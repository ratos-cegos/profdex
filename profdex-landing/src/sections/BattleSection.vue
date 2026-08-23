<script setup>
import { battle } from '@/content/copy.js'
import { BY_SLUG } from '@/data/professors.js'
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
const enemy = BY_SLUG.mario
const player = BY_SLUG.gustavo

// A barra do adversário desce quando a seção entra na tela. É CSS puro
// (transition de width com steps): não vale carregar uma engine de animação
// para drenar uma barra.
const { el } = useReveal({ threshold: 0.4 })
</script>

<template>
  <SectionShell :kicker="battle.kicker" :title="battle.title">
    <template #lede>{{ battle.desc }}</template>

    <div ref="el" class="arena gba-frame">
      <div class="arena__field">
        <div class="arena__row arena__row--enemy">
          <div class="hp-window hp-window--enemy">
            <p class="hp-window__name">{{ enemy.name }}</p>
            <div class="hp-window__track" role="img" :aria-label="`Adversário ${enemy.name} com 42% de HP`">
              <span class="hp-window__fill hp-window__fill--enemy" />
            </div>
            <ul class="hp-window__types">
              <li v-for="t in enemy.types" :key="t"><TypeBadge :type-id="t" size="sm" /></li>
            </ul>
          </div>
          <figure class="fighter fighter--enemy">
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

        <p class="arena__vs" aria-hidden="true">VS</p>

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
          <div class="hp-window hp-window--player">
            <p class="hp-window__name">{{ player.name }}</p>
            <div class="hp-window__track" role="img" :aria-label="`${player.name} com 88% de HP`">
              <span class="hp-window__fill hp-window__fill--player" />
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
}

.fighter--player {
  --disco: var(--ds-blue);
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
  width: 100%;
  /* `steps()` faz a barra descer aos pulos, como numa tela de 8 bits, em vez de
     deslizar suavemente. */
  transition: width 1.2s var(--ease-pixel);
}

.hp-window__fill--enemy {
  background: var(--error);
}

.hp-window__fill--player {
  background: var(--success-text);
}

/* O drenar só acontece quando a seção aparece — antes disso as barras ficam
   cheias, que é o estado correto para quem tem movimento reduzido. */
[data-reveal='shown'] .hp-window__fill--enemy {
  width: 42%;
}

[data-reveal='shown'] .hp-window__fill--player {
  width: 88%;
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
  .hp-window__fill {
    transition: none;
  }

  .fighter img {
    animation: none;
  }
}
</style>
