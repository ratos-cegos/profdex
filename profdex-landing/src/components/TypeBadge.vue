<script setup>
import { computed } from 'vue'
import { getType, onColor } from '@/data/types.js'
import TypeIcon from '@/components/TypeIcon.vue'

const props = defineProps({
  typeId: { type: String, required: true },
  size: { type: String, default: 'md' }, // 'sm' | 'md'
})

const type = computed(() => getType(props.typeId))

// A cor do texto não é escolhida no olho: `onColor` decide por luminância.
// A paleta dos tipos vai de #495057 (quase preto) a #F5A623 (laranja claro) —
// uma cor fixa reprovaria em contraste na metade das badges.
const style = computed(() => ({
  background: type.value?.color,
  color: onColor(type.value?.color ?? '#000000'),
}))
</script>

<template>
  <span v-if="type" class="type-badge" :class="`type-badge--${size}`" :style="style">
    <TypeIcon :type="type.id" :size="size === 'sm' ? 12 : 16" />
    {{ type.label }}
  </span>
</template>

<style scoped>
.type-badge {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  padding: 5px var(--space-2);
  border-radius: var(--radius);
  font-family: var(--font-pixel);
  font-size: 9px;
  line-height: 1.4;
  white-space: nowrap;
}

.type-badge--md {
  font-size: 10px;
  padding: 6px var(--space-2);
}
</style>
