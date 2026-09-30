<script setup>
import { computed, defineAsyncComponent, ref, watch } from 'vue'
import { spriteFrenteDe, temModeloProprio } from '../data/professorArte'

// O palco da bancada: o professor que acabou de sair, ao lado do QR ou do
// "CAPTURADO". O espaço NUNCA fica vazio:
//
//  - enquanto o 3D carrega, o professor DESFILA pelo palco em três
//    profundidades — a animação da tela de descanso com um elenco de um só;
//  - o 3D entra por cima quando já está enquadrado, e o desfile sai;
//  - se o 3D falhar (GLB que não abre, 404, rede parada, chunk que não baixa),
//    ou se o professor não tiver modelo próprio, o palco fica com o sprite
//    PARADO e centralizado. Ali ele não é mais espera: é a apresentação
//    definitiva de quem foi capturado, e apresentação não desfila.
//
// Antes o palco mostrava 3D OU sprite, escolhendo só pela existência de
// `modelUrl`. Um GLB que não carregava deixava um quadrado escuro ao lado do QR,
// e era o que acontecia com os raros cadastrados pelo painel.
//
// Nada da arte sai do palco (`overflow: hidden`) e o palco não sai da cena
// (`max-height`). Antes ele tinha altura fixa: quando o quiosque era baixo, a
// cena estourava e a arte vinha por cima de "OUTRO TEMA" e "PRÓXIMO ALUNO" —
// os dois botões com que o operador faz a fila andar. O desfile, que atravessa
// a caixa, tornaria isso uma tela inteira coberta de professor.

const props = defineProps({
  // { name, modelUrl?, spriteFrontUrl?, pixelArt? }: o `revelado` do polling ou
  // o `raro.liberado` do resultado.
  professor: { type: Object, required: true },
  clearColor: { type: String, default: '#10121a' },
})

// Falha ao baixar o chunk do three.js (o Wi-Fi da feira) conta como falha do
// 3D. Sem o `onError`, o async component só renderizava nada, em silêncio.
const chunkFalhou = ref(false)
// O 3D chega só quando aparece um professor para revelar. A bancada passa o dia
// inteiro aberta e roda em modo `ficha` na maior parte do evento: carregar o
// three.js no boot seria ~700KB que a maioria das rodadas nunca usa.
const Stage3D = defineAsyncComponent({
  loader: () => import('./Stage3D.vue'),
  onError(_erro, _tentarDeNovo, desistir) {
    chunkFalhou.value = true
    desistir()
  },
})

const estado3d = ref('carregando') // carregando | pronto | falhou
const spriteFalhou = ref(false)

// ── O desfile da espera ─────────────────────────────────────────────────────

/**
 * As três profundidades, como na tela de descanso (TelaDeDescanso.vue): o fundo
 * é pequeno, apagado e lento; a frente é grande, nítida e rápida. É o paralaxe
 * que transforma "figuras deslizando" em cena — sem ele o mesmo sprite repetido
 * na horizontal parece adesivo duplicado, e aqui o elenco é de UM professor.
 *
 * `altura` é em % da altura do palco, não em vh: o palco encolhe junto com o
 * quiosque, e arte medida na janela sairia da caixa exatamente nas telas baixas,
 * que são as que não têm espaço sobrando para os botões do operador.
 *
 * As voltas são curtas (segundos, não a dezena de segundos da tela de descanso)
 * porque isto é uma espera: o 3D costuma entrar antes da segunda travessia.
 */
const CAMADAS = [
  // `sangra` é o quanto a camada pode passar da borda de cima e de baixo. Só o
  // fundo sangra de verdade: é o corte na borda que dá profundidade. A frente
  // não sangra nenhum pixel — ela é a figura que o aluno olha, e professor com
  // os pés cortados parece imagem quebrada, não terceiro plano.
  { id: 'fundo', altura: 44, opacidade: 0.3, desfoque: 1.6, dur: [12, 17], sangra: 8 },
  { id: 'meio', altura: 64, opacidade: 0.6, desfoque: 0.6, dur: [8.5, 12], sangra: 4 },
  { id: 'frente', altura: 88, opacidade: 1, desfoque: 0, dur: [6, 8.5], sangra: 0 },
]

/** Travessias por camada. Seis elementos animados: o palco é uma caixa, não a tela. */
const POR_CAMADA = 2

const entre = (min, max) => min + Math.random() * (max - min)

/**
 * Monta as travessias. Duração, faixa vertical, sentido e balanço são sorteados
 * porque o elenco é um só: sem variação, as seis cópias marchariam em fila.
 */
function montarDesfile() {
  const viajantes = []

  for (const camada of CAMADAS) {
    for (let i = 0; i < POR_CAMADA; i += 1) {
      const duracao = entre(camada.dur[0], camada.dur[1])
      viajantes.push({
        chave: `${camada.id}-${i}`,
        altura: camada.altura,
        opacidade: camada.opacidade,
        desfoque: camada.desfoque,
        topo: entre(-camada.sangra, 100 - camada.altura + camada.sangra),
        duracao,
        // Atraso NEGATIVO: cada travessia começa já no meio. Sem isso as seis
        // entrariam juntas pela mesma borda e o palco abriria vazio.
        atraso: -entre(0, duracao),
        sentido: Math.random() < 0.5 ? 'esquerda' : 'direita',
        balanco: entre(2.4, 4.2),
        amplitude: Math.round(entre(4, 11)),
      })
    }
  }

  return viajantes
}

