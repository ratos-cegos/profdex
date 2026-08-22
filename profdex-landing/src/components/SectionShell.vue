<script setup>
import { useId } from 'vue'
import { useReveal } from '@/composables/useReveal.js'

// Casca comum das seções: título, região com rótulo acessível e o reveal de
// scroll. Sem isto, cada seção repetiria o mesmo `aria-labelledby` na mão — e
// uma delas esqueceria.
defineProps({
  kicker: { type: String, default: '' },
  title: { type: String, required: true },
  // `tone="frame"` põe o conteúdo dentro do molde GBA.
  tone: { type: String, default: 'plain' },
})

const { el } = useReveal()
const headingId = useId()
</script>

<template>
  <section class="section" :aria-labelledby="headingId">
    <div class="container">
      <header ref="el" class="section-head">
        <p v-if="kicker" class="section-kicker">{{ kicker }}</p>
        <h2 :id="headingId" class="section-title">{{ title }}</h2>
        <p v-if="$slots.lede" class="section-lede"><slot name="lede" /></p>
      </header>

      <div :class="['section-body', { 'gba-frame': tone === 'frame' }]">
        <slot />
      </div>
    </div>
  </section>
</template>

<style scoped>
.section-head {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin-bottom: var(--space-5);
}

.section-title {
  /* Só o título respeita a largura de leitura confortável — em pixel, uma
     frase de título curta não precisa disso, mas evita que um título raro e
     comprido vire uma parede de uma linha só. */
  max-width: var(--maxw-prose);
}

.section-lede {
  /* Sem margem própria: o `gap` do .section-head já é o respiro entre título e
     lede, e somar os dois deixava esta linha fora da escala de 8. */
  color: var(--text-muted);
  font-size: var(--fs-body);
}

.section-body {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}
</style>
