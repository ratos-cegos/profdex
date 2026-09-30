<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, useTemplateRef } from 'vue'
import { useRouter } from 'vue-router'
import BottomNav from '../components/BottomNav.vue'
import EstadoErro from '../components/EstadoErro.vue'
import ProfCard from '../components/ProfCard.vue'
import VoucherSino from '../components/VoucherSino.vue'
import { useAuthStore } from '../stores/auth.js'
import { useBattleStore } from '../stores/battle.js'
import { useProfessorsStore } from '../stores/professors.js'

const router = useRouter()
const auth = useAuthStore()
const store = useProfessorsStore()
const battle = useBattleStore()

// Sinaliza falha ao buscar a lista (ex.: back-end fora do ar). Sem isso, um erro
// de rede deixava a grade silenciosamente vazia — como se não houvesse nenhum
// professor cadastrado.
const loadError = ref(false)
const main = useTemplateRef('main')

/**
 * `ensureLoaded` e não `fetch`: voltar da ficha de um professor remontava esta
 * view e recarregava a lista inteira, com spinner e a grade sumindo por um
 * instante. Era isso que fazia a volta parecer outra tela, e não a coleção de
 * onde o aluno tinha acabado de sair.
 *
 * O botão de "tentar de novo" continua chamando `fetch` — recarregar é o que
 * tentar de novo significa.
 */
async function load(recarregar = false) {
  loadError.value = false
  try {
    await (recarregar ? store.fetch() : store.ensureLoaded())
  } catch {
    loadError.value = true
  }
}

/**
 * Voltar ao app depois de um tempo com a tela apagada REANCORA o relógio.
 *
 * A contagem da abertura corre sobre um relógio monotônico ancorado na última
 * resposta do servidor, e em alguns navegadores esse relógio congela junto com
 * a aba. Sem isto, quem guarda o celular às 18h30 e volta às 19h30 leria "abre
 * em 25min" com a raid já aberta.
 *
 * Só pede quando há card na tela para corrigir: a grande maioria dos alunos
 * nunca fecha a Profdex, e não faz sentido uma requisição a cada vez que eles
 * trocam de app.
 */
function aoVoltarParaOApp() {
  if (document.visibilityState !== 'visible') return
  if (!raid.value.unlocked || raid.value.captured) return
  store.fetchRaid().catch(() => {})
}

onMounted(async () => {
  relogio = setInterval(() => (agora.value = store.agoraDoServidor()), 1000)
  document.addEventListener('visibilitychange', aoVoltarParaOApp)
  await load()
  // Depois da grade existir: `scrollTop` num elemento ainda vazio é engolido em
  // silêncio, e a coleção voltaria ao topo mesmo assim.
  await nextTick()
  if (main.value) main.value.scrollTop = store.dexScroll
  // Consome: só o retorno IMEDIATO da ficha restaura a posição. Chegar aqui
  // pela barra inferior, vindo de outra aba, começa do topo como sempre.
  store.dexScroll = 0
})

onUnmounted(() => {
  if (relogio) clearInterval(relogio)
  relogio = null
  document.removeEventListener('visibilitychange', aoVoltarParaOApp)
})

// ── Contagem ────────────────────────────────────────────────────────────────
// O `X/Y` conta os COMUNS mais os RAROS, mais o lendário — e este só entra
// depois que a raid destrava. É o que faz a barra parar a um passo do fim
// (`48/49`) no instante em que o aluno fecha a coleção — o gancho da raid
// inteira — e é o que torna verdade a frase "capturei o lendário e completei a
// Profdex".
//
// Os raros entram porque é essa a conta que o SERVIDOR faz para destravar a
// raid (`RaidService.dexProgress`). Contar só os comuns aqui deixaria o aluno
// lendo `18/18` sem raid nenhuma na tela e sem nada explicando por quê.
//
// Eles vêm de `rares`, não de `professors`: o servidor nunca manda raro não
// capturado, então o total do denominador é o único número que atravessa a
// fronteira sobre os que faltam — e `owned.length` já é a contagem de
// DISTINTOS (um exemplar por raro, por conta).
//
// Antes de destravar, nada muda: quem não chegou lá vê o `X/Y` de sempre e não
// tem como saber que existe uma entrada a mais.
const captured = computed(
  () =>
    store.professors.filter((p) => p.captured).length +
    store.rares.owned.length +
    (store.raid.captured ? 1 : 0),
)
const total = computed(
  () =>
    store.professors.length +
    store.rares.total +
    (store.raid.unlocked ? 1 : 0),
)

// ── Raid do lendário ────────────────────────────────────────────────────────
const raid = computed(() => store.raid)

