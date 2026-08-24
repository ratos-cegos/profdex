<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { battle } from '@/content/copy.js'
import { BY_SLUG } from '@/data/professors.js'
import { BATTLES, PLAYER_MOVES, PLAYER_SLUG } from '@/data/battle-demo.js'
import { typeMultiplier } from '@/data/types.js'
import SectionShell from '@/components/SectionShell.vue'
import TypeBadge from '@/components/TypeBadge.vue'
import { useReveal } from '@/composables/useReveal.js'

// Enquadramento clássico: adversário em cima à direita, o seu em baixo à
// esquerda, cada um com sua barra de HP do lado oposto.
//
// A arte aqui é o BONECO, não o cartoon — é o que o app desenha na arena desde
// que os `.glb` saíram de lá, e o que o briefing pede nesta seção. Um retrato
// emoldurado em QR contaria a coisa errada: dá para reconhecer o professor, mas
// não parece uma partida.
//
// O adversário aparece de FRENTE (ele encara você) e o seu, de COSTAS em
// primeiro plano — a câmera está atrás do seu ombro. É o enquadramento que todo
// mundo reconhece sem legenda, e é o que o app faz.
const player = BY_SLUG[PLAYER_SLUG]

const enemy = ref(BY_SLUG[BATTLES[0].enemy])
const enemyHp = ref(100)
const playerHp = ref(100)
const enemyFainted = ref(false)

// O menu de golpes: `cursor` é onde a setinha está, `picked` é o golpe que
// acabou de sair (piscada curta). -1 = nenhum.
const cursor = ref(0)
const picked = ref(-1)
const message = ref('')

const { el } = useReveal({ threshold: 0.4 })

/**
 * A mensagem de efetividade NÃO é escrita no roteiro: sai do `typeMultiplier`,
 * a mesma função que a batalha de verdade usa. Se a roda de tipos mudar, isto
 * acompanha em vez de virar legenda mentirosa. Ver data/battle-demo.js.
 */
function effectivenessNote(moveType, defenderTypes) {
  const m = typeMultiplier(moveType, defenderTypes)
  if (m >= 4) return 'Dano quádruplo!'
  if (m >= 2) return 'É super-eficaz!'
  if (m <= 0.25) return 'Quase não arranha…'
  if (m <= 0.5) return 'Pouco eficaz…'
  return ''
}

// ── Roteiro em loop ─────────────────────────────────────────────────────────
//
// Um `async` com `await espera(ms)` em vez de uma pilha de setTimeout aninhados:
// a sequência lê na vertical, na mesma ordem em que acontece na tela.
//
// O cancelamento é por TOKEN, e não por clearTimeout: cada execução guarda o
// número dela e confere depois de cada espera se ainda é a execução vigente.
// Sem isso, sair e voltar à seção deixaria duas linhas do tempo rodando ao mesmo
// tempo, brigando pelas mesmas refs.
const HOP = 150 // salto da setinha de um golpe para o outro
const SETTLE = 380 // pausa em cima do golpe escolhido
const HIT = 900 // golpe anunciado → barra descendo
const READ = 1100 // tempo de leitura de uma mensagem
const FAINT = 1700 // "desmaiou" antes de entrar o próximo professor

let token = 0
let timer = null

const espera = (ms) =>
  new Promise((resolve) => {
    timer = setTimeout(resolve, ms)
  })

