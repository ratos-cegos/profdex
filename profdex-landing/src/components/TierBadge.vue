<script setup>
const props = defineProps({
  tier: { type: Object, required: true },
  // Posição na escada, para a barra e para o atraso da cascata. Derivados do
  // índice, não digitados — a escada continua saindo de copy.js.
  rank: { type: Number, default: 0 },
  of: { type: Number, default: 1 },
})

// "1500+" quando não há teto — o Mestre é aberto para cima.
const range = props.tier.max === null ? `${props.tier.min}+` : `${props.tier.min}–${props.tier.max}`

// A barra é a POSIÇÃO na escada, não uma medida nova: o primeiro tier enche um
// sexto, o Mestre enche tudo. Serve de régua para o olho ler a escada como
// escada; o número exato continua escrito ao lado, e ela é aria-hidden.
const fill = ((props.rank + 1) / props.of) * 100 + '%'
</script>

<template>
  <li class="tier" :style="{ '--reveal-i': rank }">
    <span class="tier__icon" aria-hidden="true">{{ tier.icon }}</span>
    <span class="tier__name">{{ tier.name }}</span>
    <span class="tier__range">{{ range }}</span>
    <span class="tier__bar" aria-hidden="true">
      <span class="tier__bar-fill" :style="{ width: fill }" />
    </span>
  </li>
</template>

<style scoped>
.tier {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-3) var(--space-2);
  background: var(--bg-deep);
  border: 2px solid var(--surface-border);
  border-radius: var(--radius);
  text-align: center;
}

.tier__icon {
  font-size: 20px;
  line-height: 1;
}

.tier__name {
  font-family: var(--font-pixel);
  font-size: 9px;
  color: var(--unifil-gold);
}

.tier__range {
  font-size: 12px;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}

/* Mesma barra da tabela de pontos, mesma mecânica: cresce da esquerda em
   `steps()` quando a escada entra na tela. */
.tier__bar {
  display: block;
  width: 100%;
  height: 4px;
  margin-top: var(--space-1);
  background: var(--surface-border);
}

.tier__bar-fill {
  display: block;
  height: 100%;
  background: var(--unifil-orange);
  transform: scaleX(0);
  transform-origin: left;
  transition: transform var(--dur-slow) var(--ease-pixel);
  transition-delay: calc(var(--reveal-i, 0) * 70ms);
}

[data-reveal='shown'] .tier__bar-fill {
  transform: scaleX(1);
}

@media (prefers-reduced-motion: reduce) {
  .tier__bar-fill {
    transition: none;
    transform: scaleX(1);
  }
}
</style>