// Relógio vivo para o cooldown e para a abertura. Sem ele, quem perde e fica na
// tela vê "aguarde 30 min" congelado e precisa dar F5 para descobrir que já
// pode tentar.
//
// É o relógio do SERVIDOR (ver `agoraDoServidor` na store): os dois prazos são
// timestamps dele, e comparar com a hora do aparelho deixaria a tela à mercê de
// um relógio adiantado — de propósito ou não.
const agora = ref(store.agoraDoServidor())
let relogio = null

const esperaRestante = computed(() => {
  if (!raid.value.cooldownUntil) return 0
  return Math.max(0, raid.value.cooldownUntil - agora.value)
})

const esperaTexto = computed(() => {
  const ms = esperaRestante.value
  if (ms <= 0) return ''
  const minutos = Math.floor(ms / 60000)
  const segundos = Math.floor((ms % 60000) / 1000)
  if (minutos >= 1) return `${minutos}min ${String(segundos).padStart(2, '0')}s`
  return `${segundos}s`
})

// ── A hora de abrir ─────────────────────────────────────────────────────────
// A raid tem uma trava de HORÁRIO além da coleção: quem fecha a Profdex de
// tarde vê o card com a contagem, e o botão só existe depois da hora marcada
// (`raid.opens_at`, no painel). Quem decide é o servidor — isto aqui é a mesma
// verdade desenhada, para o aluno não descobrir a trava apertando o botão.
//
// O mesmo relógio do cooldown move as duas contagens.
const abreEm = computed(() => raid.value.opensAt ?? 0)
const aberturaRestante = computed(() => Math.max(0, abreEm.value - agora.value))
const aberto = computed(() => aberturaRestante.value <= 0)

// A hora vem ESCRITA do servidor (`19H`, ou `01/10 19H` quando não é hoje).
// Formatar aqui a partir de `opensAt` deixaria o texto à mercê do fuso do
// aparelho: quem trocasse o fuso no celular leria "abre às 22h" e iria embora.
const horaDeAbrir = computed(() =>
  (raid.value.opensAtLabel ?? '').toUpperCase(),
)

const aberturaTexto = computed(() => {
  const ms = aberturaRestante.value
  if (ms <= 0) return ''
  // Na última hora a contagem fica viva, ao minuto: é ela que junta a fila na
  // frente do estande antes de abrir. Antes disso, a hora marcada — um relógio
  // de 4h20min parado na tela não diz nada a quem vai embora e volta.
  if (ms >= 3_600_000) return `ABRE ${horaDeAbrir.value}`
  const minutos = Math.floor(ms / 60000)
  return minutos >= 1
    ? `ABRE EM ${minutos}MIN`
    : `ABRE EM ${Math.floor(ms / 1000)}S`
})

const podeDesafiar = computed(
  () =>
    raid.value.unlocked &&
    !raid.value.captured &&
    aberto.value &&
    esperaRestante.value <= 0,
)

const iniciando = ref(false)

async function desafiarLendario() {
  if (!podeDesafiar.value || iniciando.value) return
  iniciando.value = true
  try {
    const ack = await battle.startRaid()
    // Sucesso não navega daqui: o `battle:start` que chega pelo socket é quem
    // empurra a tela para a seleção de time, como no PvP. Navegar aqui também
    // criaria uma corrida entre os dois caminhos.
    // A recusa (cooldown, dex incompleta…) aparece no aviso pixel do App.vue,
    // disparado pelo próprio store com o `code` da raid.
    if (!ack.ok) {
      // O servidor é a autoridade sobre cooldown e elegibilidade: se ele
      // recusou, o estado local está velho. Reler corrige o botão na hora.
      await store.fetchRaid().catch(() => {})
    }
  } finally {
    iniciando.value = false
  }
}

