<script setup>
import { hero } from '@/content/copy.js'
import { APP_LOGIN_URL } from '@/config/links.js'
import PixelButton from '@/components/PixelButton.vue'
import { asset } from '@/config/asset.js'
</script>

<template>
  <header id="topo" class="hero">
    <div class="hero__inner container">
      <div class="hero__art">
        <!-- Esta imagem é o LCP da página, então NÃO é lazy e NÃO é async:
             ela precisa estar na primeira leva. 6,4 KB depois da quantização
             para paleta indexada (era 205 KB — ver
             scripts/make-placeholder-assets.mjs). -->
        <img
          class="hero__ball pixelated"
          :src="asset('/eagle-ball.png')"
          alt="Logo do ProfDex: uma águia em pixel art dentro de uma bola de captura"
          width="500"
          height="500"
          fetchpriority="high"
          decoding="sync"
        />
      </div>

      <div class="hero__text">
        <p class="hero__context">{{ hero.context }}</p>
        <h1 class="hero__title">
          {{ hero.wordmarkStart }}<span class="hero__title-accent">{{ hero.wordmarkEnd }}</span>
        </h1>
        <p class="hero__subtitle">{{ hero.subtitle }}</p>
        <p class="hero__lede">{{ hero.lede }}</p>

        <div class="hero__cta">
          <PixelButton :href="APP_LOGIN_URL" external>{{ hero.cta }}</PixelButton>
          <p class="hero__cta-hint">{{ hero.ctaHint }}</p>
        </div>
      </div>
    </div>
  </header>
</template>

<style scoped>
.hero {
  background: var(--unifil-orange);
  /* A borda inferior grossa em `--surface` é o mesmo corte da home do app:
     é ela que faz o hero parecer a tampa de um console. */
  border-bottom: 6px solid var(--surface);
  /* Fio dourado logo acima do corte: a aresta usinada entre a tampa e o resto
     do aparelho. Dois pixels — o suficiente para o corte parecer fabricado em
     vez de cortado com `border-bottom`. */
  box-shadow: inset 0 -2px 0 color-mix(in srgb, var(--unifil-gold) 45%, transparent);
  /* O topo reserva a altura da barra fixa: ela flutua por cima do hero, e
     sem esta soma o "Semana Tecnológica · UniFil" nasceria escondido
     atrás dela. Reservado em CSS, então vale já no primeiro paint — o CLS
     continua 0. */
  padding-block: calc(var(--nav-h) + var(--space-5)) var(--space-6);
  position: relative;
  overflow: hidden;
}

/* Placa de circuito impresso, no próprio laranja da marca.
 *
 * O laranja chapado tinha 500px de altura e nada acontecendo neles. Aqui ele
 * vira material: trilhas gravadas numa grade irregular, vias metálicas e um
 * barramento fora de fase.
 *
 * A REGRA QUE DECIDE TODAS AS CORES DAQUI: a textura só pode ESCURECER.
 *
 * O "DEX" dourado sobre o laranja já vive em 3,07:1 — o piso da WCAG para
 * texto grande é 3:1, então não há folga nenhuma. Clarear o fundo aproxima o
 * laranja do dourado e derruba o par: medi 2,66:1 com uma ilha clara de 7%
 * atrás da palavra. Escurecer faz o contrário — afasta os dois — e sobe para
 * ~3,9:1. Por isso as vias são BURACOS — furo escuro com halo escuro, que é o
 * que uma via furada e não preenchida é de verdade. Pastilha clara ficaria mais
 * bonita e derrubaria a palavra do hero abaixo do piso.
 *
 * O único branco que sobrou são os 3% da aresta da trilha, e ele vem SEMPRE
 * colado numa faixa escura de 5% — são 2px cada. O traço da Press Start 2P a
 * 56px tem ~7px, então nenhum glifo consegue pousar só na metade clara: o fundo
 * efetivo de qualquer letra é o par, que mede 3,13:1. Acima do piso, e acima do
 * que a página tinha antes da textura existir. */
.hero::before {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-image:
    /* Vias: furo (11%) e halo (4%), os dois escuros. Tile de 192px — elas caem
       numa trilha vertical a cada três e numa horizontal a cada duas, que é a
       densidade de uma placa real. Via em todo cruzamento seria pontilhado. */
    radial-gradient(
      circle at 3px 3px,
      rgb(0 0 0 / 11%) 0 2px,
      rgb(0 0 0 / 4%) 2px 3px,
      transparent 3px
    ),
    /* Trilhas verticais (64px) e horizontais (96px). Os períodos são
       DIFERENTES de propósito: com o mesmo número nos dois eixos a textura
       resolve como papel milimetrado, e aí não é mais uma placa — é uma grade.
       Em 64×96 os cruzamentos só se repetem a cada 192px e o olho lê circuito. */
    repeating-linear-gradient(
      to right,
      rgb(255 255 255 / 3%) 0 2px,
      rgb(0 0 0 / 5%) 2px 4px,
      transparent 4px 64px
    ),
    repeating-linear-gradient(
      to bottom,
      rgb(255 255 255 / 3%) 0 2px,
      rgb(0 0 0 / 5%) 2px 4px,
      transparent 4px 96px
    ),
    /* Barramento secundário, apagado e fora de fase (160px): é ele que quebra a
       regularidade que sobrou e dá à placa a densidade irregular. */
    repeating-linear-gradient(to right, rgb(0 0 0 / 4%) 0 2px, transparent 2px 160px),
    /* A diagonal de 45°. Numa placa real a rota mais curta entre dois pontos
       quase nunca é em L — sem ela a textura fica ortogonal demais. */
    repeating-linear-gradient(45deg, rgb(0 0 0 / 3.5%) 0 2px, transparent 2px 96px);
  background-size:
    192px 192px,
    64px 64px,
    96px 96px,
    160px 160px,
    auto;
  /* Microvida: a placa desliza um tile inteiro (192px) em 8 quadros, uma vez a
     cada 24 segundos. É `steps(8)`, então são OITO repinturas por ciclo — não
     240 por segundo — e a diferença entre um quadro e o outro é pequena demais
     para desviar o olho do título. Não custa contraste: a textura é a mesma,
     só deslocada, e o par escuro que fica sob cada glifo continua o mesmo. */
  animation: board-drift 24s steps(8, end) infinite;
}

