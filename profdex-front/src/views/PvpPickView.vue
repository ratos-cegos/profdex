<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useBattleStore } from '../stores/battle'
import { useCapturesStore } from '../stores/captures'
import { useProfessorsStore } from '../stores/professors'
import ProfessorFace from '../components/ProfessorFace.vue'
import TypeBadges from '../components/TypeBadges.vue'
import StarRating from '../components/StarRating.vue'

// A tela cobre as DUAS fases da preparação:
//
// 1. `picking` — monte um time de ATÉ 3 exemplares, às cegas. Navegação em dois
//    níveis (professor → exemplar), porque o mesmo professor pode estar na
//    coleção em combinações de tipos diferentes, cada uma com o seu deck. A
//    faixa de slots no topo é o que comunica "são até 3" e a ordem, que vira o
//    fallback de tudo depois.
// 2. `preview` — os dois times são revelados e cada um escolhe o LEAD. O
//    preview só acontece DEPOIS de os dois confirmarem: é isso que impede que
//    ele devolva o counter-pick que a seleção às cegas existe para eliminar.
//
// O rival sempre sabe QUE você agiu, nunca O QUÊ.
const router = useRouter()
const battle = useBattleStore()
const professors = useProfessorsStore()
const captures = useCapturesStore()

const MAX_TIME = 3

const now = ref(Date.now())
let clock = null

// Etapa 2 da fase 1: professor aberto para escolher entre os exemplares dele.
const aberto = ref(null)
// O time em montagem, na ordem dos slots.
const time = ref([])
const enviando = ref(false)

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
  // Ids, não objetos: quem resolve rótulo e cor é o TypeBadges.
  return [...combinacoes]
}

const emPreview = computed(() => battle.pvp?.phase === 'preview')
const timeCheio = computed(() => time.value.length >= MAX_TIME)
const jaNoTime = (id) => time.value.some((e) => e.id === id)

function abrir(professor) {
  if (battle.pvp?.youPicked) return
  aberto.value = professor
}

/**
 * Um toque adiciona ao próximo slot livre; outro toque remove. A trava é por
 * exemplar (`id`), não por professor: dois exemplares do mesmo professor são
 * personagens diferentes e podem andar juntos.
 */
function alternar(exemplar, professor) {
  if (battle.pvp?.youPicked) return
  if (jaNoTime(exemplar.id)) {
    time.value = time.value.filter((e) => e.id !== exemplar.id)
    return
  }
  if (timeCheio.value) return
  time.value = [...time.value, { ...exemplar, professor }]
}

function removerSlot(index) {
  if (battle.pvp?.youPicked) return
  time.value = time.value.filter((_, i) => i !== index)
}

async function confirmarTime() {
  if (!time.value.length || battle.pvp?.youPicked || enviando.value) return
  enviando.value = true
  try {
    await battle.pickTeam(time.value.map((e) => e.id))
  } finally {
    enviando.value = false
  }
}

