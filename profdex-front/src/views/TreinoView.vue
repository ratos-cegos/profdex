<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import AppHeader from '../components/AppHeader.vue'
import BottomNav from '../components/BottomNav.vue'
import TopTabs from '../components/TopTabs.vue'
import { useProfessorsStore } from '../stores/professors.js'
const router = useRouter()
const professors = useProfessorsStore()
const firstCaptured = computed(() => professors.professors.find((item) => item.captured))
function practice() {
  const target = firstCaptured.value ?? professors.professors[0]
  if (target) router.push({ name: 'arena', params: { id: target.slug ?? target.id } })
}
</script>
<template>
  <div class="training">
    <AppHeader title="TREINO" subtitle="ÁREA DE BATALHA"
      ><template #left><span aria-hidden="true">🎯</span></template></AppHeader
    >
    <main class="training__main page">
      <TopTabs />
      <section>
        <h2 class="pixel">PRATICAR BATALHA</h2>
        <p>Teste golpes, tipos e estratégias contra o bot sem alterar seu Elo.</p>
        <button
          class="btn btn-primary pixel"
          type="button"
          :disabled="!firstCaptured && !professors.professors.length"
          @click="practice"
        >
          INICIAR TREINO
        </button>
      </section>
      <section>
        <h2 class="pixel">GUIA DE TIPOS</h2>
        <p>Consulte a roda de vantagens, status e regras antes de entrar na arena.</p>
        <button
          class="btn btn-outline pixel"
          type="button"
          @click="router.push({ name: 'battle-guide' })"
        >
          ABRIR GUIA
        </button>
      </section>
    </main>
    <BottomNav />
  </div>
</template>
<style scoped>
.training {
  height: 100%;
  display: flex;
  flex-direction: column;
}
.training__main {
  display: grid;
  align-content: start;
  gap: 14px;
  padding: 16px;
}
.training section {
  display: grid;
  gap: 12px;
  padding: 18px;
  border: 2px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface);
}
.training h2 {
  color: var(--unifil-gold);
  font-size: 9px;
}
.training p {
  color: var(--text-muted);
  font-size: 13px;
  line-height: 1.55;
}
.training .pixel.btn {
  font-size: 7px;
}
</style>
