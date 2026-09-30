<script setup>
// Roleta de caça-níquel: desfila as opções e desacelera até parar no resultado.
//
// Serve os DOIS sorteios da raid — o tipo de cada estágio do lendário e o buff
// que o Ricardo Infiltrado entrega — porque visualmente são a mesma coisa: gira
// entre N opções e para numa. Um componente só em vez de dois evita que as duas
// animações divirjam com o tempo.
//
// Quem decide o resultado é o SERVIDOR: `resultado` chega pronto no evento de
// roteiro. A animação é teatro sobre um dado já lançado — inclusive no estágio
// 1, em que a roleta gira e cai viciada no tipo que o lendário já tinha.

import { onBeforeUnmount, onMounted, ref } from 'vue'
import TypeIcon from './TypeIcon.vue'
import { getType, legibleColor } from '../data/types.js'

const props = defineProps({
  // 'tipo' desenha ícone + nome do tipo; 'buff' desenha só o rótulo.
  kind: { type: String, default: 'tipo' },
  opcoes: { type: Array, required: true },
  resultado: { type: String, required: true },
})

const emit = defineEmits(['fim'])

const indice = ref(0)
const girando = ref(true)
let timer = null

const rotuloDe = (opcao) =>
  props.kind === 'tipo' ? (getType(opcao)?.label ?? opcao) : opcao

const corDe = (opcao) =>
  props.kind === 'tipo'
    ? legibleColor(getType(opcao)?.color ?? '#a8b8c0')
    : 'var(--yellow)'

function parar() {
  girando.value = false
  timer = null
  emit('fim')
}

function girar() {
  const destino = props.opcoes.indexOf(props.resultado)
  // Resultado fora da lista seria bug de contrato; parar em cima do que veio é
  // melhor que girar para sempre.
  if (destino < 0) {
    girando.value = false
    emit('fim')
    return
  }

  // Sem animação para quem pede menos movimento — convenção do projeto, ver
  // `style.css`. A informação é o resultado, e ele aparece na hora.
  const reduzido = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
  if (reduzido) {
    indice.value = destino
    parar()
    return
  }

  // Uma volta completa mais o caminho até o destino: garante que o resultado
  // não apareça no primeiro quadro, sem alongar o turno (a raid tem 20+).
  const passos = props.opcoes.length + destino
  let dados = 0

  const passo = () => {
    indice.value = (indice.value + 1) % props.opcoes.length
    dados += 1
    if (dados >= passos) {
      parar()
      return
    }
    // Ease-out: o intervalo cresce ao quadrado conforme chega perto do fim.
    const t = dados / passos
    timer = setTimeout(passo, 40 + 180 * t * t)
  }

  timer = setTimeout(passo, 40)
}

onMounted(girar)
onBeforeUnmount(() => {
  if (timer) clearTimeout(timer)
})
</script>

<template>
  <div class="roleta" :class="{ 'roleta--parada': !girando }">
    <div class="roleta__janela">
      <div
        class="roleta__item"
        :style="{ '--cor': corDe(opcoes[indice]) }"
        :aria-live="girando ? 'off' : 'polite'"
      >
        <TypeIcon
          v-if="kind === 'tipo'"
          :type="opcoes[indice]"
          :size="28"
          class="roleta__icone"
        />
        <span class="pixel roleta__rotulo">{{ rotuloDe(opcoes[indice]) }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.roleta {
  display: flex;
  justify-content: center;
}

.roleta__janela {
  /* Largura fixa: o rótulo muda de tamanho a cada quadro e sem isto a caixa
     pulsaria durante o giro. */
  width: 100%;
  max-width: 260px;
  padding: 10px 8px;
  border: 2px solid var(--border);
  border-radius: var(--radius);
  background: var(--bg-deep);
  overflow: hidden;
}

.roleta__item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  color: var(--cor);
}

.roleta__rotulo {
  font-size: 9px;
  line-height: 1.4;
  text-align: center;
  color: var(--cor);
}

.roleta--parada .roleta__janela {
  border-color: var(--yellow);
  box-shadow: 0 0 0 2px rgba(237, 175, 104, 0.25);
}

.roleta--parada .roleta__item {
  animation: roletaPara 320ms var(--ease-out);
}

@keyframes roletaPara {
  0% {
    transform: scale(1.18);
  }
  100% {
    transform: scale(1);
  }
}

@media (prefers-reduced-motion: reduce) {
  .roleta--parada .roleta__item {
    animation: none;
  }
}
</style>
