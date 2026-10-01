<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import ArenaPalco from '../components/ArenaPalco.vue'
import BancoDeReservas from '../components/BancoDeReservas.vue'
import MoveButton from '../components/MoveButton.vue'
import ProfessorFace from '../components/ProfessorFace.vue'
import RoteiroOverlay from '../components/RoteiroOverlay.vue'
import {
  aplicarEvento,
  chaveDoOcupante,
  ladosParaInicioDaAnimacao,
  ocupanteDoServidor,
} from '../composables/battleOcupante'
import { esperar, TEMPO } from '../composables/battleTiming'
import { efeitosDe } from '../data/battle-efeitos'
import { useBattleStore } from '../stores/battle'
import { contraBot, rotaDeSaida } from '../stores/battle-resync'

// Arena PvP: o servidor resolve tudo; esta tela só envia a intenção de golpe
// e ANIMA a fila de eventos de cada rodada (mesma linguagem do useBattle.js).
// Nos eventos recebidos a perspectiva já vem espelhada pelo servidor:
// target 'player' = VOCÊ, 'enemy' = rival — para os dois jogadores.
const router = useRouter()
const battle = useBattleStore()

// Estado exibido (a "verdade" chega pronta do servidor; isto aqui só anima).
//
// Quem está em campo de cada lado — professor, tipos, HP, caído — é estado
// PRÓPRIO da tela, que só muda quando a fila de eventos passa pela troca ou pelo
// golpe correspondente. Ver battleOcupante.js: ligado direto no `you`/`foe` do
// servidor, o substituto aparecia antes da hora e herdava a queda de quem saiu.
const inicioDaAnimacao = ladosParaInicioDaAnimacao(battle.pvp)
const exibido = ref({
  player: ocupanteDoServidor(inicioDaAnimacao?.you),
  enemy: ocupanteDoServidor(inicioDaAnimacao?.foe),
})
const youFainted = computed(() => exibido.value.player.fainted)
const foeFainted = computed(() => exibido.value.enemy.fainted)
const message = ref('')
const dicas = ref([])
const historico = ref([])
const historicoRecente = computed(() => [...historico.value].reverse())
const logDialog = ref(null)
function abrirLog() { logDialog.value?.showModal() }
function fecharLog() { logDialog.value?.close() }
let proximoIdDica = 0
const temporizadoresDica = new Map()
const DURACAO_DICA_MS = 4000
const youHit = ref(false)
const foeHit = ref(false)
const animating = ref(false)
const showResult = ref(false)
const youFeedback = ref([])
const foeFeedback = ref([])
let feedbackId = 0
let lastDamageTarget = 'enemy'

function showFeedback(target, feedback) {
  const list = target === 'player' ? youFeedback : foeFeedback
  const item = { id: ++feedbackId, offset: ((feedbackId % 5) - 2) * 12, ...feedback }
  list.value.push(item)
  setTimeout(() => {
    list.value = list.value.filter((entry) => entry.id !== item.id)
  }, 1000)
}

const ROTULOS_EFICACIA = {
  super4: 'Efetividade ×4 — devastador',
  super: 'Super eficaz',
  weak: 'Pouco eficaz',
  weak4: 'Resistiu ×¼',
}

/** Resume o evento que acabou de ser animado em uma dica curta e temporária. */
function mostrarDica(ev, turn) {
  let tipo
  let texto
  const lado = ev.target === 'player' ? 'Seu lado' : 'Rival'

  switch (ev.type) {
    case 'message':
      tipo = ev.text?.includes(' usou ') ? 'golpe' : 'info'
      texto = ev.text
      break
    case 'damage':
      tipo = 'dano'
      texto = `${lado}: −${ev.amount} HP`
      break
    case 'heal':
      tipo = 'cura'
      texto = `${lado}: +${ev.amount} HP`
      break
    case 'effectiveness':
      tipo = 'eficacia'
      texto = ROTULOS_EFICACIA[ev.level]
      break
    case 'faint':
      tipo = 'queda'
      texto = `${lado} foi nocauteado`
      break
    case 'switch':
      tipo = 'troca'
      texto = `${ev.name ?? 'Combatente'} entrou em campo · ${lado}`
      break
    default:
      // O status já vem acompanhado da mensagem que explica o que ocorreu;
      // o roteiro da raid tem o próprio overlay pausável.
      return
  }

  if (!texto) return
  const id = ++proximoIdDica
  const dica = { id, turn, tipo, texto }
  historico.value = [...historico.value, dica].slice(-400)
  dicas.value = [...dicas.value, dica].slice(-4)
  const timeout = setTimeout(() => {
    dicas.value = dicas.value.filter((dica) => dica.id !== id)
    temporizadoresDica.delete(id)
  }, DURACAO_DICA_MS)
  temporizadoresDica.set(id, timeout)
}

const now = ref(Date.now())
let clock = null

const pvp = computed(() => battle.pvp)

// Rede de segurança. O servidor resolve o turno no deadline, então ficar muito
// além disso sem receber rodada nenhuma significa que as duas pontas
// divergiram — por perda de pacote, socket morto sem o cliente perceber, ou um
// bug futuro nosso. Em vez de deixar o jogador olhando botões mortos até o F5,
// pedimos o estado de volta a quem tem autoridade.
const RESYNC_GRACE_MS = 5000
const RESYNC_COOLDOWN_MS = 10000
let lastResyncAt = 0

function resyncIfStuck() {
  const p = pvp.value
  if (!p || (p.phase !== 'active' && p.phase !== 'switching') || animating.value) return
  if (now.value < p.deadline + RESYNC_GRACE_MS) return
  if (now.value - lastResyncAt < RESYNC_COOLDOWN_MS) return
  lastResyncAt = now.value
  battle.requestResync()
}

// `switching` também tem prazo: quem não escolhe quem entra leva o próximo da
// ordem — e uma falta no contador de abandono.
const emJogo = computed(
  () => pvp.value?.phase === 'active' || pvp.value?.phase === 'switching',
)

const secondsLeft = computed(() => {
  if (!pvp.value?.deadline || !emJogo.value) return 0
  return Math.max(0, Math.ceil((pvp.value.deadline - now.value) / 1000))
})

const canAct = computed(
  () =>
    pvp.value?.phase === 'active' && !pvp.value.youMoved && !animating.value && !showResult.value,
)

