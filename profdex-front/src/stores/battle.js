import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { io } from 'socket.io-client'
import router from '../router'
import { useAuthStore } from './auth'
import { applyMoveAck } from './battle-move'
import { applyResync } from './battle-resync'
import { checarSocketVivo, ensureSocket } from './battle-socket'

// Estado do PvP: conexão com o lobby de batalha via Socket.IO.
//
// A conexão é única por app (não por tela) e abre logo APÓS O LOGIN, em
// qualquer rota autenticada (ver App.vue): antes ela só existia dentro da área
// de batalha, e um convite recebido em outra tela morria em 60s sem o aluno
// saber que existiu. Só cai no logout/expiração da sessão ou ao fechar a aba.
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

  // Janela mínima em segundo plano para desconfiar do socket. Abaixo disso a
  // aba não chegou a ser congelada pelo sistema — e um ciclo disconnect/connect
  // a cada troca de aba no desktop seria pior que o problema.
  const MIN_OCULTO_MS = 3000
  let visibilityListener = null
  let ocultoDesde = 0

  const auth = useAuthStore()

  // Lista exibida no lobby (o servidor já exclui o próprio usuário).
  const opponents = computed(() => lobbyUsers.value)

  // Quantos dá para desafiar, sem precisar da lista carregada — é o número
  // mostrado no botão da tela de batalha.
  const opponentCount = computed(() => Math.max(0, onlineTotal.value - 1))

  // Chamado no `onMounted` de várias telas e no login: é idempotente, e com um
  // socket desconectado em mãos ele RECONECTA em vez de sair pela tangente.
  function connect() {
    const jaExistia = !!socket
    const base = import.meta.env.VITE_WS_URL || ''
    socket = ensureSocket(socket, () =>
      io(`${base}/battle`, {
        path: '/api/socket.io',
        withCredentials: true,
        // Backoff largo e bem embaralhado: num evento com centenas de celulares
        // no mesmo Wi-Fi, uma oscilação derruba todo mundo junto — e com o padrão
        // (até 5s, jitter 0.5) todos voltariam dentro da mesma janela de segundos,
        // o que vira um pico de reconexão capaz de derrubar o servidor de novo.
        reconnectionDelayMax: 30000,
        randomizationFactor: 0.75,
      }),
    )
    // Reconectar um socket que já existe não duplica os listeners abaixo.
    if (jaExistia) return
    unauthorized.value = false
    observarVisibilidade()

    socket.on('connect', () => {
      connected.value = true
      // Reconexão cria um socket novo, e as salas do servidor são por socket:
      // se a tela de jogadores está aberta, é preciso se reinscrever.
      if (lobbySubscribed.value) subscribeLobby()
      // O `disconnect` limpou os convites (sem socket eles não valem), mas um
      // blip de rede não os mata no servidor: em vez de assumir que não há
      // nada, pergunta. O estado da batalha vem sozinho, no `battle:resync`
      // que o servidor emite a cada conexão.
      refreshInvites()
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

    // Os dois confirmaram o time: agora os dois se veem. O preview acontece
    // DEPOIS da confirmação — é o que impede que ele devolva o counter-pick que
    // a seleção às cegas existe para eliminar.
    socket.on('battle:preview', ({ battleId, deadline, you, foe }) => {
      pvp.value = {
        ...(pvp.value ?? { battleId }),
        battleId,
        phase: 'preview',
        pickDeadline: deadline,
        you,
        foe,
        youPicked: false, // volta a significar "já escolhi o lead?"
        foePicked: false,
        pendingEvents: [],
        result: null,
      }
      goTo('pvp-pick')
    })

    socket.on('battle:lead:opponent', () => {
      if (pvp.value) pvp.value.foePicked = true
    })

    // `reason: 'left'` é alguém saindo da seleção (nunca de batalha começada),
    // e `byYou` diz de que lado: quem clicou em "sair" não precisa de aviso
    // nenhum, quem ficou precisa saber por que a tela voltou.
    socket.on('battle:cancelled', ({ reason, byYou } = {}) => {
      pvp.value = null
      if (reason === 'left') {
        if (!byYou) lastError.value = 'O rival saiu da seleção.'
      } else {
        lastError.value = 'A seleção expirou — batalha cancelada.'
      }
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
        // A rodada também é o que tira a arena da fase de substituição.
        phase: 'active',
        youChoose: false,
        turn,
        deadline,
        you: { ...pvp.value.you, ...you },
        foe: { ...pvp.value.foe, ...foe },
        youMoved: false,
        foeMoved: false,
        pendingEvents: events,
      }
    })

    // Um ativo caiu. Quem perdeu escolhe quem entra (`youChoose`); o outro lado
    // recebe o mesmo evento só para a tela dizer que está esperando, em vez de
    // congelar sem explicação.
    socket.on('battle:faint', ({ deadline, youChoose, events, you, foe }) => {
      if (!pvp.value) return
      pvp.value = {
        ...pvp.value,
        phase: 'switching',
        deadline,
        youChoose,
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

    // Reconexão: o servidor manda o snapshot e a UI se reconstrói na tela
    // certa. Chega a cada conexão, a pedido (requestResync) e na volta do app
    // ao primeiro plano — com o jogador já na tela, daí o `goTo` em vez de um
    // push direto. `phase: 'idle'` é "não há sala": ver battle-resync.js.
    socket.on('battle:resync', (snap) => {
      const { pvp: proximo, rota, aviso } = applyResync(snap, pvp.value)
      pvp.value = proximo
      if (aviso) lastError.value = aviso
      if (rota) goTo(rota)
    })
  }

  /**
   * Volta do app ao primeiro plano: confere se o socket ainda está vivo.
   *
   * O listener é registrado uma vez (na primeira conexão) e removido no
   * `disconnect`. A checagem só dispara depois de alguns segundos oculto —
   * trocar de aba no desktop não pode derrubar a conexão de ninguém.
   */
  function observarVisibilidade() {
    if (visibilityListener || typeof document === 'undefined') return
    visibilityListener = () => {
      if (document.visibilityState === 'hidden') {
        ocultoDesde = Date.now()
        return
      }
      const oculto = ocultoDesde ? Date.now() - ocultoDesde : 0
      ocultoDesde = 0
      if (oculto < MIN_OCULTO_MS) return
      checarSocketVivo(socket)
    }
    document.addEventListener('visibilitychange', visibilityListener)
  }

  /** Navega só se já não estivermos lá — o resync a pedido chega na tela certa. */
  function goTo(name) {
    if (router.currentRoute.value.name !== name) router.push({ name })
  }

  function disconnect() {
    if (!socket) return
    socket.disconnect()
    socket = null
    if (visibilityListener) {
      document.removeEventListener('visibilitychange', visibilityListener)
      visibilityListener = null
    }
    ocultoDesde = 0
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

  /**
   * Repõe os convites que o servidor ainda considera vivos.
   *
   * O `disconnect` limpa a lista local, então sem isto um blip de rede apagava
   * da tela um desafio que continua de pé no servidor — e travava o próprio
   * jogador no "Você já tem um convite pendente" sem nada explicando na tela.
   */
  async function refreshInvites() {
    const ack = await command('invite:pending')
    if (!ack.ok) return ack
    // União, não substituição: entre a pergunta e a resposta cabe um
    // `invite:received` novo, e a lista do servidor (montada antes dele) o
    // apagaria. Convite local obsoleto não existe aqui — a queda limpou tudo.
    const doServidor = ack.incoming ?? []
    const idsDoServidor = new Set(doServidor.map((i) => i.inviteId))
    const chegadosAgora = incomingInvites.value.filter((i) => !idsDoServidor.has(i.inviteId))
    incomingInvites.value = [...doServidor, ...chegadosAgora]
    outgoingInvite.value = ack.outgoing ?? outgoingInvite.value
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
  /** Confirma o time: de 1 a 3 exemplares, na ordem escolhida na tela. */
  /**
   * Marca "já escolhi" só se a etapa ainda for a mesma de quando o pedido saiu.
   *
   * O servidor resolve dentro do próprio handler e emite o evento da etapa
   * SEGUINTE (`battle:preview` depois do pick, `battle:begin` depois do lead)
   * de forma síncrona — ou seja, antes de o ack voltar. Aplicar o ack sem
   * conferir a fase remarcava `youPicked` numa etapa que já tinha começado, e
   * era isso que travava a escolha do lead: quem confirmasse o time por último
   * caía no preview com todos os cards desabilitados e "COMEÇANDO…" na tela,
   * sem nunca poder escolher quem entra primeiro.
   *
   * Mesma família do ack de golpe carimbado com o turno (ver `submitMove` e
   * docs/BUG-BATALHA-TRAVANDO.md).
   */
  async function marcarEscolhaSeAindaVale(evento, payload) {
    const faseAoEnviar = pvp.value?.phase
    const ack = await command(evento, payload)
    if (!ack.ok) {
      lastError.value = ack.message
      return ack
    }
    if (pvp.value && pvp.value.phase === faseAoEnviar) pvp.value.youPicked = true
    return ack
  }

  function pickTeam(captureIds) {
    return marcarEscolhaSeAindaVale('battle:pick', { captureIds })
  }

  /** Quem entra primeiro, escolhido depois de ver o time do rival. */
  function chooseLead(captureId) {
    return marcarEscolhaSeAindaVale('battle:lead', { captureId })
  }

  /**
   * Sai da preparação (seleção de time ou lead) sem punição: o servidor cancela
   * a sala para os dois e devolve ambos ao lobby. Recusado depois que a batalha
   * começa — desistir ali é abandono, e abandono tem regra própria.
   */
  async function leaveSelection() {
    const ack = await command('battle:leave')
    if (!ack.ok) lastError.value = ack.message
    return ack
  }

  /**
   * Troca no turno — alternativa ao golpe. Segue o mesmo cuidado de
   * `submitMove` com o turno do ack: a troca também pode fechar a rodada.
   */
  async function switchTo(captureId) {
    if (!pvp.value) return { ok: false, message: 'Sem batalha em andamento.' }
    const turnAtSend = pvp.value.turn
    pvp.value.youMoved = true
    const ack = await command('battle:switch', { captureId })
    applyMoveAck(pvp.value, { ack, turnAtSend })
    if (!ack.ok) lastError.value = ack.message
    return ack
  }

  /** Quem entra no lugar de quem caiu (fase de substituição). */
  async function enterWith(captureId) {
    const ack = await command('battle:enter', { captureId })
    if (!ack.ok) lastError.value = ack.message
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
    refreshInvites,
    pickTeam,
    chooseLead,
    leaveSelection,
    switchTo,
    enterWith,
    submitMove,
    requestResync,
    consumeEvents,
    leaveBattle,
    clearError,
  }
})
