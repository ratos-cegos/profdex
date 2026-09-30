<script setup>
import { computed, defineAsyncComponent, ref, watch } from 'vue'
import { spriteFrenteDe, temModeloProprio } from '../data/professorArte'

// O palco da bancada: o professor que acabou de sair, ao lado do QR ou do
// "CAPTURADO". O espaço NUNCA fica vazio:
//
//  - o sprite do professor aparece na hora e segura o palco enquanto o 3D
//    carrega;
//  - o 3D entra por cima só quando já está enquadrado;
//  - se o 3D falhar (GLB que não abre, 404, rede parada, chunk que não baixa),
//    ele sai e o sprite fica.
//
// Antes o palco mostrava 3D OU sprite, escolhendo só pela existência de
// `modelUrl`. Um GLB que não carregava deixava um quadrado escuro ao lado do QR,
// e era o que acontecia com os raros cadastrados pelo painel.

const props = defineProps({
  // { name, modelUrl?, spriteFrontUrl?, pixelArt? }: o `revelado` do polling ou
  // o `raro.liberado` do resultado.
  professor: { type: Object, required: true },
  clearColor: { type: String, default: '#10121a' },
})

// Falha ao baixar o chunk do three.js (o Wi-Fi da feira) conta como falha do
// 3D. Sem o `onError`, o async component só renderizava nada, em silêncio.
const chunkFalhou = ref(false)
// O 3D chega só quando aparece um professor para revelar. A bancada passa o dia
// inteiro aberta e roda em modo `ficha` na maior parte do evento: carregar o
// three.js no boot seria ~700KB que a maioria das rodadas nunca usa.
const Stage3D = defineAsyncComponent({
  loader: () => import('./Stage3D.vue'),
  onError(_erro, _tentarDeNovo, desistir) {
    chunkFalhou.value = true
    desistir()
  },
})

const estado3d = ref('carregando') // carregando | pronto | falhou
const spriteFalhou = ref(false)

// Outro professor no mesmo palco: tudo recomeça, inclusive a chance do 3D.
watch(
  () => props.professor,
  () => {
    estado3d.value = 'carregando'
    spriteFalhou.value = false
  },
)

const tenta3d = computed(
  () => temModeloProprio(props.professor) && !chunkFalhou.value && estado3d.value !== 'falhou',
)

// NUNCA o sprite ou o GLB padrão: os dois caem no Gustavo, e mostrar o
// professor errado ao lado do QR é pior que mostrar só a inicial (decisão 17).
const spriteProprio = computed(() =>
  props.professor.spriteFrontUrl ? spriteFrenteDe(props.professor) : null,
)
const inicial = computed(() => props.professor.name?.[0]?.toUpperCase() ?? '?')
</script>

<template>
  <figure class="palco-revelacao">
    <img
      v-if="spriteProprio && !spriteFalhou"
      v-show="estado3d !== 'pronto'"
      class="palco-revelacao__sprite"
      :class="{ 'palco-revelacao__sprite--pixel': professor.pixelArt }"
      :src="spriteProprio"
      :alt="professor.name"
      @error="spriteFalhou = true"
    />
    <span
      v-else-if="estado3d !== 'pronto'"
      class="palco-revelacao__inicial"
      role="img"
      :aria-label="professor.name"
    >
      {{ inicial }}
    </span>

    <component
      :is="Stage3D"
      v-if="tenta3d"
      class="palco-revelacao__3d"
      :class="{ 'palco-revelacao__3d--visivel': estado3d === 'pronto' }"
      :config="{
        modelPath: professor.modelUrl,
        clearColor,
        autoRotate: true,
        interactive: false,
      }"
      @pronto="estado3d = 'pronto'"
      @erro="estado3d = 'falhou'"
    />
  </figure>
</template>

<style scoped>
/* Altura fixa porque o <TresCanvas> herda o tamanho do pai: sem ela o canvas
   nasce com 0px e o professor não aparece. */
.palco-revelacao {
  position: relative;
  margin: 0;
  width: clamp(200px, 32vh, 340px);
  height: clamp(200px, 32vh, 340px);
  display: grid;
  place-items: center;
}

.palco-revelacao__sprite {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  /* Balanço leve: sem 3D, é o que dá vida à revelação. */
  animation: revelacao-balanco 2.4s ease-in-out infinite;
}

.palco-revelacao__sprite--pixel {
  image-rendering: pixelated;
}

.palco-revelacao__inicial {
  width: 60%;
  aspect-ratio: 1;
  display: grid;
  place-items: center;
  border: 3px solid var(--unifil-gold);
  border-radius: var(--radius-lg);
  background: var(--bg-deep);
  color: var(--unifil-gold);
  font-family: var(--font-pixel);
  font-size: clamp(40px, 9vh, 88px);
}

/* O 3D fica por cima do sprite, invisível, até estar enquadrado. Invisível e
   não desmontado: o canvas precisa existir para carregar e medir o modelo. */
.palco-revelacao__3d {
  position: absolute;
  inset: 0;
  opacity: 0;
  transition: opacity 0.35s ease;
}

.palco-revelacao__3d--visivel {
  opacity: 1;
}

@keyframes revelacao-balanco {
  0%,
  100% {
    transform: translateY(0) rotate(-1.5deg);
  }
  50% {
    transform: translateY(-8px) rotate(1.5deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .palco-revelacao__sprite {
    animation: none;
  }

  .palco-revelacao__3d {
    transition: none;
  }
}
</style>
