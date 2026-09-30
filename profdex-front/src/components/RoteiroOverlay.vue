<script setup>
// Os momentos de ROTEIRO da raid: virada de estágio, chegada do NDE, chegada do
// Ricardo Infiltrado.
//
// Por que um overlay e não a faixa de mensagem: a faixa tem altura travada em
// 56px (`--faixa-mensagem`) e um slot ÚNICO que se sobrescreve a cada 850ms.
// Num turno com seis mensagens, as cinco primeiras são destruídas antes de
// serem lidas — e roteiro é justamente o que o jogador não pode perder. Mexer na
// altura da faixa encolheria os lutadores, que é a regressão que aquele sistema
// foi construído para evitar.
//
// Golpe normal continua no auto-avanço da faixa. Aqui o tempo é do jogador: uma
// linha por toque. Com o botão de pular ao lado, porque quem perdeu a raid e
// voltou depois do cooldown já viu este texto.

import { computed, onBeforeUnmount, ref, watch } from 'vue'
import RoletaDeSorteio from './RoletaDeSorteio.vue'

const props = defineProps({
  // { linhas: string[], roleta?: { kind, opcoes, resultado } }
  roteiro: { type: Object, required: true },
})

const emit = defineEmits(['fim'])

const fase = ref('linhas')
const indice = ref(0)
let timer = null

const linhas = computed(() => props.roteiro?.linhas ?? [])
const linhaAtual = computed(() => linhas.value[indice.value] ?? '')
const naUltima = computed(() => indice.value >= linhas.value.length - 1)

function reiniciar() {
  if (timer) clearTimeout(timer)
  indice.value = 0
  fase.value = props.roteiro?.roleta ? 'roleta' : 'linhas'
}

watch(() => props.roteiro, reiniciar, { immediate: true })

/** A roleta parou: dá um respiro para o resultado ser lido e passa ao texto. */
function aoPararARoleta() {
  timer = setTimeout(() => {
    fase.value = 'linhas'
    timer = null
  }, 700)
}

function avancar() {
  // Durante o giro o toque não faz nada: o resultado é a informação, e pular
  // para o texto antes de ele assentar deixaria o jogador sem saber o que caiu.
  if (fase.value !== 'linhas') return
  if (naUltima.value) {
    emit('fim')
    return
  }
  indice.value += 1
}

function pular() {
  emit('fim')
}

onBeforeUnmount(() => {
  if (timer) clearTimeout(timer)
})
</script>

<template>
  <div
    class="roteiro"
    role="dialog"
    aria-modal="true"
    aria-label="Momento da raid"
    @click="avancar"
  >
    <button class="pixel roteiro__pular" type="button" @click.stop="pular">
      PULAR ▸
    </button>

    <div class="roteiro__miolo">
      <RoletaDeSorteio
        v-if="roteiro.roleta"
        :key="roteiro.roleta.resultado"
        :kind="roteiro.roleta.kind"
        :opcoes="roteiro.roleta.opcoes"
        :resultado="roteiro.roleta.resultado"
        @fim="aoPararARoleta"
      />

      <div v-if="fase === 'linhas'" class="roteiro__caixa">
        <p class="pixel roteiro__texto" aria-live="polite">{{ linhaAtual }}</p>
        <span class="pixel roteiro__dica">
          {{ naUltima ? 'TOQUE PARA VOLTAR À LUTA' : 'TOQUE PARA CONTINUAR' }}
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.roteiro {
  position: fixed;
  top: 0;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 100%;
  max-width: 480px;
  /* Acima do palco e das notificações (`.notificacoes` é 15 no App.vue). */
  z-index: 20;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 18px;
  padding: 24px 18px;
  padding-top: calc(24px + env(safe-area-inset-top));
  background: rgba(10, 11, 13, 0.9);
  cursor: pointer;
}

.roteiro__pular {
  position: absolute;
  top: calc(12px + env(safe-area-inset-top));
  right: 14px;
  padding: 6px 10px;
  font-size: 7px;
  color: var(--text-muted);
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 100px;
  cursor: pointer;
  /* Alvo de toque confortável sem inflar a pílula. */
  min-height: 32px;
}

.roteiro__miolo {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 18px;
  width: 100%;
}

.roteiro__caixa {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px 12px;
  background: var(--surface);
  border: 2px solid var(--yellow);
  border-radius: var(--radius);
  box-shadow: 4px 4px 0 rgba(0, 0, 0, 0.45);
  animation: roteiroEntra var(--dur-base) var(--ease-out);
}

.roteiro__texto {
  margin: 0;
  font-size: 9px;
  line-height: 1.7;
  color: var(--text-primary);
}

.roteiro__dica {
  font-size: 6px;
  color: var(--yellow);
  align-self: flex-end;
  animation: roteiroPisca 1.4s steps(2, end) infinite;
}

@keyframes roteiroEntra {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes roteiroPisca {
  50% {
    opacity: 0.35;
  }
}

@media (prefers-reduced-motion: reduce) {
  .roteiro__caixa {
    animation: none;
  }
  .roteiro__dica {
    animation: none;
  }
}
</style>
