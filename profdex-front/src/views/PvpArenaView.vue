<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import ArenaPalco from '../components/ArenaPalco.vue'
import BancoDeReservas from '../components/BancoDeReservas.vue'
import MoveButton from '../components/MoveButton.vue'
import ProfessorFace from '../components/ProfessorFace.vue'
import { useBattleStore } from '../stores/battle'

// Arena PvP: o servidor resolve tudo; esta tela só envia a intenção de golpe
// e ANIMA a fila de eventos de cada rodada (mesma linguagem do useBattle.js).
// Nos eventos recebidos a perspectiva já vem espelhada pelo servidor:
// target 'player' = VOCÊ, 'enemy' = rival — para os dois jogadores.
const router = useRouter()
const battle = useBattleStore()

// Estado exibido (a "verdade" chega pronta do servidor; isto aqui só anima).
const youHp = ref(0)
const foeHp = ref(0)
const message = ref('')
const youHit = ref(false)
const foeHit = ref(false)
const youFainted = ref(false)
const foeFainted = ref(false)
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
const timeExibido = ref({ you: [], foe: [] })

function sincronizarTimeExibido() {
  timeExibido.value = {
    you: pvp.value?.you?.team ?? [],
    foe: pvp.value?.foe?.team ?? [],
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
  if (ack.ok) message.value = pvp.value?.foeMoved ? 'Resolvendo…' : 'Aguardando o rival…'
}

async function entrarCom(membro) {
  if (!precisaEntrar.value) return
  const ack = await battle.enterWith(membro.captureId)
  if (ack.ok) message.value = `${membro.professor.name} entra em campo!`
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
const ladoRival = computed(() => ({
  professor: pvp.value?.foe?.professor,
  name: pvp.value?.foe?.professor?.name ?? pvp.value?.opponent?.name ?? '',
  types: pvp.value?.foe?.types ?? [],
  hp: foeHp.value,
  maxHp: pvp.value?.foe?.maxHp ?? 0,
  hit: foeHit.value,
  fainted: foeFainted.value,
  feedback: foeFeedback.value,
}))

const ladoSeu = computed(() => ({
  professor: pvp.value?.you?.professor,
  name: pvp.value?.you?.professor?.name ?? 'Você',
  types: pvp.value?.you?.types ?? [],
  hp: youHp.value,
  maxHp: pvp.value?.you?.maxHp ?? 0,
  hit: youHit.value,
  fainted: youFainted.value,
  feedback: youFeedback.value,
}))

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
    return p.foeMoved ? 'Resolvendo a rodada…' : `Aguardando ${p.opponent.name}…`
  }
  return message.value
})

const resultText = computed(() => {
  const r = pvp.value?.result
  if (!r) return ''
  if (r.result === 'win') return 'VOCÊ VENCEU!'
  if (r.result === 'loss') return 'VOCÊ FOI DERROTADO'
  return 'EMPATE!'
})

