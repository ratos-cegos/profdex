<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useCapturesStore } from '../stores/captures'
import { useProfessorsStore } from '../stores/professors'
import { typesForProfessor, typeInfos } from '../data/professorTypes.js'
import { movesForTypes } from '../data/moves.js'

const route = useRoute()
const router = useRouter()
const store = useProfessorsStore()
const capturesStore = useCapturesStore()

onMounted(() => capturesStore.ensureLoaded().catch(() => {}))

// O professor vem do parâmetro da rota (/professor/:id), aceitando UUID, slug ou
// nome (findByKey). Fallbacks: o state da navegação (clique no ProfDex) e, por
// fim, um modelo padrão — assim um deep link / F5 nunca cai em tela vazia.
const professor = computed(
  () =>
    store.findByKey(route.params.id) ||
    window.history.state?.character || {
      id: 'modelo-padrao',
      name: 'Professor',
      slug: 'professor',
    },
)

// Número no "Pokédex": posição na lista carregada (1-based). '—' se ainda não
// estiver na lista (deep link antes do preload terminar).
const dexNum = computed(() => {
  const i = store.professors.findIndex((p) => p.id === professor.value.id)
  return i >= 0 ? `#${String(i + 1).padStart(3, '0')}` : '#—'
})

// ── Tipos ────────────────────────────────────────────────────────────────
const typeList = computed(() => typeInfos(typesForProfessor(professor.value)))

// ── Descrição ──────────────────────────────────────────────────────────────
// Ainda não há campo `description` no back-end; montamos um texto de sabor a
// partir dos tipos do professor (substituir por dado real quando existir).
const description = computed(() => {
  const infos = typeList.value
  if (!infos.length) return 'Professor do ProfDex, pronto para a batalha.'
  const labels = infos.map((t) => t.label).join(' e ')
  const detail = infos.map((t) => t.description).join(' ')
  return `Especialista em ${labels}. ${detail}`
})

// ── Atributos ───────────────────────────────────────────────────────────────
// Sem stats por professor no back-end: derivamos valores determinísticos do
// slug (o mesmo professor sempre cai nos mesmos números) só para dar o sabor de
// ficha de Pokédex. Trocar por dados reais quando a API expuser atributos.
function statFromSeed(seed, salt, min, max) {
  const s = `${seed}:${salt}`
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return min + (h % (max - min + 1))
}

const stats = computed(() => {
  const seed = professor.value.slug || professor.value.id || professor.value.name
  return [
    { key: 'pv', label: 'PV', value: statFromSeed(seed, 'pv', 100, 150), max: 150, color: 'var(--ds-green-glow)' },
    { key: 'rigor', label: 'Ataque', value: statFromSeed(seed, 'rigor', 55, 95), max: 100, color: 'var(--error)' },
    { key: 'didatica', label: 'Defesa', value: statFromSeed(seed, 'didatica', 55, 95), max: 100, color: 'var(--ds-blue-glow)' },
    { key: 'raciocinio', label: 'Velocidade', value: statFromSeed(seed, 'raciocinio', 55, 95), max: 100, color: 'var(--ds-orange-glow)' },
  ]
})

// ── Exemplares ──────────────────────────────────────────────────────────────
// Cada ficha de QR resgatada virou um exemplar com combinação de tipos e deck
// próprios. Aqui eles aparecem agrupados por combinação: "o Eron de IA/ML" com
// os seus, "o Eron de Arquitetura + IA/ML" com os dele.
const grupos = computed(() => capturesStore.groupedByVariant(professor.value.id))

const totalExemplares = computed(() =>
  grupos.value.reduce((soma, g) => soma + g.items.length, 0),
)

const dataCurta = (iso) =>
  new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })

// Movepool genérico dos tipos do professor: só entra quando não há exemplar
// para mostrar (deep link em professor ainda não capturado).
const skills = computed(() => movesForTypes(typesForProfessor(professor.value)).slice(0, 4))

