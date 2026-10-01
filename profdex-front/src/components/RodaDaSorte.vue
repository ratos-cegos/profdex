<script setup>
// A roda da raid: nove nós em círculo e um ponteiro que gira e para num deles.
//
// Por que uma RODA e não um caça-níquel (que era o que estava aqui antes): o
// jogador já aprendeu esta roda. Ela é a roda de tipos da tela de guia
// (`BattleGuideView`), com os mesmos nove nós nas mesmas cores — ver o giro do
// lendário acontecer NELA é o pagamento de ter estudado a tabela. Um slot
// machine de texto não dizia nada sobre este jogo.
//
// E por que o PONTEIRO gira em vez da roda: com a roda girando, os ícones
// giram com ela e viram borrão — e deixar o vencedor de pé no fim exige
// contra-rotação que só fecha para um dos nove. Com a roda parada os nove ficam
// legíveis do primeiro ao último quadro, que é o que faz o giro valer: o jogador
// acompanha o ponteiro passando pelo tipo que ele queria.
//
// O resultado vem do SERVIDOR. A animação é teatro sobre um dado já lançado —
// inclusive no estágio 1, em que a roda cai viciada no tipo que o chefe já tinha.

import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import TypeIcon from './TypeIcon.vue'
import { getType, legibleColor } from '../data/types.js'

const props = defineProps({
  /** 'tipo' desenha o ícone do tipo; 'buff' numera os nós. */
  kind: { type: String, default: 'tipo' },
  opcoes: { type: Array, required: true },
  resultado: { type: String, required: true },
  /** Pesos do sorteio, quando houver: pintam os nós por raridade. */
  pesos: { type: Array, default: null },
})

const emit = defineEmits(['fim'])

/** Voltas completas antes de desacelerar. Três é longo o bastante para dar
 *  tensão e curto o bastante para não atrasar um turno de raid. */
const VOLTAS = 3
const DURACAO_MS = 2600

const giro = ref(0)
const parou = ref(false)
let timer = null

const indiceVencedor = computed(() => {
  const i = props.opcoes.indexOf(props.resultado)
  // Resultado fora da lista seria bug de contrato; parar no primeiro nó é
  // melhor que girar para sempre.
  return i < 0 ? 0 : i
})

const passo = computed(() => 360 / Math.max(1, props.opcoes.length))

/**
 * A cor de um nó.
 *
 * Tipo: a cor canônica, clareada por `legibleColor` — `engenharia-software` é
 * `#495057` e sumiria no fundo escuro.
 *
 * Buff: a raridade. Ver o ponteiro parar num nó dourado e já saber que foi algo
 * raro é informação, não enfeite — e é a única coisa que a roda de buff tem a
 * dizer antes de o nome aparecer.
 */
function corDoNo(i) {
  if (props.kind === 'tipo') {
    return legibleColor(getType(props.opcoes[i])?.color ?? '#a8b8c0')
  }
  const peso = props.pesos?.[i]
  if (peso === 1) return 'var(--raro)'
  if (peso === 2) return 'var(--ds-blue-glow)'
  return 'var(--ds-green-glow)'
}

const nos = computed(() =>
  props.opcoes.map((opcao, i) => ({
    key: `${opcao}-${i}`,
    opcao,
    angulo: i * passo.value,
    cor: corDoNo(i),
    vencedor: i === indiceVencedor.value,
    // Nó numerado quando não há ícone: nove nomes de buff não cabem numa roda
    // de 220px, e o nome do que saiu aparece inteiro abaixo dela.
    rotulo: String(i + 1),
  })),
)

const rotuloDoResultado = computed(() =>
  props.kind === 'tipo'
    ? (getType(props.resultado)?.label ?? props.resultado).toUpperCase()
    : props.resultado.toUpperCase(),
)

const corDoResultado = computed(() => corDoNo(indiceVencedor.value))

function parar() {
  parou.value = true
  timer = null
  emit('fim')
}

onMounted(() => {
  const destino = VOLTAS * 360 + indiceVencedor.value * passo.value

  // Quem pede menos movimento recebe o resultado direto — convenção do projeto
  // (ver `style.css`). A informação é onde parou, e ela aparece na hora.
  const reduzido = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
  if (reduzido) {
    giro.value = indiceVencedor.value * passo.value
    parar()
    return
  }

  // Dois quadros antes de soltar o giro: a transição precisa ver o valor
  // inicial para interpolar, senão o ponteiro aparece já no destino.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      giro.value = destino
      timer = setTimeout(parar, DURACAO_MS)
    })
  })
})

onBeforeUnmount(() => {
  if (timer) clearTimeout(timer)
})
</script>

