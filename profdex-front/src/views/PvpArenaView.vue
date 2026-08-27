<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import BattleHpBar from '../components/BattleHpBar.vue'
import BinaryTunnelScene from '../components/BinaryTunnelScene.vue'
import DamagePopup from '../components/DamagePopup.vue'
import MoveButton from '../components/MoveButton.vue'
import { useBattleStore } from '../stores/battle'
import { spriteUrlForProfessor } from '../data/professorSprites'

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
  if (!p || p.phase !== 'active' || animating.value) return
  if (now.value < p.deadline + RESYNC_GRACE_MS) return
  if (now.value - lastResyncAt < RESYNC_COOLDOWN_MS) return
  lastResyncAt = now.value
  battle.requestResync()
}

const secondsLeft = computed(() => {
  if (!pvp.value?.deadline || pvp.value.phase !== 'active') return 0
  return Math.max(0, Math.ceil((pvp.value.deadline - now.value) / 1000))
})

const canAct = computed(
  () =>
    pvp.value?.phase === 'active' && !pvp.value.youMoved && !animating.value && !showResult.value,
)

// Sprites 2D, não .glb: dois modelos de dezenas de MB por partida faziam o
// Safari do iPhone descartar a aba no meio da batalha.
// Ver docs/BUG-BATALHA-TRAVANDO.md.
const youSprite = computed(() => spriteUrlForProfessor(pvp.value?.you?.professor))
const foeSprite = computed(() => spriteUrlForProfessor(pvp.value?.foe?.professor))

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
  } else if (pvp.value?.phase === 'active') {
    message.value = 'Escolha seu golpe!'
  }
}

