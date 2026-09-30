<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import AppHeader from '../components/AppHeader.vue'
import BottomNav from '../components/BottomNav.vue'
import TopTabs from '../components/TopTabs.vue'
import { useBattleStore } from '../stores/battle.js'
import { useCapturesStore } from '../stores/captures.js'
import { useProfessorsStore } from '../stores/professors.js'
import { sortearOponente } from '../data/treino.js'
const router = useRouter()
const battle = useBattleStore()
const captures = useCapturesStore()
const professors = useProfessorsStore()

// Quantos exemplares o aluno tem decide o que cada formato faz:
// - com exemplar, o treino é com o PRÓPRIO time, pela seleção do ranqueado,
//   contra um bot com o mesmo número de comuns sorteados (sala no servidor);
// - sem nenhum, o 1v1 continua com o boneco do Gustavo, só no aparelho — é o
//   treino de quem ainda não capturou ninguém.
const carregando = ref(true)
onMounted(() => {
  captures
    .ensureLoaded()
    .catch(() => {})
    .finally(() => (carregando.value = false))
})
const exemplares = computed(() => captures.captures.length)

/** Qual formato está abrindo agora (1 ou 3), para o botão dizer "PREPARANDO…". */
const abrindo = ref(null)
const erro = ref('')

async function treinar(tamanho) {
  if (abrindo.value) return
  erro.value = ''
  abrindo.value = tamanho
  try {
    if (tamanho === 1 && !exemplares.value) {
      // Sem exemplar: o boneco contra um comum sorteado (ver data/treino.js).
      await professors.ensureLoaded().catch(() => {})
      router.push({ name: 'arena', params: { id: sortearOponente(professors.professors) } })
      return
    }
    // O `battle:start` que chega em seguida leva à seleção de time.
    const ack = await battle.startTreino(tamanho)
    if (!ack.ok) erro.value = ack.message
  } finally {
    abrindo.value = null
  }
}

const podeTresContraTres = computed(() => exemplares.value >= 3)
const motivoDoTresContraTres = computed(() => {
  if (carregando.value || podeTresContraTres.value) return ''
  const n = exemplares.value
  return n
    ? `Você tem ${n} ${n === 1 ? 'exemplar' : 'exemplares'}; o 3 contra 3 pede 3.`
    : 'Capture 3 professores para montar um time de 3.'
})
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
        <p v-if="exemplares || carregando">
          Monte o time com os seus exemplares e enfrente um <strong>bot</strong> com o mesmo
          número de professores comuns, sorteados. Nada aqui altera seu Elo, suas vitórias ou
          sua coleção.
        </p>
        <p v-else>
          Você ainda não capturou ninguém: no 1 contra 1 você joga com o Prof. Gustavo contra um
          professor sorteado. Nada aqui altera seu Elo, suas vitórias ou sua coleção.
        </p>

        <div class="formatos" role="group" aria-label="Formato do treino">
          <button
            class="btn btn-primary pixel formato"
            type="button"
            :disabled="!!abrindo || carregando"
            @click="treinar(1)"
          >
            {{ abrindo === 1 ? 'PREPARANDO…' : '1 CONTRA 1' }}
          </button>
          <button
            class="btn btn-primary pixel formato"
            type="button"
            :disabled="!!abrindo || carregando || !podeTresContraTres"
            :aria-describedby="motivoDoTresContraTres ? 'motivo-3v3' : undefined"
            @click="treinar(3)"
          >
            {{ abrindo === 3 ? 'PREPARANDO…' : '3 CONTRA 3' }}
          </button>
        </div>
        <p v-if="motivoDoTresContraTres" id="motivo-3v3" class="formatos__motivo">
          {{ motivoDoTresContraTres }}
        </p>
        <p v-if="erro" class="formatos__erro" role="alert">{{ erro }}</p>
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
/* Os dois formatos lado a lado: a escolha é uma só, entre dois iguais. */
.formatos {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.formato {
  min-height: 44px;
  touch-action: manipulation;
}
.formato:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.training .formatos__motivo {
  font-size: 12px;
}
.training .formatos__erro {
  color: var(--error);
  font-size: 12px;
}
</style>
