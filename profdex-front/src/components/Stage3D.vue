<script setup>
import { computed, onBeforeUnmount, watch } from 'vue'
import { TresCanvas } from '@tresjs/core'
import { OrbitControls } from '@tresjs/cientos'
import SceneContent from '@/components/SceneContent.vue'

// Mesmo padrão do ARViewer: um único prop `config` descreve a cena,
// então esta camada 3D é reutilizável e a página só passa os dados.
const props = defineProps({
  config: {
    type: Object,
    default: () => ({}),
    // config aceita:
    //   modelPath?: string
    //   clearColor?: string
    //   autoRotate?: boolean   gira sozinho (bancada)
    //   interactive?: boolean  arrastar/pinçar (padrão: true)
  },
})

// A rotação automática existe para a bancada: o tablet fica na mesa virado
// para o aluno e ninguém vai arrastar a cena para ver o professor de outro
// ângulo. Desligada por padrão — a tela de AR continua como era.
//
// Quem gira é o MODELO, no próprio eixo (ver SceneContent), e não a câmera em
// volta dele: com o `autoRotate` do OrbitControls o chão e a luz giravam junto,
// e o professor passava de um lado para o outro da tela em vez de só rodar.
//
// `prefers-reduced-motion` para a rotação, como o resto do app já respeita.
const semMovimento =
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

const autoRotate = computed(() => Boolean(props.config.autoRotate) && !semMovimento)
const interativo = computed(() => props.config.interactive !== false)

// `pronto` quando o modelo entrou na cena; `erro` quando não vai entrar. Quem
// hospeda o palco decide o que mostrar no lugar (a bancada mostra o sprite).
const emit = defineEmits(['pronto', 'erro'])

// Download parado no Wi-Fi da feira não dispara erro nenhum: o fetch só fica
// pendurado. Passado o prazo sem modelo, conta como falha, e o palco não fica
// vazio esperando. Se o GLB chegar depois, quem hospeda já trocou de arte.
const PRAZO_MODELO_MS = 12000
let prazo = null
let resolvido = false

function armarPrazo(caminho) {
  clearTimeout(prazo)
  resolvido = false
  if (!caminho) return
  prazo = setTimeout(() => falhar(), PRAZO_MODELO_MS)
}

function aoFicarPronto() {
  if (resolvido) return
  resolvido = true
  clearTimeout(prazo)
  emit('pronto')
}

function falhar() {
  if (resolvido) return
  resolvido = true
  clearTimeout(prazo)
  emit('erro')
}

watch(() => props.config.modelPath, armarPrazo, { immediate: true })
onBeforeUnmount(() => clearTimeout(prazo))
</script>

<template>
  <div class="tres-stage">
    <!-- O <TresCanvas> é o único componente Vue "de verdade" da árvore 3D:
         ele cria o WebGLRenderer do Three.js e preenche o elemento pai.
         Tudo dentro dele é interpretado pelo renderer do TresJS. -->
    <TresCanvas :clear-color="config.clearColor ?? '#1a1a1a'" shadows :dpr="[1, 2]">
      <!-- Câmera: posição no espaço + para onde olha.
           Enquadra a caixa de lado LADO_ALVO (2) em que o SceneContent encaixa
           qualquer professor: a 2,6 de distância, num FOV de 50°, cabem ~2,4
           unidades de altura — o modelo inteiro com uma margem estreita. -->
      <TresPerspectiveCamera :position="[0, 1.35, 2.6]" :look-at="[0, 0.95, 0]" />

      <!-- Controle de órbita touch/mouse (arrastar pra girar, pinça pra zoom).
           Vem pronto do @tresjs/cientos — nada de escrever na mão. -->
      <OrbitControls
        :enable-damping="true"
        :target="[0, 0.95, 0]"
        :enable-rotate="interativo"
        :enable-zoom="interativo"
        :enable-pan="interativo"
      />

      <!-- Iluminação: uma ambiente suave + uma direcional que faz sombra -->
      <TresAmbientLight :intensity="0.6" />
      <TresDirectionalLight :position="[3, 5, 2]" :intensity="1.3" cast-shadow />

      <!-- Suspense trata o carregamento assíncrono do GLB lá dentro -->
      <Suspense>
        <SceneContent
          :model-path="config.modelPath ?? ''"
          :spin="autoRotate"
          @pronto="aoFicarPronto"
          @erro="falhar"
        />
      </Suspense>
    </TresCanvas>
  </div>
</template>

<style scoped>
/* O TresCanvas herda o tamanho deste wrapper, então ele precisa ter
   dimensões definidas (a página dá altura ao painel que contém isto). */
.tres-stage {
  width: 100%;
  height: 100%;
  border-radius: var(--radius-lg, 16px);
  overflow: hidden;
  background: var(--bg-deep);
}
</style>
