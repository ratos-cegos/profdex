<script setup>
import ProfessorFace from './ProfessorFace.vue'

// Os reservas ficam em uma linha compacta: retrato e HP continuam visíveis,
// enquanto os efeitos aparecem junto ao nome somente durante a entrada em campo.
defineProps({
  team: { type: Array, default: () => [] },
  /** captureId de quem está em campo. Só existe para o próprio time. */
  activeCaptureId: { type: String, default: null },
  /** O banco do rival fica alinhado ao outro lado da tela. */
  foe: { type: Boolean, default: false },
  /** Rótulo de quem é este banco ("VOCÊ"/"RIVAL"). */
  rotulo: { type: String, default: '' },
})

const proporcao = (m) => (m.maxHp ? Math.max(0, m.hp) / m.maxHp : 0)
</script>

<template>
  <div v-if="team.length > 1" class="banco-wrap" :class="{ 'banco-wrap--foe': foe }">
    <span v-if="rotulo" class="pixel banco__rotulo">{{ rotulo }}</span>
    <ul class="banco" :class="{ 'banco--foe': foe }">
      <li
        v-for="(m, i) in team"
        :key="m.captureId ?? i"
        class="banco__item"
        :class="{
          'banco__item--caido': m.fainted,
          'banco__item--ativo': activeCaptureId && m.captureId === activeCaptureId,
        }"
        :title="m.professor.name"
      >
        <ProfessorFace class="banco__face" :professor="m.professor" />
        <span class="banco__hp">
          <span
            class="banco__hp-fill"
            :class="{ 'banco__hp-fill--baixo': proporcao(m) <= 0.3 }"
            :style="{ width: `${proporcao(m) * 100}%` }"
          />
        </span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.banco-wrap {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.banco__rotulo {
  flex-shrink: 0;
  font-size: 6px;
  line-height: 1.4;
  color: var(--text-muted);
  letter-spacing: 0.04em;
}

.banco {
  display: flex;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.banco--foe {
  justify-content: flex-start;
}

.banco__item {
  width: 34px;
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 3px;
  border: 2px solid var(--border);
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.45);
}

.banco__item--ativo {
  border-color: var(--yellow);
}

.banco__item--caido {
  opacity: 0.4;
  filter: grayscale(1);
}

.banco__face {
  width: 100%;
  height: 26px;
  display: block;
  object-fit: cover;
  object-position: top;
  image-rendering: pixelated;
}

.banco__hp {
  height: 4px;
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.2);
  overflow: hidden;
}

.banco__hp-fill {
  display: block;
  height: 100%;
  background: var(--ds-green);
  transition: width 0.3s ease;
}

.banco__hp-fill--baixo {
  background: var(--error);
}
</style>
