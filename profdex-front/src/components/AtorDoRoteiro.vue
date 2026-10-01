<script setup>
// Quem protagoniza o momento de roteiro, entrando em cena de verdade.
//
// O overlay antes era texto e mais nada, numa arena cujo assunto inteiro são as
// sprites dos professores. O Sérgio chegar andando até a roda, esperar o giro e
// se transformar ali é o que transforma "apareceu um aviso" em "aconteceu uma
// cena".
//
// A entrada usa `steps()`, e isso é deliberado: sprite que desliza suave
// pertence a outro jogo. Em degraus ela lê como personagem ANDANDO, que é a
// linguagem do resto do app (`--ease-pixel` existe em `style.css` por isso).
//
// Os quatro do NDE entram escalonados pelo índice — chegam como um grupo, não
// como um bloco.

import { onBeforeUnmount, ref, watch } from 'vue'

const props = defineProps({
  /** `{ nome, sprites, pixelArt, spriteDepois }` — ver o evento `roteiro`. */
  ator: { type: Object, required: true },
  /**
   * Liga a transformação. O overlay só levanta isto depois de a roda parar: o
   * chefe cresce DEPOIS de o tipo novo ter sido anunciado, nunca antes.
   */
  transformando: { type: Boolean, default: false },
})

const emit = defineEmits(['fim-da-transformacao'])

/** Duração de cada etapa. Somadas, ~1,4s — um turno de raid não pode esperar. */
const CRESCER_MS = 820
const CAIR_MS = 520

const fase = ref('entrando')
/** Índice da arte exibida: 0 = a de agora, 1 = a do estágio novo. */
const arte = ref(0)
let timers = []

const sprites = () => (props.ator?.sprites ?? []).filter(Boolean)

const spriteAtual = (i) =>
  arte.value === 1 && props.ator?.spriteDepois
    ? props.ator.spriteDepois
    : sprites()[i]

function agendar(fn, ms) {
  timers.push(setTimeout(fn, ms))
}

/**
 * Volta ao começo quando o ATOR muda.
 *
 * Sem isto, o segundo momento de roteiro de uma mesma raid aparecia sem
 * animação nenhuma. A virada de estágio 3 e a chegada do NDE vêm no MESMO lote
 * de eventos: o overlay zera `roteiro` e põe o próximo no mesmo tick, o Vue
 * agrupa as duas atualizações, e o componente é remendado em vez de desmontado.
 * `fase` ficava em `pronto` — que é justamente a classe com `animation: none` e
 * `scale(1.3)` — e `arte` ficava em 1.
 *
 * O Ricardo era o mais atingido porque o evento dele quase sempre vem DEPOIS de
 * alguma virada de estágio: ele era sempre o segundo roteiro da raid.
 */
watch(
  () => props.ator,
  () => {
    for (const t of timers) clearTimeout(t)
    timers = []
    fase.value = 'entrando'
    arte.value = 0
  },
)

watch(
  () => props.transformando,
  (ligou) => {
    if (!ligou || fase.value !== 'entrando') return
    fase.value = 'crescendo'

    agendar(() => {
      // A troca acontece no PICO do crescimento, com o clarão cobrindo: é o que
      // faz uma arte virar a outra em vez de uma sumir e a outra aparecer.
      arte.value = 1
      fase.value = 'caindo'
      agendar(() => {
        fase.value = 'pronto'
        emit('fim-da-transformacao')
      }, CAIR_MS)
    }, CRESCER_MS)
  },
)

onBeforeUnmount(() => {
  for (const t of timers) clearTimeout(t)
  timers = []
})
</script>

<template>
  <div
    class="ator"
    :class="`ator--${fase}`"
    :style="{ '--quantos': sprites().length }"
  >
    <img
      v-for="(src, i) in sprites()"
      :key="i"
      class="ator__sprite"
      :class="{ 'ator__sprite--pixel': ator.pixelArt }"
      :style="{ '--atraso': `${i * 110}ms` }"
      :src="spriteAtual(i)"
      :alt="ator.nome"
      decoding="async"
    />
    <!-- Sem arte, a cena ainda diz QUEM chegou. Professor sem sprite cadastrada
         é dado incompleto, não motivo para o personagem sumir do roteiro. -->
    <span v-if="!sprites().length" class="pixel ator__placa">{{ ator.nome }}</span>

    <!-- O clarão da transformação. Só existe durante ela, e é ele que esconde a
         troca de arquivo no quadro em que ela acontece. -->
    <span v-if="fase === 'crescendo' || fase === 'caindo'" class="ator__clarao" />
  </div>
</template>

<style scoped>
.ator {
  position: relative;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  gap: 2px;
  /* Altura fixa: a sprite cresce durante a transformação e, sem isto, empurraria
     a caixa de texto para baixo no meio da cena. */
  height: 140px;
}

