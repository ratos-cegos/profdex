<script setup>
import { nav } from '@/content/copy.js'
import { APP_LOGIN_URL } from '@/config/links.js'
import PixelButton from '@/components/PixelButton.vue'
import { useOverHero, useSectionActive } from '@/composables/useScrollSpy.js'
import { asset } from '@/config/asset.js'

// Dois estados de fundo, e nada além disso: sobre o laranja do hero a barra é o
// próprio laranja; do fim do hero em diante ela é a superfície escura. Quem
// decide é o observador — ver src/composables/useScrollSpy.js.
const { overHero } = useOverHero()

// Só para o `aria-current` do link. Se o observador não rodar, o link continua
// funcionando; ele apenas não se marca como "você está aqui".
const { active: creditsActive } = useSectionActive('creditos')
</script>

<template>
  <header class="site-nav" :class="overHero ? 'site-nav--over-hero' : 'site-nav--over-dark'">
    <nav class="site-nav__inner container" aria-label="Navegação principal">
      <!-- A bola vai como decorativa (alt="") porque o wordmark ao lado já é o
           texto — mesma decisão do rodapé. Em telas muito estreitas o wordmark
           some por espaço, e é por isso que o NOME acessível está no link, não
           na imagem: ele não depende do que está visível. -->
      <a class="site-nav__brand" href="#topo" :aria-label="nav.brandLabel">
        <img
          class="site-nav__ball"
          :src="asset('/logo-unifil.png')"
          alt=""
          width="36"
          height="28"
          decoding="sync"
        />
        <span class="site-nav__wordmark" aria-hidden="true">
          {{ nav.brandStart }}<span class="site-nav__dex">{{ nav.brandEnd }}</span>
        </span>
      </a>

      <div class="site-nav__actions">
        <a
          class="site-nav__link"
          href="#creditos"
          :aria-current="creditsActive ? 'true' : undefined"
        >
          {{ nav.credits }}
        </a>

        <PixelButton :href="APP_LOGIN_URL" external>{{ nav.cta }}</PixelButton>
      </div>
    </nav>
  </header>
</template>

<style scoped>
.site-nav {
  position: fixed;
  inset: 0 0 auto;
  /* Abaixo do .skip-link (z-index 10 em App.vue): o link de pulo PRECISA
     aparecer por cima da barra quando o teclado o alcança. Acima de tudo o
     mais — o hero chega a z-index 1. */
  z-index: 9;
  /* Altura fixa, não derivada do conteúdo: é o mesmo número que reserva o
     espaço no topo do hero e que o observador usa de rootMargin. Se ela
     variasse com o conteúdo, as três coisas discordariam e a página teria
     layout shift no primeiro paint. */
  height: var(--nav-h);
  transition:
    background-color var(--dur-base) var(--ease-out),
    box-shadow var(--dur-base) var(--ease-out);
}

.site-nav__inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  height: 100%;
}

/* ── Estado 1: sobre o laranja do hero ──────────────────────────────────── */
/* A barra assume o próprio laranja da marca em vez de ficar transparente: o
   hero rola POR BAIXO dela, e com fundo translúcido o título e a bola de 176px
   passariam atrás dos rótulos — contraste imprevisível a cada pixel de
   rolagem. Chapada, o fundo de trás do texto é sempre o mesmo #995200. */
.site-nav--over-hero {
  background: var(--unifil-orange);
}

/* Sobre o laranja só o branco passa: 5,6:1. O dourado daria 3,1:1, que a WCAG
   só aceita em display grande — o "DEX" de 56px do hero pode, este de 12px
   não. Por isso o wordmark inteiro fica branco neste estado. */
.site-nav--over-hero .site-nav__wordmark,
.site-nav--over-hero .site-nav__dex,
.site-nav--over-hero .site-nav__link {
  color: var(--text-primary);
}

/* O contorno de foco dourado também vive em 3,1:1 sobre o laranja — no limite
   do piso de 3:1 para componentes. Sobre o hero ele vira branco. */