// ── Time ───────────────────────────────────────────────────────────────────
// Painel de troca aberto (fase `active`). A escolha de entrada, na fase
// `switching`, não é opcional e por isso não usa este estado.
const trocaAberta = ref(false)

/**
 * O time como a TELA mostra, que atrasa de propósito em relação ao servidor.
 *
 * `pvp.you.team` chega com o resultado final da rodada no instante em que o
 * `battle:round` aterrissa — antes de a fila de eventos ser animada. Ligado
 * direto na HUD, o banco de reservas descontava a vida (e marcava o caído)
 * enquanto a barra grande ainda estava descendo: a mesma pancada aparecia duas
 * vezes, e a miniatura sempre "sabia" antes.
 *
 * Aqui a cópia exibida só é atualizada quando a animação alcança o servidor
 * (fim de `play`, ou `syncFromServer` fora de animação).
 */
const timeExibido = ref({
  you: inicioDaAnimacao?.you?.team ?? [],
  foe: inicioDaAnimacao?.foe?.team ?? [],
})

/**
 * As pílulas de efeito ativo, pelo MESMO motivo do `timeExibido`.
 *
 * Diferença: vida e queda chegam como eventos e por isso a tela as anima passo a
 * passo; efeito não — não há evento que diga "o ataque dele subiu para +2". Então
 * as pílulas atualizam uma vez por rodada, quando a animação alcança o servidor.
 * Ligadas direto no payload, elas mostrariam o buff do turno antes de o golpe que
 * o causou ter sido animado.
 */
const efeitosExibidos = ref({
  you: efeitosDe(inicioDaAnimacao?.you),
  foe: efeitosDe(inicioDaAnimacao?.foe),
})

/** Sincroniza as cópias ATRASADAS da HUD com o que o servidor já sabe. */
function sincronizarTimeExibido() {
  timeExibido.value = {
    you: pvp.value?.you?.team ?? [],
    foe: pvp.value?.foe?.team ?? [],
  }
  efeitosExibidos.value = {
    you: efeitosDe(pvp.value?.you),
    foe: efeitosDe(pvp.value?.foe),
  }
}

/** Reservas vivos: quem dá para pôr em campo agora. */
const reservas = computed(() =>
  (pvp.value?.you?.team ?? []).filter(
    (m) => !m.fainted && m.captureId !== pvp.value?.you?.activeCaptureId,
  ),
)

const precisaEntrar = computed(
  () => pvp.value?.phase === 'switching' && pvp.value?.youChoose,
)

async function trocarPara(membro) {
  if (!canAct.value) return
  trocaAberta.value = false
  const ack = await battle.switchTo(membro.captureId)
  if (ack.ok) {
    message.value = semRivalHumano.value
      ? 'Resolvendo…' // contra o servidor o outro lado já agiu: nunca há espera
      : pvp.value?.foeMoved
        ? 'Resolvendo…'
        : 'Aguardando o rival…'
  }
}

// Travado enquanto a queda ainda anima: o servidor responde à entrada na hora
// (a rodada seguinte chega antes do ack), e escolher no meio da animação
// embaralhava a ordem do que a tela mostra. "Entra em campo!" é o servidor
// quem anuncia, na fila; aqui fica só a confirmação do toque.
async function entrarCom(membro) {
  if (!precisaEntrar.value || animating.value) return
  const ack = await battle.enterWith(membro.captureId)
  if (ack.ok) message.value = `${membro.professor.name} vai entrar!`
}

// ── Os dois lados do palco ─────────────────────────────────────────────────
// Sprites 2D, não .glb: dois modelos de dezenas de MB por partida faziam o
// Safari do iPhone descartar a aba no meio da batalha.
// Ver docs/BUG-BATALHA-TRAVANDO.md.
//
// O palco é o MESMO componente do treino (ArenaPalco.vue). Antes esta tela
// tinha o seu, com cada lado numa coluna flex e o sprite em `flex: 1` — o
// tamanho do personagem era o espaço que sobrava, e o banco de reservas do
// rival, empilhado acima do sprite dele, era o que mais espremia.
// Quem resolve costas/frente também é o palco.
const ladoRival = computed(() => {
  const o = exibido.value.enemy
  return {
    professor: o.professor,
    // Só a raid manda isto, e só durante o evento do NDE: quatro professores
    // dividindo um corpo. O palco desenha os quatro quando o campo existe.
    // Do OCUPANTE, como a barra: lidos do `foe` final, grupo e nome trocavam
    // antes da fila chegar à troca (o NDE surgia com a vida do chefe, e o
    // chefe voltava a tempo de "cair" no lugar do NDE).
    professores: o.grupo,
    // Do OCUPANTE pelo mesmo motivo do grupo: lido do `foe` final, o lendario
    // trocava de corpo antes de o overlay anunciar a transformacao.
    estagio: o.estagio,
    // O nome em campo vem antes do nome do professor porque quem está no
    // assento pode ser o grupo ("NDE da Coordenação"), não um professor.
    name: o.nome ?? o.professor?.name ?? pvp.value?.opponent?.name ?? '',
    types: o.types,
    hp: o.hp,
    maxHp: o.maxHp,
    hit: foeHit.value,
    fainted: o.fainted,
    feedback: foeFeedback.value,
    // Do SERVIDOR, sincronizado no fim da fila (ver `efeitosExibidos`): efeito
    // não chega como evento com detalhe suficiente para animar passo a passo, e
    // ligar direto no payload faria as pilulas saberem antes da animacao.
    efeitos: efeitosExibidos.value.foe,
    chave: chaveDoOcupante(o),
  }
})

const ladoSeu = computed(() => {
  const o = exibido.value.player
  return {
    professor: o.professor,
    name: o.professor?.name ?? 'Você',
    types: o.types,
    hp: o.hp,
    maxHp: o.maxHp,
    hit: youHit.value,
    fainted: o.fainted,
    feedback: youFeedback.value,
    efeitos: efeitosExibidos.value.you,
    chave: chaveDoOcupante(o),
  }
})

/**
 * A mensagem de turno como a faixa mostra.
 *
 * A espera pelo rival era um `<p>` extra no fim da faixa, que aparecia no
 * instante em que você usava um golpe — ou seja, a tela se mexia exatamente no
 * toque que ela devia responder. Aqui ela entra na moldura de mensagem, que tem
 * altura reservada, e continua reagindo ao rival mover no meio da espera.
 */
