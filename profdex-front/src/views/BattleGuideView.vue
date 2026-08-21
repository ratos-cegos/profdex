<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import TypeIcon from '../components/TypeIcon.vue'
import {
  TYPE_CYCLE,
  legibleColor,
  onColor,
  strongAgainst,
  weakAgainst,
} from '../data/types'

const router = useRouter()

function goBack() {
  router.back()
}

// ---- Geometria da roda (SVG) ----
const VIEW = 320 // viewBox quadrado
const CENTER = VIEW / 2
const RADIUS = 122 // raio onde ficam os nós
const NODE_R = 26 // raio de cada nó

// Cada nó posicionado no círculo, começando no topo (12h) e girando no horário.
const nodes = computed(() =>
  TYPE_CYCLE.map((type, i) => {
    const angle = (-90 + i * (360 / TYPE_CYCLE.length)) * (Math.PI / 180)
    return {
      ...type,
      x: CENTER + RADIUS * Math.cos(angle),
      y: CENTER + RADIUS * Math.sin(angle),
    }
  }),
)

// Seta de cada nó para o seguinte (mostra o fluxo "vence os 2 seguintes").
const arrows = computed(() =>
  nodes.value.map((from, i) => {
    const to = nodes.value[(i + 1) % nodes.value.length]
    const dx = to.x - from.x
    const dy = to.y - from.y
    const dist = Math.hypot(dx, dy)
    const ux = dx / dist
    const uy = dy / dist
    // Recorta a linha para não entrar dentro dos círculos.
    const gap = NODE_R + 5
    return {
      color: from.color,
      x1: from.x + ux * gap,
      y1: from.y + uy * gap,
      x2: to.x - ux * gap,
      y2: to.y - uy * gap,
    }
  }),
)

// ---- Cards do guia ----
const guide = computed(() =>
  TYPE_CYCLE.map((type) => ({
    ...type,
    strong: strongAgainst(type.id),
    weak: weakAgainst(type.id),
  })),
)
</script>