.site-nav--over-hero :focus-visible {
  outline-color: var(--text-primary);
}

/* O CTA inverte junto, exatamente como o botão do hero já faz: laranja sobre
   laranja não teria plano de fundo. */
.site-nav--over-hero :deep(.btn-pixel) {
  background: var(--surface);
}

.site-nav--over-hero :deep(.btn-pixel:hover) {
  background: var(--bg-deep);
}

/* ── Estado 2: sobre o fundo escuro ─────────────────────────────────────── */
/* --surface (#1a1a1a) e não --bg-deep (#121418): a barra precisa ler como uma
   peça POR CIMA da página, e são esses 8 pontos de luminância que dizem isso.
   O fio dourado embaixo é o mesmo corte do hero — a aresta usinada entre a
   tampa do console e o resto do aparelho. */
.site-nav--over-dark {
  background: var(--surface);
  box-shadow: inset 0 -2px 0 color-mix(in srgb, var(--unifil-gold) 45%, transparent);
}

.site-nav--over-dark .site-nav__wordmark {
  color: var(--text-primary);
}

/* Aqui o dourado é permitido e é a assinatura: 9,1:1 sobre --surface. */
.site-nav--over-dark .site-nav__dex,
.site-nav--over-dark .site-nav__link {
  color: var(--unifil-gold);
}

/* ── Peças ──────────────────────────────────────────────────────────────── */

.site-nav__brand {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  /* Alvo de toque: a barra inteira de altura, não só a caixa do texto. */
  height: 100%;
  padding-right: var(--space-2);
  text-decoration: none;
}

.site-nav__brand:hover {
  text-decoration: none;
}

.site-nav__ball {
  width: auto;
  height: 28px;
  flex-shrink: 0;
}

.site-nav__wordmark {
  font-family: var(--font-pixel);
  font-size: 12px;
  line-height: 1;
  letter-spacing: 1px;
  transition: color var(--dur-base) var(--ease-out);
}

.site-nav__dex {
  transition: color var(--dur-base) var(--ease-out);
}

.site-nav__actions {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.site-nav__link {
  display: inline-flex;
  align-items: center;
  /* 44px de alvo de toque, como o resto da casa — o rótulo tem 10px de altura,
     quem clica não. */
  min-height: 44px;
  padding-inline: var(--space-2);
  font-family: var(--font-pixel);
  font-size: var(--fs-pixel-sm);
  line-height: 1;
  transition: color var(--dur-base) var(--ease-out);
}

/* "Você está aqui": um fio dourado sob o rótulo quando a seção de créditos
   está em cena. Não muda a cor do texto — mudar cor por estado ativo custaria
   um par de contraste a mais para conferir em cada fundo. */
.site-nav__link[aria-current] {
  box-shadow: inset 0 -2px 0 currentColor;
}

/* O botão do topo é mais baixo que o padrão de 52px: ainda são 44px de alvo de
   toque, o mínimo da casa, e é o que deixa a barra em 60px sem apertar. */
.site-nav :deep(.btn-pixel) {
  min-height: 44px;
  padding: var(--space-2) var(--space-3);
}

/* Abaixo de ~380px (celulares antigos e o Fold fechado) o wordmark sai e fica
   só a bola. O nome acessível do link não muda: ele está no aria-label. */
@media (max-width: 380px) {
  .site-nav__wordmark {
    display: none;
  }
}

@media (min-width: 720px) {
  .site-nav__actions {
    gap: var(--space-3);
  }

  .site-nav__wordmark {
    font-size: 14px;
  }
}

/* Movimento reduzido: os dois estados continuam existindo e continuam
   corretos, mas a troca é instantânea — sem cor animada. */
@media (prefers-reduced-motion: reduce) {
  .site-nav,
  .site-nav__wordmark,
  .site-nav__dex,
  .site-nav__link {
    transition: none;
  }
}
</style>
