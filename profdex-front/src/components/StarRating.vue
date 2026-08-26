<script setup>
import { computed } from 'vue'

const props = defineProps({ value: { type: Number, default: 0 } })
const rating = computed(() => Math.max(0, Math.min(5, Math.round(props.value * 2) / 2)))
const label = computed(() => `${rating.value.toLocaleString('pt-BR')} de 5 estrelas`)
</script>

<template>
  <span class="stars" role="img" :aria-label="label">
    <span
      v-for="index in 5"
      :key="index"
      class="stars__item"
      :class="{
        'stars__item--full': rating >= index,
        'stars__item--half': rating === index - 0.5,
      }"
      aria-hidden="true"
    >★</span>
  </span>
</template>

<style scoped>
.stars { display: inline-flex; gap: 2px; color: var(--surface-border); }
.stars__item { position: relative; font-size: 18px; line-height: 1; }
.stars__item--full { color: var(--unifil-gold); }
.stars__item--half::after {
  content: '★'; position: absolute; inset: 0; width: 50%; overflow: hidden;
  color: var(--unifil-gold);
}
</style>
