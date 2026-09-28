<script setup>
/**
 * Tela de descanso da bancada — o atrator do estande.
 *
 * Existe para o intervalo: a fila acabou, ninguém está jogando, e o tablet
 * mostraria o numpad de matrícula parado. No meio de uma feira, tela parada é
 * tela que ninguém olha. Aqui o elenco inteiro desfila pelo monitor com a marca
 * no centro, e quem passa na frente descobre que o estande existe.
 *
 * Três decisões sustentam o resto do arquivo:
 *
 * 1. **Raro e lendário passam como SILHUETA PRETA.** Eles são a surpresa do
 *    evento — o raro só sai para quem destrava o tema, o lendário só para quem
 *    fecha a Profdex. Esta tela fica virada para a fila; mostrar a arte de
 *    verdade entregaria de graça o que o jogo inteiro existe para esconder. A
 *    silhueta faz o trabalho inverso: prova que eles existem sem dizer quem são.
 *
 * 2. **A lista vem de `/admin/professors`.** É a única rota que devolve `rare`
 *    e `legendary` — a pública os omite de propósito (ver professors.service.ts).
 *    Só cabe aqui porque a bancada já é rota de admin: nenhum aluno chega a
 *    esta tela, e quem chega já vê o elenco inteiro no painel de professores.
 *
 * 3. **A animação é CSS, sem um único frame em JS.** O quiosque passa horas
 *    nisto. `transform` e `opacity` animados são compostos na GPU e não custam
 *    layout; um `requestAnimationFrame` movendo 20 elementos esquentaria o
 *    tablet e roubaria quadros da revelação 3D que roda na mesma tela.
 */
import { onBeforeUnmount, onMounted, ref } from 'vue'
import api from '../services/api'
import InstitutionalSignature from './InstitutionalSignature.vue'
import { spriteFrenteDe } from '../data/professorArte'

const emit = defineEmits(['fechar'])

const desfile = ref([])
const erro = ref('')

/**
 * As três profundidades do desfile.
 *
 * O paralaxe é o que transforma "figuras deslizando" em cena: o fundo é
 * pequeno, apagado e lento; a frente é grande, nítida e rápida. Sem ele os
 * professores parecem adesivos empurrados na horizontal.
 *
 * `altura` é em vh — a arte acompanha a tela, que vai do tablet de 10" ao
 * monitor emprestado do laboratório.
 */
const CAMADAS = [
  { id: 'fundo', altura: 15, opacidade: 0.26, desfoque: 2.4, dur: [46, 66] },
  { id: 'meio', altura: 25, opacidade: 0.58, desfoque: 0.9, dur: [32, 44] },
  { id: 'frente', altura: 37, opacidade: 0.95, desfoque: 0, dur: [21, 30] },
]

/** Teto de elementos animados ao mesmo tempo, para o tablet dar conta. */
const MAX_VIAJANTES = 24

const entre = (min, max) => min + Math.random() * (max - min)

/**
 * Monta a fila de travessias a partir do elenco.
 *
 * Cada professor entra uma vez por camada, e a ordem é embaralhada para o
 * mesmo rosto não aparecer três vezes lado a lado. Elenco pequeno repete — é o
 * que queremos: com 4 professores a tela precisa continuar cheia.
 */
function montarDesfile(professores) {
  const viajantes = []

  for (const camada of CAMADAS) {
    const baralho = [...professores].sort(() => Math.random() - 0.5)
    for (const [i, professor] of baralho.entries()) {
      const duracao = entre(camada.dur[0], camada.dur[1])
      viajantes.push({
        chave: `${camada.id}-${professor.id}-${i}`,
        src: spriteFrenteDe(professor),
        // Raro e lendário nunca mostram a arte: viram vulto (ver decisão 1).
        silhueta: Boolean(professor.rare || professor.legendary),
        pixelArt: Boolean(professor.pixelArt),
        camada: camada.id,
        altura: camada.altura,
        opacidade: camada.opacidade,
        desfoque: camada.desfoque,
        // Faixa vertical. O topo negativo e o fundo abaixo de 100% deixam
        // alguns entrarem cortados pela borda, que é o que dá a sensação de
        // multidão em vez de fileira.
        topo: entre(-8, 78),
        duracao,
        // Atraso NEGATIVO: a animação começa já no meio. Sem isso os 24
        // entrariam juntos pela mesma borda nos primeiros segundos, e a tela
        // ficaria vazia até a primeira volta completar.
        atraso: -entre(0, duracao),
        sentido: Math.random() < 0.5 ? 'esquerda' : 'direita',
        balanco: entre(3.2, 6.4),
        amplitude: Math.round(entre(8, 22)),
      })
    }
  }

  return viajantes.sort(() => Math.random() - 0.5).slice(0, MAX_VIAJANTES)
}