async function escolherLead(membro) {
  if (battle.pvp?.youPicked || enviando.value) return
  enviando.value = true
  try {
    await battle.chooseLead(membro.captureId)
  } finally {
    enviando.value = false
  }
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

    <!-- A faixa é o que diz, sem texto, "são até 3 e esta é a ordem". A ordem
         importa: ela é o fallback do lead e da entrada após um nocaute. -->
    <div v-if="!emPreview" class="slots">
      <button
        v-for="i in MAX_TIME"
        :key="i"
        class="slot"
        :class="{ 'slot--cheio': time[i - 1], 'slot--proximo': time.length === i - 1 }"
        type="button"
        :disabled="!time[i - 1] || battle.pvp.youPicked"
        :aria-label="time[i - 1] ? `Remover ${time[i - 1].professor.name} do time` : `Slot ${i} vazio`"
        @click="removerSlot(i - 1)"
      >
        <template v-if="time[i - 1]">
          <ProfessorFace class="slot__face" :slug="time[i - 1].professor.slug" :name="time[i - 1].professor.name" />
          <span class="slot__remover" aria-hidden="true">✕</span>
        </template>
        <span v-else class="pixel slot__vazio">{{ i }}</span>
      </button>

      <button
        class="pixel slots__confirmar"
        type="button"
        :disabled="!time.length || battle.pvp.youPicked || enviando"
        @click="confirmarTime"
      >
        {{ battle.pvp.youPicked ? 'CONFIRMADO' : `CONFIRMAR (${time.length})` }}
      </button>
    </div>

    <main class="pick__main page">
      <!-- ── Fase 2: team preview + escolha do lead ───────────────────────── -->
      <template v-if="emPreview">
        <p class="pick__hint">
          Times revelados. Escolha quem entra primeiro — o rival escolhe o dele
          ao mesmo tempo, sem ver o seu.
        </p>

        <section class="preview">
          <h2 class="pixel preview__titulo">SEU TIME</h2>
          <ul class="preview__lista">
            <li v-for="m in battle.pvp.you?.team ?? []" :key="m.captureId">
              <button
                class="lead-card"
                type="button"
                :disabled="battle.pvp.youPicked || enviando"
                @click="escolherLead(m)"
              >
                <ProfessorFace class="lead-card__face" :slug="m.professor.slug" :name="m.professor.name" />
                <span class="pixel lead-card__nome">{{ m.professor.name }}</span>
                <TypeBadges :types="m.types" />
                <span class="lead-card__cta">Entrar primeiro</span>
              </button>
            </li>
          </ul>
        </section>

        <section class="preview">
          <h2 class="pixel preview__titulo">TIME DE {{ battle.pvp.foe?.name?.toUpperCase() }}</h2>
          <ul class="preview__lista">
            <li v-for="(m, i) in battle.pvp.foe?.team ?? []" :key="i" class="preview__foe">
              <ProfessorFace class="lead-card__face" :slug="m.professor.slug" :name="m.professor.name" />
              <span class="pixel lead-card__nome">{{ m.professor.name }}</span>
              <TypeBadges :types="m.types" />
            </li>
          </ul>
        </section>
      </template>

      <!-- ── Fase 1, etapa 1: qual professor ──────────────────────────────── -->
      <template v-else-if="!aberto">
        <p class="pick__hint">
          Monte seu time com até {{ MAX_TIME }} professores. Quanto mais levar,
          mais chances de virar o jogo — o rival não vê sua escolha até os dois
          confirmarem.
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
                <ProfessorFace :slug="professor.slug" :name="professor.name" />
                <span v-if="professor.exemplares.length > 1" class="pick-card__count pixel">
                  ×{{ professor.exemplares.length }}
                </span>
              </span>
              <span class="pixel pick-card__name">{{ professor.name }}</span>
              <TypeBadges :types="typesOf(professor)" />
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
          <TypeBadges :types="grupo.types" align="start" />

          <button
            v-for="(exemplar, i) in grupo.items"
            :key="exemplar.id"
            class="exemplar-card"
            :class="{ 'exemplar-card--no-time': jaNoTime(exemplar.id) }"
            type="button"
            :disabled="battle.pvp.youPicked || (timeCheio && !jaNoTime(exemplar.id))"
            @click="alternar(exemplar, aberto)"
          >
            <span class="exemplar-card__head">
              <span class="pixel exemplar-card__idx">{{ i + 1 }}</span>
              <span class="exemplar-card__hint">
                {{ jaNoTime(exemplar.id) ? 'No time · tocar para tirar' : 'Levar para a arena' }}
              </span>
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
          {{ battle.pvp.foePicked ? 'COMEÇANDO…' : 'AGUARDANDO O RIVAL…' }}
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

/* ── Faixa de slots ──────────────────────────────────────────────────────── */
.slots {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  /* Em 320px (iPhone SE) os três slots mais o botão ficam no limite exato da
     linha. Sem o wrap, o botão de confirmar é o que sai da tela — e ele é o
     único jeito de fechar o time. */
  flex-wrap: wrap;
  gap: 8px;
  padding: 10px 16px;
  background: rgba(0, 0, 0, 0.35);
  border-bottom: 2px solid var(--border, #2a2f3a);
}

.slot {
  position: relative;
  width: 48px;
  height: 48px;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  padding: 0;
  border: 2px dashed var(--border, #2a2f3a);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.04);
  cursor: pointer;
}

.slot--cheio {
  border-style: solid;
  border-color: var(--yellow, #ffcb05);
  background: rgba(255, 203, 5, 0.12);
}

/* O próximo a ser preenchido: sem isto, com um slot já cheio não fica claro
   para onde vai o toque seguinte. */
.slot--proximo {
  border-color: var(--yellow, #ffcb05);
}

.slot__face {
  width: 100%;
  height: 100%;
  object-fit: contain;
  border-radius: 8px;
}

.slot__remover {
  position: absolute;
  top: -6px;
  right: -6px;
  width: 18px;
  height: 18px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--red, #c62828);
  color: white;
  font-size: 11px;
  line-height: 1;
}

.slot__vazio {
  font-size: 12px;
  color: var(--text-muted, #8b93a7);
}

.slots__confirmar {
  margin-left: auto;
  min-height: 44px;
  padding: 0 16px;
  border: 2px solid var(--yellow, #ffcb05);
  border-radius: 10px;
  background: var(--yellow, #ffcb05);
  color: #1a1a1a;
  font-size: 10px;
  cursor: pointer;
}

.slots__confirmar:disabled {
  opacity: 0.45;
  background: transparent;
  color: var(--text-muted, #8b93a7);
  border-color: var(--border, #2a2f3a);
  cursor: not-allowed;
}

/* ── Team preview ────────────────────────────────────────────────────────── */
.preview {
  margin-bottom: 20px;
}

.preview__titulo {
  margin-bottom: 10px;
  font-size: 10px;
  color: var(--yellow, #ffcb05);
}

.preview__lista {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  list-style: none;
  padding: 0;
  margin: 0;
}

/* Quem cresce e encolhe é o item da lista — o card do próprio time é um
   <button> DENTRO do <li>, então dimensioná-lo direto não teria efeito nenhum:
   o item flex é o <li>. O teto evita dois cards de meia tela no desktop. */
.preview__lista > li {
  flex: 1 1 132px;
  max-width: 168px;
  display: flex;
}

.lead-card,
.preview__foe {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 12px 8px;
  border: 2px solid var(--border, #2a2f3a);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.04);
}

.lead-card {
  cursor: pointer;
}

.lead-card:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.lead-card__face {
  width: 64px;
  height: 64px;
  object-fit: contain;
}

.lead-card__nome {
  font-size: 10px;
  color: white;
  text-align: center;
}

.lead-card__cta {
  margin-top: 2px;
  font-size: 11px;
  color: var(--yellow, #ffcb05);
}

/* O time do rival é informação, não alvo de toque. */
.preview__foe {
  opacity: 0.9;
}

.exemplar-card--no-time {
  border-color: var(--yellow, #ffcb05);
  background: rgba(255, 203, 5, 0.12);
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
