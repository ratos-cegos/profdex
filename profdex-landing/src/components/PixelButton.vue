<script setup>
import { computed } from 'vue'

// Botão da casa. Vira <a> quando recebe `href` — um CTA que navega É um link, e
// leitor de tela, "abrir em nova aba" e clique do meio dependem disso.
const props = defineProps({
  href: { type: String, default: null },
  variant: { type: String, default: 'solid' }, // 'solid' | 'ghost'
  block: { type: Boolean, default: false },
  external: { type: Boolean, default: false },
})

const tag = computed(() => (props.href ? 'a' : 'button'))

const classes = computed(() => [
  'btn-pixel',
  { 'btn-pixel--ghost': props.variant === 'ghost', 'btn-pixel--block': props.block },
])

// `noopener` sempre que abrir em outra aba: sem ele a página de destino recebe
// uma referência à nossa via window.opener.
const linkAttrs = computed(() =>
  props.href && props.external ? { target: '_blank', rel: 'noopener noreferrer' } : {},
)
</script>

<template>
  <component
    :is="tag"
    :class="classes"
    :href="href || undefined"
    :type="href ? undefined : 'button'"
    v-bind="linkAttrs"
  >
    <slot />
  </component>
</template>