<template>
  <div class="guide">
    <header class="guide__header">
      <button class="back-btn" type="button" @click="goBack">← Voltar</button>
      <div class="header__info">
        <span class="pixel eyebrow">COMO LUTAR</span>
        <h1 class="pixel header__title">INSTRUÇÕES</h1>
      </div>
    </header>

    <main class="guide__main page">
      <p class="guide__rule">
        Cada tipo é <strong class="strong-txt">super-eficaz (2×)</strong> contra os
        2 seguintes (sentido horário) e
        <strong class="weak-txt">fraco (0,5×)</strong> contra os 2 anteriores.
      </p>

      <!-- ATRIBUTOS -->
      <section class="panel">
        <h2 class="pixel panel__title">ATRIBUTOS</h2>
        <ul class="attr-list">
          <li class="attr" style="--attr-color: var(--ds-green-glow)">
            <span class="pixel attr__name">PV</span>
            <p class="attr__desc">
              Pontos de vida: quanto dano o professor aguenta. Chegou a
              <strong>zero</strong>, ele desmaia e a batalha acaba.
            </p>
          </li>
          <li class="attr" style="--attr-color: var(--error)">
            <span class="pixel attr__name">Ataque</span>
            <p class="attr__desc">
              Quanto dano os seus golpes causam. Quanto maior, mais forte cada acerto.
            </p>
          </li>
          <li class="attr" style="--attr-color: var(--ds-blue-glow)">
            <span class="pixel attr__name">Defesa</span>
            <p class="attr__desc">
              Reduz o dano que você <strong>recebe</strong>. Quanto maior, menos os
              golpes do oponente doem.
            </p>
          </li>
          <li class="attr" style="--attr-color: var(--ds-orange-glow)">
            <span class="pixel attr__name">Velocidade</span>
            <p class="attr__desc">
              Quem tem mais Velocidade <strong>age primeiro</strong> no turno e fica
              mais difícil de acertar.
            </p>
          </li>
        </ul>

        <h3 class="pixel calc__title">COMO O DANO É CALCULADO</h3>
        <div class="calc-box">
          <p class="calc-formula pixel">
            Dano ≈ Poder do golpe × (Ataque ÷ Defesa) × Vantagem de tipo
          </p>
        </div>
        <ul class="calc-notes">
          <li>
            O <strong>Poder do golpe</strong> é a base de cada ataque; o
            <strong>Ataque</strong> de quem bate multiplica, e a
            <strong>Defesa</strong> de quem apanha divide.
          </li>
          <li>
            A <strong>Vantagem de tipo</strong> multiplica por
            <strong class="strong-txt">2×</strong> (forte),
            <strong class="weak-txt">0,5×</strong> (fraco) ou 1× (neutro).
          </li>
          <li>
            Usar um golpe do <strong>mesmo tipo</strong> do professor rende um bônus
            extra de <strong>1,5×</strong>, e há uma pequena variação aleatória a cada
            acerto — por isso o dano nunca é idêntico.
          </li>
          <li>
            Buffs e debuffs durante a luta sobem ou descem esses atributos por alguns
            turnos, mudando o resultado da conta.
          </li>
        </ul>
      </section>

      <!-- RODA DE VANTAGENS -->
      <section class="panel">
        <h2 class="pixel panel__title panel__title--wheel">RODA DE VANTAGENS</h2>
        <div class="wheel">
          <svg :viewBox="`0 0 ${VIEW} ${VIEW}`" class="wheel__svg" role="img"
               aria-label="Roda de vantagens dos tipos">
            <defs>
              <marker
                v-for="node in nodes"
                :id="`arrow-${node.id}`"
                :key="`m-${node.id}`"
                markerWidth="6"
                markerHeight="6"
                refX="4.5"
                refY="3"
                orient="auto"
              >
                <path d="M0,0 L6,3 L0,6 Z" :fill="node.color" />
              </marker>
            </defs>

            <!-- setas de fluxo -->
            <line
              v-for="(a, i) in arrows"
              :key="`a-${i}`"
              :x1="a.x1"
              :y1="a.y1"
              :x2="a.x2"
              :y2="a.y2"
              :stroke="a.color"
              stroke-width="3.5"
              stroke-linecap="round"
              :marker-end="`url(#arrow-${nodes[i].id})`"
            />

            <!-- centro -->
            <circle
              :cx="CENTER"
              :cy="CENTER"
              r="46"
              fill="none"
              stroke="var(--yellow)"
              stroke-width="2"
            />
            <text
              :x="CENTER"
              :y="CENTER - 4"
              text-anchor="middle"
              class="wheel__center-title"
            >
              ProfDex
            </text>
            <text
              :x="CENTER"
              :y="CENTER + 14"
              text-anchor="middle"
              class="wheel__center-sub"
            >
              vence os 2
            </text>
            <text
              :x="CENTER"
              :y="CENTER + 26"
              text-anchor="middle"
              class="wheel__center-sub"
            >
              seguintes →
            </text>

            <!-- nós -->
            <g v-for="node in nodes" :key="node.id">
              <circle
                :cx="node.x"
                :cy="node.y"
                :r="NODE_R"
                :fill="node.color"
                stroke="rgba(0,0,0,0.35)"
                stroke-width="2"
              />
              <!-- `<svg>` aninhado nao aceita x/y, entao quem posiciona e o <g>.
                   O -11 centraliza o icone de 22px no meio do no.
                   A cor vem de `onColor`: o circulo esta preenchido com a cor
                   canonica do tipo, e sobre ela so preto ou branco tem
                   contraste - a paleta vai de #495057 a #F5A623. -->
              <g
                :transform="`translate(${node.x - 11}, ${node.y - 11})`"
                :style="{ color: onColor(node.color) }"
              >
                <TypeIcon :type="node.id" :size="22" />
              </g>
            </g>
          </svg>

          <ul class="wheel__legend">
            <li v-for="node in nodes" :key="`l-${node.id}`" class="wheel__legend-item">
              <span class="legend-dot" :style="{ background: node.color }" />
              {{ node.label }}
            </li>
          </ul>
        </div>
      </section>

      <!-- GUIA DOS TIPOS -->
      <section class="panel">
        <h2 class="pixel panel__title">GUIA DOS TIPOS</h2>
        <div class="type-grid">
          <article
            v-for="type in guide"
            :key="type.id"
            class="type-card"
            :style="{ '--type-color': type.color, '--type-icon': legibleColor(type.color) }"
          >
            <header class="type-card__head">
              <TypeIcon class="type-card__icon" :type="type.id" :size="22" />
              <h3 class="pixel type-card__name">{{ type.label }}</h3>
            </header>
            <p class="type-card__desc">{{ type.description }}</p>

            <div class="type-card__matchup">
              <span class="matchup-label matchup-label--strong">▲ FORTE (2×)</span>
              <span class="matchup-list">
                {{ type.strong.map((t) => t.label).join(', ') }}
              </span>
            </div>
            <div class="type-card__matchup">
              <span class="matchup-label matchup-label--weak">▼ FRACO (0,5×)</span>
              <span class="matchup-list">
                {{ type.weak.map((t) => t.label).join(', ') }}
              </span>
            </div>
          </article>
        </div>
      </section>
    </main>
  </div>