function skillTag(move) {
  const hasPower = move.power != null
  const hasEffect = Array.isArray(move.effects) && move.effects.length > 0
  if (hasPower && hasEffect) return 'Dano / Efeito'
  if (hasPower) return 'Dano'
  return 'Suporte'
}

// ── Avatar ──────────────────────────────────────────────────────────────────
const imgError = ref(false)
const cartoonSrc = computed(() => `/professors/${professor.value.slug}-cartoon.png`)

function goBack() {
  router.push({ name: 'profdex' })
}

function goAR() {
  router.push({
    name: 'character-ar',
    params: { id: professor.value.id },
    state: { character: { ...professor.value } },
  })
}
</script>

<template>
  <main class="prof-detail">
    <header class="prof-detail__topbar">
      <button class="back-btn pixel" type="button" @click="goBack">← Voltar</button>
      <span class="pixel dex-num">{{ dexNum }}</span>
    </header>

    <div class="prof-detail__scroll page">
      <!-- Ficha: dados à esquerda, avatar + AR à direita -->
      <section class="identity card">
        <div class="identity__info">
          <span class="pixel eyebrow">PROFESSOR</span>
          <h1 class="identity__name">{{ professor.name }}</h1>

          <div class="type-badges">
            <span
              v-for="t in typeList"
              :key="t.id"
              class="type-badge"
              :style="{ '--type-color': t.color }"
            >
              <span class="type-badge__icon" aria-hidden="true">{{ t.icon }}</span>
              {{ t.label }}
            </span>
          </div>

          <ul class="stats">
            <li v-for="s in stats" :key="s.key" class="stat">
              <span class="pixel stat__label">{{ s.label }}</span>
              <div class="stat__track">
                <div
                  class="stat__fill"
                  :style="{ width: (s.value / s.max) * 100 + '%', background: s.color }"
                />
              </div>
              <span class="pixel stat__val">{{ s.value }}</span>
            </li>
          </ul>
        </div>

        <div class="identity__media">
          <div class="avatar-frame">
            <img
              v-if="!imgError"
              :src="cartoonSrc"
              :alt="`Prof. ${professor.name}`"
              class="avatar-frame__img"
              @error="imgError = true"
            />
            <div v-else class="avatar-frame__fallback">
              <span class="avatar-person" aria-hidden="true" />
            </div>
          </div>
          <button class="ar-btn pixel" type="button" @click="goAR">Ver em RA</button>
        </div>
      </section>

      <!-- Descrição -->
      <section class="desc-panel card">
        <span class="pixel panel-label">Descrição</span>
        <p class="desc-text">{{ description }}</p>
      </section>

      <!-- Exemplares capturados, agrupados por combinação de tipos -->
      <section v-if="grupos.length" class="skills">
        <h2 class="pixel skills__title">
          MEUS EXEMPLARES <span class="skills__count">({{ totalExemplares }})</span>
        </h2>

        <div v-for="grupo in grupos" :key="grupo.typeKey" class="variant">
          <div class="variant__head">
            <div class="type-badges">
              <span
                v-for="t in typeInfos(grupo.types)"
                :key="t.id"
                class="type-badge"
                :style="{ '--type-color': t.color }"
              >
                <span class="type-badge__icon" aria-hidden="true">{{ t.icon }}</span>
                {{ t.label }}
              </span>
            </div>
            <span class="pixel variant__count">×{{ grupo.items.length }}</span>
          </div>

          <article v-for="(exemplar, i) in grupo.items" :key="exemplar.id" class="exemplar card">
            <header class="exemplar__head">
              <span class="pixel exemplar__idx">{{ i + 1 }}</span>
              <span class="exemplar__date">capturado em {{ dataCurta(exemplar.capturedAt) }}</span>
            </header>
            <ul class="skill-list">
              <li v-for="s in exemplar.moves" :key="s.id" class="skill skill--inset">
                <div class="skill__head">
                  <span class="skill__name">{{ s.name }}</span>
                  <span
                    class="pixel skill__tag"
                    :class="`skill__tag--${skillTag(s) === 'Dano' ? 'dano' : skillTag(s) === 'Suporte' ? 'suporte' : 'misto'}`"
                  >
                    {{ skillTag(s) }}
                  </span>
                </div>
                <p class="skill__desc">{{ s.description }}</p>
              </li>
            </ul>
          </article>
        </div>
      </section>

      <!-- Sem exemplar: mostra o movepool dos tipos, só para dar o sabor -->
      <section v-else class="skills">
        <h2 class="pixel skills__title">SKILLS</h2>
        <ul class="skill-list">
          <li v-for="(s, i) in skills" :key="s.id" class="skill card">
            <div class="skill__head">
              <span class="pixel skill__idx">{{ i + 1 }}</span>
              <span class="skill__name">{{ s.name }}</span>
              <span
                class="pixel skill__tag"
                :class="`skill__tag--${skillTag(s) === 'Dano' ? 'dano' : skillTag(s) === 'Suporte' ? 'suporte' : 'misto'}`"
              >
                {{ skillTag(s) }}
              </span>
            </div>
            <p class="skill__desc">{{ s.description }}</p>
          </li>
        </ul>
      </section>
    </div>
  </main>
