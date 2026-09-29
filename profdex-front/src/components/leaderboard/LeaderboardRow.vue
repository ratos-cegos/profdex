<script setup>
import PixelIcon from '../PixelIcon.vue'
import { TIER_ICONE } from '../../data/pixelIcons'
import { formatarPontos } from './formato'

// Uma posição do ranking, do 4º lugar para baixo.
//
// O nome tem a coluna do meio inteira e quebra linha quando precisa; o detalhe
// (tier, vitórias) fica numa linha própria EMBAIXO, e não dentro do mesmo span
// — antes os dois eram cortados juntos com reticências. A pontuação ocupa só a
// largura do próprio número, empilhada sobre a unidade, para não roubar espaço
// do nome.
defineProps({
  user: { type: Object, required: true },
  position: { type: Number, required: true },
  unidade: { type: String, required: true },
})
</script>

<template>
  <li class="linha" :class="{ 'linha--voce': user.destaque }">
    <span class="pixel linha__pos" aria-hidden="true">{{ position }}</span>

    <span class="linha__quem">
      <span class="linha__nome" :title="user.nomeCompleto" :aria-label="user.nomeCompleto">{{ user.nome }}</span>
      <span v-if="user.tier || user.detalhe" class="linha__detalhe">
        <PixelIcon v-if="TIER_ICONE[user.tier]" :nome="TIER_ICONE[user.tier]" :escala="1" />
        {{ [user.tier, user.detalhe].filter(Boolean).join(' · ') }}
      </span>
    </span>

    <span class="pixel linha__pts">
      <span>{{ formatarPontos(user.pontuacao) }}</span>
      <small>{{ unidade }}</small>
    </span>
  </li>
</template>

<style scoped>
.linha {
  display: grid;
  grid-template-columns: 2.25rem minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--space-2);
  min-height: 56px;
  padding: 10px 12px 10px 8px;
  border: 2px solid var(--surface-border);
  border-radius: 4px;
  background: var(--surface);
}

.linha__pos {
  color: var(--text-muted);
  font-size: 10px;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.linha__quem {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.linha__nome {
  color: var(--text-primary);
  font-size: 14px;
  font-weight: 700;
  line-height: 1.3;
  overflow-wrap: anywhere;
}

.linha__detalhe {
  display: flex;
  align-items: center;
  gap: 5px;
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 600;
}

.linha__pts {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
  color: var(--text-primary);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.linha__pts small {
  color: var(--unifil-gold);
  font-size: 7px;
}

/* A linha do próprio aluno: a moldura da Pokédex, a mesma que marca uma
   entrada capturada. */
.linha--voce {
  border-color: var(--bg-deep);
  background: color-mix(in srgb, var(--unifil-orange) 18%, var(--surface));
  box-shadow: var(--dex-bevel-sm);
}

.linha--voce .linha__pos {
  color: var(--unifil-gold);
}

@media (prefers-reduced-motion: no-preference) {
  .linha {
    animation: linha-entra var(--dur-base) steps(4, end) both;
    animation-delay: calc(var(--linha-i, 0) * 70ms + 900ms);
  }

  .linha--voce {
    animation:
      linha-entra var(--dur-base) steps(4, end) both,
      linha-pulsa 1.2s steps(2, end) 3;
    animation-delay:
      calc(var(--linha-i, 0) * 70ms + 900ms),
      calc(var(--linha-i, 0) * 70ms + 1300ms);
  }
}

@keyframes linha-entra {
  from {
    opacity: 0;
    transform: translateX(-8px);
  }
}

@keyframes linha-pulsa {
  50% {
    box-shadow:
      var(--dex-bevel-sm),
      0 0 0 2px var(--unifil-gold);
  }
}
</style>
