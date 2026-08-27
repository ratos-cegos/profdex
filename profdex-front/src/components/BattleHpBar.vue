<script setup>
import { computed } from 'vue'
import TypeIcon from './TypeIcon.vue'

const props = defineProps({
  name: { type: String, required: true },
  hp: { type: Number, required: true },
  maxHp: { type: Number, required: true },
  avatarSrc: { type: String, default: '' },
  // Ids dos tipos do combatente, desenhados antes do nome.
  //
  // Antes os icones eram emoji concatenados DENTRO de `name` pelo chamador
  // (`${icones} Prof. ${nome}`). Um componente nao sobrevive a um `.join('')`,
  // entao os tipos passaram a ser prop propria. Default vazio: quem nao passa
  // `types` renderiza exatamente como antes.
  types: { type: Array, default: () => [] },
})

const percent = computed(() =>
  props.maxHp > 0 ? Math.max(0, Math.min(100, (props.hp / props.maxHp) * 100)) : 0
)

// Verde > 50%, amarelo > 20%, vermelho no restante (igual Pokémon)
const barColor = computed(() => {
  if (percent.value > 50) return 'var(--ds-green-glow)'
  if (percent.value > 20) return 'var(--ds-orange-glow)'
  return 'var(--error)'
})

function hideBrokenImage(event) {
  event.currentTarget.style.display = 'none'
}
</script>

<template>
  <div class="hp-panel" :class="{ 'hp-panel--empty': percent === 0 }">
    <div v-if="avatarSrc" class="hp-panel__avatar">
      <img :src="avatarSrc" :alt="name" @error="hideBrokenImage" />
    </div>
    <div class="hp-panel__info">
      <div class="hp-panel__row">
        <span v-if="types.length" class="hp-panel__types">
          <TypeIcon v-for="id in types" :key="id" :type="id" :size="12" />
        </span>
        <span class="pixel hp-panel__name">{{ name }}</span>
      </div>
      <div class="hp-panel__bar" role="progressbar" :aria-valuenow="hp" :aria-valuemax="maxHp"
        :aria-label="`HP de ${name}`">
        <span class="pixel hp-panel__hp-label">HP</span>
        <div class="hp-panel__track" :class="{ 'hp-panel__track--empty': percent === 0 }">
          <div class="hp-panel__fill" :style="{ width: percent + '%', background: barColor }" />
        </div>
      </div>
      <span class="pixel hp-panel__numbers">{{ hp }}/{{ maxHp }}</span>
    </div>
  </div>
</template>

<style scoped>
.hp-panel {
  display: flex;
  align-items: center;
  gap: 10px;
  background: rgba(18, 20, 24, 0.88);
  border: 2px solid var(--border);
  border-radius: var(--radius);
  padding: 8px 12px;
  min-width: 180px;
  box-shadow: 2px 2px 0 rgba(0, 0, 0, 0.35);
}

.hp-panel__avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  overflow: hidden;
  border: 2px solid var(--yellow);
  flex-shrink: 0;
  background: var(--bg-surface);
}

.hp-panel__avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.hp-panel__info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.hp-panel__row {
  display: flex;
  /* Era `space-between` com um filho so (portanto equivalente a `flex-start`).
     Com os icones de tipo ao lado do nome, `space-between` jogaria os dois para
     extremos opostos do painel. */
  justify-content: flex-start;
  align-items: center;
  gap: 6px;
}

.hp-panel__types {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
  color: var(--text-primary);
}

.hp-panel__name {
  font-size: 9px;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.hp-panel__bar {
  display: flex;
  align-items: center;
  gap: 6px;
}

.hp-panel__hp-label {
  font-size: 6px;
  color: var(--yellow);
}

.hp-panel__track {
  flex: 1;
  height: 8px;
  background: var(--bg-deep);
  border: 1px solid var(--border);
  border-radius: 4px;
  overflow: hidden;
}

.hp-panel__track--empty {
  background: var(--error);
  border-color: #ff8f8f;
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.28);
}

.hp-panel--empty .hp-panel__numbers {
  color: #ff9b9b;
}

.hp-panel__fill {
  height: 100%;
  border-radius: 3px;
  transition: width 0.5s ease, background 0.5s ease;
}

.hp-panel__numbers {
  font-size: 7px;
  color: var(--text-muted);
  align-self: flex-end;
}
</style>
