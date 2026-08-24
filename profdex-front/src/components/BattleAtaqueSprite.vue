<script setup>
import { computed, ref, watch } from 'vue'
import { ATAQUE_FRAMES } from '../data/professorSprites.js'

const props = defineProps({
  src: { type: String, required: true },
  sheetSrc: { type: String, default: null },
  attacking: { type: Boolean, default: false },
  hit: { type: Boolean, default: false },
  pixel: { type: Boolean, default: false },
  alt: { type: String, default: '' },
  imgClass: { type: String, default: '' },
})

const playSheet = computed(() => Boolean(props.attacking && props.sheetSrc))
const ratio = ref(0.55)

watch(
  () => props.sheetSrc,
  (url) => {
    if (!url) return
    const img = new Image()
    img.onload = () => {
      if (img.naturalWidth && img.naturalHeight) {
        ratio.value = img.naturalWidth / ATAQUE_FRAMES / img.naturalHeight
      }
    }
    img.src = url
  },
  { immediate: true },
)
</script>

<template>
  <div
    v-if="playSheet"
    class="battle-sheet"
    :class="[imgClass, { 'battle-sheet--pixel': pixel }]"
    :style="{ aspectRatio: String(ratio) }"
  >
    <div
      class="battle-sheet__strip"
      :style="{ backgroundImage: `url(${sheetSrc})` }"
    />
  </div>
  <img
    v-else
    :class="imgClass"
    :src="src"
    :alt="alt"
    decoding="async"
  />
</template>

<style scoped>
.battle-sheet {
  height: 100%;
  overflow: hidden;
  pointer-events: none;
  flex-shrink: 0;
}

.battle-sheet__strip {
  width: 600%;
  height: 100%;
  background-repeat: no-repeat;
  background-size: 100% 100%;
  animation: battle-folha 0.45s steps(5) forwards;
}

.battle-sheet--pixel,
.battle-sheet--pixel .battle-sheet__strip {
  image-rendering: pixelated;
}

@keyframes battle-folha {
  from {
    transform: translateX(0);
  }
  to {
    transform: translateX(-83.333%);
  }
}

@media (prefers-reduced-motion: reduce) {
  .battle-sheet__strip {
    animation: none;
  }
}
</style>