// ── Raros ───────────────────────────────────────────────────────────────────
// Contador próprio, que é um RECORTE do da dex e não uma conta paralela: os
// raros também estão no `X/Y` lá de cima. Ele fica porque "faltam 2 raros" é a
// informação que manda o aluno de volta para a bancada, e o `X/Y` sozinho não
// diz de que tipo é o que falta.
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
  // Antes do push: a view é desmontada na transição e o elemento some junto.
  // Quem estava vendo o 40º professor não pode recomeçar do 1º por ter aberto
  // uma ficha.
  store.dexScroll = main.value?.scrollTop ?? 0
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

    <main ref="main" class="profdex__main page">
      <div v-if="store.loading" class="loading-state">
        <div class="spinner-lg" />
        <span class="pixel" style="font-size: 8px">Carregando...</span>
      </div>

      <EstadoErro v-else-if="loadError && !store.professors.length" message="Não foi possível carregar os professores. Verifique se o servidor está no ar." @retry="load(true)" />

      <template v-else>
        <div class="grid">
          <ProfCard
            v-for="(prof, i) in store.professors"
            :key="prof.id"
            :professor="prof"
            :index="i"
            @details="goDetails"
          />

          <!-- ⚡ O LENDÁRIO, na posição Y+1 da própria grade — ele faz parte
               da coleção, diferente do raro, que tem seção separada abaixo.
               Só existe aqui depois de a raid destravar. -->
          <template v-if="raid.unlocked">
            <!-- Capturado: card normal, com selo. A raid acabou para ele. -->
            <ProfCard
              v-if="raid.captured && raid.legendary"
              :key="raid.legendary.id"
              :professor="{
                ...raid.legendary,
                discovered: true,
                captured: true,
                capturedCount: 1,
              }"
              :index="store.professors.length"
              legendary
              @details="goDetails"
            />

            <!-- Ainda não: silhueta com `???` piscando colorido. Não há nome,
                 tipo nem arte para mostrar — o servidor nunca os enviou. -->
            <div
              v-else
              class="lendario"
              :aria-label="
                aberto
                  ? 'Professor lendário — desafie a raid'
                  : `Professor lendário — a raid abre: ${raid.opensAtLabel}`
              "
            >
              <span class="lendario__raio" aria-hidden="true">⚡</span>
              <span class="lendario__texto">???</span>

              <button
                class="lendario__botao"
                type="button"
                :disabled="!podeDesafiar || iniciando"
                @click="desafiarLendario"
              >
                <template v-if="iniciando">ABRINDO…</template>
                <!-- A abertura vem antes do cooldown porque é trava de todo
                     mundo: antes da hora não há tentativa para esperar. -->
                <template v-else-if="!aberto">{{ aberturaTexto }}</template>
                <template v-else-if="esperaRestante > 0">{{ esperaTexto }}</template>
                <template v-else>CAPTURAR</template>
              </button>
            </div>
          </template>
        </div>

        <!-- ✦ Raros. Contam para completar a Profdex, mas ficam em seção
             separada e abaixo da coleção: a arte do raro merece destaque, e o
             servidor não manda os não capturados — a grade de cima sabe desenhar
             um card, não uma ausência. -->
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

/* ── Lendário ───────────────────────────────────────────────────────────────
   Silhueta que PISCA COLORIDO: o brilho atravessa a roda de cores em vez de
   pulsar numa cor só, que é o que diferencia "lendário" de "bloqueado" à
   distância, sem precisar de legenda.

   O card fica na grade principal e por isso herda a altura dos ProfCard. */
.lendario {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 132px;
  padding: 8px;
  border-radius: var(--radius-lg);
  border: 2px solid transparent;
  background:
    linear-gradient(var(--bg-card), var(--bg-card)) padding-box,
    linear-gradient(120deg, #ffd166, #ef476f, #7b61ff, #06d6a0, #ffd166)
      border-box;
  background-size: auto, 300% 300%;
  animation: lendario-borda 4s linear infinite;
}

/* `prefers-reduced-motion` desliga a animação: um card piscando sem parar no
   meio da coleção é exatamente o tipo de movimento que a preferência existe
   para cortar. A borda colorida FICA — ela é a informação, o movimento não. */
@media (prefers-reduced-motion: reduce) {
  .lendario { animation: none; }
  .lendario__raio { animation: none; }
}

@keyframes lendario-borda {
  0% { background-position: auto, 0% 50%; }
  50% { background-position: auto, 100% 50%; }
  100% { background-position: auto, 0% 50%; }
}

.lendario__raio {
  font-size: 22px;
  animation: lendario-brilho 1.6s ease-in-out infinite;
}

@keyframes lendario-brilho {
  0%, 100% { opacity: 0.55; transform: scale(1); }
  50% { opacity: 1; transform: scale(1.15); }
}

.lendario__texto {
  font-family: var(--font-pixel);
  font-size: 9px;
  color: var(--text-muted);
  letter-spacing: 0.1em;
}

.lendario__botao {
  width: 100%;
  min-height: 28px;
  padding: 5px 6px;
  border: none;
  border-radius: 8px;
  font-family: var(--font-pixel);
  font-size: 7px;
  letter-spacing: 0.06em;
  color: var(--bg-deep);
  background: var(--yellow);
  cursor: pointer;
}

/* Desabilitado é o estado do COOLDOWN, e ele mostra o relógio correndo em vez
   de sumir: o aluno precisa saber que vai poder de novo, e quando. */
.lendario__botao:disabled {
  background: var(--border);
  color: var(--text-muted);
  cursor: not-allowed;
}

.lendario__botao:focus-visible {
  outline: 2px solid white;
  outline-offset: 2px;
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
