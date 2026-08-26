<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'

// Abas Batalha | Ranking.
//
// Antes o Ranking era estado local da BatalhaView (`tab = 'ranking'`) e existia
// um segundo caminho — um botão grande na lista vertical — que levava a uma
// página de ranking diferente, com dados estáticos. Agora há um ranking só, numa
// rota só, e esta aba é o único acesso a ele.
const ABAS = [
  { rota: 'batalha', rotulo: 'Jogar', icone: '/icons/batalha.png' },
  { rota: 'ranking', rotulo: 'Ranking', icone: '/icons/ranking.png' },
  { rota: 'treino', rotulo: 'Treino', emoji: '🎯' },
]

const route = useRoute()
const abaAtiva = computed(() => route.name)
</script>

<template>
  <div class="tabs" role="tablist">
    <RouterLink
      v-for="aba in ABAS"
      :key="aba.rota"
      class="pixel tabs__btn"
      :class="{ 'tabs__btn--ativa': abaAtiva === aba.rota }"
      :to="{ name: aba.rota }"
      role="tab"
      :aria-selected="abaAtiva === aba.rota"
    >
      <img v-if="aba.icone" class="tabs__icone" :src="aba.icone" alt="" aria-hidden="true" />
      <span v-else class="tabs__emoji" aria-hidden="true">{{ aba.emoji }}</span>
      {{ aba.rotulo }}
    </RouterLink>
  </div>
</template>

<style scoped>
.tabs {
  width: 100%;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.tabs__btn {
  min-height: 52px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 6px 10px;
  border: 2px solid var(--border);
  border-radius: var(--radius);
  background: var(--bg-card);
  color: var(--text-muted);
  font-size: 9px;
  text-decoration: none;
  transition:
    color 0.15s ease,
    border-color 0.15s ease,
    transform 0.15s ease;
}

/* Mesma regra da barra inferior: altura fixa, largura livre. */
.tabs__icone {
  height: var(--tab-icon);
  width: auto;
  max-width: 45%;
  object-fit: contain;
  image-rendering: pixelated;
  opacity: 0.6;
  transition: opacity 0.15s ease;
  pointer-events: none;
}
.tabs__emoji { font-size: 22px; opacity: .65; }
.tabs__btn--ativa .tabs__emoji { opacity: 1; }

.tabs__btn--ativa {
  border-color: var(--yellow);
  color: var(--yellow);
}

.tabs__btn--ativa .tabs__icone {
  opacity: 1;
}

@media (hover: hover) {
  .tabs__btn:hover {
    border-color: var(--yellow);
    color: var(--yellow);
  }

  .tabs__btn:hover .tabs__icone {
    opacity: 1;
  }
}

.tabs__btn:active {
  transform: translateY(2px);
}

.tabs__btn:focus-visible {
  outline: 2px solid var(--unifil-gold);
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  .tabs__btn,
  .tabs__icone {
    transition: none;
  }

  .tabs__btn:active {
    transform: none;
  }
}
</style>