function syncFromServer() {
  if (!pvp.value?.you) return
  youHp.value = pvp.value.you.hp
  foeHp.value = pvp.value.foe.hp
  if (youHp.value <= 0) youFainted.value = true
  if (foeHp.value <= 0) foeFainted.value = true
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
  if (!pvp.value || pvp.value.phase === 'picking') {
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
    <div class="pvp-arena__bg">
      <BinaryTunnelScene :speed="5" color="#ff2bc4" />
    </div>
    <img class="pvp-arena__brand" src="/marca/logotipo-branco.png" alt="UNIFIL" />

    <!-- Rival (topo) -->
    <div class="pvp-arena__foe">
      <BattleHpBar
        :name="pvp.foe.professor?.name ?? pvp.opponent.name"
        :hp="foeHp"
        :max-hp="pvp.foe.maxHp"
      />
      <img
        class="pvp-arena__model pvp-arena__model--foe"
        :class="{ 'pvp-arena__model--hit': foeHit, 'pvp-arena__model--fainted': foeFainted }"
        :src="foeSprite"
        :alt="`Prof. ${pvp.foe.professor?.name ?? pvp.opponent.name}`"
        decoding="async"
      />
      <DamagePopup v-for="item in foeFeedback" :key="item.id" v-bind="item" />
    </div>

    <!-- Você (base) -->
    <div class="pvp-arena__you">
      <img
        class="pvp-arena__model"
        :class="{ 'pvp-arena__model--hit': youHit, 'pvp-arena__model--fainted': youFainted }"
        :src="youSprite"
        :alt="pvp.you.professor?.name ?? 'Seu professor'"
        decoding="async"
      />
      <DamagePopup v-for="item in youFeedback" :key="item.id" v-bind="item" />
      <BattleHpBar :name="pvp.you.professor?.name ?? 'Você'" :hp="youHp" :max-hp="pvp.you.maxHp" />
    </div>

    <!-- HUD -->
    <div class="pvp-arena__hud">
      <div class="pvp-arena__msgrow">
        <p class="pvp-arena__message">{{ message }}</p>
        <span
          v-if="pvp.phase === 'active'"
          class="pixel pvp-arena__timer"
          :class="{ 'pvp-arena__timer--low': secondsLeft <= 10 }"
        >
          {{ secondsLeft }}s
        </span>
      </div>

      <div class="pvp-arena__moves">
        <MoveButton
          v-for="move in pvp.you.moves"
          :key="move.id"
          :move="move"
          :opponent-types="pvp.foe.types"
          :disabled="!canAct"
          @select="useMove"
        />
      </div>

      <p v-if="pvp.youMoved && pvp.phase === 'active' && !animating" class="pvp-arena__waiting">
        {{ pvp.foeMoved ? 'Resolvendo a rodada…' : `Aguardando ${pvp.opponent.name}…` }}
      </p>
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
.pvp-arena {
  position: fixed;
  inset: 0;
  overflow: hidden;
  background: #08000f;
  display: flex;
  flex-direction: column;
}

.pvp-arena::after {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 1;
  pointer-events: none;
}

.pvp-arena__brand {
  position: absolute;
  top: calc(12px + env(safe-area-inset-top));
  right: 16px;
  z-index: 1;
  width: clamp(64px, 19vw, 112px);
  height: auto;
  opacity: 0.64;
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.45));
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

.pvp-arena__bg {
  position: absolute;
  inset: 0;
  opacity: 0.8;
}

.pvp-arena__foe,
.pvp-arena__you {
  position: relative;
  z-index: 1;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 14px 0;
  min-height: 0;
}

.pvp-arena__foe {
  align-items: flex-end;
}

.pvp-arena__you {
  align-items: flex-start;
  justify-content: flex-end;
}

.pvp-arena__model {
  width: 46vw;
  max-width: 240px;
  flex: 1;
  min-height: 0;
  /* `contain` mantém o sprite inteiro no quadro que antes era do model-viewer,
     sem esticar a arte quando a tela é estreita. */
  object-fit: contain;
  object-position: bottom center;
  background: transparent;
  /* Sombra no lugar da que o model-viewer projetava. */
  filter: drop-shadow(0 12px 14px rgba(0, 0, 0, 0.45));
  transition:
    filter 0.6s ease,
    opacity 0.6s ease,
    transform 0.6s ease;
}

.pvp-arena__model--foe {
  align-self: flex-start;
  object-position: top center;
}

.pvp-arena__model--hit {
  animation: pvp-hit 0.45s steps(3);
}

.pvp-arena__model--fainted,
.pvp-arena__model--fainted.pvp-arena__model--hit {
  animation: none;
  filter: grayscale(1) brightness(0.6);
  opacity: 0.75;
  transform: translateY(8%) rotate(12deg);
}

@keyframes pvp-hit {
  50% {
    opacity: 0.2;
    filter: brightness(3);
  }
}

.pvp-arena__hud {
  position: relative;
  z-index: 2;
  flex-shrink: 0;
  background: var(--bg-card);
  border-top: 2px solid var(--border);
  padding: 10px 14px calc(12px + env(safe-area-inset-bottom));
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.pvp-arena__msgrow {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-height: 38px;
}

.pvp-arena__message {
  margin: 0;
  font-size: 14px;
  color: var(--text);
}

.pvp-arena__timer {
  flex-shrink: 0;
  font-size: 14px;
  color: var(--text);
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 6px 10px;
}

.pvp-arena__timer--low {
  color: var(--red-light);
  animation: pvp-blink 1s steps(2) infinite;
}

@keyframes pvp-blink {
  50% {
    opacity: 0.35;
  }
}

.pvp-arena__moves {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.pvp-move {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  padding: 10px 12px;
  border-radius: var(--radius);
  background: var(--bg-surface);
  border: 2px solid var(--border);
  color: var(--text);
  cursor: pointer;
  text-align: left;
}

.pvp-move:disabled {
  opacity: 0.45;
  cursor: default;
}

.pvp-move__name {
  font-size: 8px;
}

.pvp-move__meta {
  /* O icone virou elemento e precisa alinhar com o numero ao lado. */
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  font-size: 11px;
  color: var(--text-muted);
}

.pvp-arena__waiting {
  margin: 0;
  font-size: 12px;
  color: var(--text-muted);
  text-align: center;
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

@media (prefers-reduced-motion: reduce) {
  .pvp-arena--defeat::after,
  .pvp-arena--victory::after,
  .pvp-arena__model,
  .pvp-arena__model--hit,
  .pvp-arena__timer--low {
    animation: none;
    transition: none;
  }
}
</style>
