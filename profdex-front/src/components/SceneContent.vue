<script setup>
import { shallowRef, watch } from 'vue'
import { useLoop } from '@tresjs/core'
import { Box3 } from 'three'
import { enquadramentoDe } from '../composables/enquadrarModelo.js'
import ModeloGlb from './ModeloGlb.vue'

// Este componente vive DENTRO do <TresCanvas> (ver Stage3D.vue).
// Só aqui dentro o contexto do Tres existe — por isso o useLoop
// (o "game loop" de cada frame) e as tags <Tres*> ficam neste arquivo,
// e não no componente que hospeda o canvas.
const props = defineProps({
  // Caminho de um .glb dentro de /public.
  modelPath: { type: String, default: '' },
  // Gira o professor no próprio eixo — é a revelação da bancada.
  spin: { type: Boolean, default: false },
})

// Só repassa o que o ModeloGlb avisa: quem decide o que fazer com a falha é a
// tela (a bancada troca o palco pelo sprite).
const emit = defineEmits(['pronto', 'erro'])

/** Radianos por segundo: uma volta a cada ~10s, tempo de ler o nome na ficha. */
const VELOCIDADE_GIRO = 0.6

// shallowRef porque o valor é um objeto THREE.js (Group) que não queremos que o
// Vue torne reativo em profundidade — só precisamos da referência.
const eixoRef = shallowRef()
const modeloRef = shallowRef()

// Reaproveitada entre medições: o enquadramento roda dentro do loop de render,
// e alocar um Box3 por frame é lixo de GC num tablet.
const caixa = new Box3()
let enquadrado = false

// Outro professor = outro GLB, e o enquadramento do anterior não serve. Zerar o
// giro junto é o que garante que a medição aconteça sempre com o eixo parado
// (ver `enquadrar`).
watch(
  () => props.modelPath,
  () => {
    enquadrado = false
    if (eixoRef.value) eixoRef.value.rotation.y = 0
  },
)

/**
 * Mede o modelo e aplica o enquadramento. `false` = o GLB ainda não chegou, e
 * quem chama tenta de novo no frame seguinte.
 *
 * `setFromObject` MEDE EM ESPAÇO DE MUNDO, então isto só vale com o grupo de
 * fora ainda sem rotação — por isso o giro só começa depois de enquadrar.
 */
function enquadrar(objeto) {
  // Zera antes de medir: numa troca de professor o objeto ainda carrega a
  // escala do anterior, e medir por cima dela encolheria o novo a cada troca.
  objeto.position.set(0, 0, 0)
  objeto.scale.setScalar(1)
  objeto.updateWorldMatrix(true, true)

  const enquadramento = enquadramentoDe(caixa.setFromObject(objeto))
  if (!enquadramento) return false

  objeto.scale.setScalar(enquadramento.escala)
  objeto.position.set(...enquadramento.posicao)
  return true
}

// useLoop devolve um gancho que roda uma vez por frame (~60x/s).
// `delta` = segundos desde o frame anterior, então multiplicar por ele
// deixa a rotação independente do FPS da máquina.
const { onBeforeRender } = useLoop()
onBeforeRender(({ delta }) => {
  if (!enquadrado) {
    if (!modeloRef.value) return
    enquadrado = enquadrar(modeloRef.value)
    // Ainda carregando: não gira, para a próxima medição pegar o eixo parado.
    if (!enquadrado) return
    // `pronto` só depois de enquadrar, e não quando o GLB chega: quem esconde o
    // palco até aqui não mostra nenhum frame do modelo fora de escala.
    emit('pronto')
  }
  if (props.spin && eixoRef.value) eixoRef.value.rotation.y += delta * VELOCIDADE_GIRO
})
</script>

<template>
  <!-- Dois grupos: o de FORA gira, o de DENTRO é recentrado e escalado pelo
       enquadramento. Separados porque as duas transformações se atrapalham —
       medir um objeto que já está girando dá uma caixa diferente a cada frame.

       `:key` no interno para a troca de professor recriar o grupo em vez de
       reaproveitar um que ainda tem o GLB antigo pendurado. -->
  <TresGroup ref="eixoRef">
    <TresGroup v-if="modelPath" :key="modelPath" ref="modeloRef">
      <ModeloGlb :path="modelPath" @erro="emit('erro')" />
    </TresGroup>
  </TresGroup>

  <!-- Chão, só para dar noção de escala e receber a sombra. -->
  <TresMesh :rotation="[-Math.PI / 2, 0, 0]" receive-shadow>
    <TresPlaneGeometry :args="[12, 12]" />
    <TresMeshStandardMaterial color="#161616" :roughness="1" />
  </TresMesh>
</template>
