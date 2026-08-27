<script setup>
import { computed, onMounted, ref, useTemplateRef } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ProfessorExemplares from '../components/ProfessorExemplares.vue'
import ProfessorGolpes from '../components/ProfessorGolpes.vue'
import ProfessorIdentidade from '../components/ProfessorIdentidade.vue'
import TypeIcon from '../components/TypeIcon.vue'
import { movesForTypes } from '../data/moves.js'
import { typeInfos, typesForProfessor } from '../data/professorTypes.js'
import { useCapturesStore } from '../stores/captures.js'
import { useProfessorsStore } from '../stores/professors.js'

const route = useRoute()
const router = useRouter()
const professors = useProfessorsStore()
const captures = useCapturesStore()
const panels = useTemplateRef('panels')
const active = ref(0)
const imageError = ref(false)
const capturesIndisponiveis = ref(false)
let scrollTimer

onMounted(() =>
  captures.ensureLoaded().catch(() => {
    // A ficha continua útil sem a coleção: identidade, atributos, RA e o
    // movepool dos tipos não dependem dela. Só o painel "Exemplares" fica sem
    // dados, e ele mesmo avisa — derrubar a tela inteira seria pior.
    capturesIndisponiveis.value = true
  }),
)
const professor = computed(
  () =>
    professors.findByKey(route.params.id) ||
    window.history.state?.character || {
      id: 'modelo-padrao',
      name: 'Professor',
      slug: 'professor',
    },
)
const dexNum = computed(() => {
  const index = professors.professors.findIndex((item) => item.id === professor.value.id)
  return index < 0 ? '#—' : `#${String(index + 1).padStart(3, '0')}`
})
const typeIds = computed(() => typesForProfessor(professor.value))
const types = computed(() => typeInfos(typeIds.value))
const description = computed(
  () =>
    `Especialista em ${types.value.map((type) => type.label).join(' e ')}. ${types.value.map((type) => type.description).join(' ')}`,
)
const groups = computed(() => captures.groupedByVariant(professor.value.id))
const moves = computed(() => movesForTypes(typeIds.value))

function seeded(salt, min, max) {
  const text = `${professor.value.slug}:${salt}`
  let hash = 0
  for (const char of text) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return min + (hash % (max - min + 1))
}
const stats = computed(() => [
  { key: 'pv', label: 'PV', value: seeded('pv', 100, 150), max: 150, color: 'var(--success-text)' },
  {
    key: 'rigor',
    label: 'Ataque',
    value: seeded('rigor', 55, 95),
    max: 100,
    color: 'var(--error)',
  },
  {
    key: 'didatica',
    label: 'Defesa',
    value: seeded('didatica', 55, 95),
    max: 100,
    color: 'var(--ds-blue-glow)',
  },
  {
    key: 'raciocinio',
    label: 'Velocidade',
    value: seeded('raciocinio', 55, 95),
    max: 100,
    color: 'var(--ds-orange-glow)',
  },
])
const tabs = ['SOBRE', 'EXEMPLARES', 'GOLPES']
function selectTab(index) {
  active.value = index
  panels.value?.children[index]?.scrollIntoView({
    behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    inline: 'start',
    block: 'nearest',
  })
}
function onScroll() {
  clearTimeout(scrollTimer)
  scrollTimer = setTimeout(() => {
    active.value = Math.round(panels.value.scrollLeft / panels.value.clientWidth)
  }, 80)
}
function onTabKey(event, index) {
  if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return
  event.preventDefault()
  selectTab((index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length)
}
function openAr() {
  router.push({
    name: 'character-ar',
    params: { id: professor.value.id },
    state: { character: { ...professor.value } },
  })
}
</script>

<template>
  <main class="detail">
    <header class="detail__header">
      <button
        type="button"
        aria-label="Voltar ao ProfDex"
        @click="router.push({ name: 'profdex' })"
      >
        ←
      </button>
      <div class="detail__avatar">
        <img
          v-if="!imageError"
          :src="`/professors/${professor.slug}-face.png`"
          :alt="professor.name"
          @error="imageError = true"
        /><span v-else>{{ professor.name[0] }}</span>
      </div>
      <div class="detail__identity">
        <span class="pixel">{{ dexNum }}</span>
        <h1>{{ professor.name }}</h1>
        <div>
          <i v-for="type in types" :key="type.id" :style="{ '--type-color': type.color }"
            ><TypeIcon :type="type.id" :size="12" /> {{ type.label }}</i
          >
        </div>
      </div>
    </header>
    <nav class="detail__tabs" role="tablist" aria-label="Ficha do professor">
      <button
        v-for="(tab, index) in tabs"
        :key="tab"
        class="pixel"
        :class="{ active: active === index }"
        role="tab"
        :aria-selected="active === index"
        @click="selectTab(index)"
        @keydown="onTabKey($event, index)"
      >
        {{ tab }}
      </button>
    </nav>
    <div ref="panels" class="detail__panels" @scroll.passive="onScroll">
      <section role="tabpanel">
        <ProfessorIdentidade :description="description" :stats="stats" @open-ar="openAr" />
      </section>
      <section role="tabpanel">
        <ProfessorExemplares :groups="groups" :erro="capturesIndisponiveis" />
      </section>
      <section role="tabpanel"><ProfessorGolpes :moves="moves" /></section>
    </div>
  </main>
</template>

<style scoped>
.detail {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg);
  color: var(--text);
}
.detail__header {
  flex: 0 0 auto;
  min-height: 112px;
  display: grid;
  grid-template-columns: 44px 68px 1fr;
  align-items: center;
  gap: 10px;
  padding: calc(10px + env(safe-area-inset-top)) 14px 10px;
  background: linear-gradient(160deg, var(--surface-border), var(--unifil-orange));
}
.detail__header > button {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.28);
  color: white;
  font-size: 20px;
}
.detail__avatar {
  width: 64px;
  height: 64px;
  display: grid;
  place-items: center;
  overflow: hidden;
  border: 2px solid var(--unifil-gold);
  border-radius: 50%;
  background: var(--surface);
  font-size: 24px;
}
.detail__avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.detail__identity {
  min-width: 0;
}
.detail__identity > span {
  color: var(--unifil-gold);
  font-size: 7px;
}
.detail__identity h1 {
  margin: 4px 0 7px;
  overflow: hidden;
  font-size: 19px;
  line-height: 1.1;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.detail__identity div {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.detail__identity i {
  padding: 3px 6px;
  border: 1px solid var(--type-color);
  border-radius: 999px;
  background: color-mix(in srgb, var(--type-color) 30%, transparent);
  color: white;
  font-size: 9px;
  font-style: normal;
}
.detail__tabs {
  flex: 0 0 auto;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  border-bottom: 2px solid var(--border);
  background: var(--surface);
}
.detail__tabs button {
  min-height: 46px;
  background: transparent;
  color: var(--text-muted);
  font-size: 7px;
}
.detail__tabs button.active {
  box-shadow: inset 0 -3px var(--unifil-gold);
  color: var(--unifil-gold);
}
.detail__panels {
  flex: 1;
  min-height: 0;
  display: flex;
  overflow-x: auto;
  overflow-y: hidden;
  scroll-snap-type: x mandatory;
  scrollbar-width: none;
}
.detail__panels > section {
  min-width: 100%;
  height: 100%;
  overflow-y: auto;
  scroll-snap-align: start;
}
@media (prefers-reduced-motion: reduce) {
  .detail__panels {
    scroll-behavior: auto;
  }
}
</style>
