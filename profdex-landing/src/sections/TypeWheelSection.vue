<script setup>
import { computed, onBeforeUnmount, ref, shallowRef } from 'vue'
import { TYPE_CYCLE, legibleColor, onColor, strongAgainst, weakAgainst } from '@/data/types.js'
import { typeWheel } from '@/content/copy.js'
import SectionShell from '@/components/SectionShell.vue'
import TypeIcon from '@/components/TypeIcon.vue'
import { useMotionPreference } from '@/composables/useMotionPreference.js'

// A roda inteira é DERIVADA do TYPE_CYCLE: os setores saem da ordem do array e
// as setas saem de strongAgainst(). Nada de coordenada ou vantagem digitada à
// mão — mudar a ordem do array no app muda o desenho aqui, que é exatamente o
// contrato do sistema de tipos ("a ordem do array É a roda").

const N = TYPE_CYCLE.length
const STEP = 360 / N
const GAP = 2 // graus de respiro entre setores
const R_OUTER = 190
const R_INNER = 118
const R_ICON = 154 // meio do anel
const CENTER = 200

const { prefersReducedMotion } = useMotionPreference()

// ── O estado é um ângulo, e só ──────────────────────────────────────────────
//
// `rotation` é a fonte de verdade da posição da roda. O tipo selecionado é o
// que está SOB O PONTEIRO DO TOPO quando ela para — derivado do ângulo, não
// mantido em paralelo. `selectedId` é o resultado dessa conta, gravado no
// momento em que a roda assenta: durante um giro livre o painel não pode
// repintar a cada 40 graus.
const rotation = ref(0)
const selectedId = ref(TYPE_CYCLE[0].id)
const selected = computed(() => TYPE_CYCLE.find((t) => t.id === selectedId.value))

/** Índice do tipo que está no topo para um dado ângulo da roda. */
const indexAtTop = (deg) => (((-Math.round(deg / STEP)) % N) + N) % N

/** Ângulo (múltiplo de STEP) que leva o tipo `i` ao topo pelo caminho mais curto. */
const rotationForIndex = (i, from) => {
  const base = -i * STEP
  return base + Math.round((from - base) / 360) * 360
}

/** Centro angular do tipo `i`, com o primeiro no topo. */
const centerAngle = (i) => -90 + i * STEP

const polar = (angleDeg, radius) => {
  const rad = (angleDeg * Math.PI) / 180
  return { x: CENTER + radius * Math.cos(rad), y: CENTER + radius * Math.sin(rad) }
}

const sectors = computed(() =>
  TYPE_CYCLE.map((type, i) => {
    const start = centerAngle(i) - STEP / 2 + GAP / 2
    const end = centerAngle(i) + STEP / 2 - GAP / 2
    const o1 = polar(start, R_OUTER)
    const o2 = polar(end, R_OUTER)
    const i1 = polar(end, R_INNER)
    const i2 = polar(start, R_INNER)
    const icon = polar(centerAngle(i), R_ICON)

    return {
      ...type,
      iconPos: { x: icon.x, y: icon.y },
      iconColor: onColor(type.color),
      d: [
        'M ' + o1.x.toFixed(2) + ' ' + o1.y.toFixed(2),
        'A ' + R_OUTER + ' ' + R_OUTER + ' 0 0 1 ' + o2.x.toFixed(2) + ' ' + o2.y.toFixed(2),
        'L ' + i1.x.toFixed(2) + ' ' + i1.y.toFixed(2),
        'A ' + R_INNER + ' ' + R_INNER + ' 0 0 0 ' + i2.x.toFixed(2) + ' ' + i2.y.toFixed(2),
        'Z',
      ].join(' '),
    }
  }),
)

const strongList = computed(() => strongAgainst(selectedId.value))
const weakList = computed(() => weakAgainst(selectedId.value))

/** Setas do tipo selecionado até os dois que ele bate. */
const arrows = computed(() => {
  const from = TYPE_CYCLE.findIndex((t) => t.id === selectedId.value)
  return strongList.value.map((target) => {
    const to = TYPE_CYCLE.findIndex((t) => t.id === target.id)
    const a = polar(centerAngle(from), R_INNER - 8)
    const b = polar(centerAngle(to), R_INNER - 8)
    // Curva puxada para o centro: duas setas retas se sobreporiam.
    return {
      id: target.id,
      d:
        'M ' +
        a.x.toFixed(2) +
        ' ' +
        a.y.toFixed(2) +
        ' Q ' +
        CENTER +
        ' ' +
        CENTER +
        ' ' +
        b.x.toFixed(2) +
        ' ' +
        b.y.toFixed(2),
    }
  })
})

