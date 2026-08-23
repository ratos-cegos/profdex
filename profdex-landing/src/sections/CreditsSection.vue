<script setup>
import { credits } from '@/content/copy.js'
import { REPO_URL, UNIFIL_URL } from '@/config/links.js'
import SectionShell from '@/components/SectionShell.vue'
import { useReveal } from '@/composables/useReveal.js'

// Dois observadores, como em HowItWorksSection: a lista de pessoas entra em
// cascata, as duas caixas de baixo entram juntas.
const { el: teamEl } = useReveal()
const { el: metaEl } = useReveal()
</script>

<template>
  <!-- `id` no elemento externo: é o alvo das duas âncoras de Créditos (a da
       barra do topo e a do rodapé). O respiro contra a barra fixa vem do
       `scroll-padding-top` do html — ver styles/base.css. -->
  <div id="creditos">
    <SectionShell :kicker="credits.kicker" :title="credits.title">
      <template #lede>{{ credits.lede }}</template>

      <h3 class="credits__subtitle">{{ credits.teamTitle }}</h3>

      <ul ref="teamEl" class="credits__team reveal-stagger">
        <li
          v-for="(person, i) in credits.team"
          :key="person.name + person.role"
          class="credits__person gba-frame gba-frame--plain"
          :style="{ '--reveal-i': i }"
        >
          <!-- Nome em fonte de corpo, nunca em pixel: nome de pessoa não é
               rótulo de UI, e a Press Start 2P não aguenta nome comprido nem
               acento em caixa alta (ver a regra em styles/base.css). -->
          <p class="credits__name">{{ person.name }}</p>
          <p class="credits__role">{{ person.role }}</p>
          <div v-if="person.links?.length" class="credits__person-links">
            <a
              v-for="link in person.links"
              :key="link.url"
              class="credits__person-link"
              :href="link.url"
              target="_blank"
              rel="noopener noreferrer"
            >
              {{ link.label || link.url }}
            </a>
          </div>
        </li>
      </ul>

      <h3 class="credits__subtitle">{{ credits.advisorsTitle }}</h3>

      <ul class="credits__team">
        <li
          v-for="person in credits.advisors"
          :key="person.name + person.role"
          class="credits__person gba-frame gba-frame--plain"
        >
          <p class="credits__name">{{ person.name }}</p>
          <p class="credits__role">{{ person.role }}</p>
          <div v-if="person.links?.length" class="credits__person-links">
            <a
              v-for="link in person.links"
              :key="link.url"
              class="credits__person-link"
              :href="link.url"
              target="_blank"
              rel="noopener noreferrer"
            >
              {{ link.label || link.url }}
            </a>
          </div>
        </li>
      </ul>

      <div ref="metaEl" class="credits__meta reveal-steps">
        <article class="credits__card gba-frame gba-frame--deep">
          <h3 class="credits__subtitle">{{ credits.institutionTitle }}</h3>
          <p class="credits__card-name">{{ credits.institutionName }}</p>
          <p class="credits__card-desc">{{ credits.institutionDesc }}</p>
          <a :href="UNIFIL_URL" target="_blank" rel="noopener noreferrer">
            {{ credits.institutionLink }}
          </a>
        </article>

        <article class="credits__card gba-frame gba-frame--deep">
          <h3 class="credits__subtitle">{{ credits.projectTitle }}</h3>
          <p class="credits__card-desc">{{ credits.projectDesc }}</p>
          <a :href="REPO_URL" target="_blank" rel="noopener noreferrer">
            {{ credits.projectLink }}
          </a>
          <p class="credits__note">{{ credits.fontsNote }}</p>
        </article>
      </div>
    </SectionShell>
  </div>
</template>

<style scoped>
.credits__subtitle {
  font-family: var(--font-pixel);
  font-size: var(--fs-pixel-sm);
  color: var(--unifil-gold);
  line-height: 1.7;
}

.credits__team {
  list-style: none;
  display: grid;
  /* `auto-fit` + minmax: uma coluna no celular, duas no tablet, quatro no
     desktop — sem uma media query por degrau, e sem número mágico de colunas
     que quebra quando o time crescer ou encolher. */
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: var(--space-3);
}

.credits__person {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  padding: var(--space-3);
}

.credits__name {
  font-size: var(--fs-body);
  color: var(--text-primary);
  line-height: 1.4;
}

.credits__role {
  font-family: var(--font-pixel);
  font-size: var(--fs-body-sm);
  line-height: 1.7;
  color: var(--text-muted);
}

.credits__person-links {
  margin-top: var(--space-1);
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.credits__person-link {
  font-family: var(--font-pixel);
  font-size: var(--fs-body-sm);
  line-height: 1.7;
}

.credits__meta {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: var(--space-3);
}

.credits__card {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  align-items: flex-start;
}

.credits__card-name {
  font-family: var(--font-pixel);
  font-size: var(--fs-h3);
  color: var(--text-primary);
  line-height: 1.6;
}

.credits__card-desc {
  font-family: var(--font-pixel);
  font-size: var(--fs-body-sm);
  line-height: 1.7;
  color: var(--text-muted);
}

.credits__note {
  margin-top: var(--space-1);
  font-size: 13px;
  color: var(--text-muted);
}
</style>
