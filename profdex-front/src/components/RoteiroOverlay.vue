<script setup>
// Os momentos de ROTEIRO da raid: virada de estágio, chegada do NDE, chegada do
// Ricardo Infiltrado.
//
// Por que um overlay e não a faixa de mensagem: a faixa tem altura travada em
// 56px (`--faixa-mensagem`) e um slot ÚNICO que se sobrescreve a cada 850ms. Num
// turno com seis mensagens, as cinco primeiras são destruídas antes de serem
// lidas — e roteiro é justamente o que o jogador não pode perder. Mexer na
// altura da faixa encolheria os lutadores, que é a regressão que aquele sistema
// foi construído para evitar.
//
// A cena é ORQUESTRADA, em ordem fixa: o ator entra andando, a roda gira e para,
// o chefe se transforma, e só então o texto começa. Cada etapa espera a
// anterior. Espalhar as quatro ao mesmo tempo era o que fazia a tela anterior
// parecer um aviso de sistema em vez de um momento do jogo.
//
// Golpe normal continua no auto-avanço da faixa. Aqui o tempo é do jogador: uma
// linha por toque, com um botão de pular ao lado — quem perdeu a raid e voltou
// depois do cooldown já viu este texto.

import { computed, onBeforeUnmount, ref, watch } from 'vue'
import AtorDoRoteiro from './AtorDoRoteiro.vue'
import RodaDaSorte from './RodaDaSorte.vue'

const props = defineProps({
  // `{ linhas, roleta?, ator?, estagio? }` — ver o evento `roteiro`.
  roteiro: { type: Object, required: true },
})

const emit = defineEmits(['fim'])

/** Respiro depois de a roda parar, para o resultado ser lido antes do texto. */
const PAUSA_APOS_A_RODA = 620

const etapa = ref('linhas')
const indice = ref(0)
let timer = null

const linhas = computed(() => props.roteiro?.linhas ?? [])
const linhaAtual = computed(() => linhas.value[indice.value] ?? '')
const naUltima = computed(() => indice.value >= linhas.value.length - 1)

/**
 * Basta o evento trazer um ator — não se exige que a arte esteja lá.
 *
 * Antes isto era `a?.sprites?.some(Boolean) ? a : null`: sem URL de sprite, o
 * ator sumia da cena inteira e não sobrava nada dizendo quem tinha chegado. O
 * `AtorDoRoteiro` desenha a placa com o nome quando não há arte, que é pior que
 * a sprite e muito melhor que o nada silencioso.
 */
const ator = computed(() => props.roteiro?.ator ?? null)

/** Virada de estágio: o ator tem para onde se transformar. */
const temTransformacao = computed(() => Boolean(ator.value?.spriteDepois))

function limparTimer() {
  if (timer) clearTimeout(timer)
  timer = null
}

function reiniciar() {
  limparTimer()
  indice.value = 0
  etapa.value = props.roteiro?.roleta ? 'roda' : 'linhas'
}

watch(() => props.roteiro, reiniciar, { immediate: true })

/** A roda parou: dá o respiro e vai para a transformação, ou direto ao texto. */
function aoPararARoda() {
  limparTimer()
  timer = setTimeout(() => {
    etapa.value = temTransformacao.value ? 'transformacao' : 'linhas'
    timer = null
  }, PAUSA_APOS_A_RODA)
}

function aoFimDaTransformacao() {
  etapa.value = 'linhas'
}

function avancar() {
  // Durante a roda e a transformação o toque não faz nada: o resultado é a
  // informação, e pular para o texto antes de ele assentar deixaria o jogador
  // sem saber o que caiu.
  if (etapa.value !== 'linhas') return
  if (naUltima.value) {
    emit('fim')
    return
  }
  indice.value += 1
}

onBeforeUnmount(limparTimer)
</script>

<template>
  <div
    class="roteiro"
    role="dialog"
    aria-modal="true"
    aria-label="Momento da raid"
    @click="avancar"
  >
    <button class="pixel roteiro__pular" type="button" @click.stop="emit('fim')">
      PULAR ▸
    </button>

    <div class="roteiro__cena">
      <RodaDaSorte
        v-if="roteiro.roleta"
        :key="roteiro.roleta.resultado"
        :kind="roteiro.roleta.kind"
        :opcoes="roteiro.roleta.opcoes"
        :resultado="roteiro.roleta.resultado"
        :pesos="roteiro.roleta.pesos ?? null"
        class="roteiro__roda"
        :class="{ 'roteiro__roda--recuada': etapa !== 'roda' }"
        @fim="aoPararARoda"
      />

      <AtorDoRoteiro
        v-if="ator"
        :ator="ator"
        :transformando="etapa === 'transformacao'"
        @fim-da-transformacao="aoFimDaTransformacao"
      />
    </div>

    <div v-if="etapa === 'linhas'" class="roteiro__caixa">
      <p class="pixel roteiro__texto" aria-live="polite">{{ linhaAtual }}</p>
      <span class="pixel roteiro__dica">
        {{ naUltima ? 'TOQUE PARA VOLTAR À LUTA' : 'TOQUE PARA CONTINUAR' }}
      </span>
    </div>
    <!-- Reserva a altura da caixa durante a roda e a transformação: sem isto a
         cena inteira salta para baixo quando o texto aparece. -->
    <div v-else class="roteiro__caixa roteiro__caixa--vazia" aria-hidden="true" />
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
  gap: 20px;
  padding: 24px 18px;
  padding-top: calc(24px + env(safe-area-inset-top));
  /* Quase opaco: a cena precisa do palco apagado atrás dela, não translúcido —
     sprite sobre sprite não lê. */
  background: rgba(8, 9, 11, 0.96);
  cursor: pointer;
  animation: roteiroAbre var(--dur-base) var(--ease-out);
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
  min-height: 32px;
}

.roteiro__cena {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  width: 100%;
}

/* Depois de parar, a roda RECUA: encolhe e perde brilho para o ator virar o
   assunto. Duas coisas grandes ao mesmo tempo competiriam, e quem importa a
   partir daí é o professor. */
.roteiro__roda {
  transition:
    transform var(--dur-slow) var(--ease-out),
    opacity var(--dur-slow) var(--ease-out);
}

.roteiro__roda--recuada {
  transform: scale(0.64);
  opacity: 0.42;
}

.roteiro__caixa {
  width: 100%;
  min-height: 76px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 12px;
  background: var(--surface);
  border: 2px solid var(--yellow);
  border-radius: var(--radius);
  box-shadow: 4px 4px 0 rgba(0, 0, 0, 0.45);
  animation: roteiroCaixaEntra var(--dur-base) var(--ease-out);
}

.roteiro__caixa--vazia {
  visibility: hidden;
  animation: none;
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

@keyframes roteiroAbre {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes roteiroCaixaEntra {
  from {
    opacity: 0;
    transform: translateY(10px);
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
  .roteiro,
  .roteiro__caixa {
    animation: none;
  }
  .roteiro__roda {
    transition: none;
  }
  .roteiro__dica {
    animation: none;
  }
}
</style>
