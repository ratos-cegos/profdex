<script setup>
import { computed } from 'vue'

// Ícone de cada um dos 9 tipos.
//
// O `types.js` do app guarda um emoji por tipo (🧩, 📐, 🧠…), e o próprio
// briefing pede para trocá-los por ícones que conversem com as cores. Emoji
// numa landing tem três problemas: cada sistema desenha o seu, quase todos são
// coloridos (brigam com a cor canônica do tipo) e nenhum se alinha à grade de
// pixel do resto da página.
//
// Estes são monocromáticos e herdam `currentColor`, então cada ícone sai
// exatamente na cor do seu tipo. Traço de 2px numa viewBox de 24, coordenadas
// inteiras — é o que mantém a aresta nítida.
//
// Formato: [tagSVG, atributos]. Descritores em vez de `v-html` porque injetar
// innerHTML para desenhar um ícone estático é abrir uma porta que não precisa
// existir.

const props = defineProps({
  type: { type: String, required: true },
  size: { type: [Number, String], default: 24 },
})

const ICONS = {
  // Peça de quebra-cabeça: dedução encaixando.
  logica: [
    [
      'path',
      { d: 'M4 4h6a2 2 0 1 1 4 0h6v6a2 2 0 1 0 0 4v6h-6a2 2 0 1 0-4 0H4v-6a2 2 0 1 0 0-4V4z' },
    ],
  ],
  // O sinal de integral: o símbolo que o curso inteiro reconhece de longe.
  // Traço único, sem eixos por baixo — a leitura em 20px depende de a silhueta
  // ser uma coisa só, e a versão com eixos + tangente virava rabisco nesse
  // tamanho.
  calculo: [['path', { d: 'M16 4c0-1.1-.9-2-2-2s-3 1-3 4v12c0 3-1.5 4-3 4s-2-.9-2-2' }]],
  // Rede neural: três camadas de nós ligadas.
  'ia-ml': [
    ['circle', { cx: 5, cy: 7, r: 2 }],
    ['circle', { cx: 5, cy: 17, r: 2 }],
    ['circle', { cx: 12, cy: 12, r: 2 }],
    ['circle', { cx: 19, cy: 7, r: 2 }],
    ['circle', { cx: 19, cy: 17, r: 2 }],
    ['path', { d: 'M7 8l3 3M7 16l3-2M14 11l3-3M14 13l3 3' }],
  ],
  // Cabeça de robô com antena: sensor e atuador.
  robotica: [
    ['path', { d: 'M12 2v3' }],
    ['rect', { x: 4, y: 7, width: 16, height: 12, rx: 1 }],
    ['path', { d: 'M9 12h.01M15 12h.01' }],
    ['path', { d: 'M9 16h6' }],
  ],
  // Chip com as pernas: hardware e baixo nível.
  arquitetura: [
    ['rect', { x: 7, y: 7, width: 10, height: 10, rx: 1 }],
    ['path', { d: 'M10 2v5M14 2v5M10 17v5M14 17v5M2 10h5M2 14h5M17 10h5M17 14h5' }],
  ],
  // Quadro e alguém apresentando: práticas integradoras.
  npi: [
    ['rect', { x: 3, y: 3, width: 18, height: 13, rx: 1 }],
    ['path', { d: 'M7 20l5-4 5 4' }],
    ['path', { d: 'M7 8h6M7 12h4' }],
  ],
  // Grafo de nós: roteamento e sistemas distribuídos.
  redes: [
    ['circle', { cx: 12, cy: 4, r: 2 }],
    ['circle', { cx: 4, cy: 18, r: 2 }],
    ['circle', { cx: 20, cy: 18, r: 2 }],
    ['circle', { cx: 12, cy: 12, r: 2 }],
    ['path', { d: 'M12 6v4M10 13l-4 3M14 13l4 3' }],
  ],
  // Cilindro clássico de banco de dados.
  banco: [
    ['ellipse', { cx: 12, cy: 6, rx: 8, ry: 3 }],
    ['path', { d: 'M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6' }],
    ['path', { d: 'M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3' }],
  ],
  // Fluxo que bifurca: estruturas e complexidade.
  algoritmos: [
    ['path', { d: 'M3 7h5l4 10h8' }],
    ['path', { d: 'M3 17h5l4-10h8' }],
    ['path', { d: 'M17 4l3 3-3 3' }],
    ['path', { d: 'M17 14l3 3-3 3' }],
  ],
}

const parts = computed(() => ICONS[props.type] ?? [])
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="square"
    stroke-linejoin="miter"
    aria-hidden="true"
    focusable="false"
  >
    <component :is="tag" v-for="([tag, attrs], i) in parts" :key="i" v-bind="attrs" />
  </svg>
</template>