async function carregar() {
  try {
    const { data } = await api.get('/admin/professors')
    // Inativo não entra: "remover" no painel é desativar, e um professor tirado
    // do evento não pode voltar a desfilar na vitrine dele.
    const elenco = (data ?? []).filter((p) => p.active)
    if (!elenco.length) {
      erro.value = 'Nenhum professor ativo para mostrar.'
      return
    }
    desfile.value = montarDesfile(elenco)
  } catch {
    // A tela de descanso não tem para quem reclamar: ela existe justamente
    // quando não há ninguém na mesa. Falhou, mostra só a marca — que já é
    // melhor do que o numpad parado.
    erro.value = 'Não foi possível carregar os professores.'
  }
}

// ── Quiosque ────────────────────────────────────────────────────────────────

/**
 * Tela cheia e tela acesa.
 *
 * Os dois só existem aqui e valem pelo contexto: um monitor de estande que
 * apaga sozinho depois de 10 minutos deixa de ser atrator, e a barra do
 * navegador no meio da vitrine denuncia que aquilo é um site aberto num tablet.
 * Os dois são "se der" — navegador que recusa continua com a tela funcionando.
 */
let wakeLock = null

async function entrarEmQuiosque() {
  try {
    await document.documentElement.requestFullscreen?.()
  } catch {
    // Sem gesto válido ou sem permissão: segue em janela normal.
  }
  try {
    wakeLock = (await navigator.wakeLock?.request('screen')) ?? null
  } catch {
    wakeLock = null
  }
}

async function sairDoQuiosque() {
  try {
    await wakeLock?.release()
  } catch {
    // Já liberado pelo navegador ao esconder a aba.
  }
  wakeLock = null
  try {
    if (document.fullscreenElement) await document.exitFullscreen?.()
  } catch {
    // Idem: sair da tela cheia nunca pode impedir o fechamento.
  }
}

function fechar() {
  emit('fechar')
}

function aoTeclar() {
  fechar()
}

onMounted(() => {
  void carregar()
  void entrarEmQuiosque()
  window.addEventListener('keydown', aoTeclar)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', aoTeclar)
  void sairDoQuiosque()
})
</script>

<template>
  <!-- Qualquer toque sai: o operador volta a atender sem procurar botão. O
       `pointerdown` e não `click` porque a mesa é tocada com pressa, e um
       arrasto acidental cancelaria o clique. -->
  <div
    class="descanso"
    role="dialog"
    aria-modal="true"
    aria-label="Tela de descanso do ProfDex"
    @pointerdown="fechar"
  >
    <div class="desfile" aria-hidden="true">
      <div
        v-for="v in desfile"
        :key="v.chave"
        class="viajante"
        :class="[`viajante--${v.camada}`, `viajante--${v.sentido}`]"
        :style="{
          top: `${v.topo}%`,
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
            :class="{
              'viajante__arte--silhueta': v.silhueta,
              'viajante__arte--pixel': v.pixelArt && !v.silhueta,
            }"
            :style="{ height: `${v.altura}vh` }"
            :src="v.src"
            alt=""
            draggable="false"
          />
          <span v-if="v.silhueta" class="viajante__enigma pixel">?</span>
        </div>
      </div>
    </div>

    <!-- Véu radial: sem ele um professor da camada da frente passa por trás do
         título e o nome da marca fica ilegível por 2 segundos. -->
    <div class="veu" aria-hidden="true"></div>

    <div class="marca">
      <div class="marca__ball">
        <img class="eagle-ball-icon" src="/eagle-ball.png" alt="" aria-hidden="true" />
      </div>
      <h1 class="marca__titulo pixel">PROF<span>DEX</span></h1>
      <p class="marca__mote">Colecione seus professores!</p>
      <p class="marca__chamada pixel">TOQUE PARA COMEÇAR</p>
      <InstitutionalSignature class="marca__assinatura" compact />
    </div>

    <p v-if="erro" class="aviso">{{ erro }}</p>
  </div>
</template>