.ator__sprite {
  height: 100%;
  width: auto;
  /* Dividido pela QUANTIDADE: os quatro do NDE a 30vw cada dariam 120vw e
     estourariam a coluna. Com o divisor, um sozinho ocupa o espaço todo e os
     quatro repartem. */
  max-width: calc((100% - 6px) / var(--quantos, 1));
  object-fit: contain;
  /* Pelo PÉ, como no palco: sem isto, arte com folga no topo do PNG flutua. */
  object-position: bottom center;
  filter: drop-shadow(0 3px 0 rgba(0, 0, 0, 0.5));
  /* `steps(1, end)` e não `--ease-pixel`: o salto tem de cair exatamente nas
     paradas que o keyframe define, e não ser reamostrado em seis. */
  animation: entraAndando 880ms steps(1, end) var(--atraso) both;
}

/* Telas baixas (iPhone SE e afins): a cena inteira tem ~530px e o ator é a
   primeira coisa que pode ceder sem perder sentido. */
@media (max-height: 640px) {
  .ator {
    height: 108px;
  }
}

.ator__sprite--pixel {
  image-rendering: pixelated;
}

/* A placa de quem não tem arte. Mesma entrada da sprite, para a cena continuar
   tendo alguém chegando. */
.ator__placa {
  align-self: center;
  padding: 10px 14px;
  font-size: 9px;
  color: var(--yellow);
  border: 2px solid var(--yellow);
  border-radius: var(--radius);
  background: rgba(0, 0, 0, 0.5);
  animation: entraAndando 880ms steps(1, end) both;
}

/* ── A transformação ────────────────────────────────────────────────────────
 *
 * `steps(1, end)` em cada trecho: o crescimento acontece em TRÊS saltos secos,
 * não numa rampa. Rampa suave é a estética de outro jogo; salto é a deste. */
.ator--crescendo .ator__sprite {
  animation: cresceEmSaltos 820ms steps(1, end) forwards;
}

.ator--caindo .ator__sprite {
  animation: caiMaior 520ms var(--ease-out) forwards;
}

/* Segura o estado final SEM animação: repetir a regra de `--caindo` aqui faria
   a queda tocar de novo na troca de classe. */
.ator--pronto .ator__sprite {
  animation: none;
  transform: scale(1.3);
}

.ator__clarao {
  position: absolute;
  inset: -12% -6%;
  border-radius: 50%;
  /* Vermelho porque é a cor da transformação do chefe. Sai do centro dele. */
  background: radial-gradient(circle, rgba(255, 107, 107, 0.85) 0%, transparent 70%);
  animation: claraoPulsa 820ms steps(1, end);
  pointer-events: none;
}

/* Ciclo de CAMINHADA, não um slide.
 *
 * Oito paradas em X com o Y alternando entre 0 e -4px: com `steps(1, end)` cada
 * trecho é um salto seco, e o sobe-desce lê como passo. É a diferença entre o
 * professor ANDAR até a roda e ele deslizar até ela — e a segunda opção não
 * pertence a este jogo. */
@keyframes entraAndando {
  0% {
    opacity: 0;
    transform: translate(140px, 0);
  }
  12% {
    opacity: 1;
    transform: translate(120px, -4px);
  }
  25% {
    transform: translate(100px, 0);
  }
  37% {
    transform: translate(80px, -4px);
  }
  50% {
    transform: translate(60px, 0);
  }
  62% {
    transform: translate(40px, -4px);
  }
  75% {
    transform: translate(20px, 0);
  }
  87% {
    transform: translate(6px, -4px);
  }
  100% {
    transform: translate(0, 0);
  }
}

@keyframes cresceEmSaltos {
  0% {
    transform: scale(1);
  }
  33% {
    transform: scale(1.12) translateY(-3px);
  }
  66% {
    transform: scale(1.26) translateY(-7px);
  }
  100% {
    transform: scale(1.42) translateY(-10px);
  }
}

/* "Caindo na próxima versão": ele chega maior e bate no chão. */
@keyframes caiMaior {
  0% {
    transform: scale(1.42) translateY(-10px);
  }
  55% {
    transform: scale(1.3) translateY(0);
  }
  72% {
    transform: scale(1.34) translateY(-3px);
  }
  100% {
    transform: scale(1.3) translateY(0);
  }
}

@keyframes claraoPulsa {
  0% {
    opacity: 0;
  }
  33% {
    opacity: 0.5;
  }
  66% {
    opacity: 0.85;
  }
  100% {
    opacity: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .ator__sprite,
  .ator--crescendo .ator__sprite,
  .ator--caindo .ator__sprite {
    animation: none;
    transform: none;
  }
  .ator__clarao {
    animation: none;
    opacity: 0;
  }
}
</style>