const isDimmed = (id) => id !== selectedId.value && !strongList.value.some((t) => t.id === id)

// O grupo dos setores gira; os ÍCONES CONTRA-GIRAM pelo mesmo ângulo, em torno
// do próprio centro (14,14 na caixa de 28 do TypeIcon). Sem isso os símbolos
// ficam de cabeça para baixo na primeira meia volta: o desenho continua certo e
// a leitura some.
const spinStyle = computed(() => ({ transform: 'rotate(' + rotation.value.toFixed(2) + 'deg)' }))

const iconTransform = (s) =>
  'translate(' +
  (s.iconPos.x - 14).toFixed(2) +
  ', ' +
  (s.iconPos.y - 14).toFixed(2) +
  ') rotate(' +
  (-rotation.value).toFixed(2) +
  ' 14 14)'

// ── Giro por clique longo ───────────────────────────────────────────────────
//
// Física à mão, sem biblioteca: velocidade angular com atrito exponencial num
// requestAnimationFrame. São ~40 linhas e nenhum byte a mais na rede do evento.
//
// O gesto tem três tempos:
//   segurar → carrega (a roda acelera enquanto o dedo está nela)
//   soltar  → inércia (desacelera sozinha)
//   parar   → trava no múltiplo de STEP mais próximo, e quem ficou sob o
//             ponteiro do topo vira a seleção.
//
// Clique curto (sem segurar) continua selecionando direto o setor tocado — só
// que agora ele também VIAJA até o topo, porque o topo é a posição de leitura.

const HOLD_MS = 300 // limiar entre clique curto e clique longo
const MOVE_PX = 12 // ...ou o ponteiro andou tanto que já não é um clique
const CHARGE_ACCEL = 900 // °/s² enquanto segura
const CHARGE_MAX = 700 // °/s de teto (~2 voltas por segundo)
const FRICTION = 2.1 // 1/s do decaimento exponencial depois de soltar
const MIN_SPIN = 100 // °/s abaixo disso a roda desiste e assenta
const SETTLE_MS = 240

const wheelEl = ref(null)
const stageEl = ref(null)
const chipsEl = ref(null)
const charging = ref(false)

let mode = 'idle' // 'charge' | 'coast' | 'settle'
let velocity = 0 // °/s. Negativo = a leitura avança na ordem do array.
let raf = 0
let lastFrame = 0
let holdTimer = 0
let settleFrom = 0
let settleTo = 0
let settleStart = 0
let settleDur = SETTLE_MS
let pointerId = null
let downAt = 0
let downX = 0
let downY = 0
let moved = false

/** Mesma família do --ease-out: sai forte e chega macio. Escrito em JS, e não
 *  como transição de CSS, porque os ícones contra-giram pelo MESMO número — uma
 *  transição no grupo deixaria os símbolos para trás durante o assentamento. */
const easeOut = (t) => 1 - (1 - t) ** 4

function loop(now) {
  const dt = Math.min((now - lastFrame) / 1000, 0.05)
  lastFrame = now

  if (mode === 'charge') {
    velocity = Math.max(velocity - CHARGE_ACCEL * dt, -CHARGE_MAX)
    rotation.value += velocity * dt
  } else if (mode === 'coast') {
    velocity *= Math.exp(-FRICTION * dt)
    rotation.value += velocity * dt
    if (Math.abs(velocity) < MIN_SPIN) beginSettle()
  } else if (mode === 'settle') {
    const t = Math.min((now - settleStart) / settleDur, 1)
    rotation.value = settleFrom + (settleTo - settleFrom) * easeOut(t)
    if (t >= 1) {
      rotation.value = settleTo
      mode = 'idle'
      raf = 0
      return
    }
  } else {
    raf = 0
    return
  }

  raf = requestAnimationFrame(loop)
}

function startLoop() {
  if (raf) return
  lastFrame = performance.now()
  raf = requestAnimationFrame(loop)
}

function stop() {
  if (raf) cancelAnimationFrame(raf)
  raf = 0
  mode = 'idle'
  velocity = 0
}

