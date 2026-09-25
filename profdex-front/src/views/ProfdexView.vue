<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import BottomNav from '../components/BottomNav.vue'
import EstadoErro from '../components/EstadoErro.vue'
import ProfCard from '../components/ProfCard.vue'
import VoucherSino from '../components/VoucherSino.vue'
import { useAuthStore } from '../stores/auth.js'
import { useProfessorsStore } from '../stores/professors.js'

const router = useRouter()
const auth = useAuthStore()
const store = useProfessorsStore()

// Sinaliza falha ao buscar a lista (ex.: back-end fora do ar). Sem isso, um erro
// de rede deixava a grade silenciosamente vazia — como se não houvesse nenhum
// professor cadastrado.
const loadError = ref(false)

async function load() {
  loadError.value = false
  try {
    await store.fetch()
  } catch {
    loadError.value = true
  }
}

onMounted(load)

// O `X/Y` conta só os COMUNS. O raro fica fora dos dois números (tarefa 15,
// decisão 14) — e nem chega nesta lista: o servidor filtra `rare: false` em
// `GET /professors`, então não há como esquecer o filtro aqui.
const captured = computed(() => store.professors.filter((p) => p.captured).length)
const total = computed(() => store.professors.length)

// ── Raros ───────────────────────────────────────────────────────────────────
// Contador PRÓPRIO, ao lado do da dex e nunca somado a ele.
//
// A rota devolve o professor cru; as flags de progresso são constantes aqui e
// não vêm do servidor: estar nesta lista JÁ significa ter capturado, e o limite
// é de um exemplar por conta, para sempre (decisão 7).
const raros = computed(() =>
  store.rares.owned.map((p) => ({
    ...p,
    discovered: true,
    captured: true,
    capturedCount: 1,
  })),
)
const rarosTotal = computed(() => store.rares.total)

/**
 * Quantos cards bloqueados desenhar. Eles são silhuetas genéricas: o servidor
 * não manda nome, tipo nem arte de raro não capturado, então não existe nada
 * para vazar — nem no DevTools.
 *
 * "Existe raro" muda o comportamento do aluno (ele volta para a bancada);
 * "existe um número desconhecido de raros" não muda nada.
 */
const rarosBloqueados = computed(() =>
  Math.max(0, rarosTotal.value - raros.value.length),
)

function goDetails(prof) {
  router.push({
    name: 'professor',
    params: { id: prof.id },
    state: { character: { ...prof } },
  })
}
</script>

<template>
  <div class="profdex">
    <header class="profdex__header">
      <div class="header__top">
        <h1 class="pixel header__title">PROF<span>DEX</span></h1>
        <div class="header__acoes">
          <!-- Só aparece quando existe voucher para mostrar (ver VoucherSino). -->
          <VoucherSino />
          <button class="profile-btn" type="button" aria-label="Abrir perfil" @click="router.push({ name: 'perfil' })">
            <span class="profile-btn__avatar" aria-hidden="true">{{ auth.user?.name?.[0]?.toUpperCase() ?? 'P' }}</span>
            <span>{{ auth.user?.name }}</span>
          </button>
        </div>
      </div>

      <div class="header__trainer">
        <span class="pixel" style="font-size: 8px; color: rgba(255,255,255,0.7)">TREINADOR</span>
        <span class="trainer-name">{{ auth.user?.name }}</span>
      </div>

      <div class="header__progress">
        <div class="progress-text pixel">
          {{ captured }}<span>/{{ total }}</span> capturados
        </div>
        <div class="progress-bar">
          <div
            class="progress-fill"
            :style="{ width: total ? `${(captured / total) * 100}%` : '0%' }"
          />
        </div>
      </div>
    </header>

    <main class="profdex__main page">
      <div v-if="store.loading" class="loading-state">
        <div class="spinner-lg" />
        <span class="pixel" style="font-size: 8px">Carregando...</span>
      </div>

      <EstadoErro v-else-if="loadError && !store.professors.length" message="Não foi possível carregar os professores. Verifique se o servidor está no ar." @retry="load" />

      <template v-else>
        <div class="grid">
          <ProfCard
            v-for="(prof, i) in store.professors"
            :key="prof.id"
            :professor="prof"
            :index="i"
            @details="goDetails"
          />
        </div>

        <!-- ✦ Raros. Seção separada e abaixo da coleção: eles não contam para
             completar a Profdex, então não podem dividir a grade com ela. -->
        <section v-if="rarosTotal" class="raros">
          <header class="raros__head">
            <h2 class="pixel raros__titulo">✦ RAROS</h2>
            <span class="pixel raros__contador">
              {{ raros.length }}<span>/{{ rarosTotal }}</span>
            </span>
          </header>

          <div class="grid">
            <ProfCard
              v-for="(prof, i) in raros"
              :key="prof.id"
              :professor="prof"
              :index="i"
              rare
              @details="goDetails"
            />

            <!-- Silhuetas. Sem nome, sem tipo, sem arte — é tudo o que o app
                 recebeu sobre eles, e por isso tudo o que ele pode mostrar. -->
            <div
              v-for="n in rarosBloqueados"
              :key="`bloqueado-${n}`"
              class="raro-bloqueado"
              aria-label="Professor raro ainda não capturado"
            >
              <span class="raro-bloqueado__marca" aria-hidden="true">✦</span>
              <span class="raro-bloqueado__texto">???</span>
            </div>
          </div>
        </section>
      </template>
    </main>

    <BottomNav />
  </div>
