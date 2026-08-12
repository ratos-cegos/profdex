<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import BattleHpBar from '../components/BattleHpBar.vue'
import BinaryTunnelScene from '../components/BinaryTunnelScene.vue'
import { useBattleStore } from '../stores/battle'
import { spriteUrlForProfessor } from '../data/professorSprites'
import { getType } from '../data/types'

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
const animating = ref(false)
const showResult = ref(false)

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
    pvp.value?.phase === 'active' &&
    !pvp.value.youMoved &&
    !animating.value &&
    !showResult.value,
)

// Sprites 2D, não .glb: dois modelos de dezenas de MB por partida faziam o
// Safari do iPhone descartar a aba no meio da batalha.
// Ver docs/BUG-BATALHA-TRAVANDO.md.
const youSprite = computed(() => spriteUrlForProfessor(pvp.value?.you?.professor))
const foeSprite = computed(() => spriteUrlForProfessor(pvp.value?.foe?.professor))

const resultText = computed(() => {
  const r = pvp.value?.result
  if (!r) return ''
  if (r.result === 'win') return 'VITÓRIA!'
  if (r.result === 'loss') return 'DERROTA…'
  return 'EMPATE!'
})

function moveTypeColor(move) {
  return getType(move.type)?.color || 'var(--bg-surface)'
}

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
        const isYou = ev.target === 'player'
        const flag = isYou ? youHit : foeHit
        flag.value = true
        if (isYou) youHp.value = Math.max(0, youHp.value - ev.amount)
        else foeHp.value = Math.max(0, foeHp.value - ev.amount)
        await delay(450)
        flag.value = false
        message.value = `Causou ${ev.amount} de dano!`
        await delay(650)
        break
      }
      case 'heal': {
        if (ev.target === 'player') youHp.value += ev.amount
        else foeHp.value += ev.amount
        await delay(600)
        break
      }
      case 'status':
        await delay(300)
        break
      case 'effectiveness':
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
  <div v-if="pvp?.you" class="pvp-arena">
    <div class="pvp-arena__bg">
      <BinaryTunnelScene :speed="5" color="#ff2bc4" />
    </div>

    <!-- Rival (topo) -->
    <div class="pvp-arena__foe">
      <BattleHpBar
        :name="pvp.foe.professor?.name ?? pvp.opponent.name"
        :hp="foeHp"
        :max-hp="pvp.foe.maxHp"
      />
      <img
        class="pvp-arena__model pvp-arena__model--foe"
        :class="{ 'pvp-arena__model--hit': foeHit }"
        :src="foeSprite"
        :alt="`Prof. ${pvp.foe.professor?.name ?? pvp.opponent.name}`"
        decoding="async"
      />
    </div>

    <!-- Você (base) -->
    <div class="pvp-arena__you">
      <img
        class="pvp-arena__model"
        :class="{ 'pvp-arena__model--hit': youHit }"
        :src="youSprite"
        :alt="pvp.you.professor?.name ?? 'Seu professor'"
        decoding="async"
      />
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
        <button
          v-for="move in pvp.you.moves"
          :key="move.id"
          class="pvp-move"
          type="button"
          :disabled="!canAct"
          :style="{ borderColor: moveTypeColor(move) }"
          @click="useMove(move)"
        >
          <span class="pixel pvp-move__name">{{ move.name }}</span>
          <span class="pvp-move__meta">
            {{ getType(move.type)?.icon }} {{ move.power ? `${move.power}` : move.raw }}
          </span>
        </button>
      </div>

      <p v-if="pvp.youMoved && pvp.phase === 'active' && !animating" class="pvp-arena__waiting">
        {{ pvp.foeMoved ? 'Resolvendo a rodada…' : `Aguardando ${pvp.opponent.name}…` }}
      </p>
    </div>

    <!-- Resultado -->
    <div v-if="showResult" class="pvp-result">
      <div class="pvp-result__card">
        <p class="pixel pvp-result__title">{{ resultText }}</p>
        <p class="pvp-result__reason">
          {{ pvp.result?.reason === 'abandono' ? 'Por abandono' : 'Por nocaute' }}
        </p>
        <p v-if="pvp.result?.rating" class="pixel pvp-result__rating">
          {{ pvp.result.rating.delta >= 0 ? '+' : '' }}{{ pvp.result.rating.delta }} pts
          → {{ pvp.result.rating.rating }} · {{ pvp.result.rating.tier }}
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
}

.pvp-arena__model--foe {
  align-self: flex-start;
  object-position: top center;
}

.pvp-arena__model--hit {
  animation: pvp-hit 0.45s steps(3);
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

.pvp-result__title {
  font-size: 20px;
  color: var(--yellow);
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
</style>