async function jogar() {
  const meu = ++token
  const vigente = () => meu === token

  while (vigente()) {
    for (const luta of BATTLES) {
      enemy.value = BY_SLUG[luta.enemy]
      enemyHp.value = 100
      playerHp.value = 100
      enemyFainted.value = false
      picked.value = -1
      message.value = `${enemy.value.name} entrou na arena!`
      await espera(READ)
      if (!vigente()) return

      for (const turno of luta.turns) {
        if (turno.enemyMove) {
          message.value = `${enemy.value.name} usou ${turno.enemyMove}!`
          await espera(HIT)
          if (!vigente()) return

          playerHp.value = turno.playerHp
          await espera(READ)
          if (!vigente()) return
          continue
        }

        // Varre o menu inteiro antes de parar no golpe do roteiro. A varredura
        // é o que faz a cena parecer ALGUÉM escolhendo, e não uma barra
        // descendo sozinha.
        message.value = 'Escolha um golpe.'
        for (let i = 0; i < PLAYER_MOVES.length; i++) {
          cursor.value = i
          await espera(HOP)
          if (!vigente()) return
        }

        cursor.value = turno.move
        await espera(SETTLE)
        if (!vigente()) return

        picked.value = turno.move
        const golpe = PLAYER_MOVES[turno.move]
        message.value = `${player.name} usou ${golpe.name}!`
        await espera(HIT)
        if (!vigente()) return

        if (turno.enemyHp !== undefined) {
          enemyHp.value = turno.enemyHp
          const nota = effectivenessNote(golpe.type, enemy.value.types)
          if (nota) {
            await espera(HIT)
            if (!vigente()) return
            message.value = nota
          }
        } else if (turno.note) {
          message.value = turno.note
        }

        await espera(READ)
        if (!vigente()) return
        picked.value = -1
      }

      enemyFainted.value = true
      message.value = `${enemy.value.name} desmaiou. ${player.name} venceu!`
      await espera(FAINT)
      if (!vigente()) return
    }
  }
}

/** Estado parado, para quem pediu menos movimento — um quadro no meio da luta. */
function quadroEstatico() {
  enemy.value = BY_SLUG[BATTLES[0].enemy]
  enemyHp.value = 68
  playerHp.value = 82
  cursor.value = 0
  picked.value = 0
  message.value = `${player.name} usou ${PLAYER_MOVES[0].name}!`
}

let observador = null

onMounted(() => {
  const node = el.value
  if (!node) return

  const semMovimento =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

  if (semMovimento || typeof IntersectionObserver === 'undefined') {
    quadroEstatico()
    return
  }

  // A luta só corre com a seção à vista: um loop infinito girando enquanto o
  // visitante lê outra parte da página é bateria de celular gasta à toa. Sair
  // e voltar reinicia a luta do começo, que é o comportamento certo aqui —
  // ninguém volta querendo pegar o meio de um turno.
  observador = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) jogar()
        else token++
      }
    },
    { threshold: 0.35 },
  )

  observador.observe(node)
})

onBeforeUnmount(() => {
  token++
  clearTimeout(timer)
  observador?.disconnect()
  observador = null
})
</script>

