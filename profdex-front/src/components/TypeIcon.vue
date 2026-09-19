<script setup>
import { computed } from 'vue'

// Ícone de cada um dos 9 tipos. Arte oficial, trazida da landing page
// (`profdex-landing-page/src/components/TypeIcon.vue`), que é outro repositório
// — por isso o componente é copiado, e não importado.
//
// O `icon` de `data/types.js` guarda um emoji por tipo (📚, 📐, 🧠…). Emoji tem
// três problemas: cada sistema desenha o seu, quase todos são coloridos (brigam
// com a cor canônica do tipo) e nenhum se alinha à identidade do resto do app.
//
// Estes são monocromáticos e herdam `currentColor`, então cada ícone sai
// exatamente na cor do seu tipo. Traço de 2px numa viewBox de 24, coordenadas
// inteiras — é o que mantém a aresta nítida.
//
// É vetor, não pixel art: NÃO aplicar `image-rendering: pixelated` (a convenção
// do projeto para os PNGs de `/icons`), que só serrilharia as curvas.
//
// Formato: [tagSVG, atributos]. Descritores em vez de `v-html` porque injetar
// innerHTML para desenhar um ícone estático é abrir uma porta que não precisa
// existir.

const props = defineProps({
  type: { type: String, required: true },
  size: { type: [Number, String], default: 24 },
})

const ICONS = {
  // Livro aberto: a leitura e o debate que sustentam a área.
  humanas: [
    ['path', { d: 'M12 7v12' }],
    ['path', { d: 'M12 7C10 5 7 4 3 5v12c4-1 7 0 9 2' }],
    ['path', { d: 'M12 7c2-2 5-3 9-2v12c-4-1-7 0-9 2' }],
  ],
  // O sinal de integral: o símbolo que o curso inteiro reconhece de longe.
  // Traço único, sem eixos por baixo — a leitura em 20px depende de a silhueta
  // ser uma coisa só, e a versão com eixos + tangente virava rabisco nesse
  // tamanho. Continua servindo para Matemática, que hoje cobre também
  // estatística: o integral é o que o aluno reconhece como "a matéria pesada".
  matematica: [['path', { d: 'M16 4c0-1.1-.9-2-2-2s-3 1-3 4v12c0 3-1.5 4-3 4s-2-.9-2-2' }]],
  // Rede neural: três camadas de nós ligadas.
  ia: [
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
  // Dois blocos ligados por uma seta: a leitura de diagrama (UML/BPMN).
  'engenharia-software': [
    ['rect', { x: 3, y: 3, width: 8, height: 6, rx: 1 }],
    ['rect', { x: 13, y: 15, width: 8, height: 6, rx: 1 }],
    ['path', { d: 'M7 9v9h6' }],
    ['path', { d: 'M11 16l2 2-2 2' }],
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