</template>

<style scoped>
.profdex {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.profdex__header {
  background: linear-gradient(160deg, var(--red-dark), var(--red));
  padding: 16px 20px 28px;
  position: relative;
  flex-shrink: 0;
}

.profdex__header::after {
  content: '';
  position: absolute;
  bottom: -1px;
  left: 0; right: 0;
  height: 20px;
  background: var(--bg);
  border-radius: 20px 20px 0 0;
}

.header__top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.header__title {
  font-size: 20px;
  color: white;
  text-shadow: 2px 2px 0 rgba(0,0,0,0.3);
}

.header__title span {
  color: var(--yellow);
}

/* Sino + perfil. `min-width: 0` para o nome do treinador continuar podendo
   encolher com reticências quando o sino aparece. */
.header__acoes {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.profile-btn {
  min-width: 44px;
  min-height: 44px;
  max-width: 52%;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: rgba(0,0,0,0.25);
  color: rgba(255,255,255,0.8);
  border: 1px solid rgba(255,255,255,0.2);
  border-radius: 20px;
  padding: 6px 10px;
  font-size: 11px;
  overflow: hidden;
}
.profile-btn > span:last-child { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.profile-btn__avatar { flex: 0 0 30px; width: 30px; height: 30px; display: grid; place-items: center; border-radius: 50%; background: var(--yellow); color: var(--bg-deep); font-weight: 900; }
.profile-btn:focus-visible { outline: 2px solid white; outline-offset: 2px;
}

.header__trainer {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-bottom: 14px;
}

.trainer-name {
  font-size: 16px;
  font-weight: 700;
  color: white;
}

.header__progress {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.progress-text {
  font-size: 9px;
  color: rgba(255,255,255,0.9);
}

.progress-text span {
  color: rgba(255,255,255,0.5);
}

.progress-bar {
  height: 6px;
  background: rgba(0,0,0,0.3);
  border-radius: 3px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: var(--yellow);
  border-radius: 3px;
  transition: width 0.5s ease;
}

/* O scroll vem da classe utilitária `.page`; repetir flex/overflow aqui só
   duplicava a regra. */
.profdex__main {
  padding: 20px 16px;
}

.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 40px 0;
}

.spinner-lg {
  width: 36px;
  height: 36px;
  border: 3px solid var(--border);
  border-top-color: var(--red);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

/* `auto-fill` + `minmax` mantém 3 colunas na largura típica do app e cai para 2
   em telas de 320px, onde `repeat(3, 1fr)` espremia os cards. */
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
  gap: 12px;
}

/* ── Raros ──────────────────────────────────────────────────────────────── */
.raros {
  margin-top: 28px;
  padding-top: 20px;
  /* Separador explícito: a seção é outra coleção, com outro contador. */
  border-top: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.raros__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}

.raros__titulo {
  margin: 0;
  font-size: 10px;
  color: var(--raro);
  letter-spacing: 0.08em;
}

.raros__contador {
  font-size: 9px;
  color: var(--raro);
}

.raros__contador span {
  color: var(--text-muted);
}

/* Silhueta do raro não capturado. Não há nome, tipo nem arte para mostrar —
   o servidor nunca os enviou. */
.raro-bloqueado {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 132px;
  border: 2px dashed color-mix(in srgb, var(--raro) 45%, transparent);
  border-radius: var(--radius-lg);
  background: color-mix(in srgb, var(--raro) 6%, var(--bg-card));
}

.raro-bloqueado__marca {
  font-size: 22px;
  color: color-mix(in srgb, var(--raro) 55%, transparent);
}

.raro-bloqueado__texto {
  font-family: var(--font-pixel);
  font-size: 8px;
  color: var(--text-muted);
}

.error-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 12px;
  padding: 48px 24px;
}

.error-state__icon {
  width: 48px;
  height: 48px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--red);
  color: white;
  font-size: 20px;
}

.error-state__title {
  font-size: 11px;
  color: var(--yellow);
}

.error-state__copy {
  max-width: 300px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-muted);
}

.error-state__retry {
  width: auto;
  margin-top: 4px;
}

</style>