const desfile = ref(montarDesfile())

// Outro professor no mesmo palco: tudo recomeça, inclusive a chance do 3D e o
// arranjo do desfile — repetir o mesmo sorteio entregaria duas revelações
// seguidas com as figuras nas mesmas posições.
watch(
  () => props.professor,
  () => {
    estado3d.value = 'carregando'
    spriteFalhou.value = false
    desfile.value = montarDesfile()
  },
)

const tenta3d = computed(
  () => temModeloProprio(props.professor) && !chunkFalhou.value && estado3d.value !== 'falhou',
)

// NUNCA o sprite ou o GLB padrão: os dois caem no Gustavo, e mostrar o
// professor errado ao lado do QR é pior que mostrar só a inicial (decisão 17).
const spriteProprio = computed(() =>
  props.professor.spriteFrontUrl ? spriteFrenteDe(props.professor) : null,
)
const inicial = computed(() => props.professor.name?.[0]?.toUpperCase() ?? '?')

/**
 * O desfile só existe como ESPERA. Sem modelo próprio, com o 3D já enquadrado
 * ou depois de uma falha não há nada por vir, e o palco volta ao sprite parado.
 */
const mostraDesfile = computed(
  () =>
    Boolean(spriteProprio.value) &&
    !spriteFalhou.value &&
    tenta3d.value &&
    estado3d.value === 'carregando',
)
</script>

<template>
  <figure class="palco-revelacao">
    <!-- O sprite parado continua no DOM durante o desfile: é ele que carrega o
         `@error` (o desfile inteiro depende do mesmo arquivo) e é ele que volta
         a aparecer sob `prefers-reduced-motion`, por CSS. -->
    <img
      v-if="spriteProprio && !spriteFalhou"
      v-show="estado3d !== 'pronto'"
      class="palco-revelacao__sprite"
      :class="{
        'palco-revelacao__sprite--pixel': professor.pixelArt,
        'palco-revelacao__sprite--desfilando': mostraDesfile,
      }"
      :src="spriteProprio"
      :alt="professor.name"
      width="340"
      height="340"
      decoding="async"
      @error="spriteFalhou = true"
    />
    <span
      v-else-if="estado3d !== 'pronto'"
      class="palco-revelacao__inicial"
      role="img"
      :aria-label="professor.name"
    >
      {{ inicial }}
    </span>

    <!-- A saída é um fade do mesmo tempo da entrada do 3D: os dois se cruzam.
         Sem isso o desfile sumia de um quadro para o outro e sobrava um palco
         quase vazio durante a transição do canvas — parecia trava, não troca.

         `role="img"` com rótulo: para quem usa leitor de tela o desfile é UMA
         imagem do professor, não seis cópias dele atravessando a tela. -->
    <Transition name="desfile">
      <div
        v-if="mostraDesfile"
        class="palco-revelacao__desfile"
        role="img"
        :aria-label="professor.name"
      >
        <div
          v-for="v in desfile"
          :key="v.chave"
          class="viajante"
          :class="`viajante--${v.sentido}`"
          :style="{
            top: `${v.topo}%`,
            '--altura': `${v.altura}%`,
            '--dur': `${v.duracao}s`,
            '--atraso': `${v.atraso}s`,
            '--opacidade': v.opacidade,
            '--desfoque': `${v.desfoque}px`,
          }"
        >
          <div
            class="viajante__balanco"
            :style="{ '--balanco': `${v.balanco}s`, '--amplitude': `${v.amplitude}px` }"
          >
            <img
              class="viajante__arte"
              :class="{ 'viajante__arte--pixel': professor.pixelArt }"
              :src="spriteProprio"
              alt=""
              draggable="false"
            />
          </div>
        </div>
      </div>
    </Transition>

    <component
      :is="Stage3D"
      v-if="tenta3d"
      class="palco-revelacao__3d"
      :class="{ 'palco-revelacao__3d--visivel': estado3d === 'pronto' }"
      :config="{
        modelPath: professor.modelUrl,
        clearColor,
        autoRotate: true,
        interactive: false,
      }"
      @pronto="estado3d = 'pronto'"
      @erro="estado3d = 'falhou'"
    />
  </figure>
</template>

<style scoped>
/* Altura fixa porque o <TresCanvas> herda o tamanho do pai: sem ela o canvas
   nasce com 0px e o professor não aparece.

   `max-height` e `overflow` são o contrato com a cena que hospeda o palco: ele
   CEDE altura quando o quiosque é baixo, e nada que esteja dentro dele pinta
   fora da caixa. Sem os dois, a arte transbordava para cima dos botões do
   operador — e o desfile, que atravessa a caixa, cobriria a tela inteira. */