</template>

<style scoped>
.prof-detail {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg);
  color: var(--text);
}

/* Barra do topo: mesma linguagem vermelha do cabeçalho do ProfDex */
.prof-detail__topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: calc(14px + env(safe-area-inset-top)) 16px 14px;
  background: linear-gradient(160deg, var(--red-dark), var(--red));
  flex-shrink: 0;
}

.back-btn {
  background: rgba(0, 0, 0, 0.28);
  color: rgba(255, 255, 255, 0.9);
  border: 1px solid rgba(255, 255, 255, 0.22);
  border-radius: 20px;
  padding: 8px 14px;
  font-size: 8px;
  letter-spacing: 0.5px;
}

.back-btn:active {
  transform: translateY(1px);
}

.dex-num {
  font-size: 10px;
  color: var(--yellow);
  text-shadow: 1px 1px 0 rgba(0, 0, 0, 0.35);
}

.prof-detail__scroll {
  flex: 1;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

/* Card base — reaproveita a estética das cartas do ProfDex */
.card {
  background: var(--bg-card);
  border: 2px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: 2px 2px 0 rgba(0, 0, 0, 0.35);
}

/* ── Ficha ───────────────────────────────────────────────────────────────── */
.identity {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 14px;
  padding: 16px;
}

.identity__info {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.eyebrow {
  font-size: 7px;
  letter-spacing: 1px;
  color: var(--yellow);
}

.identity__name {
  font-size: 20px;
  line-height: 1.1;
  font-weight: 800;
}

.type-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.type-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 9px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  color: #fff;
  background: color-mix(in srgb, var(--type-color) 30%, transparent);
  border: 1.5px solid var(--type-color);
  text-shadow: 1px 1px 0 rgba(0, 0, 0, 0.35);
}

.type-badge__icon {
  font-size: 12px;
}

.stats {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 7px;
  margin-top: 2px;
}

.stat {
  display: grid;
  grid-template-columns: 62px 1fr 26px;
  align-items: center;
  gap: 8px;
}

.stat__label {
  font-size: 7px;
  color: var(--text-muted);
  white-space: nowrap;
}

.stat__track {
  height: 8px;
  background: var(--bg-deep);
  border: 1px solid var(--border);
  border-radius: 4px;
  overflow: hidden;
}

.stat__fill {
  height: 100%;
  border-radius: 3px;
  transition: width 0.5s ease;
}

.stat__val {
  font-size: 8px;
  color: var(--text);
  text-align: right;
}

/* Avatar + botão de RA (coluna direita, como no esboço) */
.identity__media {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.avatar-frame {
  width: 108px;
  height: 108px;
  border-radius: var(--radius);
  border: 2px solid var(--yellow);
  background: radial-gradient(circle at 50% 35%, rgba(237, 175, 104, 0.18), var(--surface) 70%);
  display: grid;
  place-items: center;
  overflow: hidden;
  box-shadow: inset 0 0 0 2px rgba(0, 0, 0, 0.25);
}

.avatar-frame__img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.avatar-frame__fallback {
  width: 100%;
  height: 100%;
  display: grid;
  place-items: center;
  color: var(--text-muted);
}

.avatar-person {
  position: relative;
  width: 46px;
  height: 50px;
  opacity: 0.7;
}

.avatar-person::before {
  content: '';
  position: absolute;
  top: 0;
  left: 50%;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--text-muted);
  transform: translateX(-50%);
}

.avatar-person::after {
  content: '';
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  height: 26px;
  border-radius: 20px 20px 10px 10px;
  background: var(--text-muted);
}

.ar-btn {
  width: 108px;
  padding: 8px 6px;
  font-size: 8px;
  letter-spacing: 0.5px;
  color: var(--text-primary);
  background: var(--ds-blue);
  border: 1px solid var(--ds-blue-glow);
  border-radius: var(--radius);
  box-shadow: inset 0 3px 0 var(--ds-blue-glow), inset 0 -4px 0 var(--ds-blue-shadow);
  transition: transform 0.12s ease, filter 0.12s ease;
}

.ar-btn:active {
  transform: translateY(2px);
  filter: brightness(0.94);
}

/* ── Descrição ─────────────────────────────────────────────────────────────── */
.desc-panel {
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.panel-label {
  font-size: 8px;
  letter-spacing: 0.5px;
  color: var(--yellow);
}

.desc-text {
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-muted);
}

/* ── Skills ────────────────────────────────────────────────────────────────── */
.skills {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.skills__title {
  font-size: 14px;
  color: var(--text);
  text-shadow: 2px 2px 0 rgba(0, 0, 0, 0.35);
  letter-spacing: 1px;
}

.skills__count {
  color: var(--yellow);
}

/* ── Exemplares ────────────────────────────────────────────────────────────── */
.variant {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 14px;
}

.variant__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.variant__count {
  flex-shrink: 0;
  font-size: 8px;
  color: var(--yellow);
}

.exemplar {
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.exemplar__head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.exemplar__idx {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--yellow);
  font-size: 8px;
}

.exemplar__date {
  font-size: 11px;
  color: var(--text-muted);
}

/* Dentro do exemplar o golpe não é mais um card: vira linha da lista. */
.skill--inset {
  background: var(--bg-deep);
  border: 1px solid var(--border);
  border-left: 3px solid var(--yellow);
  border-radius: var(--radius);
  box-shadow: none;
  padding: 8px 10px;
}

.skill-list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.skill {
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  border-left: 4px solid var(--yellow);
}

.skill__head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.skill__idx {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--yellow);
  font-size: 8px;
}

.skill__name {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  font-weight: 700;
}

.skill__tag {
  flex-shrink: 0;
  padding: 3px 7px;
  border-radius: 999px;
  font-size: 6px;
  letter-spacing: 0.5px;
  border: 1px solid var(--border);
}

.skill__tag--dano {
  color: var(--error);
  border-color: color-mix(in srgb, var(--error) 55%, transparent);
  background: color-mix(in srgb, var(--error) 15%, transparent);
}

.skill__tag--misto {
  color: var(--ds-orange-glow);
  border-color: color-mix(in srgb, var(--ds-orange-glow) 55%, transparent);
  background: color-mix(in srgb, var(--ds-orange-glow) 15%, transparent);
}

.skill__tag--suporte {
  color: var(--ds-green-glow);
  border-color: color-mix(in srgb, var(--ds-green-glow) 55%, transparent);
  background: color-mix(in srgb, var(--ds-green-glow) 15%, transparent);
}

.skill__desc {
  font-size: 12px;
  line-height: 1.45;
  color: var(--text-muted);
}
</style>
