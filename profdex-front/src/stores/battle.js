import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { io } from 'socket.io-client'
import router from '../router'
import { useAuthStore } from './auth'
import { applyMoveAck } from './battle-move'

// Estado do PvP: conexão com o lobby de batalha via Socket.IO.
//
// A conexão é única por app (não por tela): quem entrou na área de batalha
// continua "online" — e alcançável por convites — enquanto navega pelo resto
// do app. Só cai no logout/expiração da sessão ou ao fechar a aba.
//
// O handshake usa path /api/socket.io porque o cookie de sessão (HttpOnly,
// path=/api) é a autenticação — no path padrão o navegador nem o enviaria.
// Em dev a mesma origem cobre tudo via proxy do Vite; em produção com o
// backend em outro domínio, defina VITE_WS_URL.
export const useBattleStore = defineStore('battle', () => {
  const connected = ref(false)
  const unauthorized = ref(false)

  // Lobby: por padrão o servidor manda só o TOTAL de gente online. A lista em
  // si só trafega enquanto a tela de jogadores está aberta — mandar todo mundo
  // para todo mundo fazia o custo crescer com o quadrado da população e
  // transformava uma reconexão em massa em queda do servidor.
  // Ver docs/CARGA-PVP.md.
  const onlineTotal = ref(0)
  const lobbyUsers = ref([]) // já vem sem o próprio usuário
  const lobbySubscribed = ref(false) // intenção: a tela está aberta?

  // Convites: um de saída por vez (regra do servidor); vários podem chegar.
  const outgoingInvite = ref(null) // { inviteId, to: {id,name}, expiresAt }
  const incomingInvites = ref([]) // [{ inviteId, from: {id,name}, expiresAt }]

  // Batalha PvP em andamento. O servidor é a autoridade: aqui só espelhamos o
  // que ele mandou. `pendingEvents` é a fila da última rodada que a arena anima.
  //
  // { battleId, opponent, phase: 'picking'|'active'|'done',
  //   pickDeadline, youPicked, foePicked,               // fase picking
  //   turn, deadline, you, foe, youMoved, foeMoved,     // fase active
  //   pendingEvents: [], result: null|{result,reason} }
  const pvp = ref(null)

  // Última falha de comando (cooldown, jogador ocupado…) — a UI mostra e limpa.
  const lastError = ref(null)

  let socket = null

  const auth = useAuthStore()

  // Lista exibida no lobby (o servidor já exclui o próprio usuário).
  const opponents = computed(() => lobbyUsers.value)

  // Quantos dá para desafiar, sem precisar da lista carregada — é o número
  // mostrado no botão da tela de batalha.
  const opponentCount = computed(() => Math.max(0, onlineTotal.value - 1))

  function connect() {
    if (socket) return
    unauthorized.value = false

    const base = import.meta.env.VITE_WS_URL || ''
    socket = io(`${base}/battle`, {
      path: '/api/socket.io',
      withCredentials: true,
      // Backoff largo e bem embaralhado: num evento com centenas de celulares
      // no mesmo Wi-Fi, uma oscilação derruba todo mundo junto — e com o padrão
      // (até 5s, jitter 0.5) todos voltariam dentro da mesma janela de segundos,
      // o que vira um pico de reconexão capaz de derrubar o servidor de novo.
      reconnectionDelayMax: 30000,
      randomizationFactor: 0.75,
    })

    socket.on('connect', () => {
      connected.value = true
      // Reconexão cria um socket novo, e as salas do servidor são por socket:
      // se a tela de jogadores está aberta, é preciso se reinscrever.
      if (lobbySubscribed.value) subscribeLobby()
    })

    socket.on('disconnect', () => {
      connected.value = false
      lobbyUsers.value = []
      onlineTotal.value = 0
      // Convites são efêmeros no servidor; sem conexão eles já não valem.
      outgoingInvite.value = null
      incomingInvites.value = []
    })

    socket.on('error:unauthorized', () => {
      // Sessão inválida: desistir de reconectar — ia falhar em loop.
      unauthorized.value = true
      disconnect()
    })

    // Chega sempre (agrupado numa janela de 2s no servidor) — é o que alimenta
    // o contador da tela sem exigir a lista carregada.
    socket.on('lobby:count', ({ total }) => {
      onlineTotal.value = total
    })

    // Só chega enquanto inscrito: fora da tela de jogadores o servidor nem envia.
    socket.on('lobby:update', (update) => {
      if (update.type === 'join') {
        if (update.user.id === auth.user?.id) return
        const rest = lobbyUsers.value.filter((u) => u.id !== update.user.id)
        lobbyUsers.value = [...rest, update.user]
      } else if (update.type === 'leave') {
        lobbyUsers.value = lobbyUsers.value.filter((u) => u.id !== update.userId)
      } else if (update.type === 'status') {
        lobbyUsers.value = lobbyUsers.value.map((u) =>
          u.id === update.userId ? { ...u, status: update.status } : u,
        )
      }
    })

    socket.on('invite:received', (invite) => {
      incomingInvites.value = [
        ...incomingInvites.value.filter((i) => i.inviteId !== invite.inviteId),
        invite,
      ]
    })

    socket.on('invite:expired', ({ inviteId }) => dropInvite(inviteId))

    socket.on('invite:cancelled', ({ inviteId, reason }) => {
      if (outgoingInvite.value?.inviteId === inviteId && reason === 'declined') {
        lastError.value = `${outgoingInvite.value.to.name} recusou o desafio.`
      }
      dropInvite(inviteId)
    })

    // ── Batalha PvP ─────────────────────────────────────────────────────────

    socket.on('battle:start', ({ battleId, pickDeadline, opponent }) => {
      outgoingInvite.value = null
      incomingInvites.value = []
      pvp.value = {
        battleId,
        opponent,
        phase: 'picking',
        pickDeadline,
        youPicked: false,
        foePicked: false,
        pendingEvents: [],
        result: null,
      }
      router.push({ name: 'pvp-pick' })
    })

    socket.on('battle:pick:opponent', () => {
      if (pvp.value) pvp.value.foePicked = true
    })

    socket.on('battle:cancelled', () => {
      pvp.value = null
      lastError.value = 'A seleção expirou — batalha cancelada.'
      router.push({ name: 'batalha' })
    })

    socket.on('battle:begin', ({ battleId, turn, deadline, you, foe }) => {
      pvp.value = {
        ...(pvp.value ?? { battleId }),
        battleId,
        phase: 'active',
        turn,
        deadline,
        you,
        foe,
        youMoved: false,
        foeMoved: false,
        pendingEvents: [],
        result: null,
      }
      router.push({ name: 'pvp-arena' })
    })

    socket.on('battle:move:opponent', () => {
      if (pvp.value) pvp.value.foeMoved = true
    })

    socket.on('battle:round', ({ turn, deadline, events, you, foe }) => {
      if (!pvp.value) return
      pvp.value = {
        ...pvp.value,
        turn,
        deadline,
        you: { ...pvp.value.you, ...you },
        foe: { ...pvp.value.foe, ...foe },
        youMoved: false,
        foeMoved: false,
        pendingEvents: events,
      }
    })

    socket.on('battle:end', ({ events, result, reason, rating, you, foe }) => {
      if (!pvp.value) return
      pvp.value = {
        ...pvp.value,
        phase: 'done',
        you: { ...pvp.value.you, ...you },
        foe: { ...pvp.value.foe, ...foe },
        pendingEvents: events,
        // rating: { delta, rating, tier } — null quando a batalha não pontuou
        result: { result, reason, rating },
      }
    })

    // Reconexão no meio da batalha: o servidor manda o snapshot e a UI se
    // reconstrói na tela certa. Também chega a pedido (requestResync), com o
    // jogador já na tela — daí o `goTo` em vez de um push direto.
    //
    // `syncedAt` marca cada snapshot: como ele não traz fila de eventos para
    // animar, é o sinal que a arena usa para realinhar as barras de HP.
    socket.on('battle:resync', (snap) => {
      if (snap.phase === 'picking') {
        pvp.value = {
          battleId: snap.battleId,
          opponent: snap.opponent,
          phase: 'picking',
          pickDeadline: snap.deadline,
          youPicked: snap.youPicked,
          foePicked: snap.foePicked,
          pendingEvents: [],
          result: null,
          syncedAt: Date.now(),
        }
        goTo('pvp-pick')
      } else if (snap.phase === 'active') {
        pvp.value = {
          battleId: snap.battleId,
          opponent: snap.opponent,
          phase: 'active',
          turn: snap.turn,
          deadline: snap.deadline,
          you: snap.you,
          foe: snap.foe,
          youMoved: snap.youMoved,
          foeMoved: snap.foeMoved,
          pendingEvents: [],
          result: null,
          syncedAt: Date.now(),
        }
        goTo('pvp-arena')
      }
    })
  }

  /** Navega só se já não estivermos lá — o resync a pedido chega na tela certa. */
  function goTo(name) {
    if (router.currentRoute.value.name !== name) router.push({ name })
  }

  function disconnect() {
    if (!socket) return
    socket.disconnect()
    socket = null
    connected.value = false
    lobbyUsers.value = []
    onlineTotal.value = 0
    lobbySubscribed.value = false
    outgoingInvite.value = null
    incomingInvites.value = []
  }

  // Comando com ack: resolve com a resposta { ok, ... } do servidor.
  function command(event, payload) {
    return new Promise((resolve) => {
      if (!socket?.connected) {
        resolve({ ok: false, message: 'Sem conexão com o lobby.' })
        return
      }
      const timeout = setTimeout(
        () => resolve({ ok: false, message: 'O servidor não respondeu.' }),
        5000,
      )
      socket.emit(event, payload, (ack) => {
        clearTimeout(timeout)
        resolve(ack ?? { ok: false, message: 'Resposta inválida do servidor.' })
      })
    })
  }

  /** Abriu a tela de jogadores: passa a receber a lista e seus eventos. */
  async function subscribeLobby() {
    lobbySubscribed.value = true
    const ack = await command('lobby:subscribe')
    if (ack.ok) {
      lobbyUsers.value = ack.users
      onlineTotal.value = ack.total
    } else {
      lastError.value = ack.message
    }
    return ack
  }

  /** Fechou a tela: o servidor para de mandar eventos de presença. */
  function unsubscribeLobby() {
    lobbySubscribed.value = false
    lobbyUsers.value = []
    if (socket?.connected) socket.emit('lobby:unsubscribe')
  }

  /** Busca no servidor — o cliente não tem mais a lista inteira para filtrar. */
  async function searchLobby(term) {
    const ack = await command('lobby:search', { term })
    if (ack.ok) {
      lobbyUsers.value = ack.users
      onlineTotal.value = ack.total
    }
    return ack
  }

  async function sendInvite(toUserId) {
    const ack = await command('invite:send', { toUserId })
    if (ack.ok) outgoingInvite.value = ack.invite
    else lastError.value = ack.message
    return ack
  }

  async function acceptInvite(inviteId) {
    const ack = await command('invite:accept', { inviteId })
    if (!ack.ok) {
      lastError.value = ack.message
      dropInvite(inviteId)
    }
    return ack
  }

  async function declineInvite(inviteId) {
    dropInvite(inviteId) // some da UI já; o servidor confirma pelo ack
    return command('invite:decline', { inviteId })
  }

  function dropInvite(inviteId) {
    if (outgoingInvite.value?.inviteId === inviteId) outgoingInvite.value = null
    incomingInvites.value = incomingInvites.value.filter((i) => i.inviteId !== inviteId)
  }

  // Manda o EXEMPLAR, não o professor: é ele que carrega a combinação de tipos
  // e o deck sorteados na captura.
  async function pickCapture(captureId) {
    const ack = await command('battle:pick', { captureId })
    if (ack.ok && pvp.value) pvp.value.youPicked = true
    else if (!ack.ok) lastError.value = ack.message
    return ack
  }

  async function submitMove(moveId) {
    if (!pvp.value) return { ok: false, message: 'Sem batalha em andamento.' }
    const turnAtSend = pvp.value.turn

    // Otimista: trava o botão já no clique, sem esperar o round-trip — isso
    // também fecha a janela em que um duplo-toque mandava dois golpes. A volta
    // do ack NUNCA escreve `youMoved` sem antes conferir o turno: quando o
    // próprio golpe fecha a rodada, o `battle:round` do turno seguinte chega
    // ANTES do ack. Ver battle-move.js e docs/BUG-BATALHA-TRAVANDO.md.
    pvp.value.youMoved = true
    const ack = await command('battle:move', { moveId })
    applyMoveAck(pvp.value, { ack, turnAtSend })
    if (!ack.ok) lastError.value = ack.message
    return ack
  }

  /**
   * Pede o snapshot da batalha ao servidor (handler `battle:resync` do gateway).
   * É a rede de segurança da arena: se o prazo do turno passou e nada chegou,
   * o estado é reconstruído a partir da autoridade em vez de deixar o jogador
   * olhando botões mortos.
   */
  function requestResync() {
    if (socket?.connected) socket.emit('battle:resync')
  }

  /** A arena chama após animar a fila da rodada. */
  function consumeEvents() {
    if (pvp.value) pvp.value.pendingEvents = []
  }

  /** Sai da tela de resultado: limpa o estado local (o servidor já fechou). */
  function leaveBattle() {
    pvp.value = null
  }

  function clearError() {
    lastError.value = null
  }

  // Sessão expirou (401 em qualquer request) ou logout: derruba o socket para
  // não manter uma presença com identidade que já não vale.
  window.addEventListener('auth:expired', disconnect)

  return {
    connected,
    unauthorized,
    onlineTotal,
    opponents,
    opponentCount,
    lobbySubscribed,
    outgoingInvite,
    incomingInvites,
    pvp,
    lastError,
    connect,
    disconnect,
    subscribeLobby,
    unsubscribeLobby,
    searchLobby,
    sendInvite,
    acceptInvite,
    declineInvite,
    pickCapture,
    submitMove,
    requestResync,
    consumeEvents,
    leaveBattle,
    clearError,
  }
})
