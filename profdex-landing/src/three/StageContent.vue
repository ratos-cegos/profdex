<script setup>
import { shallowRef } from 'vue'
import { useLoop, useTres } from '@tresjs/core'
import { OrbitControls } from '@tresjs/cientos'
import GlbModel from '@/three/GlbModel.vue'

// Conteúdo da cena. Este componente é FILHO do <TresCanvas> — e precisa ser:
// `useLoop` e `useTres` dependem do contexto que o canvas injeta, e não
// funcionam no componente que hospeda o canvas. Mesmo padrão de
// SceneContent.vue no repositório principal.

const props = defineProps({
  modelPath: { type: String, required: true },
  /** Rotação automática — desligada quando o usuário pede menos movimento. */
  autoRotate: { type: Boolean, default: true },
})

const emit = defineEmits(['ready', 'error', 'progress'])

const pivot = shallowRef(null)
const { invalidate } = useTres()

const { onBeforeRender } = useLoop()
onBeforeRender(({ delta }) => {
  if (!props.autoRotate || !pivot.value) return
  // Multiplicar por `delta` deixa a rotação independente do FPS da máquina.
  pivot.value.rotation.y += delta * 0.35
  // O canvas está em `render-mode="on-demand"`: só redesenha quando alguém
  // avisa que algo mudou. Sem este `invalidate`, a rotação aconteceria nos
  // dados e nunca apareceria na tela.
  invalidate()
})
</script>

<template>
  <!-- Órbita por toque/mouse. `@change` é obrigatório no modo on-demand: sem
       ele, arrastar move a câmera e a tela não repinta. -->
  <OrbitControls
    :enable-damping="true"
    :enable-pan="false"
    :min-distance="2"
    :max-distance="9"
    :target="[0, 1, 0]"
    @change="invalidate()"
  />

  <!-- Luzes com os mesmos valores de SceneContent.vue do app: já calibradas
       para esta arte, e não há motivo para reinventar. -->
  <TresAmbientLight :intensity="0.6" />
  <TresDirectionalLight :position="[3, 5, 2]" :intensity="1.3" />
  <!-- Uma segunda direcional fraca, do lado oposto, evita que a parte de trás
       do modelo vire silhueta preta quando ele gira. -->
  <TresDirectionalLight :position="[-4, 2, -3]" :intensity="0.45" />

  <TresGroup ref="pivot">
    <GlbModel
      :path="modelPath"
      @ready="emit('ready')"
      @error="emit('error')"
      @progress="(p) => emit('progress', p)"
    />
  </TresGroup>
</template>