/** Assenta no múltiplo de STEP mais próximo (ou no alvo pedido) e publica quem
 *  ficou no topo. */
function beginSettle(target = null, duration = SETTLE_MS) {
  settleFrom = rotation.value
  settleTo = target === null ? Math.round(rotation.value / STEP) * STEP : target
  settleStart = performance.now()
  settleDur = duration
  mode = 'settle'
  // A seleção é publicada aqui, não no fim: o painel acompanha a roda chegando,
  // em vez de piscar depois que ela já parou.
  selectedId.value = TYPE_CYCLE[indexAtTop(settleTo)].id
  startLoop()
}

/** Leva o tipo `i` ao topo. Com movimento reduzido é um corte seco — a
 *  informação é a mesma, só não viaja. */
function selectTo(i) {
  const target = rotationForIndex(i, rotation.value)
  if (prefersReducedMotion.value) {
    stop()
    rotation.value = target
    selectedId.value = TYPE_CYCLE[i].id
    return
  }
  const dist = Math.abs(target - rotation.value)
  beginSettle(target, Math.min(180 + dist * 1.1, 520))
}

/** Qual setor está sob o dedo/ponteiro, ou null (centro, ou fora do anel). */
function sectorAt(event) {
  const svg = wheelEl.value
  if (!svg) return null
  const rect = svg.getBoundingClientRect()
  if (!rect.width) return null
  const scale = rect.width / 400 // o viewBox é quadrado, então uma escala basta
  const dx = (event.clientX - (rect.left + rect.width / 2)) / scale
  const dy = (event.clientY - (rect.top + rect.height / 2)) / scale
  const r = Math.hypot(dx, dy)
  if (r < R_INNER - 12 || r > R_OUTER + 8) return null
  // Desfaz a rotação atual para perguntar ao desenho original quem está ali.
  const deg = (Math.atan2(dy, dx) * 180) / Math.PI - rotation.value
  return ((Math.round((deg + 90) / STEP) % N) + N) % N
}

function startCharge() {
  holdTimer = 0
  if (pointerId === null) return
  charging.value = true
  mode = 'charge'
  startLoop()
}

function onPointerDown(event) {
  if (event.button > 0) return
  pointerId = event.pointerId
  downAt = performance.now()
  downX = event.clientX
  downY = event.clientY
  moved = false
  // Captura o ponteiro já aqui. Sem isso, soltar o botão FORA da roda (apertar,
  // arrastar para longe, largar) não entrega nenhum `pointerup` a este
  // elemento: o cronômetro do clique longo dispararia depois, e a roda ficaria
  // carregando para sempre sem ninguém segurando.
  //
  // Capturar cedo não custa o clique curto, porque quem decide qual setor foi
  // tocado é o `sectorAt()` no `pointerup`, e não um `@click` no <path>.
  try {
    stageEl.value?.setPointerCapture(event.pointerId)
  } catch {
    // Navegador recusou a captura: as escutas na janela, abaixo, cobrem o caso.
  }
  // Cinto e suspensório: enquanto o gesto estiver em curso, o fim dele também é
  // escutado na janela. Se a captura falhar, o `pointerup` de fora da roda ainda
  // chega — e chegar duas vezes não faz mal, porque o segundo já encontra
  // `pointerId === null` e volta na primeira linha.
  window.addEventListener('pointerup', onPointerUp)
  window.addEventListener('pointercancel', onPointerCancel)
  // A roda passa a ser do usuário: o giro por scroll é dobrado no ângulo atual
  // e desligado, para os dois não disputarem o mesmo desenho.
  foldScrollSpin()
  if (prefersReducedMotion.value) return
  stop()
  holdTimer = window.setTimeout(startCharge, HOLD_MS)
}

function unbindGestureEnd() {
  window.removeEventListener('pointerup', onPointerUp)
  window.removeEventListener('pointercancel', onPointerCancel)
}

function onPointerMove(event) {
  if (pointerId === null || event.pointerId !== pointerId) return
  if (Math.hypot(event.clientX - downX, event.clientY - downY) > MOVE_PX) moved = true
}

