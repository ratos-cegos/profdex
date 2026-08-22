<script setup>
import { professors } from '@/content/copy.js'
import { CAPTURABLE, LOCKED } from '@/data/professors.js'
import SectionShell from '@/components/SectionShell.vue'
import ProfessorCard from '@/components/ProfessorCard.vue'
import { useReveal } from '@/composables/useReveal.js'

// A grade entra card a card, na ordem da Pokédex: é a leitura de uma coleção
// sendo preenchida, e é o argumento inteiro da seção.
const { el } = useReveal({ threshold: 0.1 })

// Esta seção mostra a GRADE da Pokédex, e só isso.
//
// Havia aqui um contador "3 de 14 com retrato" e um texto que dizia quantos
// professores já tinham arte. Era estado interno de produção exposto numa página
// pública de divulgação — e, pior, dizia ao aluno que o jogo está incompleto em
// vez de convidá-lo a completar a coleção. Os cards travados agora significam
// "ainda não desbloqueado".
</script>

<template>
  <SectionShell :kicker="professors.kicker" :title="professors.title">
    <template #lede>{{ professors.desc }}</template>

    <ul ref="el" class="grid reveal-stagger">
      <ProfessorCard
        v-for="(prof, i) in CAPTURABLE"
        :key="prof.slug"
        :professor="prof"
        :index="i"
      />
      <ProfessorCard
        v-for="(prof, i) in LOCKED"
        :key="`locked-${i}`"
        :professor="prof"
        :index="CAPTURABLE.length + i"
        locked
      />
    </ul>
  </SectionShell>
</template>

<style scoped>
.grid {
  display: grid;
  gap: var(--space-3);
  list-style: none;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
}

@media (min-width: 720px) {
  .grid {
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  }
}
</style>
