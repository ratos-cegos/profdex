<script setup>
import { onBeforeUnmount, onMounted, shallowRef } from 'vue'
import { Box3, Vector3 } from 'three'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { asset } from '@/config/asset.js'
import { disposeObject3D } from '@/three/disposeObject3D.js'

// Carrega o .glb e — mais importante que carregar — devolve a memória depois.
//
// Vive DENTRO do <TresCanvas> (ver ModelStage.vue): é lá que o contexto do
// TresJS existe.
//
// Por que GLTFLoader direto, e não o `useGLTF` do @tresjs/cientos:
//
//  1. O `useGLTF` instancia um DRACOLoader internamente e nunca o descarta. O
//     DRACOLoader mantém um POOL DE WEB WORKERS vivo; só `.dispose()` encerra.
//     Numa seção cujo propósito é não deixar lixo na memória, isso não serve.
//  2. Ele não expõe `onProgress`, então a barra de carregamento seria falsa.
//  3. Sem controle do ciclo de vida não dá para ignorar uma resposta que chega
//     depois de o usuário já ter fechado o 3D — e ela chega, em rede de evento.
//
// O preço são ~40 linhas em vez de 5. Vale, e é o mesmo Three.js por baixo.

const props = defineProps({
  path: { type: String, required: true },
  /** Altura desejada do modelo, em unidades de cena. */
  targetHeight: { type: Number, default: 2 },
})

const emit = defineEmits(['ready', 'error', 'progress'])

// shallowRef porque o valor é um objeto do Three (Group). Reatividade profunda
// num grafo de cena é cara e não serve para nada aqui — só precisamos da
// referência.
const modelRef = shallowRef(null)

let gltfLoader = null
let dracoLoader = null
// Vira true no unmount: se o carregamento terminar depois disso, o resultado é
// descartado na hora em vez de virar um modelo órfão preso na memória.
let cancelled = false

/** Escala e centraliza o modelo para a câmera não precisar ser recalibrada. */
function normalize(scene) {
  const box = new Box3().setFromObject(scene)
  const size = box.getSize(new Vector3())
  const center = box.getCenter(new Vector3())
  if (size.y <= 0) return

  const scale = props.targetHeight / size.y
  scene.scale.setScalar(scale)
  // Centraliza em X/Z e apoia a base em Y=0, seja qual for a unidade de
  // exportação do arquivo.
  scene.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale)
}

onMounted(() => {
  dracoLoader = new DRACOLoader()
  // Decodificador na PRÓPRIA origem (public/draco/), copiado do pacote `three`
  // instalado — versão casada com este GLTFLoader. O padrão da lib aponta para
  // o CDN do Google: um terceiro no caminho crítico é um ponto de falha a mais
  // no Wi-Fi de um evento.
  dracoLoader.setDecoderPath(asset('/draco/'))

  gltfLoader = new GLTFLoader()
  gltfLoader.setDRACOLoader(dracoLoader)

  gltfLoader.load(
    props.path,
    (gltf) => {
      if (cancelled) {
        // Chegou tarde: o usuário já fechou. Descarta em vez de guardar.
        disposeObject3D(gltf.scene)
        return
      }
      normalize(gltf.scene)
      modelRef.value = gltf.scene
      emit('ready')
    },
    (event) => {
      // `lengthComputable` é false quando o servidor não manda Content-Length
      // (resposta comprimida em chunks, por exemplo) — aí não há porcentagem
      // honesta a mostrar, e a barra fica indeterminada.
      if (event.lengthComputable && event.total > 0) {
        emit('progress', event.loaded / event.total)
      }
    },
    () => {
      if (!cancelled) emit('error')
    },
  )
})

onBeforeUnmount(() => {
  cancelled = true

  // O ponto do arquivo inteiro: sem isto, desmontar o componente não devolve
  // um byte de GPU. Ver src/three/disposeObject3D.js.
  disposeObject3D(modelRef.value)
  modelRef.value = null

  // Encerra o pool de workers do Draco.
  dracoLoader?.dispose()
  dracoLoader = null
  gltfLoader = null
})
</script>

<template>
  <!-- `primitive` é como o TresJS insere um objeto do Three já pronto na cena. -->
  <primitive v-if="modelRef" :object="modelRef" />
</template>
