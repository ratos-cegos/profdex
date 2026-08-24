<script setup>
import { pvp } from '@/content/copy.js'
import SectionShell from '@/components/SectionShell.vue'
import TierBadge from '@/components/TierBadge.vue'
import { useReveal } from '@/composables/useReveal.js'

// Os cinco passos entram em cascata (a ordem deles É a leitura) e a escada de
// tiers entra depois, com as barras crescendo.
const { el: flowEl } = useReveal()
const { el: ladderEl } = useReveal({ threshold: 0.25 })

const pad = (n) => String(n).padStart(2, '0')
</script>

<template>
  <SectionShell :kicker="pvp.kicker" :title="pvp.title">
    <ol ref="flowEl" class="flow reveal-stagger">
      <li
        v-for="(step, i) in pvp.steps"
        :key="step.title"
        class="flow__step gba-frame gba-frame--plain"
        :style="{ '--reveal-i': i }"
      >
        <span class="step-num" aria-hidden="true">{{ pad(i + 1) }}</span>
        <h3 class="flow__title">{{ step.title }}</h3>
        <p class="flow__desc">{{ step.desc }}</p>
      </li>
    </ol>

    <div ref="ladderEl" class="ladder gba-frame">
      <h3 class="ladder__title">Tiers do ranqueado</h3>
      <ul class="ladder__tiers">
        <TierBadge
          v-for="(tier, i) in pvp.tiers"
          :key="tier.name"
          :tier="tier"
          :rank="i"
          :of="pvp.tiers.length"
        />
      </ul>
      <p class="ladder__note">{{ pvp.ratingNote }}</p>
      <p class="ladder__note">{{ pvp.antiTrade }}</p>
    </div>
  </SectionShell>
</template>

<style scoped>
.flow {
  display: grid;
  gap: var(--space-3);
  list-style: none;
  /* Cinco passos: uma coluna no celular, duas no tablet, cinco no desktop.
     `auto-fit` com mínimo de 190px chega lá sozinho, sem três breakpoints. */
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
}

.flow__step {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.flow__title {
  font-family: var(--font-pixel);
  font-size: 11px;
  line-height: 1.6;
}

.flow__desc {
  font-family: var(--font-pixel);
  font-size: var(--fs-body-sm);
  line-height: 1.7;
  color: var(--text-muted);
}

.ladder {
  margin-top: var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.ladder__title {
  font-family: var(--font-pixel);
  font-size: var(--fs-h3);
  color: var(--unifil-gold);
  line-height: 1.6;
}

.ladder__tiers {
  display: grid;
  gap: var(--space-2);
  list-style: none;
  grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
}

.ladder__note {
  font-family: var(--font-pixel);
  font-size: var(--fs-body-sm);
  line-height: 1.7;
  color: var(--text-muted);
  border-left: 3px solid var(--unifil-orange);
  padding-left: var(--space-3);
}
</style>