@keyframes board-drift {
  from {
    background-position: 0 0;
  }
  to {
    background-position: 192px 192px;
  }
}

.hero__inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-4);
  text-align: center;
  position: relative;
  z-index: 1;
}

.hero__ball {
  width: clamp(112px, 26vw, 176px);
  height: auto;
  /* Sombra dura, sem blur: é a sombra que um sprite tem, não a de um cartão. */
  filter: drop-shadow(4px 4px 0 rgb(0 0 0 / 25%));
  animation: hero-float 4s steps(8, end) infinite;
}

@keyframes hero-float {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-8px);
  }
}

.hero__context {
  font-family: var(--font-pixel);
  font-size: var(--fs-pixel-sm);
  /* Sobre o laranja da marca, só branco passa em contraste. O dourado daria
     3,1:1 — reprovado para texto pequeno. */
  color: var(--text-primary);
  opacity: 0.92;
}

.hero__title {
  font-family: var(--font-pixel);
  font-size: var(--fs-hero);
  line-height: 1.2;
  color: var(--text-primary);
  letter-spacing: 1px;
  text-shadow: 4px 4px 0 var(--surface);
  margin-block: var(--space-2);
}

/* O dourado aparece só aqui: display grande, onde 3,1:1 é aceitável (WCAG
   trata ≥24px como texto grande) e onde ele é a assinatura da marca. */
.hero__title-accent {
  color: var(--unifil-gold);
  /* Entrada de "ligar o aparelho": o DEX encaixa no PROF em três quadros.
     TRANSFORM APENAS — nada de fade. O LCP da página é o texto do hero, e
     animar opacidade aqui empurraria a marca de LCP para o fim da animação. */
  display: inline-block;
  animation: dex-snap 360ms steps(3, end) 1 both;
}

@keyframes dex-snap {
  from {
    transform: translateX(6px);
  }
  to {
    transform: translateX(0);
  }
}

.hero__subtitle {
  font-family: var(--font-pixel);
  font-size: var(--fs-h3);
  color: var(--text-primary);
  line-height: 1.6;
}

.hero__lede {
  margin-inline: auto;
  margin-top: var(--space-3);
  color: var(--text-primary);
  font-size: var(--fs-body);
  opacity: 0.95;
}

.hero__cta {
  margin-top: var(--space-4);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
}

.hero__cta-hint {
  font-family: var(--font-pixel);
  font-size: var(--fs-body-sm);
  line-height: 1.7;
  color: var(--text-primary);
  opacity: 0.85;
}

/* O botão do hero fica sobre o laranja, então inverte: fundo escuro para não
   sumir no fundo da própria cor. */
.hero__cta :deep(.btn-pixel) {
  background: var(--surface);
  min-width: 220px;
}

.hero__cta :deep(.btn-pixel:hover) {
  background: var(--bg-deep);
}

@media (min-width: 860px) {
  .hero {
    padding-block: calc(var(--nav-h) + var(--space-6)) var(--space-7);
  }

  .hero__inner {
    flex-direction: row;
    /* Preenche a largura do container em vez de empacotar as duas peças à
       esquerda: sem isto, alargar `--maxw-content` só cria uma faixa vazia
       nova à direita do texto — o mesmo desperdício de fora do container,
       só que dentro dele. */
    justify-content: space-between;
    text-align: left;
    gap: var(--space-6);
  }

  .hero__ball {
    width: clamp(176px, 20vw, 240px);
  }

  .hero__text {
    /* Cresce para preencher o espaço que sobra ao lado da bola, em vez de um
       teto fixo em px: era ele que deixava vão morto entre o fim do texto e
       a borda direita do hero quando a fonte do corpo mudou de largura. */
    flex: 1 1 auto;
    min-width: 0;
  }

  .hero__lede {
    margin-inline: 0;
  }

  .hero__cta {
    align-items: flex-start;
  }
}

/* Acima de 1400px o `--maxw-content` fluido (ver tokens.css) já entregou
 * espaço extra ao hero; sem crescer a bola junto, esse espaço vira só um
 * `gap` maior entre as duas metades. A bola cresce com a tela para continuar
 * lendo como a peça de mesmo peso visual que o título, e não um selo
 * encolhendo num canto. */
@media (min-width: 1400px) {
  .hero__ball {
    width: clamp(240px, 16vw, 320px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .hero__ball,
  .hero::before,
  .hero__title-accent {
    animation: none;
  }
}
</style>