function onPointerUp(event) {
  if (pointerId === null || event.pointerId !== pointerId) return
  if (holdTimer) window.clearTimeout(holdTimer)
  holdTimer = 0
  unbindGestureEnd()

  const wasCharging = charging.value
  const heldLong = performance.now() - downAt >= HOLD_MS
  charging.value = false
  pointerId = null

  if (wasCharging) {
    // Solta com a inércia acumulada; ela decide sozinha onde parar.
    mode = 'coast'
    startLoop()
    return
  }

  if (prefersReducedMotion.value && (heldLong || moved)) {
    // Sem giro animado e sem inércia: o clique longo só avança um tipo.
    selectTo((indexAtTop(rotation.value) + 1) % N)
    return
  }

  const hit = moved ? null : sectorAt(event)
  if (hit === null) settleIfOffGrid()
  else selectTo(hit)
}

function onPointerCancel(event) {
  if (pointerId === null || (event && event.pointerId !== pointerId)) return
  if (holdTimer) window.clearTimeout(holdTimer)
  holdTimer = 0
  unbindGestureEnd()
  pointerId = null
  if (charging.value) {
    // O navegador tomou o ponteiro no meio do giro (a página começou a rolar,
    // por exemplo): trata como soltar, para a roda não congelar carregada.
    charging.value = false
    mode = 'coast'
    startLoop()
    return
  }
  settleIfOffGrid()
}

/** Depois de dobrar o giro por scroll a roda pode ficar fora da grade; se nada
 *  mais aconteceu no gesto, ela volta para o múltiplo de STEP mais próximo. */
function settleIfOffGrid() {
  if (mode !== 'idle') return
  const nearest = Math.round(rotation.value / STEP) * STEP
  if (Math.abs(nearest - rotation.value) < 0.01) return
  if (prefersReducedMotion.value) {
    rotation.value = nearest
    selectedId.value = TYPE_CYCLE[indexAtTop(nearest)].id
    return
  }
  beginSettle()
}

// ── Teclado: os chips alcançam tudo, com ou sem roda ────────────────────────
//
// A roda girável é um realce. Tab chega em cada um dos nove chips como antes, e
// as setas ←/→ passam para o tipo vizinho na ordem da roda — que é a ordem das
// vantagens, então andar de um em um É a explicação do sistema.

function focusChip(i) {
  chipsEl.value?.querySelectorAll('button')[i]?.focus()
}

function onChipKeydown(event, i) {
  const forward = event.key === 'ArrowRight' || event.key === 'ArrowDown'
  const back = event.key === 'ArrowLeft' || event.key === 'ArrowUp'
  if (!forward && !back) return
  event.preventDefault()
  const next = (i + (forward ? 1 : -1) + N) % N
  selectTo(next)
  focusChip(next)
}

// ── Rotação por scroll (GSAP), só onde ela não atrapalha ────────────────────
//
// O GSAP só é baixado se: a tela for grande o bastante para a roda ficar
// confortável, o usuário não tiver pedido menos movimento, e houver interação
// com a seção. No celular — o caso real do público — nada disso é baixado, e a
// roda fica parada e legível.
//
// Ele gira o <svg> INTEIRO (ponteiro do topo junto, então a leitura continua
// coerente), enquanto o giro à mão gira só o grupo dos setores: transforms
// diferentes, em elementos diferentes, sem disputa. No primeiro toque o de
// scroll é dobrado no outro e desligado de vez.

const gsapCtx = shallowRef(null)
const gsapLib = shallowRef(null)
let scrollSpinOff = false

async function enableScrollSpin() {
  if (gsapCtx.value || scrollSpinOff || !wheelEl.value) return
  if (prefersReducedMotion.value) return
  if (!window.matchMedia('(min-width: 860px)').matches) return

  const [{ gsap }, { ScrollTrigger }] = await Promise.all([
    import('gsap'),
    import('gsap/ScrollTrigger'),
  ])
  if (scrollSpinOff || !wheelEl.value) return
  gsap.registerPlugin(ScrollTrigger)
  gsapLib.value = gsap

  gsapCtx.value = gsap.context(() => {
    gsap.to(wheelEl.value, {
      rotation: STEP, // exatamente um passo: a roda "avança um tipo"
      ease: 'none',
      scrollTrigger: { trigger: wheelEl.value, start: 'top bottom', end: 'bottom top', scrub: 1 },
    })
  })
}

/** Transfere para o ângulo da mão o que o scroll tinha aplicado, e mata o
 *  ScrollTrigger. Os setores não se mexem um pixel — só o ponteiro do topo, que
 *  volta à vertical: a cabeça de leitura travando no lugar. */
