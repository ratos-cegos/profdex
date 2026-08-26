<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useBattleStore } from '../stores/battle'
import { useCapturesStore } from '../stores/captures'
import { useProfessorsStore } from '../stores/professors'
import { typeInfos } from '../data/professorTypes'
import StarRating from '../components/StarRating.vue'

// Seleção às cegas em duas etapas, dentro dos mesmos 60s: primeiro QUEM, depois
// QUAL EXEMPLAR — o mesmo professor pode estar na coleção em combinações de
// tipos diferentes, cada uma com o seu deck.
// O oponente vê que você escolheu, mas não o quê: o servidor só revela os dois
// picks juntos, no battle:begin.
const router = useRouter()
const battle = useBattleStore()
const professors = useProfessorsStore()
const captures = useCapturesStore()

const now = ref(Date.now())
let clock = null

// Etapa 2: professor aberto para escolher entre os exemplares dele.
const aberto = ref(null)

onMounted(() => {
  battle.connect() // idempotente; cobre refresh no meio da seleção (resync)
  if (!professors.professors.length) professors.fetch().catch(() => {})
  captures.ensureLoaded().catch(() => {})
  clock = setInterval(() => {
    now.value = Date.now()
  }, 500)
  // Sem batalha em andamento (deep link, F5 sem sessão de sala): volta ao lobby.
  if (!battle.pvp) router.replace({ name: 'batalha' })
})

onUnmounted(() => clock && clearInterval(clock))

// Só professores com pelo menos um exemplar — a lista sai das capturas, não da
// dex, porque é o exemplar que entra na arena.
const capturados = computed(() =>
  professors.professors
    .map((p) => ({ ...p, exemplares: captures.byProfessorId(p.id) }))
    .filter((p) => p.exemplares.length > 0),
)

const grupos = computed(() =>
  aberto.value ? captures.groupedByVariant(aberto.value.id) : [],
)

const secondsLeft = computed(() => {
  const deadline = battle.pvp?.pickDeadline
  if (!deadline) return 0
  return Math.max(0, Math.ceil((deadline - now.value) / 1000))
})

// Os tipos de cada exemplar, não os do professor: um Eron de IA/ML e um de
// Arquitetura + IA/ML aparecem com badges diferentes.
function typesOf(professor) {
  const combinacoes = new Set()
  for (const exemplar of professor.exemplares) {
    for (const type of exemplar.types) combinacoes.add(type)
  }
  return typeInfos([...combinacoes])
}

function abrir(professor) {
  if (battle.pvp?.youPicked) return
  aberto.value = professor
}

async function choose(exemplar) {
  if (battle.pvp?.youPicked) return
  await battle.pickCapture(exemplar.id)
}
</script>

<template>
  <div v-if="battle.pvp" class="pick">
    <header class="pick__header">
      <div>
        <span class="pixel pick__eyebrow">BATALHA CONTRA</span>
        <h1 class="pixel pick__title">{{ battle.pvp.opponent.name }}</h1>
      </div>
      <span class="pixel pick__timer" :class="{ 'pick__timer--low': secondsLeft <= 10 }">
        {{ secondsLeft }}s
      </span>
    </header>

    <main class="pick__main page">
      <!-- Etapa 1: qual professor -->
      <template v-if="!aberto">
        <p class="pick__hint">
          Escolha seu professor. O rival não vê sua escolha até a batalha começar.
        </p>

        <p v-if="!capturados.length" class="pick__empty">
          Você ainda não capturou nenhum professor — capture um pela tela de
          Scanear para poder batalhar.
        </p>

        <ul v-else class="pick__grid">
          <li v-for="professor in capturados" :key="professor.id">
            <button
              class="pick-card"
              type="button"
              :disabled="battle.pvp.youPicked"
              @click="abrir(professor)"
            >
              <span class="pick-card__avatar">
                <img
                  :src="`/professors/${professor.slug}-face.png`"
                  :alt="professor.name"
                  @error="(e) => (e.currentTarget.style.visibility = 'hidden')"
                />
                <span v-if="professor.exemplares.length > 1" class="pick-card__count pixel">
                  ×{{ professor.exemplares.length }}
                </span>
              </span>
              <span class="pixel pick-card__name">{{ professor.name }}</span>
              <span class="pick-card__types">
                <span
                  v-for="t in typesOf(professor)"
                  :key="t.id"
                  class="pick-card__type"
                  :style="{ background: t.color }"
                >
                  {{ t.icon }} {{ t.label }}
                </span>
              </span>
            </button>
          </li>
        </ul>
      </template>

      <!-- Etapa 2: qual exemplar daquele professor (tipos + deck) -->
      <template v-else>
        <div class="pick__subhead">
          <button class="pick__back pixel" type="button" @click="aberto = null">← Trocar</button>
          <span class="pixel pick__subtitle">{{ aberto.name }}</span>
        </div>

        <p class="pick__hint">
          Cada exemplar tem tipos e golpes próprios, sorteados quando você o capturou.
        </p>

        <div v-for="grupo in grupos" :key="grupo.typeKey" class="exemplares">
          <div class="pick-card__types exemplares__types">
            <span
              v-for="t in typeInfos(grupo.types)"
              :key="t.id"
              class="pick-card__type"
              :style="{ background: t.color }"
            >
              {{ t.icon }} {{ t.label }}
            </span>
          </div>

          <button
            v-for="(exemplar, i) in grupo.items"
            :key="exemplar.id"
            class="exemplar-card"
            type="button"
            :disabled="battle.pvp.youPicked"
            @click="choose(exemplar)"
          >
            <span class="exemplar-card__head">
              <span class="pixel exemplar-card__idx">{{ i + 1 }}</span>
              <span class="exemplar-card__hint">Levar para a arena</span>
              <StarRating class="exemplar-card__stars" :value="exemplar.stars" />
            </span>
            <span class="exemplar-card__moves">
              <span v-for="m in exemplar.moves" :key="m.id" class="exemplar-card__move">
                {{ m.name }}<template v-if="m.power"> · {{ m.power }}</template>
              </span>
            </span>
          </button>
        </div>
      </template>

      <div class="pick__status">
        <p v-if="battle.pvp.youPicked" class="pixel pick__waiting">
          {{ battle.pvp.foePicked ? 'REVELANDO…' : 'AGUARDANDO O RIVAL…' }}
        </p>
        <p v-else-if="battle.pvp.foePicked" class="pick__foe-picked">
          {{ battle.pvp.opponent.name }} já escolheu!
        </p>
      </div>
    </main>
  </div>