const mensagemExibida = computed(() => {
  const p = pvp.value
  if (p?.phase === 'active' && p.youMoved && !animating.value) {
    return p.foeMoved || semRivalHumano.value
      ? 'Resolvendo a rodada…'
      : `Aguardando ${p.opponent.name}…`
  }
  return message.value
})

// A raid usa esta mesma tela, mas o vocabulário é outro: não há rival, não há
// Elo, e vencer significa CAPTURAR. Ver tarefa 18, decisão 17.
const naRaid = computed(() => pvp.value?.mode === 'raid')
// O treino também: o adversário é o bot, nada vale ranking, e dá para fugir.
const naTreino = computed(() => pvp.value?.mode === 'treino')
// Contra o servidor, o outro lado responde na hora: nunca há rival a esperar.
const semRivalHumano = computed(() => contraBot(pvp.value?.mode))

const resultText = computed(() => {
  const r = pvp.value?.result
  if (!r) return ''
  if (r.result === 'win') {
    // `captured: false` numa vitória é o caso raro de quem venceu duas vezes
    // (duas abas): o servidor recusa o segundo exemplar e a tela não pode
    // prometer o que não entregou.
    if (naRaid.value) return r.captured ? 'LENDÁRIO CAPTURADO!' : 'VOCÊ VENCEU!'
    return 'VOCÊ VENCEU!'
  }
  if (r.result === 'loss') return 'VOCÊ FOI DERROTADO'
  return 'EMPATE!'
})

/** O texto abaixo do título: como a batalha terminou, em português. */
const resultReason = computed(() => {
  const r = pvp.value?.result
  if (!r) return ''
  if (naTreino.value) {
    if (r.reason === 'abandono') return 'Você saiu do treino'
    if (r.reason === 'limite_de_turnos') return 'Por limite de turnos'
    if (r.result === 'win') return 'O time do bot caiu'
    if (r.result === 'loss') return 'Seu time caiu'
    return 'Os dois times caíram juntos'
  }
  if (r.reason === 'abandono') return 'Por abandono'
  if (r.reason === 'limite_de_turnos') {
    return naRaid.value ? 'O lendário resistiu ao tempo' : 'Por limite de turnos'
  }
  if (naRaid.value && r.result === 'win') {
    return r.captured
      ? 'Ele entra na sua Profdex com atributos perfeitos.'
      : 'Você já tinha capturado este lendário.'
  }
  if (naRaid.value) return 'Seu time caiu'
  return 'Por nocaute'
})

/** Quando a próxima tentativa de raid libera — só existe na derrota. */
const retryText = computed(() => {
  const retryAt = pvp.value?.result?.retryAt
  if (!naRaid.value || !Number.isFinite(retryAt)) return ''
  const minutos = Math.max(1, Math.ceil((retryAt - Date.now()) / 60000))
  return `Você pode tentar de novo em ${minutos} min.`
})

const resultKind = computed(() => pvp.value?.result?.result ?? '')
const ratingDeltaText = computed(() => {
  const delta = pvp.value?.result?.rating?.delta
  if (!Number.isFinite(delta)) return ''
  return `ELO ${delta >= 0 ? '+' : ''}${delta}`
})

// ── A fila de eventos ──────────────────────────────────────────────────────
// Cada rodada que chega entra no FIM da fila, e um único laço a consome em
// ordem. Antes, uma rodada que chegava enquanto a anterior ainda animava era
// ignorada e depois apagada pelo `consumeEvents()` — com a entrada pós-nocaute
// respondida na hora pelo servidor, era justamente a troca que se perdia.
const fila = []

// ── Roteiro ──────────────────────────────────────────────────────────────────
// Os eventos `roteiro` (virada de estágio da raid, NDE, Ricardo) saem da faixa
// de mensagem e vão para um overlay que ESPERA o toque do jogador. A fila de
// eventos fica pausada enquanto ele lê — daí a promessa: `play()` só continua
// quando o overlay avisa que terminou.
const roteiro = ref(null)
let fecharRoteiro = null

function mostrarRoteiro(ev) {
  return new Promise((resolve) => {
    roteiro.value = { linhas: ev.linhas ?? [], roleta: ev.roleta ?? null }
    fecharRoteiro = () => {
      roteiro.value = null
      fecharRoteiro = null
      resolve()
    }
  })
}

// Sair da tela no meio de um roteiro (voltar, F5, rota trocada) deixaria a
// promessa pendurada para sempre e `animating` travado em true — botões mortos
// até o próximo F5. Resolver na desmontagem é o que fecha essa porta.
function soltarRoteiroPendente() {
  fecharRoteiro?.()
}

async function drenarFila() {
  if (animating.value) return
  animating.value = true
  while (fila.length) {
    const rodada = fila.shift()
    await play(rodada.events, rodada.turn)
  }
  fimDaFila()
}

// Reproduz os eventos de uma rodada (mesmos tipos do motor). Os tempos vêm de
// battleTiming.js, compartilhados com o treino.
async function play(events, turn) {
  for (const ev of events) {
    mostrarDica(ev, turn)
    switch (ev.type) {
      case 'message':
        message.value = ev.text
        await esperar(TEMPO.mensagem)
        break
      case 'damage': {
        lastDamageTarget = ev.target
        showFeedback(ev.target, { amount: ev.amount, kind: 'dano' })
        const flag = ev.target === 'player' ? youHit : foeHit
        flag.value = true
        exibido.value = aplicarEvento(exibido.value, ev)
        await esperar(TEMPO.danoImpacto)
        flag.value = false
        message.value = `Causou ${ev.amount} de dano!`
        await esperar(TEMPO.danoTexto)
        break
      }
      case 'heal': {
        showFeedback(ev.target, { amount: ev.amount, kind: 'cura' })
        exibido.value = aplicarEvento(exibido.value, ev)
        await esperar(TEMPO.cura)
        break
      }
      case 'status':
        await esperar(TEMPO.status)
        break
      case 'effectiveness':
        showFeedback(lastDamageTarget, {
          kind: ev.level.startsWith('super') ? 'critico' : 'dano',
          label: {
            super4: 'DEVASTADOR! ×4',
            super: 'SUPER EFICAZ!',
            weak: 'POUCO EFICAZ…',
            weak4: 'RESISTIU ×¼',
          }[ev.level],
        })
        message.value =
          {
            super4: 'Foi devastador! (×4)',
            super: 'Foi super eficaz!',
            weak: 'Não foi muito eficaz…',
            weak4: 'Mal arranhou… (×¼)',
          }[ev.level] || ''
        await esperar(TEMPO.eficacia)
        break
      // A queda é SÓ de quem o evento aponta; o tempo a mais deixa a animação
      // do palco terminar antes da próxima frase.
      case 'faint':
        exibido.value = aplicarEvento(exibido.value, ev)
        await esperar(TEMPO.queda)
        break
      // A troca sai da SALA, não do motor: o evento traz quem entra, e é AQUI —
      // no ponto certo da fila — que o sprite, os tipos e a barra passam para
      // ele, com o HP dele e de pé (sprite novo, ver `chave` no ArenaPalco).
      // Sem texto próprio: o "X entra em campo!" vem logo atrás, do servidor.
      case 'switch':
        exibido.value = aplicarEvento(exibido.value, ev)
        await esperar(TEMPO.troca)
        break
      // Momento de roteiro: sai da faixa e vai para o overlay, no ritmo do
      // jogador. O `await` mantém o resto da rodada em espera.
      case 'roteiro': {
        // A ordem destas duas linhas é o ponto. `mostrarRoteiro` monta o overlay
        // de forma SÍNCRONA (dentro do executor da promessa), então aplicar a
        // virada de estágio depois dela coloca as duas no mesmo tick: o Vue
        // pinta uma vez, com o overlay já cobrindo o palco e a arte nova atrás.
        // Invertido, o lendário trocava de corpo à vista antes de o overlay
        // anunciar a transformação.
        const toque = mostrarRoteiro(ev)
        exibido.value = aplicarEvento(exibido.value, ev)
        await toque
        break
      }
      default:
        break
    }
  }
}