function foldScrollSpin() {
  scrollSpinOff = true
  if (!gsapCtx.value) return
  const current = Number(gsapLib.value?.getProperty(wheelEl.value, 'rotation')) || 0
  gsapCtx.value.revert()
  gsapCtx.value = null
  rotation.value += current
}

onBeforeUnmount(() => {
  if (holdTimer) window.clearTimeout(holdTimer)
  unbindGestureEnd()
  stop()
  gsapCtx.value?.revert()
  gsapCtx.value = null
})
</script>

<template>
  <SectionShell :kicker="typeWheel.kicker" :title="typeWheel.title">
    <template #lede>{{ typeWheel.desc }}</template>

    <div class="wheel-layout">
      <!-- A SVG é decorativa: TODA a informação dela existe em HTML abaixo (os
           botões, o painel do tipo e a tabela para leitor de tela). Isso evita a
           ginástica de tornar setores de SVG focáveis, que quebra em navegador
           antigo e rende uma ordem de foco confusa. O giro por clique longo é um
           REALCE: tudo o que ele faz, os chips fazem pelo teclado. -->
      <div
        ref="stageEl"
        class="wheel"
        :class="{ 'wheel--charging': charging }"
        @pointerenter="enableScrollSpin"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerCancel"
      >
        <svg
          ref="wheelEl"
          class="wheel__svg"
          viewBox="0 0 400 400"
          aria-hidden="true"
          focusable="false"
        >
          <defs>
            <marker
              id="wheel-arrow"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="5"
              markerHeight="5"
              orient="auto-start-reverse"
            >
              <path d="M0 0L10 5L0 10z" fill="#edaf68" />
            </marker>
          </defs>

          <!-- Tudo o que é derivado do TYPE_CYCLE gira junto: setores, ícones e
               setas de vantagem. Assim as setas continuam ligando os mesmos dois
               tipos depois de meia volta. -->
          <g class="wheel__spin" :style="spinStyle">
            <path
              v-for="s in sectors"
              :key="s.id"
              :d="s.d"
              :fill="s.color"
              :class="['wheel__sector', { 'wheel__sector--dim': isDimmed(s.id) }]"
            />

            <g
              v-for="s in sectors"
              :key="'icon-' + s.id"
              :transform="iconTransform(s)"
              :style="{ color: s.iconColor }"
              :class="{ 'wheel__icon--dim': isDimmed(s.id) }"
            >
              <TypeIcon :type="s.id" :size="28" />
            </g>

            <path
              v-for="a in arrows"
              :key="'arrow-' + a.id"
              :d="a.d"
              class="wheel__arrow"
              fill="none"
              marker-end="url(#wheel-arrow)"
            />
          </g>

          <!-- Aro de carga: acende em degraus enquanto o dedo segura a roda. -->
          <circle :cx="CENTER" :cy="CENTER" r="194" class="wheel__rim" />

          <circle :cx="CENTER" :cy="CENTER" r="70" class="wheel__hub" />

          <!-- A cabeça de leitura. Ela NÃO gira com os setores: é contra ela que
               a roda trava, e é ela que explica por que "o topo" é a seleção. -->
          <path class="wheel__needle" d="M188 0 L212 0 L200 24 Z" />
        </svg>
      </div>

      <div class="wheel-panel">
        <p class="wheel-panel__hint">{{ typeWheel.hint }}</p>

        <ul ref="chipsEl" class="wheel-panel__chips">
          <li v-for="(t, i) in TYPE_CYCLE" :key="t.id">
            <button
              type="button"
              class="chip"
              :class="{ 'chip--on': t.id === selectedId }"
              :style="{
                '--chip': legibleColor(t.color),
                '--chip-fill': t.color,
                '--chip-on': onColor(t.color),
              }"
              :aria-pressed="t.id === selectedId"
              @click="selectTo(i)"
              @keydown="onChipKeydown($event, i)"
              @focus="enableScrollSpin"
            >
              <TypeIcon :type="t.id" :size="14" />
              {{ t.label }}
            </button>
          </li>
        </ul>

        <div v-if="selected" class="wheel-panel__detail gba-frame gba-frame--deep">
          <h3 class="wheel-panel__name" :style="{ color: legibleColor(selected.color) }">
            {{ selected.label }}
          </h3>
          <p class="wheel-panel__desc">{{ selected.description }}</p>

          <dl class="wheel-panel__matchups">
            <div>
              <dt class="wheel-panel__term wheel-panel__term--strong">
                {{ typeWheel.legendStrong }} <span aria-hidden="true">2×</span>
              </dt>
              <dd>{{ strongList.map((t) => t.label).join(' · ') }}</dd>
            </div>
            <div>
              <dt class="wheel-panel__term wheel-panel__term--weak">
                {{ typeWheel.legendWeak }} <span aria-hidden="true">0,5×</span>
              </dt>
              <dd>{{ weakList.map((t) => t.label).join(' · ') }}</dd>
            </div>
          </dl>
        </div>

        <p class="wheel-panel__note">{{ typeWheel.note }}</p>
      </div>
    </div>

    <!-- Equivalente textual completo: quem usa leitor de tela recebe a roda
         inteira de uma vez, sem precisar clicar tipo por tipo. -->
    <table class="sr-only">
      <!-- `sr-only` também NO caption, e não só na tabela: caption é uma caixa
           fora do box da tabela, então o clip-path do `.sr-only` do <table> não
           o alcança de forma confiável. Como a tabela é `position: absolute`, o
           caption que escapa fica fora do fluxo e pinta por cima do conteúdo ao
           lado em telas estreitas. Mesmo padrão do ScoreSection.vue. -->
      <caption class="sr-only">
        Vantagens de cada tipo na roda do ProfDex
      </caption>
      <thead>
        <tr>
          <th scope="col">Tipo</th>
          <th scope="col">Forte contra (2×)</th>
          <th scope="col">Fraco contra (0,5×)</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="t in TYPE_CYCLE" :key="t.id">
          <th scope="row">{{ t.label }}</th>
          <td>
            {{
              strongAgainst(t.id)
                .map((x) => x.label)
                .join(', ')
            }}
          </td>
          <td>
            {{
              weakAgainst(t.id)
                .map((x) => x.label)
                .join(', ')
            }}
          </td>
        </tr>
      </tbody>
    </table>
  </SectionShell>
