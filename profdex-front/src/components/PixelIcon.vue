<script setup>
import { computed } from 'vue'
import { desenharIcone } from '../data/pixelIcons'

// Ícone pixel da casa (src/data/pixelIcons.js) desenhado como SVG inline.
//
// SVG e não PNG: sai nítido em qualquer densidade de tela, pega as cores dos
// tokens (o ícone muda junto se a paleta mudar) e não custa requisição.
// `crispEdges` impede o navegador de suavizar a borda de cada pixel.
const props = defineProps({
  nome: { type: String, required: true },
  // Pixels de tela por pixel da grade. Inteiro de propósito: 1,5× faria uns
  // pixels ficarem com 1px e outros com 2px, e o desenho "treme".
  escala: {
    type: Number,
    default: 2,
    validator: (valor) => Number.isInteger(valor) && valor > 0,
  },
  // Com rótulo o ícone é informação (leitor de tela anuncia); sem, é enfeite.
  rotulo: { type: String, default: '' },
})

const icone = computed(() => desenharIcone(props.nome))
</script>

<template>
  <svg
    v-if="icone"
    class="pixel-icon"
    :width="icone.largura * escala"
    :height="icone.altura * escala"
    :viewBox="`0 0 ${icone.largura} ${icone.altura}`"
    shape-rendering="crispEdges"
    focusable="false"
    :role="rotulo ? 'img' : undefined"
    :aria-label="rotulo || undefined"
    :aria-hidden="rotulo ? undefined : 'true'"
  >
    <path v-for="camada in icone.camadas" :key="camada.cor" :d="camada.d" :style="{ fill: camada.cor }" />
  </svg>
</template>

<style scoped>
.pixel-icon {
  display: block;
  flex-shrink: 0;
}
</style>