</template>

<style scoped>
.guide {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.guide__header {
  background: linear-gradient(160deg, var(--red-dark), var(--red));
  padding: 18px 20px 30px;
  position: relative;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 14px;
}

.guide__header::after {
  content: '';
  position: absolute;
  right: 0;
  bottom: -1px;
  left: 0;
  height: 20px;
  background: var(--bg);
  border-radius: 20px 20px 0 0;
}

.back-btn {
  position: relative;
  z-index: 1;
  min-height: 38px;
  padding: 0 14px;
  border-radius: var(--radius);
  background: rgba(0, 0, 0, 0.25);
  color: rgba(255, 255, 255, 0.88);
  border: 1px solid rgba(255, 255, 255, 0.2);
  white-space: nowrap;
}

.header__info {
  flex: 1;
  min-width: 0;
}

.eyebrow {
  display: block;
  margin-bottom: 4px;
  color: var(--yellow);
  font-size: 8px;
}

.header__title {
  font-size: 18px;
  color: white;
  text-shadow: 2px 2px 0 rgba(0, 0, 0, 0.3);
}

.guide__main {
  padding: 8px 16px 32px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.guide__rule {
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-muted);
  text-align: center;
  padding: 0 4px;
}

.strong-txt {
  color: var(--ds-green-glow);
}
.weak-txt {
  color: var(--error);
}

/* Painéis */
.panel {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 16px 14px;
}

.panel__title {
  font-size: 12px;
  color: var(--bg);
  background: var(--yellow);
  text-align: center;
  padding: 10px;
  border-radius: var(--radius);
  margin-bottom: 16px;
}

/* Atributos */
.attr-list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.attr {
  border: 1px solid var(--border);
  border-left: 4px solid var(--attr-color);
  border-radius: var(--radius);
  background: var(--bg-surface);
  padding: 10px 12px;
}

.attr__name {
  display: block;
  font-size: 11px;
  color: var(--attr-color);
  margin-bottom: 4px;
}

.attr__desc {
  font-size: 12px;
  line-height: 1.45;
  color: var(--text-muted);
}

.calc__title {
  font-size: 10px;
  color: var(--text);
  text-align: center;
  margin: 18px 0 10px;
}

.calc-box {
  background: var(--bg-surface);
  border: 1px dashed var(--yellow);
  border-radius: var(--radius);
  padding: 12px 10px;
}

.calc-formula {
  font-size: 9px;
  line-height: 1.6;
  color: var(--yellow);
  text-align: center;
}

.calc-notes {
  list-style: disc;
  margin: 12px 0 0;
  padding-left: 18px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.calc-notes li {
  font-size: 12px;
  line-height: 1.45;
  color: var(--text-muted);
}

/* Roda */
.wheel {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
}

.wheel__svg {
  width: 100%;
  max-width: 340px;
  height: auto;
}

/* A cor do icone da roda vai inline (depende da cor do no); aqui nada. */

.wheel__center-title {
  fill: var(--yellow);
  font-family: var(--font-pixel);
  font-size: 11px;
}

.wheel__center-sub {
  fill: var(--text-muted);
  font-size: 9px;
}

.wheel__legend {
  list-style: none;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px 12px;
  width: 100%;
}

.wheel__legend-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text);
}

.legend-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  flex-shrink: 0;
}

/* Guia dos tipos */
.type-grid {
  display: grid;
  gap: 12px;
}

.type-card {
  border: 1px solid var(--border);
  border-left: 4px solid var(--type-color);
  border-radius: var(--radius);
  background: var(--bg-surface);
  overflow: hidden;
}

.type-card__head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background: color-mix(in srgb, var(--type-color) 22%, transparent);
}

.type-card__icon {
  color: var(--type-icon);
  flex-shrink: 0;
}

.type-card__name {
  font-size: 11px;
  color: var(--text);
}

.type-card__desc {
  font-size: 12px;
  color: var(--text-muted);
  padding: 10px 12px 8px;
  line-height: 1.4;
}

.type-card__matchup {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 10px;
  padding: 0 12px 8px;
  font-size: 12px;
}

.type-card__matchup:last-child {
  padding-bottom: 12px;
}

.matchup-label {
  font-family: var(--font-pixel);
  font-size: 8px;
  white-space: nowrap;
}

.matchup-label--strong {
  color: var(--ds-green-glow);
}
.matchup-label--weak {
  color: var(--error);
}

.matchup-list {
  color: var(--text);
}
</style>