<style scoped>
.descanso {
  position: fixed;
  inset: 0;
  z-index: 60;
  overflow: hidden;
  background:
    radial-gradient(circle at 50% 45%, rgba(237, 175, 104, 0.12), transparent 55%),
    radial-gradient(circle at 12% 88%, rgba(153, 82, 0, 0.22), transparent 60%),
    var(--bg-deep, #121418);
  cursor: pointer;
  user-select: none;
  touch-action: none;
}

/* ── O desfile ─────────────────────────────────────────────────────────── */

.desfile {
  position: absolute;
  inset: 0;
}

.viajante {
  position: absolute;
  left: 0;
  opacity: var(--opacidade);
  filter: blur(var(--desfoque));
  /* `will-change` aqui e não no filho: é este elemento que atravessa a tela, e
     promovê-lo a camada própria evita repintura da tela inteira a cada quadro. */
  will-change: transform;
  animation: atravessa var(--dur) linear var(--atraso) infinite;
}

.viajante--direita {
  animation-name: atravessa-invertido;
}

.viajante__balanco {
  position: relative;
  animation: balanca var(--balanco) ease-in-out infinite alternate;
}

.viajante__arte {
  display: block;
  width: auto;
  object-fit: contain;
  /* A arte do elenco é mista (ver professorArte.js): pixel art de verdade
     precisa de `pixelated`, cartoon serrilharia com o mesmo filtro. */
  image-rendering: auto;
}

.viajante__arte--pixel {
  image-rendering: pixelated;
}

/**
 * A silhueta.
 *
 * `brightness(0)` zera a cor e preserva o alfa do PNG: sai o vulto exato do
 * professor, preto, sem precisar de uma segunda arte. O `drop-shadow` claro em
 * volta não é enfeite — preto sobre um fundo quase preto seria invisível, e o
 * que precisa atravessar a tela é justamente o contorno.
 */
.viajante__arte--silhueta {
  filter: brightness(0) drop-shadow(0 0 6px rgba(245, 196, 81, 0.5))
    drop-shadow(0 0 22px rgba(255, 255, 255, 0.16));
}

/**
 * A interrogação sobre o vulto.
 *
 * Não é enfeite: `brightness(0)` só devolve o contorno do professor quando o
 * PNG tem alfa. Arte enviada como retângulo opaco — os dois cartuns do seed são
 * assim — viraria um quadrado preto liso, que lido de longe parece imagem
 * quebrada, não segredo. Com o "?" por cima, o pior caso continua dizendo
 * exatamente o que a silhueta existe para dizer: tem professor aqui que você
 * ainda não pode ver.
 */
.viajante__enigma {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: clamp(22px, 5vh, 64px);
  color: rgba(245, 196, 81, 0.82);
  text-shadow: 0 0 18px rgba(0, 0, 0, 0.8);
  pointer-events: none;
}

@keyframes atravessa {
  from {
    transform: translateX(118vw);
  }
  to {
    transform: translateX(-45vw);
  }
}

@keyframes atravessa-invertido {
  from {
    transform: translateX(-45vw);
  }
  to {
    transform: translateX(118vw);
  }
}

@keyframes balanca {
  from {
    transform: translateY(calc(var(--amplitude) * -0.5)) rotate(-1.6deg);
  }
  to {
    transform: translateY(calc(var(--amplitude) * 0.5)) rotate(1.6deg);
  }
}

/* ── A marca, no centro ────────────────────────────────────────────────── */

.veu {
  position: absolute;
  inset: 0;
  background: radial-gradient(
    ellipse 46% 52% at 50% 46%,
    rgba(10, 11, 15, 0.92) 0%,
    rgba(10, 11, 15, 0.72) 45%,
    transparent 72%
  );
}

.marca {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: clamp(8px, 1.6vh, 18px);
  text-align: center;
  padding: 4vh 6vw;
}

.marca__ball {
  width: clamp(72px, 12vh, 132px);
  height: clamp(72px, 12vh, 132px);
  filter: drop-shadow(0 0 26px rgba(237, 175, 104, 0.45));
  animation: flutua 4.5s ease-in-out infinite alternate;
}

.marca__titulo {
  margin: 0;
  font-size: clamp(30px, 7vh, 82px);
  line-height: 1.15;
  color: var(--text-primary, #fff);
  letter-spacing: 2px;
  text-shadow:
    4px 4px 0 rgba(0, 0, 0, 0.55),
    0 0 34px rgba(237, 175, 104, 0.35);
}

.marca__titulo span {
  color: var(--unifil-gold, #edaf68);
}

.marca__mote {
  margin: 0;
  font-size: clamp(13px, 2.2vh, 24px);
  color: rgba(255, 255, 255, 0.78);
}

.marca__chamada {
  margin: clamp(6px, 1.4vh, 16px) 0 0;
  padding: clamp(8px, 1.4vh, 14px) clamp(16px, 2.4vw, 28px);
  border: 2px solid rgba(237, 175, 104, 0.55);
  border-radius: 999px;
  font-size: clamp(9px, 1.5vh, 15px);
  color: var(--unifil-gold, #edaf68);
  letter-spacing: 1px;
  animation: pulsa 2.2s ease-in-out infinite;
}

.marca__assinatura {
  margin-top: clamp(8px, 2vh, 22px);
  /* O clique na assinatura não pode navegar para fora do quiosque: o
     `pointerdown` do pai já fecha a tela, e abrir a landing no tablet do
     estande deixaria a bancada perdida. */
  pointer-events: none;
}

.aviso {
  position: absolute;
  right: 16px;
  bottom: 14px;
  margin: 0;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.35);
}

@keyframes flutua {
  from {
    transform: translateY(-6px) scale(0.985);
  }
  to {
    transform: translateY(6px) scale(1.015);
  }
}

@keyframes pulsa {
  0%,
  100% {
    opacity: 0.55;
    border-color: rgba(237, 175, 104, 0.35);
  }
  50% {
    opacity: 1;
    border-color: rgba(237, 175, 104, 0.85);
  }
}

/* O app inteiro respeita esta preferência. Aqui ela não pode apagar a tela: o
   ponto é chamar atenção. O desfile congela em posições já espalhadas (o atraso
   negativo continua valendo) e só a marca respira. */
@media (prefers-reduced-motion: reduce) {
  .viajante,
  .viajante__balanco,
  .marca__ball {
    animation-play-state: paused;
  }

  .marca__chamada {
    animation: none;
    opacity: 1;
  }
}
</style>