<template>
  <SectionShell :kicker="battle.kicker" :title="battle.title">
    <template #lede>{{ battle.desc }}</template>

    <!-- A demo é uma vitrine que se repete sozinha: para leitor de tela ela não
         é navegável nem informativa turno a turno (seria uma live region
         tagarelando para sempre). O equivalente textual abaixo diz o que a cena
         mostra, de uma vez, e o campo fica `aria-hidden`. -->
    <p class="sr-only">
      Demonstração automática de uma batalha: {{ player.name }} enfrenta
      {{ BATTLES.map((b) => BY_SLUG[b.enemy].name).join(' e ') }}, escolhendo golpes de um
      menu de quatro e vencendo as duas lutas. A cena se repete em loop.
    </p>

    <div ref="el" class="arena gba-frame">
      <div class="arena__field" aria-hidden="true">
        <div class="arena__row arena__row--enemy">
          <div class="hp-window hp-window--enemy">
            <p class="hp-window__name">{{ enemy.name }}</p>
            <div class="hp-window__track">
              <span
                class="hp-window__fill hp-window__fill--enemy"
                :style="{ width: `${enemyHp}%` }"
              />
            </div>
            <ul class="hp-window__types">
              <li v-for="t in enemy.types" :key="t"><TypeBadge :type-id="t" size="sm" /></li>
            </ul>
          </div>

          <!-- Ocupa o vão do meio no desktop; no celular quebra para a linha de
               baixo (ver `.arena__log` no CSS). -->
          <p class="arena__log">{{ message }}</p>

          <figure class="fighter fighter--enemy" :class="{ 'fighter--fainted': enemyFainted }">
            <img
              class="pixelated"
              :src="enemy.sprite"
              :alt="`Professor ${enemy.name}, o adversário`"
              width="64"
              height="64"
              loading="lazy"
              decoding="async"
            />
          </figure>
        </div>

        <p class="arena__vs">VS</p>

        <div class="arena__row arena__row--player">
          <figure class="fighter fighter--player">
            <img
              class="pixelated"
              :src="player.spriteBack"
              :alt="`Professor ${player.name}, o seu combatente, visto de costas`"
              width="64"
              height="64"
              loading="lazy"
              decoding="async"
            />
          </figure>

          <!-- O menu de golpes mora no vão entre o seu boneco e o seu HUD, que
               é onde uma tela de batalha o coloca — e, no desktop, era
               justamente o espaço que sobrava vazio. -->
          <ul class="move-menu">
            <li
              v-for="(m, i) in PLAYER_MOVES"
              :key="m.name"
              class="move"
              :class="{ 'move--cursor': cursor === i, 'move--picked': picked === i }"
            >
              <span class="move__cursor">▶</span>
              <span class="move__name">{{ m.name }}</span>
              <span class="move__cat">{{ m.category }}</span>
            </li>
          </ul>

          <div class="hp-window hp-window--player">
            <p class="hp-window__name">{{ player.name }}</p>
            <div class="hp-window__track">
              <span
                class="hp-window__fill hp-window__fill--player"
                :style="{ width: `${playerHp}%` }"
              />
            </div>
            <ul class="hp-window__types">
              <li v-for="t in player.types" :key="t"><TypeBadge :type-id="t" size="sm" /></li>
            </ul>
          </div>
        </div>
      </div>

      <dl class="stats">
        <div v-for="stat in battle.stats" :key="stat.label" class="stats__item">
          <dt>{{ stat.label }}</dt>
          <dd>{{ stat.hint }}</dd>
        </div>
      </dl>

      <div class="moves">
        <div class="moves__block">
          <h3 class="moves__title">Categorias de golpe</h3>
          <ul class="moves__tags">
            <li v-for="c in battle.moveCategories" :key="c" class="tag">{{ c }}</li>
          </ul>
        </div>

        <div class="moves__block">
          <h3 class="moves__title">Efeitos de status</h3>
          <ul class="moves__tags">
            <li v-for="e in battle.effects" :key="e" class="tag tag--muted">{{ e }}</li>
          </ul>
          <p class="moves__note">{{ battle.effectsNote }}</p>
        </div>
      </div>
    </div>

    <p class="training">{{ battle.training }}</p>
  </SectionShell>
</template>