.palco-revelacao {
  position: relative;
  margin: 0;
  width: clamp(200px, 32vh, 340px);
  height: clamp(200px, 32vh, 340px);
  max-width: 100%;
  /* Cede altura para a cena que o hospeda, com piso de 130px — abaixo disso o
     professor deixa de ser reconhecível e o palco não serve para nada. */
  min-height: 130px;
  max-height: 100%;
  display: grid;
  place-items: center;
  overflow: hidden;
}

/* Ocupa o quadrado do palco e a arte se ajusta dentro (`contain`): os
   `width`/`height` do <img> reservam o espaço antes de a imagem chegar. */
.palco-revelacao__sprite {
  width: 100%;
  height: 100%;
  object-fit: contain;
  /* Balanço leve: sem 3D, é o que dá vida à revelação. */
  animation: revelacao-balanco 2.4s ease-in-out infinite;
}

.palco-revelacao__sprite--pixel {
  image-rendering: pixelated;
}

/* Enquanto o desfile toca, o sprite parado fica só como âncora do `@error`. */
.palco-revelacao__sprite--desfilando {
  display: none;
}

.palco-revelacao__inicial {
  width: 60%;
  aspect-ratio: 1;
  display: grid;
  place-items: center;
  border: 3px solid var(--unifil-gold);
  border-radius: var(--radius-lg);
  background: var(--bg-deep);
  color: var(--unifil-gold);
  font-family: var(--font-pixel);
  font-size: clamp(40px, 9vh, 88px);
}

/* ── O desfile ─────────────────────────────────────────────────────────────
   Animação 100% CSS, como na tela de descanso: `transform` e `opacity` são
   compostos na GPU e não custam layout. Um `requestAnimationFrame` movendo
   figuras aqui roubaria quadros justamente do 3D que está carregando ao lado. */

.palco-revelacao__desfile {
  position: absolute;
  inset: 0;
}

.desfile-leave-active {
  transition: opacity 0.35s ease;
}

.desfile-leave-to {
  opacity: 0;
}

/* Largura do palco inteiro com a arte centralizada: é o que torna a travessia
   previsível. Medir o percurso pela largura do SPRITE faria uma arte estreita
   "nascer" já dentro do palco, no meio da caixa. */
.viajante {
  position: absolute;
  left: 0;
  width: 100%;
  height: var(--altura);
  opacity: var(--opacidade);
  filter: blur(var(--desfoque));
  /* Aqui e não no filho: é este elemento que atravessa a caixa, e promovê-lo a
     camada própria evita repintura do palco a cada quadro. */
  will-change: transform;
  animation: palco-atravessa var(--dur) linear var(--atraso) infinite;
}

.viajante--direita {
  animation-name: palco-atravessa-invertido;
}

.viajante__balanco {
  height: 100%;
  animation: palco-balanca var(--balanco) ease-in-out infinite alternate;
}

.viajante__arte {
  display: block;
  height: 100%;
  width: auto;
  margin: 0 auto;
  object-fit: contain;
  /* A arte do elenco é mista (ver professorArte.js): pixel art de verdade
     precisa de `pixelated`, cartoon serrilharia com o mesmo filtro. */
  image-rendering: auto;
}

.viajante__arte--pixel {
  image-rendering: pixelated;
}

@keyframes palco-atravessa {
  from {
    transform: translateX(120%);
  }
  to {
    transform: translateX(-120%);
  }
}

@keyframes palco-atravessa-invertido {
  from {
    transform: translateX(-120%);
  }
  to {
    transform: translateX(120%);
  }
}

@keyframes palco-balanca {
  from {
    transform: translateY(calc(var(--amplitude) * -0.5)) rotate(-1.6deg);
  }
  to {
    transform: translateY(calc(var(--amplitude) * 0.5)) rotate(1.6deg);
  }
}

/* O 3D fica por cima do sprite, invisível, até estar enquadrado. Invisível e
   não desmontado: o canvas precisa existir para carregar e medir o modelo. */
.palco-revelacao__3d {
  position: absolute;
  inset: 0;
  opacity: 0;
  transition: opacity 0.35s ease;
}

.palco-revelacao__3d--visivel {
  opacity: 1;
}

@keyframes revelacao-balanco {
  0%,
  100% {
    transform: translateY(0) rotate(-1.5deg);
  }
  50% {
    transform: translateY(-8px) rotate(1.5deg);
  }
}

/* Quem pediu menos movimento não recebe o desfile: seis figuras atravessando
   uma caixa pequena é exatamente o que a preferência existe para evitar. O
   palco volta ao sprite parado — e ele já está no DOM, só escondido. */
@media (prefers-reduced-motion: reduce) {
  .palco-revelacao__desfile {
    display: none;
  }

  .palco-revelacao__sprite--desfilando {
    display: block;
  }

  .palco-revelacao__sprite {
    animation: none;
  }

  .desfile-leave-active,
  .palco-revelacao__3d {
    transition: none;
  }
}
</style>