<template>
  <div class="roda" :class="{ 'roda--parou': parou }">
    <div class="roda__disco">
      <!-- Os nós. Posicionados por ângulo e contra-rotacionados para ficarem de
           pé: a roda não gira, mas o `rotate` do posicionamento gira o conteúdo
           junto se ninguém desfizer. -->
      <span
        v-for="no in nos"
        :key="no.key"
        class="roda__no"
        :class="{ 'roda__no--vencedor': parou && no.vencedor }"
        :style="{
          '--angulo': `${no.angulo}deg`,
          '--cor': no.cor,
        }"
      >
        <span class="roda__no-miolo">
          <TypeIcon v-if="kind === 'tipo'" :type="no.opcao" :size="18" />
          <span v-else class="pixel roda__no-numero">{{ no.rotulo }}</span>
        </span>
      </span>

      <!-- O selo do lendário no eixo. O ⚡ é o mesmo que marca o card dele na
           Profdex, então a roda se identifica sem legenda. -->
      <span class="roda__eixo" aria-hidden="true">⚡</span>

      <!-- O ponteiro: é ELE que gira. -->
      <span class="roda__ponteiro" :style="{ '--giro': `${giro}deg` }">
        <span class="roda__seta" />
      </span>
    </div>

    <!-- A cor só entra DEPOIS de parar. Pintar o `· · ·` com a cor do resultado
         entregava a raridade antes do giro acabar: na roda do Ricardo, três
         pontinhos dourados já diziam "vai sair algo raro". -->
    <p
      class="pixel roda__resultado"
      :style="{ '--cor': parou ? corDoResultado : 'var(--text-muted)' }"
      aria-live="polite"
    >
      {{ parou ? rotuloDoResultado : '· · ·' }}
    </p>
  </div>
</template>

<style scoped>
.roda {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
}

/* Medida única da roda: tudo aqui é derivado dela, então mudar o tamanho é
   mexer num número só. `min()` para não estourar em tela estreita. */
.roda__disco {
  /* Medida única da roda. `min()` com `vw` para não estourar em tela estreita, e
     a consulta de altura mais abaixo encolhe em tela baixa — a cena inteira tem
     ~530px e não pode passar a dobra. */
  --raio: min(104px, 30vw);
  position: relative;
  width: calc(var(--raio) * 2);
  height: calc(var(--raio) * 2);
  border-radius: 50%;
  background:
    radial-gradient(circle, rgba(237, 175, 104, 0.1) 0%, transparent 62%),
    var(--bg-deep);
  /* O chanfro 8-bit do app, o mesmo do quadro da Profdex. É ele que faz a roda
     pertencer a esta tela em vez de parecer um widget de outro lugar. */
  box-shadow: var(--dex-bevel);
}

.roda__no {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 34px;
  height: 34px;
  margin: -17px 0 0 -17px;
  /* Posiciona no círculo e desfaz a rotação no miolo, para o ícone ficar de pé. */
  transform: rotate(var(--angulo)) translateY(calc(var(--raio) * -0.72));
}

.roda__no-miolo {
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  border-radius: 50%;
  color: var(--cor);
  border: 2px solid var(--cor);
  background: rgba(0, 0, 0, 0.55);
  transform: rotate(calc(var(--angulo) * -1));
  transition:
    transform var(--dur-base) var(--ease-out),
    box-shadow var(--dur-base) var(--ease-out);
}

.roda__no-numero {
  font-size: 9px;
}

/* O vencedor cresce e ganha brilho quando o ponteiro para. Um nó só muda —
   é onde a atenção precisa estar. */
.roda__no--vencedor .roda__no-miolo {
  transform: rotate(calc(var(--angulo) * -1)) scale(1.3);
  box-shadow:
    0 0 0 2px rgba(0, 0, 0, 0.6),
    0 0 12px var(--cor);
}

.roda__eixo {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: calc(var(--raio) * 0.42);
  line-height: 1;
  filter: drop-shadow(0 0 6px rgba(237, 175, 104, 0.55));
}

.roda__ponteiro {
  position: absolute;
  inset: 0;
  transform: rotate(var(--giro));
  /* Desaceleração longa de roda da fortuna. Aqui NÃO entra o `--ease-pixel`
     (steps) do projeto: movimento em degraus é a linguagem dos SPRITES, e numa
     roda ele leria como travamento em vez de inércia. */
  transition: transform 2600ms cubic-bezier(0.12, 0.82, 0.08, 1);
}

.roda__seta {
  position: absolute;
  top: calc(var(--raio) * -0.1);
  left: 50%;
  width: 0;
  height: 0;
  margin-left: -9px;
  /* Triângulo em borda: aresta dura, sem SVG, e combina com o resto. */
  border-left: 9px solid transparent;
  border-right: 9px solid transparent;
  border-top: 16px solid var(--yellow);
  filter: drop-shadow(0 2px 0 rgba(0, 0, 0, 0.6));
}

.roda--parou .roda__seta {
  animation: setaBate 360ms var(--ease-out);
}

.roda__resultado {
  margin: 0;
  /* 12px é o maior texto pixel da batalha, e de propósito: é o momento que a
     tela inteira existe para anunciar. */
  font-size: 12px;
  line-height: 1.5;
  text-align: center;
  color: var(--cor);
  min-height: 1.5em;
  text-shadow: 0 2px 0 rgba(0, 0, 0, 0.7);
}

.roda--parou .roda__resultado {
  animation: resultadoEntra 320ms var(--ease-pixel);
}

@keyframes setaBate {
  0% {
    transform: translateY(0);
  }
  45% {
    transform: translateY(5px);
  }
  100% {
    transform: translateY(0);
  }
}

/* `steps()` aqui porque é TEXTO aparecendo, não objeto em movimento: o corte
   seco é a linguagem do resto do app. */
@keyframes resultadoEntra {
  0% {
    opacity: 0;
    transform: scale(0.8);
  }
  100% {
    opacity: 1;
    transform: scale(1);
  }
}

@media (max-height: 640px) {
  .roda__disco {
    --raio: min(80px, 26vw);
  }
  .roda__resultado {
    font-size: 10px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .roda__ponteiro,
  .roda__no-miolo {
    transition: none;
  }
  .roda--parou .roda__seta,
  .roda--parou .roda__resultado {
    animation: none;
  }
}
</style>
