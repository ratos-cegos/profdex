<script setup>
import { onBeforeUnmount, onMounted, shallowRef } from 'vue'
import { criarCarregadorGlb } from '../composables/carregadorGlb.js'
import { disposeObject3D } from '../composables/disposeObject3D.js'

// Carrega um .glb e AVISA quando deu certo ou errado.
//
// Vive DENTRO do <TresCanvas> (ver SceneContent.vue). Substitui o
// `<GLTFModel>` do @tresjs/cientos por dois motivos:
//
//  1. Ele não abria GLB comprimido (ver composables/carregadorGlb.js), e é
//     assim que chegam os professores cadastrados pelo painel.
//  2. O erro dele ia só para o console. Sem um evento de falha, a bancada não
//     tinha como trocar o palco vazio pelo sprite do professor.
//
// Não normaliza escala nem posição: isso é do `enquadrar` do SceneContent, que
// mede o grupo em volta deste componente.

const props = defineProps({
  path: { type: String, required: true },
})

const emit = defineEmits(['pronto', 'erro'])

// shallowRef: o valor é um grafo do Three, e reatividade profunda nele é cara
// e inútil. Só a referência importa.
const cena = shallowRef(null)

let carregador = null
// Vira true no unmount: um GLB que chega depois disso é descartado na hora, em
// vez de virar um modelo órfão preso na GPU. Na rede do evento, ele chega.
let cancelado = false

onMounted(() => {
  carregador = criarCarregadorGlb()
  carregador.loader.load(
    props.path,
    (gltf) => {
      if (cancelado) {
        disposeObject3D(gltf.scene)
        return
      }
      gltf.scene.traverse((no) => {
        if (no.isMesh) no.castShadow = true
      })
      cena.value = gltf.scene
      emit('pronto')
    },
    undefined,
    (e) => {
      if (cancelado) return
      // Fica no console para quem diagnostica no tablet; a tela segue com o
      // sprite, que é o que a bancada faz com o `erro`.
      console.warn('[ModeloGlb] falha ao carregar', props.path, e)
      emit('erro')
    },
  )
})

onBeforeUnmount(() => {
  cancelado = true
  disposeObject3D(cena.value)
  cena.value = null
  carregador?.descartar()
  carregador = null
})
</script>

<template>
  <!-- `primitive` é como o TresJS insere na cena um objeto do Three já pronto. -->
  <primitive v-if="cena" :object="cena" />
</template>
