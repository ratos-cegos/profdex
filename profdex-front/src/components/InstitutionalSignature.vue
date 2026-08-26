<script setup>
import { getLandingCreditsUrl } from '../services/public-links.js'

const landingCreditsUrl = getLandingCreditsUrl()

defineProps({
  compact: { type: Boolean, default: false },
})
</script>

<template>
  <a
    class="institutional-signature"
    :class="{ 'institutional-signature--compact': compact }"
    :href="landingCreditsUrl"
    aria-label="Conheça a UNIFIL e a equipe do ProfDex"
  >
    <span>Uma experiência</span>
    <img src="/marca/logotipo-branco.png" alt="UNIFIL" />
  </a>
</template>

<style scoped>
.institutional-signature {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 9px;
  min-height: 44px;
  color: rgba(255, 255, 255, 0.76);
  font-size: 8px;
  line-height: 1.4;
  text-decoration: none;
}

.institutional-signature img {
  width: 88px;
  height: auto;
}

.institutional-signature--compact {
  min-height: 36px;
  font-size: 7px;
}

.institutional-signature--compact img {
  width: 72px;
}

.institutional-signature:focus-visible {
  outline: 2px solid var(--unifil-gold);
  outline-offset: 4px;
}
</style>
