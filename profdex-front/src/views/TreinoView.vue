<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import AppHeader from '../components/AppHeader.vue'
import BottomNav from '../components/BottomNav.vue'
import TopTabs from '../components/TopTabs.vue'
import { useProfessorsStore } from '../stores/professors.js'
import { sortearOponente } from '../data/treino.js'
const router = useRouter()
const professors = useProfessorsStore()

// O oponente é sorteado a cada treino entre os professores comuns (ver
// src/data/treino.js), então a chamada não promete um nome: diz que é sorteio.
const sorteando = ref(false)

async function practice() {
  if (sorteando.value) return
  sorteando.value = true
  try {
    // A lista quase sempre já está carregada (a Profdex a busca no login).
    // Sem ela, o sorteio cai no fallback e a arena abre igual.
    await professors.ensureLoaded().catch(() => {})
    router.push({ name: 'arena', params: { id: sortearOponente(professors.professors) } })
  } finally {
    sorteando.value = false
  }
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
        <h2 class="pixel">QUIZ DE TREINO</h2>
        <p>
          Pratique as perguntas do curso quantas vezes quiser, sem o cronômetro do operador. Não
          vale ponto nem QR de captura — as questões daqui não são as da bancada.
        </p>
        <button
          class="btn btn-primary pixel"
          type="button"
          @click="router.push({ name: 'quiz-treino' })"
        >
          COMEÇAR QUIZ
        </button>
      </section>
      <section>
        <h2 class="pixel">PRATICAR BATALHA</h2>
        <p>
          Teste golpes, tipos e estratégias contra um <strong>professor sorteado</strong> a
          cada treino. Nada aqui altera seu Elo, suas vitórias ou sua coleção.
        </p>
        <button
          class="btn btn-primary pixel"
          type="button"
          :disabled="sorteando"
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