</template>

<style scoped>
.pick {
  position: fixed;
  inset: 0;
  display: flex;
  flex-direction: column;
  background: var(--bg, #0b0d12);
}

.pick__header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 18px 20px;
  background: linear-gradient(160deg, var(--red-dark), var(--red));
}

.pick__eyebrow {
  display: block;
  font-size: 8px;
  color: var(--yellow);
  margin-bottom: 4px;
}

.pick__title {
  font-size: 16px;
  color: white;
  text-shadow: 2px 2px 0 rgba(0, 0, 0, 0.3);
}

.pick__timer {
  font-size: 18px;
  color: white;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.25);
  border-radius: var(--radius);
  padding: 8px 12px;
}

.pick__timer--low {
  color: var(--yellow);
  animation: pick-blink 1s steps(2) infinite;
}

@keyframes pick-blink {
  50% {
    opacity: 0.4;
  }
}

/* `flex: 1` e `overflow-y` já vêm da classe utilitária `.page`. */
.pick__main {
  padding: 20px 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.pick__hint,
.pick__empty {
  color: var(--text-muted);
  font-size: 13px;
  margin: 0;
}

.pick__grid {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 12px;
}

.pick-card {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 14px 10px;
  border-radius: var(--radius-lg);
  background: var(--bg-card);
  border: 2px solid var(--border);
  color: var(--text);
  cursor: pointer;
  transition: transform 0.15s, border-color 0.15s;
}

.pick-card:not(:disabled):active {
  transform: scale(0.97);
  border-color: var(--yellow);
}

.pick-card:disabled {
  opacity: 0.5;
  cursor: default;
}

.pick-card__avatar {
  position: relative;
  width: 64px;
  height: 64px;
  border-radius: 50%;
  border: 2px solid var(--yellow);
  background: var(--bg-surface);
}

.pick-card__avatar img {
  border-radius: 50%;
}

.pick-card__count {
  position: absolute;
  right: -4px;
  bottom: -4px;
  padding: 3px 6px;
  border-radius: 999px;
  font-size: 8px;
  color: var(--text-primary);
  background: var(--yellow);
  border: 1px solid var(--bg-deep);
}

.pick-card__avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.pick-card__name {
  font-size: 10px;
}

.pick-card__types {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 4px;
}

.pick-card__type {
  font-size: 10px;
  color: white;
  border-radius: 999px;
  padding: 2px 8px;
}

/* ── Etapa 2: exemplares ──────────────────────────────────────────────────── */
.pick__subhead {
  display: flex;
  align-items: center;
  gap: 10px;
}

.pick__back {
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-muted);
  border: 1px solid var(--border);
  border-radius: 20px;
  padding: 7px 12px;
  font-size: 8px;
}

.pick__back:active {
  transform: translateY(1px);
}

.pick__subtitle {
  font-size: 12px;
  color: var(--yellow);
}

.exemplares {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 14px;
}

.exemplares__types {
  justify-content: flex-start;
}

.exemplar-card {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  text-align: left;
  border-radius: var(--radius-lg);
  background: var(--bg-card);
  border: 2px solid var(--border);
  color: var(--text);
  cursor: pointer;
  transition: transform 0.15s, border-color 0.15s;
}

.exemplar-card:not(:disabled):active {
  transform: scale(0.99);
  border-color: var(--yellow);
}

.exemplar-card:disabled {
  opacity: 0.5;
  cursor: default;
}

.exemplar-card__head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.exemplar-card__idx {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  color: var(--yellow);
  font-size: 8px;
}

.exemplar-card__hint {
  font-size: 11px;
  color: var(--text-muted);
}
.exemplar-card__stars { margin-left: auto; }

.exemplar-card__moves {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.exemplar-card__move {
  font-size: 11px;
  padding: 3px 8px;
  border-radius: 999px;
  background: var(--bg-deep);
  border: 1px solid var(--border);
  color: var(--text-muted);
}

.pick__status {
  min-height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.pick__waiting {
  font-size: 10px;
  color: var(--yellow);
  animation: pick-blink 1.2s steps(2) infinite;
}

.pick__foe-picked {
  font-size: 13px;
  color: var(--text-muted);
}
</style>
