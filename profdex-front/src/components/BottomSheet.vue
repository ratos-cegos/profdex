<script setup>
import { onMounted, onUnmounted, useTemplateRef } from 'vue'

defineProps({
  title: { type: String, required: true },
  placement: {
    type: String,
    default: 'bottom',
    validator: (value) => ['bottom', 'center'].includes(value),
  },
})
const emit = defineEmits(['close'])
const panel = useTemplateRef('panel')

function onKeydown(event) {
  if (event.key === 'Escape') emit('close')
}
function onPopstate() {
  emit('close')
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  window.history.pushState({ bottomSheet: true }, '')
  window.addEventListener('popstate', onPopstate)
  panel.value?.focus()
})
onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('popstate', onPopstate)
  if (window.history.state?.bottomSheet) window.history.back()
})
</script>

<template>
  <div
    class="sheet"
    :class="`sheet--${placement}`"
    role="presentation"
    @click.self="$emit('close')"
  >
    <section
      ref="panel"
      class="sheet__panel"
      role="dialog"
      aria-modal="true"
      :aria-label="title"
      tabindex="-1"
    >
      <header class="sheet__header">
        <h2 class="pixel">{{ title }}</h2>
        <button type="button" aria-label="Fechar" @click="$emit('close')">✕</button>
      </header>
      <slot />
    </section>
  </div>
</template>

<style scoped>
.sheet {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: flex-end;
  background: rgba(0, 0, 0, 0.62);
  pointer-events: auto;
}
.sheet__panel {
  width: min(100%, 480px);
  max-height: min(78dvh, 620px);
  overflow: auto;
  padding: 20px 18px calc(20px + env(safe-area-inset-bottom));
  border: 2px solid var(--unifil-gold);
  border-bottom: 0;
  border-radius: 18px 18px 0 0;
  background: var(--surface);
  color: var(--text-primary);
  outline: none;
}
.sheet--center {
  align-items: center;
  justify-content: center;
  padding: max(16px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right))
    max(16px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left));
}
.sheet--center .sheet__panel {
  width: min(100%, 480px);
  max-height: min(78dvh, 620px);
  padding: 20px 18px;
  border-bottom: 2px solid var(--unifil-gold);
  border-radius: 18px;
}
.sheet__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}
.sheet__header h2 {
  font-size: 10px;
  line-height: 1.5;
}
.sheet__header button {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: var(--bg-deep);
  color: white;
  font-size: 18px;
}
</style>
