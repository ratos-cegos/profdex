<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'

// Fonte única da barra inferior.
//
// Antes cada view desenhava a sua própria barra, e as mesmas classes
// significavam coisas diferentes em cada arquivo (`nav-btn--active` era o botão
// ProfDex laranja num lugar e o botão Batalha amarelo em outro). Por isso fundo,
// borda, padding e alinhamento mudavam ao trocar de rota.
//
// Os ícones são pixel art predominantemente laranja, então o botão fica com
// fundo escuro em todos os estados: o destaque do item ativo vem da borda e do
// bisel na cor DS correspondente, não de um fundo colorido que apagaria o ícone.
const ITENS = [
  { rota: 'profdex', rotulo: 'ProfDex', icone: '/icons/profdex.png', cor: 'laranja' },
  { rota: 'scan', rotulo: 'Scanear', icone: '/icons/scanner.png', cor: 'azul' },
  { rota: 'batalha', rotulo: 'Batalha', icone: '/icons/batalha.png', cor: 'verde' },
]

const route = useRoute()

// A rota de ranking vive "dentro" da área de batalha (chega-se a ela pela aba
// superior), então o item Batalha continua destacado enquanto se está lá.
const rotaAtiva = computed(() =>
  route.name === 'ranking' ? 'batalha' : route.name,
)
</script>

<template>
  <nav class="bottom-nav" aria-label="Navegação principal">
    <RouterLink
      v-for="item in ITENS"
      :key="item.rota"
      class="bottom-nav__btn"
      :class="[
        `bottom-nav__btn--${item.cor}`,
        { 'bottom-nav__btn--ativo': rotaAtiva === item.rota },
      ]"
      :to="{ name: item.rota }"
      :aria-current="rotaAtiva === item.rota ? 'page' : undefined"
    >
      <img class="bottom-nav__icone" :src="item.icone" alt="" aria-hidden="true" />
      <span class="pixel bottom-nav__rotulo">{{ item.rotulo }}</span>
    </RouterLink>
  </nav>
</template>

<style scoped>
.bottom-nav {
  flex-shrink: 0;
  display: flex;
  gap: 8px;
  padding: var(--nav-pad) var(--nav-pad)
    calc(var(--nav-pad) + env(safe-area-inset-bottom));
  background: var(--surface);
  border-top: 3px solid var(--surface-border);
}

.bottom-nav__btn {
  flex: 1;
  min-width: 0;
  min-height: var(--nav-height);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 8px 4px;
  border: 2px solid var(--surface-border);
  border-radius: var(--radius);
  background: var(--surface);
  color: var(--text-muted);
  text-decoration: none;
  transition:
    transform 0.15s ease,
    filter 0.15s ease,
    border-color 0.15s ease,
    color 0.15s ease;
}

/* Cada item carrega a própria tríade DS; o estado ativo é uma regra só. */
.bottom-nav__btn--laranja {
  --ds-cor: var(--ds-orange);
  --ds-brilho: var(--ds-orange-glow);
  --ds-sombra: var(--ds-orange-shadow);
}

.bottom-nav__btn--azul {
  --ds-cor: var(--ds-blue);
  --ds-brilho: var(--ds-blue-glow);
  --ds-sombra: var(--ds-blue-shadow);
}

.bottom-nav__btn--verde {
  --ds-cor: var(--ds-green);
  --ds-brilho: var(--ds-green-glow);
  --ds-sombra: var(--ds-green-shadow);
}

.bottom-nav__btn--ativo {
  border-color: var(--ds-cor);
  box-shadow:
    inset 0 3px 0 var(--ds-brilho),
    inset 0 -4px 0 var(--ds-sombra);
  color: var(--text-primary);
}

/* Dimensionado pela ALTURA, com a largura livre. As artes têm proporções
   diferentes (a de batalha é 1.75:1, as outras quase quadradas); encaixá-las
   todas num quadrado fazia a de batalha aparecer com pouco mais da metade da
   altura das demais. Igualar a altura é o que iguala o peso visual. */
.bottom-nav__icone {
  height: var(--nav-icon);
  width: auto;
  max-width: 100%;
  object-fit: contain;
  image-rendering: pixelated;
  opacity: 0.6;
  transition: opacity 0.15s ease;
  user-select: none;
  pointer-events: none;
}

.bottom-nav__btn--ativo .bottom-nav__icone {
  opacity: 1;
}

.bottom-nav__rotulo {
  max-width: 100%;
  overflow: hidden;
  font-size: 7px;
  line-height: 1.4;
  white-space: nowrap;
  text-overflow: ellipsis;
}

@media (hover: hover) {
  .bottom-nav__btn:hover {
    border-color: var(--ds-cor);
    color: var(--text-primary);
  }

  .bottom-nav__btn:hover .bottom-nav__icone {
    opacity: 1;
  }
}

.bottom-nav__btn:active {
  transform: translateY(2px);
  filter: brightness(0.92);
}

.bottom-nav__btn:focus-visible {
  outline: 2px solid var(--unifil-gold);
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  .bottom-nav__btn,
  .bottom-nav__icone {
    transition: none;
  }

  .bottom-nav__btn:active {
    transform: none;
  }
}
</style>