// Fila vazia: alinha com os valores autoritativos do servidor e anuncia a fase.
function fimDaFila() {
  syncFromServer()
  animating.value = false

  if (pvp.value?.phase === 'done') {
    showResult.value = true
  } else if (pvp.value?.phase === 'switching') {
    message.value = pvp.value.youChoose
      ? 'Quem entra agora?'
      : `${pvp.value.opponent.name} está escolhendo…`
  } else if (pvp.value?.phase === 'active') {
    message.value = 'Escolha seu golpe!'
  }
}

/**
 * O ocupante do servidor, mantendo a identidade do <img> se é o mesmo
 * professor em campo — senão, o sprite remontaria a cada fim de rodada.
 */
function alinhar(atual, lado) {
  const mesmo = (atual.professor?.id ?? null) === (lado?.professor?.id ?? null)
  return ocupanteDoServidor(lado, mesmo ? atual.entrada : atual.entrada + 1)
}

function syncFromServer() {
  if (!pvp.value?.you) return
  // Atribuição completa, não `if (…) = true`: com o time, quem está em campo
  // MUDA. Só ligar a bandeira de caído deixava o sprite tombado para sempre.
  exibido.value = {
    player: alinhar(exibido.value.player, pvp.value.you),
    enemy: alinhar(exibido.value.enemy, pvp.value.foe),
  }
  // O banco só acompanha depois que a animação alcança o servidor (ver
  // `timeExibido`): o HP dos reservas é a mesma verdade da barra grande.
  sincronizarTimeExibido()
}

async function useMove(move) {
  if (!canAct.value) return
  const ack = await battle.submitMove(move.id)
  if (ack.ok) {
    message.value =
      semRivalHumano.value || pvp.value?.foeMoved ? 'Resolvendo…' : 'Aguardando o rival…'
  }
}

function backToLobby() {
  const saida = rotaDeSaida(pvp.value)
  battle.leaveBattle()
  // Cada modo volta para onde nasceu. A raid, na Profdex, é onde o resultado
  // dela aparece; o treino, na aba de treino. Voltar para o lobby do PvP
  // largaria o aluno numa tela que ele não pediu e que não mudou.
  router.push({ name: saida })
}

// ── Treino ─────────────────────────────────────────────────────────────────
// Mesmo formato de novo, sem voltar à aba: o `battle:start` que chega leva à
// seleção, com o time do bot sorteado outra vez.
const reabrindo = ref(false)
async function treinarDeNovo() {
  if (reabrindo.value) return
  reabrindo.value = true
  const tamanho = pvp.value?.tamanho ?? 1
  battle.leaveBattle()
  try {
    const ack = await battle.startTreino(tamanho)
    if (!ack.ok) router.push({ name: 'treino' })
  } finally {
    reabrindo.value = false
  }
}

// Fugir encerra o treino como derrota. Sem custo nenhum, mas é o fim da
// partida: o primeiro toque só arma, e o segundo (em até 3s) confirma.
const fugaArmada = ref(false)
let desarmarFuga = null
async function fugir() {
  if (!fugaArmada.value) {
    fugaArmada.value = true
    desarmarFuga = setTimeout(() => (fugaArmada.value = false), 3000)
    return
  }
  clearTimeout(desarmarFuga)
  fugaArmada.value = false
  const ack = await battle.fugirDoTreino()
  // Sala já fechada (fim de partida no mesmo instante): só sai da tela.
  if (!ack.ok) backToLobby()
}

// Novas rodadas chegam pelo store: vão para o fim da fila local e o store é
// esvaziado na hora, para a próxima rodada nunca sobrescrever uma que ainda
// não foi mostrada.
watch(
  () => pvp.value?.pendingEvents,
  (events) => {
    if (!events?.length) return
    fila.push({ events: [...events], turn: pvp.value?.turn ?? 0 })
    battle.consumeEvents()
    drenarFila()
  },
  { immediate: true },
)

// Snapshot do servidor (reconexão ou rede de segurança acima): não vem com fila
// de eventos, então as barras de HP precisam ser realinhadas na mão — senão
// ficariam paradas no valor de antes da divergência.
watch(
  () => pvp.value?.syncedAt,
  (syncedAt) => {
    if (!syncedAt || animating.value) return
    syncFromServer()
    if (pvp.value?.phase !== 'active') return
    if (!pvp.value.youMoved) message.value = 'Escolha seu golpe!'
    else message.value = semRivalHumano.value ? 'Resolvendo…' : 'Aguardando o rival…'
  },
)

// Caso battle:end chegue sem eventos (ex.: abandono antes de qualquer rodada).
watch(
  () => pvp.value?.phase,
  (phase) => {
    if (phase === 'done' && !animating.value && !fila.length && !pvp.value?.pendingEvents?.length) {
      syncFromServer()
      showResult.value = true
    }
  },
)

