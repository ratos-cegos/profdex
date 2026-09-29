<script setup>
import { computed } from 'vue'
import LeaderboardPodium from './leaderboard/LeaderboardPodium.vue'
import LeaderboardRow from './leaderboard/LeaderboardRow.vue'

// Ranking: pódio dos três primeiros e lista do 4º em diante.
//
// Cada jogador chega como `{ id, nome, pontuacao, destaque, tier?, detalhe? }`.
// O pódio e a linha moram em componentes próprios (src/components/leaderboard/)
// — os dois juntos passavam de 500 linhas num arquivo só.
const props = defineProps({
  users: { type: Array, required: true },
  // Unidade da pontuação, mostrada ao lado de cada número ("pts", "capturas"…).
  unidade: { type: String, default: 'pts' },
})

const ordenados = computed(() => [...props.users].sort((a, b) => b.pontuacao - a.pontuacao))
const podio = computed(() => ordenados.value.slice(0, 3))
const demais = computed(() => ordenados.value.slice(3))

// A cascata de entrada para no 8º item: numa página de 25, o último não pode
// esperar dois segundos para aparecer.
const CASCATA_MAX = 8
</script>

<template>
  <section class="leaderboard" aria-label="Ranking">
    <LeaderboardPodium :users="podio" :unidade="unidade" />

    <ol v-if="demais.length" class="leaderboard__lista" :start="4" aria-label="Demais posições do ranking">
      <LeaderboardRow
        v-for="(user, index) in demais"
        :key="user.id"
        :user="user"
        :position="index + 4"
        :unidade="unidade"
        :style="{ '--linha-i': Math.min(index, CASCATA_MAX) }"
      />
    </ol>
  </section>
</template>

<style scoped>
.leaderboard {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.leaderboard__lista {
  display: flex;
  flex-direction: column;
  gap: 6px;
  list-style: none;
}
</style>
