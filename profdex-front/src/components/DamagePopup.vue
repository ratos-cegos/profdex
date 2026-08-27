<script setup>
defineProps({
  amount: { type: Number, default: 0 },
  kind: { type: String, default: 'dano' },
  label: { type: String, default: '' },
  offset: { type: Number, default: 0 },
})
</script>

<template>
  <span
    class="damage-popup"
    :class="`damage-popup--${kind}`"
    :style="{ '--popup-offset': `${offset}px` }"
  >
    <strong v-if="amount" class="pixel">{{ kind === 'cura' ? '+' : '−' }}{{ amount }}</strong>
    <small v-if="label" class="pixel">{{ label }}</small>
  </span>
</template>

<style scoped>
.damage-popup {
  position: absolute;
  z-index: 8;
  left: calc(50% + var(--popup-offset));
  top: 20%;
  display: grid;
  justify-items: center;
  pointer-events: none;
  color: var(--error);
  animation: popup-rise 900ms ease-out forwards;
  text-shadow:
    -2px -2px 0 #111,
    2px -2px 0 #111,
    -2px 2px 0 #111,
    2px 2px 0 #111;
}
.damage-popup strong {
  font-size: 20px;
}
.damage-popup small {
  margin-top: 5px;
  max-width: 130px;
  color: white;
  font-size: 7px;
  text-align: center;
  line-height: 1.5;
}
.damage-popup--cura {
  color: var(--success-text);
}
.damage-popup--critico {
  color: var(--unifil-gold);
}
@keyframes popup-rise {
  from {
    opacity: 1;
    transform: translate(-50%, 12px);
  }
  to {
    opacity: 0;
    transform: translate(-50%, -54px);
  }
}
@media (prefers-reduced-motion: reduce) {
  .damage-popup {
    animation: popup-still 900ms steps(1, end) forwards;
  }
  @keyframes popup-still {
    0% {
      opacity: 1;
    }
    100% {
      opacity: 0;
    }
  }
}
</style>