onMounted(() => {
  battle.connect() // idempotente; cobre refresh (o resync reconstrói a tela)
  // `picking` e `preview` são as duas etapas da tela de seleção — chegar na
  // arena em qualquer uma delas é deep link ou F5 fora de hora.
  if (!pvp.value || pvp.value.phase === 'picking' || pvp.value.phase === 'preview') {
    router.replace({ name: pvp.value ? 'pvp-pick' : rotaDeSaida(pvp.value) })
    return
  }
  // O watcher imediato já pode estar reproduzindo uma rodada. Sincronizar o
  // snapshot final aqui adiantaria a troca e faria o novo sprite herdar o dano
  // e a queda que ainda pertencem ao professor anterior.
  if (!animating.value) {
    syncFromServer()
    message.value = `${pvp.value.foe.professor?.name ?? pvp.value.opponent.name} entrou na arena!`
  }
  clock = setInterval(() => {
    now.value = Date.now()
    resyncIfStuck()
  }, 500)
})

onUnmounted(() => {
  if (clock) clearInterval(clock)
  clearTimeout(desarmarFuga)
  for (const timeout of temporizadoresDica.values()) clearTimeout(timeout)
  temporizadoresDica.clear()
  soltarRoteiroPendente()
})
</script>

<template>
  <div
    v-if="pvp?.you"
    class="pvp-arena"
    :class="{
      'pvp-arena--defeat': youFainted || resultKind === 'loss',
      'pvp-arena--victory': foeFainted || resultKind === 'win',
      'pvp-arena--treino': naTreino,
    }"
  >
    <!-- O mesmo palco do treino: só os dois lutadores, o fundo e as barras de
         HP sobrepostas. Sem colunas flex, sem banco de reservas aqui dentro. -->
    <ArenaPalco :foe="ladoRival" :you="ladoSeu" />

    <!-- Sem isto, o treino com o próprio time é idêntico ao ranqueado, e nada
         diria que ele não mexe no Elo. -->
    <template v-if="naTreino">
      <p class="pixel pvp-arena__selo">TREINO — NÃO VALE RANKING</p>
      <button
        v-if="!showResult"
        class="pixel pvp-arena__fugir"
        :class="{ 'pvp-arena__fugir--armado': fugaArmada }"
        type="button"
        :aria-label="fugaArmada ? 'Toque de novo para sair do treino' : 'Fugir do treino'"
        @click="fugir"
      >
        {{ fugaArmada ? 'SAIR MESMO?' : 'FUGIR' }}
      </button>
    </template>

    <!-- Fora da faixa de propósito: ver o comentário no topo de
         RoteiroOverlay.vue. Ele se sobrepõe ao palco e pausa a rodada. -->
    <RoteiroOverlay
      v-if="roteiro"
      :roteiro="roteiro"
      @fim="soltarRoteiroPendente"
    />

    <aside class="dicas-flutuantes" aria-label="Eventos recentes da luta" aria-live="polite">
      <article
        v-for="dica in dicas"
        :key="dica.id"
        class="dica-flutuante"
        :class="`dica-flutuante--${dica.tipo}`"
      >
        <span class="pixel dica-flutuante__turno">T{{ dica.turn }}</span>
        <span class="dica-flutuante__texto">{{ dica.texto }}</span>
      </article>
    </aside>

    <button class="pixel pvp-arena__log" type="button" aria-label="Abrir histórico da batalha" @click="abrirLog">
      LOG
    </button>

    <dialog ref="logDialog" class="battle-log" aria-labelledby="battle-log-title">
      <header class="battle-log__header">
        <div>
          <h2 id="battle-log-title" class="pixel">HISTÓRICO DA BATALHA</h2>
          <p>Eventos mais recentes primeiro</p>
        </div>
        <button class="pixel battle-log__fechar" type="button" @click="fecharLog" autofocus>FECHAR</button>
      </header>
      <ol class="battle-log__lista">
        <li v-for="evento in historicoRecente" :key="evento.id" class="battle-log__evento" :class="`battle-log__evento--${evento.tipo}`">
          <span class="pixel battle-log__turno">T{{ evento.turn }}</span>
          <span>{{ evento.texto }}</span>
        </li>
      </ol>
      <p v-if="!historico.length" class="battle-log__vazio">Os eventos aparecem aqui conforme a batalha acontece.</p>
    </dialog>

    <!-- Faixa de comandos, de ALTURA TRAVADA (ver `--faixa-altura` no estilo):
         os três blocos que se alternam aqui ocupam sempre o mesmo espaço. -->
    <div class="faixa">
      <!-- Os dois times, numa linha fina. Antes ficavam empilhados na coluna do
           sprite, entre a barra de HP e o personagem — e era o do rival que
           mais espremia. As reservas do rival são PÚBLICAS de propósito: o time
           dele já foi revelado no preview e o HP de cada um foi visto em campo;
           esconder não criaria segredo, só obrigaria a decorar. -->
      <div class="faixa__times">
        <BancoDeReservas
          :team="timeExibido.foe"
          foe
          :rotulo="naTreino ? 'BOT' : 'RIVAL'"
        />
        <BancoDeReservas
          :team="timeExibido.you"
          :active-capture-id="pvp.you.activeCaptureId"
          rotulo="VOCÊ"
        />
      </div>

      <!-- Mesma moldura do treino, com o timer na própria linha. -->
      <div class="faixa__mensagem pixel" aria-live="polite">
        <span class="faixa__texto">{{ mensagemExibida }}</span>
        <span
          v-if="emJogo"
          class="pixel faixa__timer"
          :class="{ 'faixa__timer--baixo': secondsLeft <= 10 }"
        >
          {{ secondsLeft }}s
        </span>
      </div>

      <!-- Os três blocos mutuamente exclusivos, num espaço de altura reservada.
           Sem isto a tela pulava a cada golpe usado e os golpes desapareciam
           quando o professor caía — os dois sintomas eram o mesmo defeito. -->
      <div class="faixa__blocos">
        <!-- Escolher quem entra não é opcional: enquanto está pendente, ela toma
             o lugar dos comandos em vez de dividir espaço com eles. -->
      <div v-if="pvp.phase === 'switching' && !animating" class="entrada">
          <template v-if="precisaEntrar">
            <p class="entrada__titulo">Quem entra agora?</p>
            <div class="entrada__opcoes">
              <button
                v-for="m in reservas"
                :key="m.captureId"
                class="entrada__opcao"
                type="button"
                :disabled="animating"
                @click="entrarCom(m)"
              >
                <ProfessorFace class="entrada__face" :professor="m.professor" />
                <span class="entrada__nome">{{ m.professor.name }}</span>
                <span class="entrada__hp">{{ m.hp }}/{{ m.maxHp }}</span>
              </button>
            </div>
          </template>
          <p v-else class="entrada__titulo entrada__titulo--espera">
            {{ pvp.opponent.name }} está escolhendo quem entra…
          </p>
        </div>

        <template v-else>
          <!-- Painel de troca, sobreposto aos golpes: a ação do turno é uma só. -->
          <div v-if="trocaAberta" class="entrada">
            <p class="entrada__titulo">Trocar por quem?</p>
            <div class="entrada__opcoes">
              <button
                v-for="m in reservas"
                :key="m.captureId"
                class="entrada__opcao"
                type="button"
                :disabled="!canAct"
                @click="trocarPara(m)"
              >
                <ProfessorFace class="entrada__face" :professor="m.professor" />
                <span class="entrada__nome">{{ m.professor.name }}</span>
                <span class="entrada__hp">{{ m.hp }}/{{ m.maxHp }}</span>
              </button>
            </div>
            <button class="entrada__cancelar" type="button" @click="trocaAberta = false">
              Voltar aos golpes
            </button>
          </div>

          <!-- Durante a resolução do turno os golpes ficam VISÍVEIS e
               desabilitados: dizem "é sua vez daqui a pouco" e mantêm a leitura
               do time. Sumir com eles é o que dava a sensação de tela quebrada. -->
          <template v-else>
            <div class="faixa__golpes">
              <MoveButton
                v-for="move in pvp.you.moves"
                :key="move.id"
                :move="move"
                :opponent-types="pvp.foe.types"
                :disabled="!canAct"
                @select="useMove"
              />
            </div>

            <button
              v-if="reservas.length"
              class="faixa__trocar"
              type="button"
              :disabled="!canAct"
              @click="trocaAberta = true"
            >
              ⇄ Trocar ({{ reservas.length }})
            </button>
          </template>
        </template>
      </div>
    </div>

    <!-- Resultado -->
    <div v-if="showResult" class="pvp-result">
      <div
        class="pvp-result__card"
        :class="{
          'pvp-result__card--defeat': resultKind === 'loss',
          'pvp-result__card--victory': resultKind === 'win',
        }"
      >
        <p class="pixel pvp-result__title">{{ resultText }}</p>
        <p class="pvp-result__reason">{{ resultReason }}</p>
        <p v-if="retryText" class="pvp-result__reason">{{ retryText }}</p>
        <p v-if="pvp.result?.rating" class="pixel pvp-result__rating">
          {{ ratingDeltaText }}
        </p>
        <p v-if="pvp.result?.rating" class="pvp-result__rating-detail">
          Novo Elo: {{ pvp.result.rating.rating }} · {{ pvp.result.rating.tier }}
        </p>
        <p v-if="naTreino" class="pvp-result__rating-detail">
          Foi um treino: seu Elo e sua coleção não mudam.
        </p>
        <button
          v-if="naTreino"
          class="pixel pvp-result__btn"
          type="button"
          :disabled="reabrindo"
          @click="treinarDeNovo"
        >
          {{ reabrindo ? 'PREPARANDO…' : 'TREINAR DE NOVO' }}
        </button>
        <button
          class="pixel pvp-result__btn"
          :class="{ 'pvp-result__btn--secundario': naTreino }"
          type="button"
          @click="backToLobby"
        >
          {{ naRaid ? 'VOLTAR À PROFDEX' : naTreino ? 'VOLTAR AO TREINO' : 'VOLTAR AO LOBBY' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/*
 * ── A altura da faixa de comandos ───────────────────────────────────────────
 *
 * Os três blocos que se alternam na faixa (grade de golpes + troca, painel de
 * entrada, painel de troca) não tinham altura reservada. Daí os dois sintomas
 * relatados no celular, que eram O MESMO defeito: a tela pulava quando um golpe
 * era usado, e os golpes sumiam quando o professor caía.
 *
 * Agora a altura vem de UMA conta, aqui: as medidas dos pedaços somam a altura
 * da faixa, e `--faixa-blocos` reserva o MAIOR dos três (a grade 2×2 mais o
 * botão de troca). Nenhum valor se repete em seletor nenhum.
 */
.pvp-arena {
  --faixa-gap: 8px;
  --faixa-pad-topo: 10px;
  --faixa-pad-base: calc(12px + env(safe-area-inset-bottom));
  --faixa-times: 44px;
  /* Moldura do treino (44px) mais a folga da segunda linha: a mensagem é a
     única coisa aqui cujo texto o servidor escolhe, e "Aguardando Fulano…"
     pode quebrar. Com altura fixa ela quebra DENTRO da caixa. */
  --faixa-mensagem: 56px;
  /* Altura de uma linha de golpes. Tem de ser >= o `min-height` do MoveButton
     (82px) e >= o que o nome mais longo ocupa em duas linhas (~86px medidos no
     celular); a folga é o que impede a grade de estourar a reserva. */
  --faixa-golpe: 88px;
  --faixa-trocar: 40px;

  /* O maior dos três blocos: 2 linhas de golpe + o botão de troca. */
  --faixa-blocos: calc(var(--faixa-golpe) * 2 + var(--faixa-gap) * 2 + var(--faixa-trocar));

  --faixa-altura: calc(
    var(--faixa-pad-topo) + var(--faixa-times) + var(--faixa-gap) + var(--faixa-mensagem) +
      var(--faixa-gap) + var(--faixa-blocos) + var(--faixa-pad-base)
  );

  /*
   * O palco já reserva `--palco-faixa` de rodapé para comandos — a faixa do
   * treino, com a qual o enquadramento dos lutadores foi fechado. A faixa daqui
   * é mais alta (tem o banco e o botão de troca), então o palco sobe só a
   * DIFERENÇA. Recuar a faixa inteira encolheria os dois personagens, que é
   * exatamente a queixa que esta tela existe para resolver.
   */
  --palco-recuo: max(0px, calc(var(--faixa-altura) - var(--palco-faixa)));

  position: fixed;
  inset: 0;
  overflow: hidden;
  background: #08000f;
  display: flex;
  flex-direction: column;
  /* A faixa é o único filho em fluxo; o palco é absoluto. */
  justify-content: flex-end;
}

.pvp-arena::after {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 1;
  pointer-events: none;
}

.pvp-arena--defeat::after {
  background: radial-gradient(circle at center, transparent 34%, rgba(205, 32, 32, 0.46) 100%);
  box-shadow: inset 0 0 90px rgba(255, 48, 48, 0.5);
  animation: pvp-result-pulse 2.4s ease-in-out infinite;
}

.pvp-arena--victory::after {
  background: radial-gradient(circle at center, transparent 42%, rgba(255, 209, 102, 0.2) 100%);
  box-shadow: inset 0 0 80px rgba(255, 209, 102, 0.22);
  animation: pvp-result-pulse 2.4s ease-in-out infinite;
}

@keyframes pvp-result-pulse {
  50% {
    opacity: 0.62;
  }
}

/* O fundo (ginásio da UNIFIL), os dois lutadores e as barras de HP são o
   ArenaPalco.vue — o mesmo componente do treino. As duas telas são a mesma
   batalha para quem joga, e palcos separados já divergiram uma vez. */

/* ── A faixa de comandos ─────────────────────────────────────────────────── */
.faixa {
  position: relative;
  z-index: 2;
  flex-shrink: 0;
  /* A conta está no topo deste arquivo. `min-height` e não `height`: uma
     mensagem que quebre em duas linhas cresce para cima em vez de ser cortada. */
  min-height: var(--faixa-altura);
  background: var(--bg-card);
  border-top: 2px solid var(--border);
  padding: var(--faixa-pad-topo) 14px var(--faixa-pad-base);
  display: flex;
  flex-direction: column;
  gap: var(--faixa-gap);
}

/* Os dois times, o do rival à esquerda e o seu à direita — a mesma diagonal do
   palco, onde o rival está no alto à esquerda e você embaixo à direita. */
.faixa__times {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--faixa-gap);
  /* Reservado mesmo quando alguém joga com um exemplar só (aí não há banco). */
  min-height: var(--faixa-times);
}

/* A moldura de mensagem do treino, com o timer na mesma linha (à direita).
   `height` e não `min-height`: uma mensagem de duas linhas empurraria a faixa
   inteira, que é justamente o que esta tarefa acaba com. */
.faixa__mensagem {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  height: var(--faixa-mensagem);
  padding: 10px 14px;
  border: 2px solid var(--yellow);
  border-radius: var(--radius);
  background: var(--bg-card);
  color: var(--text);
  font-size: 9px;
  line-height: 1.6;
}

.faixa__texto {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.faixa__timer {
  flex-shrink: 0;
  font-size: 9px;
  color: var(--text);
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 6px 8px;
}

.faixa__timer--baixo {
  color: var(--red-light);
  animation: pvp-blink 1s steps(2) infinite;
}

.dicas-flutuantes {
  position: fixed;
  z-index: 30;
  top: calc(env(safe-area-inset-top, 0px) + 96px);
  right: 8px;
  width: min(160px, 32vw);
  display: flex;
  flex-direction: column;
  gap: 4px;
  pointer-events: none;
}

.dica-flutuante {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: start;
  gap: 4px;
  padding: 4px 6px;
  border: 1px solid var(--border);
  border-left: 2px solid var(--yellow);
  border-radius: 7px;
  color: var(--text);
  background: rgba(18, 20, 24, 0.94);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.45);
  font-size: 9px;
  line-height: 1.3;
  animation:
    dica-aparecer 180ms ease-out both,
    dica-sumir 280ms ease-in 3.72s both;
}

.dica-flutuante__turno {
  padding-top: 2px;
  color: var(--text-muted);
  font-size: 5px;
}

.dica-flutuante__texto {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
}

.pvp-arena__log,
.battle-log__fechar {
  position: absolute;
  top: calc(61px + env(safe-area-inset-top));
  right: 12px;
  z-index: 4;
  width: 64px;
  height: 28px;
  padding: 5px 8px;
  border: 1px solid rgba(255, 255, 255, 0.25);
  border-radius: 6px;
  background: rgba(18, 20, 24, 0.35);
  color: var(--text);
  font-size: 7px;
  cursor: pointer;
}

.battle-log {
  box-sizing: border-box;
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100dvh;
  max-width: none;
  max-height: none;
  margin: 0;
  padding: calc(16px + env(safe-area-inset-top)) 16px calc(16px + env(safe-area-inset-bottom));
  border: 0;
  color: var(--text);
  background: rgba(12, 14, 18, 0.82);
}

.battle-log[open] { display: flex; flex-direction: column; gap: 16px; }
.battle-log::backdrop { background: transparent; }
.battle-log__header { display: flex; align-items: flex-start; gap: 12px; min-height: 76px; padding-right: 76px; }
.battle-log__header h2 { margin: 0; color: var(--yellow); font-size: 9px; line-height: 1.7; }
.battle-log__header p { margin: 5px 0 0; color: var(--text-muted); font-size: 11px; }
.battle-log__fechar { background: rgba(18, 20, 24, 0.7); }
.battle-log__lista { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 6px; margin: 0; padding: 0; overflow-y: auto; list-style: none; }
.battle-log__evento { display: grid; grid-template-columns: 30px minmax(0, 1fr); gap: 8px; padding: 10px; border-left: 2px solid var(--yellow); border-radius: 5px; background: rgba(18, 20, 24, 0.55); font-size: 13px; line-height: 1.5; }
.battle-log__turno { padding-top: 4px; color: var(--text-muted); font-size: 6px; }
.battle-log__evento--dano, .battle-log__evento--queda { border-left-color: var(--error); }
.battle-log__evento--cura { border-left-color: var(--ds-green-glow); }
.battle-log__vazio { color: var(--text-muted); font-size: 13px; }

.dica-flutuante--dano,
.dica-flutuante--queda {
  border-left-color: var(--error);
}

.dica-flutuante--cura {
  border-left-color: var(--ds-green-glow);
}

.dica-flutuante--eficacia,
.dica-flutuante--golpe,
.dica-flutuante--troca {
  border-left-color: var(--yellow);
}

@keyframes dica-aparecer {
  from {
    opacity: 0;
    transform: translateX(12px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

@keyframes dica-sumir {
  to {
    opacity: 0;
    transform: translateX(10px);
  }
}

@keyframes pvp-blink {
  50% {
    opacity: 0.35;
  }
}

/* O espaço dos três blocos. `height` e não `min-height`: com mínimo, o bloco
   mais alto (a grade) ainda podia passar da reserva e a faixa pulava de novo —
   a altura travada precisa ser a MESMA, não apenas um piso.
   `justify-content: flex-end` encosta a grade embaixo: o que sobra fica em
   cima, e os botões não mudam de lugar debaixo do dedo. */
.faixa__blocos {
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  gap: var(--faixa-gap);
  height: var(--faixa-blocos);
}

/* Linhas `1fr`, não automáticas: a grade divide exatamente o que sobrou do
   bloco, então nome de golpe comprido usa a folga em vez de esticar a faixa. */
.faixa__golpes {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-template-rows: 1fr 1fr;
  gap: var(--faixa-gap);
}

.faixa__trocar {
  min-height: var(--faixa-trocar);
  border: 2px solid var(--border);
  border-radius: var(--radius);
  background: rgba(255, 255, 255, 0.05);
  color: var(--text);
  font-size: 13px;
  cursor: pointer;
}

.faixa__trocar:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

/* ── Troca e entrada após nocaute ────────────────────────────────────────── */
.entrada {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 8px;
  /* Ocupa o bloco inteiro: o painel de entrada e o estado "o rival está
     escolhendo…" precisam do MESMO espaço que a grade de golpes. */
  flex: 1;
}

.entrada__titulo {
  margin: 0;
  font-size: 13px;
  font-weight: 700;
  color: var(--yellow, #ffcb05);
  text-align: center;
}

/* Esperar o rival escolher não é um comando: o texto é o mesmo tamanho, mas
   apagado, e o bloco continua com a altura reservada. */
.entrada__titulo--espera {
  font-weight: 400;
  color: var(--text-muted);
}

.entrada__opcoes {
  display: flex;
  gap: 8px;
  justify-content: center;
  flex-wrap: wrap;
}

.entrada__opcao {
  min-width: 92px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: 8px;
  border: 2px solid var(--border, #2a2f3a);
  border-radius: var(--radius, 8px);
  background: rgba(255, 255, 255, 0.05);
  color: var(--text, #fff);
  cursor: pointer;
}

.entrada__opcao:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.entrada__face {
  width: 40px;
  height: 40px;
  object-fit: contain;
}

.entrada__nome {
  font-size: 11px;
}

.entrada__hp {
  font-size: 10px;
  color: var(--text-muted, #8b93a7);
  font-variant-numeric: tabular-nums;
}

.entrada__cancelar {
  align-self: center;
  border: 0;
  background: none;
  color: var(--text-muted, #8b93a7);
  font-size: 12px;
  text-decoration: underline;
  cursor: pointer;
}

.pvp-result {
  position: absolute;
  inset: 0;
  z-index: 3;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.72);
}

.pvp-result__card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  background: var(--bg-card);
  border: 2px solid var(--yellow);
  border-radius: var(--radius-lg);
  padding: 26px 30px;
}

.pvp-result__card--defeat {
  border-color: #ff7676;
  box-shadow: 0 0 34px rgba(255, 64, 64, 0.28);
}

.pvp-result__card--victory {
  border-color: #ffd166;
  box-shadow: 0 0 34px rgba(255, 209, 102, 0.22);
}

.pvp-result__title {
  font-size: 20px;
  color: var(--yellow);
}

.pvp-result__card--defeat .pvp-result__title,
.pvp-result__card--defeat .pvp-result__rating {
  color: #ff9b9b;
}

.pvp-result__reason {
  margin: 0;
  font-size: 13px;
  color: var(--text-muted);
}

.pvp-result__rating {
  margin: 0;
  font-size: 9px;
  color: var(--ds-green);
}

.pvp-result__rating-detail {
  margin: -4px 0 0;
  font-size: 12px;
  color: var(--text-muted);
}

.pvp-result__btn {
  margin-top: 6px;
  min-height: 44px;
  padding: 0 18px;
  font-size: 10px;
  border-radius: var(--radius);
  background: var(--red-dark);
  border: 1px solid var(--red-light);
  color: white;
  cursor: pointer;
}

.pvp-result__btn:disabled {
  opacity: 0.6;
  cursor: wait;
}

/* No treino, "treinar de novo" é o caminho principal; voltar é a saída. */
.pvp-result__btn--secundario {
  background: transparent;
  border-color: var(--border);
  color: var(--text-muted);
}

/* ── Treino ──────────────────────────────────────────────────────────────── */

/* O selo fica logo abaixo da barra do bot, como na arena do treino antigo
   (ArenaView), e o palco recebe `--palco-foe-livre` para o sprite do bot não
   ficar atrás dele. */
.pvp-arena--treino {
  --palco-foe-livre: calc(103px + env(safe-area-inset-top));
}

.pvp-arena__selo {
  position: absolute;
  top: calc(76px + env(safe-area-inset-top));
  left: 12px;
  z-index: 3;
  max-width: 62%;
  margin: 0;
  padding: 5px 8px;
  border: 1px solid var(--unifil-gold);
  border-radius: var(--radius);
  background: rgba(0, 0, 0, 0.72);
  color: var(--unifil-gold);
  font-size: 6px;
  line-height: 1.5;
  letter-spacing: 0.05em;
  pointer-events: none;
}

/* Canto superior direito, onde a arena do treino antigo tinha o "voltar". */
.pvp-arena__fugir {
  position: absolute;
  top: calc(12px + env(safe-area-inset-top));
  right: 12px;
  z-index: 3;
  min-width: 44px;
  min-height: 44px;
  padding: 0 12px;
  border-radius: var(--radius);
  background: rgba(0, 0, 0, 0.55);
  border: 1px solid var(--border);
  color: var(--text);
  font-size: 8px;
  cursor: pointer;
  touch-action: manipulation;
  transition:
    background-color 0.15s ease,
    border-color 0.15s ease;
}

.pvp-arena__fugir--armado {
  background: var(--error);
  border-color: var(--error);
  color: white;
}

.pvp-arena__fugir:focus-visible {
  outline: 3px solid var(--unifil-gold);
  outline-offset: 2px;
}

/* O MoveButton fica mais alto em tela estreita (88px) e o nome quebra em mais
   linhas; a reserva acompanha, senão a grade estouraria o bloco travado. */
@media (max-width: 340px) {
  .pvp-arena {
    --faixa-golpe: 96px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .pvp-arena--defeat::after,
  .pvp-arena--victory::after,
  .faixa__timer--baixo {
    animation: none;
    transition: none;
  }
}
</style>
