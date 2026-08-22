<script setup>
import { computed } from 'vue'
import { score } from '@/content/copy.js'
import SectionShell from '@/components/SectionShell.vue'
import { useReveal } from '@/composables/useReveal.js'

const { el } = useReveal({ threshold: 0.25 })

// A barra de cada linha é proporcional ao maior valor da tabela — a régua vira
// visual sozinha, sem ninguém precisar comparar números. É o argumento da
// seção: capturar (50) e batalhar (80) valem mais que abrir o app (5).
const maxPoints = computed(() => Math.max(...score.rows.map((r) => r.points)))
const widthOf = (points) => ((points / maxPoints.value) * 100).toFixed(1) + '%'
</script>

<template>
  <SectionShell :kicker="score.kicker" :title="score.title">
    <template #lede>{{ score.desc }}</template>

    <div ref="el" class="table gba-frame">
      <table class="table__el">
        <caption class="sr-only">
          Pontos de engajamento por ação no evento
        </caption>
        <thead>
          <tr>
            <th scope="col">Ação</th>
            <th scope="col" class="table__num">Pontos</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(row, i) in score.rows"
            :key="row.action"
            :class="{ 'is-high': row.highlight }"
            :style="{ '--reveal-i': i }"
          >
            <th scope="row" class="table__action">
              {{ row.action }}
              <!-- A barra fica atrás do texto da linha, não numa coluna própria:
                   assim ela informa sem roubar largura no celular. -->
              <span class="table__bar" :style="{ width: widthOf(row.points) }" aria-hidden="true" />
            </th>
            <td class="table__num">{{ row.prefix ?? '' }}{{ row.points }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <p class="note">{{ score.note }}</p>
  </SectionShell>
</template>

<style scoped>
.table {
  padding: var(--space-3);
  overflow-x: auto;
}

.table__el {
  width: 100%;
  border-collapse: collapse;
}

.table__el th,
.table__el td {
  text-align: left;
  padding: var(--space-2) var(--space-2);
  border-bottom: 2px dashed var(--surface-border);
}

.table__el thead th {
  font-family: var(--font-pixel);
  font-size: 9px;
  color: var(--unifil-gold);
  line-height: 1.6;
}

.table__el tbody tr:last-child th,
.table__el tbody tr:last-child td {
  border-bottom: none;
}

.table__action {
  position: relative;
  font-family: var(--font-pixel);
  font-weight: 400;
  font-size: var(--fs-body-sm);
  line-height: 1.7;
  color: var(--text-primary);
  isolation: isolate;
}

.table__bar {
  position: absolute;
  left: 0;
  bottom: 2px;
  height: 3px;
  max-width: 100%;
  background: var(--surface-border);
  z-index: -1;
  /* Cresce da esquerda quando a seção aparece; `steps` mantém o gesto 8-bit. */
  transform: scaleX(0);
  transform-origin: left;
  transition: transform 900ms var(--ease-pixel);
  /* As barras crescem de cima para baixo, uma linha atrás da outra: a tabela é
     uma escada de valor, e vê-la se montar na ordem é o argumento da seção. */
  transition-delay: calc(var(--reveal-i, 0) * 70ms);
}

[data-reveal='shown'] .table__bar {
  transform: scaleX(1);
}

.is-high .table__action {
  color: var(--unifil-gold);
}

.is-high .table__bar {
  background: var(--unifil-orange);
  height: 4px;
}

.table__num {
  text-align: right;
  font-family: var(--font-pixel);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.is-high .table__num {
  color: var(--unifil-gold);
}

.note {
  margin-top: var(--space-3);
  font-family: var(--font-pixel);
  font-size: var(--fs-body-sm);
  line-height: 1.7;
  color: var(--text-muted);
  border-left: 3px solid var(--unifil-orange);
  padding-left: var(--space-3);
  max-width: var(--maxw-prose);
}

@media (prefers-reduced-motion: reduce) {
  .table__bar {
    transition: none;
    transition-delay: 0s;
    transform: scaleX(1);
  }
}
</style>