<style scoped>
.arena {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

/* O campo é uma peça só: as duas fileiras mais o "VS" central ficam
   deliberadamente coladas — é essa proximidade que lê como UM confronto em
   vez de duas fileiras soltas dentro do mesmo quadro. */
.arena__field {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.arena__row {
  display: flex;
  /* `flex-start`: a janela de HP gruda no topo da fileira, o boneco pisa no
     chão dela. Era `center` — os dois alinhados no meio é o que fazia a cena
     parecer dois elementos soltos lado a lado em vez de um HUD sobre um
     personagem, que é como todo jogo de Pokémon encaixa a dupla. */
  align-items: flex-start;
  gap: var(--space-2);
  /* Permite que o log e o menu de golpes caiam para a própria linha no
     celular. Ver os `flex-basis: 100%` deles abaixo. */
  flex-wrap: wrap;
}

.arena__row--player {
  /* A fileira do jogador inverte o eixo vertical: a janela gruda embaixo,
     porque é a câmera-por-cima-do-ombro que dá profundidade — o boneco em
     primeiro plano, o HUD dele no rodapé da cena, como o canto inferior
     direito de uma tela de batalha de verdade. */
  align-items: flex-end;
}

/* Separador central, não uma linha: um "VS" é o que uma tela de confronto
   mostra entre os dois lados, e ele substitui o `<hr>` genérico que soltava
   as duas fileiras uma da outra sem dizer o que as une. */
.arena__vs {
  align-self: center;
  font-family: var(--font-pixel);
  font-size: 11px;
  color: var(--unifil-gold);
  opacity: 0.6;
  letter-spacing: 2px;
}

/* ── Narração e menu: o que preenche o vão do desktop ───────────────────────
   No celular as fileiras já ficam apertadas e não sobra espaço nenhum — por
   isso os dois nascem com `flex-basis: 100%` e `order` alto, o que os joga
   para uma linha própria abaixo do boneco e do HUD. Só a partir de 900px,
   quando o vão do meio realmente aparece, eles voltam para dentro da fileira. */
.arena__log,
.move-menu {
  flex: 1 1 100%;
  order: 1;
}

.arena__log {
  font-family: var(--font-pixel);
  font-size: var(--fs-body-sm);
  line-height: 1.7;
  color: var(--text-primary);
  background: var(--bg-deep);
  border: 2px solid var(--surface-border);
  border-radius: var(--radius);
  padding: var(--space-2) var(--space-3);
  /* Duas linhas reservadas: a mensagem troca o tempo todo e, sem altura
     mínima, o campo inteiro pulava a cada turno. */
  min-height: calc(var(--space-2) * 2 + 2.6em);
}

.move-menu {
  display: grid;
  /* 2×2, como o menu de golpes de um GBA. */
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-1);
  list-style: none;
  background: var(--bg-deep);
  border: 3px solid var(--surface-border);
  box-shadow: inset 0 0 0 1px var(--unifil-gold);
  border-radius: var(--radius);
  padding: var(--space-2);
}

.move {
  display: grid;
  grid-template-columns: 1em minmax(0, 1fr);
  align-items: baseline;
  gap: 2px var(--space-1);
  padding: 4px 6px;
  border: 2px solid transparent;
  border-radius: var(--radius);
  font-family: var(--font-pixel);
  font-size: 9px;
  line-height: 1.5;
  color: var(--text-muted);
}

.move__cursor {
  /* Ocupa o lugar mesmo apagada: sem isto o nome do golpe dança para o lado
     toda vez que a setinha chega nele. */
  opacity: 0;
  color: var(--unifil-gold);
}

.move__name {
  min-width: 0;
  overflow-wrap: anywhere;
}

.move__cat {
  grid-column: 2;
  font-size: 8px;
  color: var(--unifil-orange);
  opacity: 0.75;
}

.move--cursor {
  border-color: var(--unifil-gold);
  color: var(--text-primary);
}

.move--cursor .move__cursor {
  opacity: 1;
}

/* O golpe que saiu: piscada de "confirmado", o mesmo gesto do menu de um GBA
   quando você aperta A. */
.move--picked {
  background: var(--unifil-orange);
  border-color: var(--unifil-gold);
  color: var(--text-primary);
}

.move--picked .move__cat {
  color: var(--text-primary);
  opacity: 0.9;
}

@media (min-width: 900px) {
  .arena__log,
  .move-menu {
    flex: 1 1 auto;
    order: 0;
  }

  .arena__log {
    /* Alinha o balão com o topo da janela de HP do adversário, em vez de
       esticar por toda a altura da fileira. */
    align-self: flex-start;
    max-width: 340px;
  }

  .move-menu {
    max-width: 300px;
  }
}

/* A largura vira variável porque o respiro de baixo é DERIVADO dela: 0,091 é
   meia elipse (largura 62% ÷ proporção 3,4 ÷ 2). Assim os dois números não podem
   sair de sincronia quando alguém mexer no tamanho do combatente.

   Não dá para usar `padding-bottom: 9%` aqui: porcentagem de padding resolve
   contra a largura do CONTÊINER — que é a linha flex de ~680 px, não os 168 px da
   figure. Dava 61 px de espaço morto embaixo de cada boneco. */
.fighter {
  --largura: clamp(96px, 26vw, 168px);
  flex-shrink: 0;
  width: var(--largura);
  position: relative;
  display: grid;
  place-items: end center;
  /* Espaço para a metade de baixo do disco: o sprite tem os pés encostados na
     borda inferior da própria imagem (a caixa do desenho vai de y=0 a y=63 num
     arquivo de 64 px), então a linha do chão é exatamente a base da <img>. */
  padding-bottom: calc(var(--largura) * 0.091);
}

.fighter img {
  width: 100%;
  aspect-ratio: 1;
  /* `contain`: o boneco é corpo inteiro sobre transparência. `cover` cortaria
     os pés, que é justamente o que faz um sprite parecer um recorte. */
  object-fit: contain;
  /* Sombra dura, sem blur: sombra de sprite, não de cartão. */
  filter: drop-shadow(3px 3px 0 rgb(0 0 0 / 45%));
  /* O disco é `position: absolute` e, sem isto, pintaria POR CIMA do boneco —
     conteúdo posicionado vem depois de conteúdo não posicionado na ordem de
     pintura, mesmo estando antes no documento. O chão precisa ficar atrás de
     quem pisa nele. */
  position: relative;
  z-index: 1;
}

/* Sem moldura em volta do boneco: ele é recortado, e emoldurá-lo o devolveria à
   condição de retrato. Quem diz de que lado cada um está é o DISCO no chão —
   vermelho para o adversário, azul para o seu —, que é como a arena do app
   marca os dois lados.

   O disco fica atrás pelo `::before` da figure e não como `background` da img,
   porque precisa ser uma elipse achatada no pé do boneco, não um retângulo. */
/* Disco e boneco ocupam a MESMA célula da grade, os dois alinhados ao fim dela.
   Assim a base da elipse e a base da <img> são a mesma linha por construção — não
   por um número que precisa ser mantido em sincronia.

   Foi o que a primeira tentativa errou: `bottom: 9%` num elemento absoluto
   resolve contra a ALTURA do contêiner, enquanto `padding-bottom: 9%` resolve
   contra a LARGURA. Dois eixos, mesmo número, e a elipse subia para a canela.

   O `translate: 0 50%` desce meia altura, levando o CENTRO da elipse até a linha
   dos pés — é onde fica o contato com o chão. A metade de baixo cai dentro do
   `padding-bottom` da figure, que é 9% da largura ≈ exatamente meia elipse
   (0,62 × 1/3,4 ÷ 2 = 0,091). Os dois vêm da largura, então continuam casados em
   qualquer tamanho de tela. */
.fighter::before,
.fighter img {
  grid-area: 1 / 1;
}

.fighter::before {
  content: '';
  align-self: end;
  width: 62%;
  aspect-ratio: 3.4 / 1;
  translate: 0 50%;
  border-radius: 50%;
  background: radial-gradient(
    ellipse at center,
    color-mix(in srgb, var(--disco) 50%, transparent) 0%,
    color-mix(in srgb, var(--disco) 22%, transparent) 55%,
    transparent 75%
  );
}

.fighter--enemy {
  --disco: var(--error);
  /* Empurra o adversário para a borda direita do quadro: com o log no meio ele
     já iria para lá, mas o `auto` mantém a composição inteira quando o log
     quebra de linha no celular. */
  margin-left: auto;
}

.fighter--player {
  --disco: var(--ds-blue);
}

/* Derrota: o boneco apaga e escorrega para baixo, como um sprite que sai de
   cena. Curto de propósito — o próximo professor entra logo em seguida. */
.fighter--fainted {
  opacity: 0;
  translate: 0 12px;
  transition:
    opacity 0.5s var(--ease-pixel),
    translate 0.5s var(--ease-pixel);
}

/* O seu combatente está em PRIMEIRO PLANO: a câmera está atrás do ombro dele.
   Se os dois tivessem o mesmo tamanho, a cena viraria dois bonecos lado a lado
   em vez de uma arena com profundidade. */
.fighter--player {
  --largura: clamp(120px, 32vw, 208px);
}

/* Respiração de sprite parado: 2 quadros, como uma animação de idle de GBA.
   `steps(2)` em vez de uma curva contínua — um sprite que desliza suavemente
   para cima e para baixo é exatamente o que um sprite de 8 bits não faz. */
.fighter img {
  animation: sprite-idle 1.8s steps(2, end) infinite;
}

.fighter--player img {
  /* Defasado, para os dois não pulsarem no mesmo quadro. */
  animation-delay: 0.9s;
}

@keyframes sprite-idle {
  0%,
  100% {
    translate: 0 0;
  }
  50% {
    translate: 0 -3px;
  }
}

/* A janela de HP: antes era um bloco solto sem contorno, flutuando ao lado do
   boneco sem nada que dissesse "isto é um painel". Uma tela de batalha de
   verdade sempre marca essa caixa — é o que separa "informação de HUD" de
   "legenda decorativa". Bisel duplo, mesmo vocabulário do `.gba-frame`, só
   que compacto o bastante para caber ao lado do combatente. */
.hp-window {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  min-width: 0;
  /* Sem teto, numa tela de 1920px a barra de HP esticava por ~800px e o
     enquadramento deixava de parecer uma tela de batalha. */
  max-width: 320px;
  background: var(--bg-deep);
  border: 3px solid var(--surface-border);
  box-shadow: inset 0 0 0 1px var(--unifil-gold);
  border-radius: var(--radius);
  padding: var(--space-2) var(--space-3);
}

.hp-window--player {
  margin-left: auto;
  align-items: flex-end;
  text-align: right;
}

.hp-window__name {
  font-family: var(--font-pixel);
  font-size: var(--fs-pixel-sm);
  line-height: 1.6;
}

.hp-window__track {
  width: 100%;
  height: 12px;
  background: var(--surface);
  border: 2px solid var(--surface-border);
  border-radius: 2px;
  overflow: hidden;
}

.hp-window__fill {
  display: block;
  height: 100%;
  /* `steps()` faz a barra descer aos pulos, como numa tela de 8 bits, em vez de
     deslizar suavemente. A largura vem do roteiro, por `:style`. */
  transition: width 0.8s var(--ease-pixel);
}

.hp-window__fill--enemy {
  background: var(--error);
}

.hp-window__fill--player {
  background: var(--success-text);
}

.hp-window__types {
  display: flex;
  gap: var(--space-1);
  list-style: none;
  flex-wrap: wrap;
  margin-top: var(--space-1);
}

.hp-window--player .hp-window__types {
  justify-content: flex-end;
}

.stats {
  display: grid;
  gap: var(--space-3);
  padding-top: var(--space-3);
  border-top: 2px dashed var(--surface-border);
}

@media (min-width: 620px) {
  .stats {
    grid-template-columns: repeat(3, 1fr);
  }
}

.stats__item dt {
  font-family: var(--font-pixel);
  font-size: 9px;
  color: var(--unifil-gold);
  line-height: 1.6;
  margin-bottom: var(--space-1);
}

.stats__item dd {
  font-family: var(--font-pixel);
  font-size: var(--fs-body-sm);
  line-height: 1.7;
  color: var(--text-muted);
}

/* Os golpes vivem DENTRO do mesmo `.gba-frame` da arena — antes eram duas
   caixas próprias empilhadas abaixo dela, e três molduras competindo é o que
   fazia a seção parecer solta. Uma tela de batalha de verdade também separa
   "campo" de "menu de golpes", mas como DUAS METADES da MESMA tela, nunca
   como cartões independentes boiando um embaixo do outro. */
.moves {
  display: grid;
  gap: var(--space-4);
  padding-top: var(--space-3);
  border-top: 2px dashed var(--surface-border);
}

@media (min-width: 720px) {
  .moves {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr);
    gap: var(--space-5);
  }

  .moves__block:first-child {
    padding-right: var(--space-5);
    border-right: 2px dashed var(--surface-border);
  }
}

.moves__block {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.moves__title {
  font-family: var(--font-pixel);
  font-size: var(--fs-h3);
  color: var(--unifil-gold);
  line-height: 1.6;
}

.moves__tags {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  list-style: none;
}

.tag {
  padding: 6px 10px;
  border: 2px solid var(--unifil-orange);
  border-radius: var(--radius);
  font-size: 13px;
  color: var(--text-primary);
}

.tag--muted {
  border-color: var(--surface-border);
  color: var(--text-muted);
}

.moves__note {
  font-family: var(--font-pixel);
  font-size: var(--fs-body-sm);
  line-height: 1.7;
  color: var(--text-muted);
  font-style: italic;
}

.training {
  font-family: var(--font-pixel);
  font-size: var(--fs-body-sm);
  line-height: 1.7;
  color: var(--text-muted);
  border-left: 3px solid var(--unifil-orange);
  padding-left: var(--space-3);
}

@media (prefers-reduced-motion: reduce) {
  .hp-window__fill,
  .fighter--fainted {
    transition: none;
  }

  .fighter img {
    animation: none;
  }
}
</style>