const resultKind = computed(() => pvp.value?.result?.result ?? '')
const ratingDeltaText = computed(() => {
  const delta = pvp.value?.result?.rating?.delta
  if (!Number.isFinite(delta)) return ''
  return `ELO ${delta >= 0 ? '+' : ''}${delta}`
})

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// Reproduz a fila de eventos de uma rodada (mesmos tipos do motor).
async function play(events) {
  animating.value = true
  for (const ev of events) {
    switch (ev.type) {
      case 'message':
        message.value = ev.text
        await delay(850)
        break
      case 'damage': {
        lastDamageTarget = ev.target
        showFeedback(ev.target, { amount: ev.amount, kind: 'dano' })
        const isYou = ev.target === 'player'
        const flag = isYou ? youHit : foeHit
        flag.value = true
        if (isYou) youHp.value = Math.max(0, youHp.value - ev.amount)
        else foeHp.value = Math.max(0, foeHp.value - ev.amount)
        if (isYou && youHp.value <= 0) youFainted.value = true
        if (!isYou && foeHp.value <= 0) foeFainted.value = true
        await delay(450)
        flag.value = false
        message.value = `Causou ${ev.amount} de dano!`
        await delay(650)
        break
      }
      case 'heal': {
        showFeedback(ev.target, { amount: ev.amount, kind: 'cura' })
        if (ev.target === 'player') youHp.value += ev.amount
        else foeHp.value += ev.amount
        await delay(600)
        break
      }
      case 'status':
        await delay(300)
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
        await delay(800)
        break
      case 'faint':
        if (ev.target === 'player') youFainted.value = true
        if (ev.target === 'enemy') foeFainted.value = true
        await delay(300)
        break
      // A troca sai da SALA, não do motor: quem entra assume o lugar em campo.
      // O sprite e a barra vêm do `you`/`foe` já atualizados no fim da fila, e
      // aqui só se limpa o estado de "caído" do slot, que agora é de outro.
      case 'switch':
        if (ev.target === 'player') youFainted.value = false
        if (ev.target === 'enemy') foeFainted.value = false
        message.value = `${ev.name} entra em campo!`
        await delay(700)
        break
      default:
        break
    }
  }
  // Fim da fila: alinha com os valores autoritativos do servidor.
  syncFromServer()
  animating.value = false
  battle.consumeEvents()

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

function syncFromServer() {
  if (!pvp.value?.you) return
  youHp.value = pvp.value.you.hp
  foeHp.value = pvp.value.foe.hp
  // Atribuição, não `if (…) = true`: com o time, quem está em campo MUDA. Só
  // ligar a bandeira deixava o sprite caído para sempre — depois do primeiro
  // nocaute, todo substituto entrava cinza e tombado, como se já estivesse
  // morto, porque nada nunca a desligava.
  youFainted.value = youHp.value <= 0
  foeFainted.value = foeHp.value <= 0
  // O banco só acompanha depois que a animação alcança o servidor (ver
  // `timeExibido`): o HP dos reservas é a mesma verdade da barra grande.
  sincronizarTimeExibido()
}

async function useMove(move) {
  if (!canAct.value) return
  const ack = await battle.submitMove(move.id)
  if (ack.ok) message.value = pvp.value?.foeMoved ? 'Resolvendo…' : 'Aguardando o rival…'
}

function backToLobby() {
  battle.leaveBattle()
  router.push({ name: 'batalha' })
}

// Novas rodadas chegam pelo store; anima assim que houver fila.
watch(
  () => pvp.value?.pendingEvents,
  (events) => {
    if (events?.length && !animating.value) play([...events])
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
    message.value = pvp.value.youMoved ? 'Aguardando o rival…' : 'Escolha seu golpe!'
  },
)

// Caso battle:end chegue sem eventos (ex.: abandono antes de qualquer rodada).
watch(
  () => pvp.value?.phase,
  (phase) => {
    if (phase === 'done' && !animating.value && !pvp.value?.pendingEvents?.length) {
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
    router.replace({ name: pvp.value ? 'pvp-pick' : 'batalha' })
    return
  }
  syncFromServer()
  message.value = `${pvp.value.foe.professor?.name ?? pvp.value.opponent.name} entrou na arena!`
  clock = setInterval(() => {
    now.value = Date.now()
    resyncIfStuck()
  }, 500)
})

onUnmounted(() => clock && clearInterval(clock))
</script>

<template>
  <div
    v-if="pvp?.you"
    class="pvp-arena"
    :class="{
      'pvp-arena--defeat': youFainted || resultKind === 'loss',
      'pvp-arena--victory': foeFainted || resultKind === 'win',
    }"
  >
    <!-- O mesmo palco do treino: só os dois lutadores, o fundo e as barras de
         HP sobrepostas. Sem colunas flex, sem banco de reservas aqui dentro. -->
    <ArenaPalco :foe="ladoRival" :you="ladoSeu" />

    <!-- Faixa de comandos, de ALTURA TRAVADA (ver `--faixa-altura` no estilo):
         os três blocos que se alternam aqui ocupam sempre o mesmo espaço. -->
    <div class="faixa">
      <!-- Os dois times, numa linha fina. Antes ficavam empilhados na coluna do
           sprite, entre a barra de HP e o personagem — e era o do rival que
           mais espremia. As reservas do rival são PÚBLICAS de propósito: o time
           dele já foi revelado no preview e o HP de cada um foi visto em campo;
           esconder não criaria segredo, só obrigaria a decorar. -->
      <div class="faixa__times">
        <BancoDeReservas :team="timeExibido.foe" foe rotulo="RIVAL" />
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
        <div v-if="pvp.phase === 'switching'" class="entrada">
          <template v-if="precisaEntrar">
            <p class="entrada__titulo">Quem entra agora?</p>
            <div class="entrada__opcoes">
              <button
                v-for="m in reservas"
                :key="m.captureId"
                class="entrada__opcao"
                type="button"
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
        <p class="pvp-result__reason">
          {{ pvp.result?.reason === 'abandono' ? 'Por abandono' : 'Por nocaute' }}
        </p>
        <p v-if="pvp.result?.rating" class="pixel pvp-result__rating">
          {{ ratingDeltaText }}
        </p>
        <p v-if="pvp.result?.rating" class="pvp-result__rating-detail">
          Novo Elo: {{ pvp.result.rating.rating }} · {{ pvp.result.rating.tier }}
        </p>
        <button class="pixel pvp-result__btn" type="button" @click="backToLobby">
          VOLTAR AO LOBBY
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
  min-width: 0;
  overflow: hidden;
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
