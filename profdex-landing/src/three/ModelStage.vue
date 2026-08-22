<script setup>
import { TresCanvas } from '@tresjs/core'

import StageContent from '@/three/StageContent.vue'

// Hospeda o <TresCanvas>, que é o único componente Vue "de verdade" da árvore
// 3D — é ele que cria o WebGLRenderer. Tudo dentro dele é interpretado pelo
// renderer do TresJS.
//
// NOME: nada aqui pode se chamar `Tres*`. A regra `isCustomElement` do
// vite.config.js trata qualquer tag com esse prefixo como custom element, e um
// componente nosso assim nomeado renderizaria vazio. Foi por isso que o
// `TresStage` do app virou `Stage3D` (docs/CENARIO-3D-E-AR.md).

defineProps({
  modelPath: { type: String, required: true },
  autoRotate: { type: Boolean, default: true },
})

const emit = defineEmits(['ready', 'error', 'progress'])
</script>

<template>
  <div class="stage">
    <TresCanvas
      clear-color="#121418"
      render-mode="on-demand"
      :dpr="[1, 1.5]"
      :shadows="false"
      power-preference="default"
    >
      <TresPerspectiveCamera :position="[0, 1.6, 4.2]" :look-at="[0, 1, 0]" :fov="42" />
      <StageContent
        :model-path="modelPath"
        :auto-rotate="autoRotate"
        @ready="emit('ready')"
        @error="emit('error')"
        @progress="(p) => emit('progress', p)"
      />
    </TresCanvas>
  </div>
</template>

<style scoped>
/* Três decisões deste bloco, todas por causa do incidente de memória
   (docs/BUG-BATALHA-TRAVANDO.md), estão nas props acima e não no CSS:

   · render-mode="on-demand" — o app usa o padrão `always`, que repinta 60×/s
     para sempre. Numa landing que fica aberta enquanto o aluno lê, isso é
     bateria queimada à toa.
   · dpr [1, 1.5] — o app usa [1, 2]. Num celular com DPR 3, o teto 2 significa
     4× mais pixels que o teto 1,5. Aqui o modelo é ilustração, não o conteúdo.
   · shadows desligado — mapa de sombra é mais uma textura na GPU, e com uma
     luz de preenchimento a leitura da forma já fica clara.

   O canvas herda o tamanho deste wrapper, então ele precisa ter altura. */
.stage {
  width: 100%;
  aspect-ratio: 4 / 3;
  max-height: 70vh;
  border-radius: var(--radius);
  overflow: hidden;
  background: var(--bg-deep);
  /* `touch-action: pan-y` deixa a página continuar rolando no celular com um
     arrasto vertical; o giro do modelo fica no arrasto horizontal. Sem isso o
     canvas engole o scroll e o usuário fica preso na seção. */
  touch-action: pan-y;
}
</style>