</template>

<style scoped>
.wheel-layout {
  display: grid;
  gap: var(--space-5);
  align-items: center;
}

@media (min-width: 860px) {
  .wheel-layout {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: var(--space-6);
  }
}

.wheel {
  max-width: 460px;
  width: 100%;
  margin-inline: auto;
  /* `pan-y` deixa a página rolar por cima da roda — ela ocupa meia tela no
     celular, e capturar o gesto vertical prenderia o aluno na seção. O que
     sobra para nós é o toque parado, que é exatamente o gesto do clique longo.
     Se o navegador decidir rolar no meio do giro, chega um `pointercancel` e a
     roda é solta com a inércia que tinha. */
  touch-action: pan-y;
  /* Segurar por 300ms num elemento com texto/imagem dispara seleção e o menu de
     contexto do toque; nenhum dos dois tem o que fazer aqui. */
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
}

.wheel__svg {
  width: 100%;
  height: auto;
  display: block;
  /* A rotação por scroll precisa girar em torno do eixo da roda, não do canto
     do SVG. */
  transform-origin: 50% 50%;
}

/* O grupo que o clique longo gira. `view-box` + centro explícito: a origem não
   pode depender da caixa de desenho do grupo, que muda quando as setas mudam. */
.wheel__spin {
  transform-box: view-box;
  transform-origin: 200px 200px;
}

.wheel__sector {
  cursor: pointer;
  transition: opacity var(--dur-base) var(--ease-out);
}

/* A 0,28 os seis setores não destacados viravam manchas escuras e a roda
   deixava de parecer uma roda de nove cores — que é o que ela precisa
   comunicar antes de qualquer interação. 0,55 destaca sem apagar. */
.wheel__sector--dim,
.wheel__icon--dim {
  opacity: 0.55;
}

.wheel__icon--dim {
  transition: opacity var(--dur-base) var(--ease-out);
}

.wheel__arrow {
  stroke: var(--unifil-gold);
  stroke-width: 3;
  stroke-linecap: square;
}

.wheel__hub {
  fill: var(--bg-deep);
  stroke: var(--surface-border);
  stroke-width: 2;
  transform-box: view-box;
  transform-origin: 200px 200px;
}

/* A cabeça de leitura, com o fio escuro por fora: ela passa por cima de nove
   cores diferentes e precisa se separar de todas. */
.wheel__needle {
  fill: var(--unifil-gold);
  stroke: var(--bg-deep);
  stroke-width: 2;
}

.wheel__rim {
  fill: none;
  stroke: var(--unifil-gold);
  stroke-width: 3;
  opacity: 0;
}

/* ── Carregando o impulso ──────────────────────────────────────────────────
   Enquanto o dedo segura, o aro acende e o miolo cresce em degraus. É o mesmo
   vocabulário do resto da página: `steps()`, não interpolação — uma roleta de
   console carrega aos pulos. */
.wheel--charging .wheel__rim {
  animation: rim-charge 400ms steps(4, end) infinite alternate;
}

.wheel--charging .wheel__hub {
  animation: hub-charge 400ms steps(3, end) infinite alternate;
}

@keyframes rim-charge {
  from {
    opacity: 0.15;
  }
  to {
    opacity: 0.9;
  }
}

@keyframes hub-charge {
  from {
    transform: scale(1);
  }
  to {
    transform: scale(1.08);
  }
}

.wheel-panel {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.wheel-panel__hint {
  font-family: var(--font-pixel);
  font-size: var(--fs-body-sm);
  line-height: 1.7;
  color: var(--text-muted);
}

.wheel-panel__chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  list-style: none;
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  /* 40px de altura mínima: alvo de toque confortável no celular. */
  min-height: 40px;
  padding: 6px 10px;
  border: 2px solid var(--chip);
  border-radius: var(--radius);
  background: transparent;
  color: var(--chip);
  font-family: var(--font-pixel);
  font-size: 9px;
  line-height: 1.4;
  transition:
    background var(--dur-fast) ease,
    transform var(--dur-fast) steps(2, end);
}

.chip:hover {
  background: color-mix(in srgb, var(--chip) 18%, transparent);
}

/* O mesmo "afundar" do .btn-pixel, em pixel inteiro: o chip é um controle, e
   controle da casa responde ao toque com deslocamento, não com sombra macia. */
.chip:active {
  transform: translate(1px, 1px);
}

.chip--on {
  /* Selecionado é preenchido: aí vale a cor canônica, com o texto
     resolvido por luminância. */
  background: var(--chip-fill);
  border-color: var(--chip-fill);
  color: var(--chip-on);
}

.wheel-panel__detail {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.wheel-panel__name {
  font-family: var(--font-pixel);
  font-size: var(--fs-h3);
  line-height: 1.6;
}

.wheel-panel__desc {
  font-family: var(--font-pixel);
  color: var(--text-muted);
  font-size: var(--fs-body-sm);
  line-height: 1.7;
}

.wheel-panel__matchups {
  display: grid;
  gap: var(--space-3);
  margin-top: var(--space-2);
}

@media (min-width: 520px) {
  .wheel-panel__matchups {
    grid-template-columns: repeat(2, 1fr);
  }
}

.wheel-panel__term {
  font-family: var(--font-pixel);
  font-size: 9px;
  line-height: 1.6;
  margin-bottom: var(--space-1);
}

.wheel-panel__term--strong {
  color: var(--success-text);
}

.wheel-panel__term--weak {
  color: var(--error);
}

.wheel-panel__matchups dd {
  font-family: var(--font-pixel);
  font-size: var(--fs-body-sm);
  line-height: 1.7;
  color: var(--text-primary);
}

.wheel-panel__note {
  font-family: var(--font-pixel);
  font-size: var(--fs-body-sm);
  line-height: 1.7;
  color: var(--text-muted);
  border-left: 3px solid var(--unifil-orange);
  padding-left: var(--space-3);
}

/* Movimento reduzido: o giro não é animado (o JS já corta a inércia e assenta
   por corte seco), e o aro de carga vira um estado ESTÁTICO — o feedback de
   "estou segurando" continua existindo, só não pisca. */
@media (prefers-reduced-motion: reduce) {
  .wheel__sector,
  .wheel__icon--dim,
  .chip {
    transition: none;
  }

  .chip:active {
    transform: none;
  }

  .wheel--charging .wheel__rim,
  .wheel--charging .wheel__hub {
    animation: none;
  }

  .wheel--charging .wheel__rim {
    opacity: 0.9;
  }
}
</style>
