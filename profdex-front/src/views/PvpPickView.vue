<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useBattleStore } from '../stores/battle'
import { useCapturesStore } from '../stores/captures'
import { useProfessorsStore } from '../stores/professors'
import ProfessorFace from '../components/ProfessorFace.vue'
import TypeBadges from '../components/TypeBadges.vue'
import StarRating from '../components/StarRating.vue'

// A tela cobre as DUAS fases da preparação:
//
// 1. `picking` — monte um time de ATÉ 3 exemplares, às cegas. Navegação em dois
//    níveis (professor → exemplar), porque o mesmo professor pode estar na
//    coleção em combinações de tipos diferentes, cada uma com o seu deck. A
//    faixa de slots no topo é o que comunica "são até 3" e a ordem, que vira o
//    fallback de tudo depois.
// 2. `preview` — os dois times são revelados e cada um escolhe o LEAD. O
//    preview só acontece DEPOIS de os dois confirmarem: é isso que impede que
//    ele devolva o counter-pick que a seleção às cegas existe para eliminar.
//
// O rival sempre sabe QUE você agiu, nunca O QUÊ.
const router = useRouter()
const battle = useBattleStore()
const professors = useProfessorsStore()
const captures = useCapturesStore()

const MAX_TIME = 3

const now = ref(Date.now())
let clock = null

// Etapa 2 da fase 1: professor aberto para escolher entre os exemplares dele.
const aberto = ref(null)
// O time em montagem, na ordem dos slots.
const time = ref([])
const enviando = ref(false)
const saindo = ref(false)
// O lead que VOCÊ escolheu, para o card continuar aceso enquanto o rival
// decide. Só local: num F5 do preview o destaque some, mas a escolha já está
// no servidor e os cards seguem travados.
const leadEscolhido = ref(null)

onMounted(() => {
  battle.connect() // idempotente; cobre refresh no meio da seleção (resync)
  if (!professors.professors.length) professors.fetch().catch(() => {})
  captures.ensureLoaded().catch(() => {})
  clock = setInterval(() => {
    now.value = Date.now()
  }, 500)
  // Sem batalha em andamento (deep link, F5 sem sessão de sala): volta ao lobby.
  if (!battle.pvp) router.replace({ name: 'batalha' })
})

onUnmounted(() => clock && clearInterval(clock))

// Só professores com pelo menos um exemplar — a lista sai das capturas, não da
// dex, porque é o exemplar que entra na arena.
//
// Os raros possuídos entram junto: fora da contagem da dex eles não estão em
// `professors`, mas em batalha são exemplares como qualquer outro (tarefa 15,
// decisão 13). O servidor já os aceita no time; sem eles aqui, o aluno que
// pegou um raro não tinha como escolhê-lo.
const capturados = computed(() =>
  [...professors.professors, ...professors.rares.owned]
    .map((p) => ({ ...p, exemplares: captures.byProfessorId(p.id) }))
    .filter((p) => p.exemplares.length > 0),
)

const grupos = computed(() => (aberto.value ? captures.groupedByVariant(aberto.value.id) : []))

// Quantos slots dá para preencher. O time sai dos EXEMPLARES — dois do mesmo
// professor contam dois —, então quem tem menos de 3 não tem como encher a
// faixa, e os slots que sobram aparecem TRANCADOS em vez de vazios: vazio
// sugere "falta escolher", e o aluno ficava procurando o que pôr ali.
// Enquanto as listas não chegaram nada tranca: "vazio" ainda não quer dizer
// "não tem".
const exemplaresDisponiveis = computed(() =>
  capturados.value.reduce((total, p) => total + p.exemplares.length, 0),
)
const slotsDisponiveis = computed(() => {
  if (!exemplaresDisponiveis.value && (captures.loading || professors.loading)) return MAX_TIME
  return Math.min(MAX_TIME, exemplaresDisponiveis.value)
})
const slotTrancado = (i) => i > slotsDisponiveis.value

const secondsLeft = computed(() => {
  const deadline = battle.pvp?.pickDeadline
  if (!deadline) return 0
  return Math.max(0, Math.ceil((deadline - now.value) / 1000))
})

// Os tipos de cada exemplar, não os do professor: um Eron de IA e um de
// Arquitetura + IA aparecem com badges diferentes.
function typesOf(professor) {
  const combinacoes = new Set()
  for (const exemplar of professor.exemplares) {
    for (const type of exemplar.types) combinacoes.add(type)
  }
  // Ids, não objetos: quem resolve rótulo e cor é o TypeBadges.
  return [...combinacoes]
}

const emPreview = computed(() => battle.pvp?.phase === 'preview')
const timeCheio = computed(() => time.value.length >= slotsDisponiveis.value)
const jaNoTime = (id) => time.value.some((e) => e.id === id)

// Sem nada para escolher, a tela precisa dizer isso — e dar saída. Enquanto a
// lista não chegou, "vazio" ainda não quer dizer "não tem".
const semExemplar = computed(() => !captures.loading && !capturados.value.length)

/**
 * Sai da seleção sem punição: o servidor cancela a sala para os dois e devolve
 * ambos ao lobby. Antes daqui, quem caísse numa seleção que não podia (ou não
 * queria) concluir só saía pelo timeout de 60s — com os dois presos.
 */
async function sairDaSelecao() {
  if (saindo.value) return
  saindo.value = true
  try {
    const ack = await battle.leaveSelection()
    // Recusado (a batalha já começou, ou a sala já não existe): a tela não pode
    // ficar presa aqui de qualquer jeito.
    if (!ack.ok) {
      battle.leaveBattle()
      router.replace({ name: 'batalha' })
    }
    // No caminho feliz quem navega é o `battle:cancelled` do servidor, que
    // precisa chegar aos DOIS.
  } finally {
    saindo.value = false
  }
}

function abrir(professor) {
  if (battle.pvp?.youPicked) return
  aberto.value = professor
}

/**
 * Um toque adiciona ao próximo slot livre; outro toque remove. A trava é por
 * exemplar (`id`), não por professor: dois exemplares do mesmo professor são
 * personagens diferentes e podem andar juntos.
 */
function alternar(exemplar, professor) {
  if (battle.pvp?.youPicked) return
  if (jaNoTime(exemplar.id)) {
    time.value = time.value.filter((e) => e.id !== exemplar.id)
    return
  }
  if (timeCheio.value) return
  time.value = [...time.value, { ...exemplar, professor }]
  // Escolhido o exemplar, volta sozinho à lista de professores para o próximo
  // slot — antes era preciso tocar em "Trocar" a cada escolha.
  aberto.value = null
}

function removerSlot(index) {
  if (battle.pvp?.youPicked) return
  time.value = time.value.filter((_, i) => i !== index)
}

async function confirmarTime() {
  if (!time.value.length || battle.pvp?.youPicked || enviando.value) return
  enviando.value = true
  try {
    await battle.pickTeam(time.value.map((e) => e.id))
  } finally {
    enviando.value = false
  }
}

async function escolherLead(membro) {
  if (battle.pvp?.youPicked || enviando.value) return
  enviando.value = true
  try {
    const ack = await battle.chooseLead(membro.captureId)
    if (ack.ok) leadEscolhido.value = membro.captureId
  } finally {
    enviando.value = false
  }
}
</script>

<template>
  <div v-if="battle.pvp" class="pick">
    <header class="pick__header">
      <div>
        <span class="pixel pick__eyebrow">BATALHA CONTRA</span>
        <h1 class="pixel pick__title">{{ battle.pvp.opponent.name }}</h1>
      </div>
      <div class="pick__header-acoes">
        <span class="pixel pick__timer" :class="{ 'pick__timer--low': secondsLeft <= 10 }">
          {{ secondsLeft }}s
        </span>
        <!-- Saída explícita: a preparação não pontua nem consome cooldown, e
             ficar preso nela até o timeout de 60s trava os DOIS jogadores. -->
        <button class="pick__sair" type="button" :disabled="saindo" @click="sairDaSelecao">
          Sair da seleção
        </button>
      </div>
    </header>

    <!-- A faixa é o que diz, sem texto, "são até 3 e esta é a ordem". A ordem
         importa: ela é o fallback do lead e da entrada após um nocaute. -->
    <div v-if="!emPreview" class="slots">
      <button
        v-for="i in MAX_TIME"
        :key="i"
        class="slot"
        :class="{
          'slot--cheio': time[i - 1],
          'slot--proximo': time.length === i - 1 && !slotTrancado(i),
          'slot--trancado': slotTrancado(i),
        }"
        type="button"
        :disabled="!time[i - 1] || battle.pvp.youPicked"
        :aria-label="
          time[i - 1]
            ? `Remover ${time[i - 1].professor.name} do time`
            : slotTrancado(i)
              ? `Slot ${i} trancado — capture mais professores para usar`
              : `Slot ${i} vazio`
        "
        @click="removerSlot(i - 1)"
      >
        <template v-if="time[i - 1]">
          <ProfessorFace class="slot__face" :professor="time[i - 1].professor" />
          <span class="slot__remover" aria-hidden="true">✕</span>
        </template>
        <span v-else-if="slotTrancado(i)" class="slot__cadeado" aria-hidden="true">🔒</span>
        <span v-else class="pixel slot__vazio">{{ i }}</span>
      </button>

      <button
        class="pixel slots__confirmar"
        :class="{ 'slots__confirmar--pronto': time.length && timeCheio && !battle.pvp.youPicked }"
        type="button"
        :disabled="!time.length || battle.pvp.youPicked || enviando"
        @click="confirmarTime"
      >
        {{ battle.pvp.youPicked ? 'CONFIRMADO' : `CONFIRMAR (${time.length}/${slotsDisponiveis})` }}
      </button>

      <p v-if="!semExemplar && slotsDisponiveis < MAX_TIME" class="slots__aviso">
        Você tem {{ slotsDisponiveis }}
        {{ slotsDisponiveis === 1 ? 'professor capturado' : 'professores capturados' }}, então seu
        time vai até {{ slotsDisponiveis }}. Os slots com 🔒 abrem quando você capturar mais.
      </p>
    </div>

    <main class="pick__main page">
      <!-- ── Fase 2: team preview + escolha do lead ───────────────────────── -->
      <template v-if="emPreview">
        <!-- A chamada é o centro da tela: um parágrafo cinza pedindo a escolha
             passava batido, e o aluno ficava olhando os dois times sem saber
             que o próximo toque era dele. -->
        <header class="lead-chamada" :class="{ 'lead-chamada--feita': battle.pvp.youPicked }">
          <h2 class="pixel lead-chamada__titulo">
            {{ battle.pvp.youPicked ? 'PRIMEIRO ESCOLHIDO' : 'SELECIONE O PRIMEIRO' }}
          </h2>
          <p class="lead-chamada__sub">
            <template v-if="battle.pvp.youPicked">Pronto. Agora é esperar o rival.</template>
            <template v-else>
              Toque no professor do seu time que começa a batalha. O rival escolhe ao mesmo tempo,
              sem ver o seu.
            </template>
          </p>
        </header>

        <section class="preview">
          <h2 class="pixel preview__titulo">SEU TIME</h2>
          <ul class="preview__lista">
            <li v-for="m in battle.pvp.you?.team ?? []" :key="m.captureId">
              <button
                class="lead-card"
                :class="{
                  'lead-card--escolhivel': !battle.pvp.youPicked,
                  'lead-card--escolhido': leadEscolhido === m.captureId,
                }"
                type="button"
                :disabled="battle.pvp.youPicked || enviando"
                @click="escolherLead(m)"
              >
                <ProfessorFace class="lead-card__face" :professor="m.professor" />
                <span class="pixel lead-card__nome">{{ m.professor.name }}</span>
                <TypeBadges :types="m.types" />
                <span class="pixel lead-card__cta">
                  {{ leadEscolhido === m.captureId ? '1º ✓' : 'ENTRA 1º' }}
                </span>
              </button>
            </li>
          </ul>
        </section>

        <section class="preview preview--rival">
          <h2 class="pixel preview__titulo">TIME DE {{ battle.pvp.foe?.name?.toUpperCase() }}</h2>
          <ul class="preview__lista">
            <li v-for="(m, i) in battle.pvp.foe?.team ?? []" :key="i" class="preview__foe">
              <ProfessorFace class="lead-card__face" :professor="m.professor" />
              <span class="pixel lead-card__nome">{{ m.professor.name }}</span>
              <TypeBadges :types="m.types" />
            </li>
          </ul>
        </section>
      </template>

      <!-- ── Fase 1, etapa 1: qual professor ──────────────────────────────── -->
      <template v-else-if="!aberto">
        <p v-if="!semExemplar" class="pick__hint">
          Monte seu time com até {{ slotsDisponiveis }}
          {{ slotsDisponiveis === 1 ? 'professor' : 'professores' }}. Quanto mais levar, mais
          chances de virar o jogo — o rival não vê sua escolha até os dois confirmarem.
        </p>

        <p v-if="captures.loading && !capturados.length" class="pick__empty">
          Carregando seus professores…
        </p>

        <!-- Sem exemplar não há o que confirmar: em vez de uma lista vazia sem
             explicação, o estado é dito e a saída fica à mão. -->
        <section v-else-if="semExemplar" class="pick__vazio">
          <p class="pixel pick__vazio-titulo">SEM PROFESSORES</p>
          <p class="pick__empty">
            Você ainda não capturou nenhum professor — capture um pela tela de Scanear para poder
            batalhar.
          </p>
          <button
            class="pixel pick__vazio-btn"
            type="button"
            :disabled="saindo"
            @click="sairDaSelecao"
          >
            SAIR DA SELEÇÃO
          </button>
        </section>

        <ul v-else class="pick__grid">
          <li v-for="professor in capturados" :key="professor.id">
            <button
              class="pick-card"
              type="button"
              :disabled="battle.pvp.youPicked"
              @click="abrir(professor)"
            >
              <span class="pick-card__avatar">
                <ProfessorFace :professor="professor" />
                <span v-if="professor.exemplares.length > 1" class="pick-card__count pixel">
                  ×{{ professor.exemplares.length }}
                </span>
              </span>
              <span class="pixel pick-card__name">{{ professor.name }}</span>
              <TypeBadges :types="typesOf(professor)" />
            </button>
          </li>
        </ul>
      </template>

      <!-- Etapa 2: qual exemplar daquele professor (tipos + deck) -->
      <template v-else>
        <div class="pick__subhead">
          <button class="pick__back pixel" type="button" @click="aberto = null">← Trocar</button>
          <span class="pixel pick__subtitle">{{ aberto.name }}</span>
        </div>

        <p class="pick__hint">
          Cada exemplar tem tipos e golpes próprios, sorteados quando você o capturou.
        </p>

        <div v-for="grupo in grupos" :key="grupo.typeKey" class="exemplares">
          <TypeBadges :types="grupo.types" align="start" />

          <button
            v-for="(exemplar, i) in grupo.items"
            :key="exemplar.id"
            class="exemplar-card"
            :class="{ 'exemplar-card--no-time': jaNoTime(exemplar.id) }"
            type="button"
            :disabled="battle.pvp.youPicked || (timeCheio && !jaNoTime(exemplar.id))"
            @click="alternar(exemplar, aberto)"
          >
            <span class="exemplar-card__head">
              <span class="pixel exemplar-card__idx">{{ i + 1 }}</span>
              <span class="exemplar-card__hint">
                {{ jaNoTime(exemplar.id) ? 'No time · tocar para tirar' : 'Levar para a arena' }}
              </span>
              <StarRating class="exemplar-card__stars" :value="exemplar.stars" />
            </span>
            <span class="exemplar-card__moves">
              <span v-for="m in exemplar.moves" :key="m.id" class="exemplar-card__move">
                {{ m.name }}<template v-if="m.power"> · {{ m.power }}</template>
              </span>
            </span>
          </button>
        </div>
      </template>

      <div class="pick__status">
        <p v-if="battle.pvp.youPicked" class="pixel pick__waiting">
          {{ battle.pvp.foePicked ? 'COMEÇANDO…' : 'AGUARDANDO O RIVAL…' }}
        </p>
        <p v-else-if="battle.pvp.foePicked" class="pick__foe-picked">
          {{ battle.pvp.opponent.name }} já escolheu!
        </p>
      </div>
    </main>
  </div>
</template>

<style scoped>
.pick {
  position: fixed;
  inset: 0;
  display: flex;
  flex-direction: column;
  background: var(--bg, #0b0d12);
}

.pick__header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 18px 20px;
  background: linear-gradient(160deg, var(--red-dark), var(--red));
}

.pick__eyebrow {
  display: block;
  font-size: 8px;
  color: var(--yellow);
  margin-bottom: 4px;
}

.pick__title {
  font-size: 16px;
  color: white;
  text-shadow: 2px 2px 0 rgba(0, 0, 0, 0.3);
}

/* ── Faixa de slots ──────────────────────────────────────────────────────── */
.slots {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  /* Em 320px (iPhone SE) os três slots mais o botão ficam no limite exato da
     linha. Sem o wrap, o botão de confirmar é o que sai da tela — e ele é o
     único jeito de fechar o time. */
  flex-wrap: wrap;
  gap: 8px;
  padding: 10px 16px;
  background: rgba(0, 0, 0, 0.35);
  border-bottom: 2px solid var(--border, #2a2f3a);
}

.slot {
  position: relative;
  width: 48px;
  height: 48px;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  padding: 0;
  border: 2px dashed var(--border, #2a2f3a);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.04);
  cursor: pointer;
}

.slot--cheio {
  border-style: solid;
  border-color: var(--yellow, #ffcb05);
  background: rgba(255, 203, 5, 0.12);
}

/* O próximo a ser preenchido: sem isto, com um slot já cheio não fica claro
   para onde vai o toque seguinte. */
.slot--proximo {
  border-color: var(--yellow, #ffcb05);
}

/* Recorte do rosto: a sprite é de corpo inteiro e, solta no slot, vazava por
   cima do resto da tela. Presa ao slot, cortada e ancorada no topo, fica só a
   cabeça — e por baixo do ✕ de remover. Sem `overflow: hidden` no slot, que
   cortaria o ✕ (ele fica meio para fora). */
.slot__face {
  position: absolute;
  inset: 0;
  z-index: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: top;
  border-radius: 8px;
}

.slot__remover {
  position: absolute;
  top: -6px;
  right: -6px;
  width: 18px;
  height: 18px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--red, #c62828);
  color: white;
  font-size: 11px;
  line-height: 1;
  z-index: 1;
}

.slot__vazio {
  font-size: 12px;
  color: var(--text-muted, #8b93a7);
}

.slot:disabled {
  cursor: default;
}

/* Trancado: não é "falta escolher", é "não dá". Sem a borda tracejada de slot
   vazio, apagado e listrado — o mesmo visual de algo indisponível. */
.slot--trancado {
  border-style: solid;
  border-color: transparent;
  background: repeating-linear-gradient(
    135deg,
    rgba(255, 255, 255, 0.06) 0 6px,
    transparent 6px 12px
  );
  opacity: 0.5;
}

.slot--trancado:disabled {
  cursor: not-allowed;
}

.slot__cadeado {
  font-size: 18px;
  filter: grayscale(1);
}

.slots__aviso {
  flex-basis: 100%;
  margin: 0;
  font-size: 12px;
  line-height: 1.4;
  color: var(--text-muted, #8b93a7);
}

.slots__confirmar {
  margin-left: auto;
  min-height: 44px;
  padding: 0 16px;
  border: 2px solid var(--yellow, #ffcb05);
  border-radius: 10px;
  background: var(--yellow, #ffcb05);
  color: #1a1a1a;
  font-size: 10px;
  cursor: pointer;
}

/* Time no limite: o próximo passo é confirmar, e o botão avisa. */
.slots__confirmar--pronto {
  animation: pick-pulso 1.2s ease-in-out infinite;
}

.slots__confirmar:disabled {
  opacity: 0.45;
  background: transparent;
  color: var(--text-muted, #8b93a7);
  border-color: var(--border, #2a2f3a);
  cursor: not-allowed;
}

/* ── Team preview ────────────────────────────────────────────────────────── */
.lead-chamada {
  padding: 18px 16px;
  border-radius: var(--radius-lg);
  border: 3px solid var(--yellow, #ffcb05);
  background: rgba(255, 203, 5, 0.1);
  text-align: center;
}

.lead-chamada__titulo {
  margin: 0 0 10px;
  font-size: clamp(16px, 5.5vw, 24px);
  line-height: 1.3;
  color: var(--yellow, #ffcb05);
  text-shadow: 2px 2px 0 rgba(0, 0, 0, 0.4);
}

.lead-chamada__sub {
  margin: 0;
  font-size: 13px;
  line-height: 1.45;
  color: var(--text, #e8eaf0);
}

.lead-chamada--feita {
  border-color: var(--success-text);
  background: var(--success-bg);
}

.lead-chamada--feita .lead-chamada__titulo {
  color: var(--success-text);
}

.preview {
  margin-bottom: 20px;
}

.preview__titulo {
  margin-bottom: 10px;
  font-size: 10px;
  color: var(--yellow, #ffcb05);
}

.preview__lista {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  list-style: none;
  padding: 0;
  margin: 0;
}

/* Quem cresce e encolhe é o item da lista — o card do próprio time é um
   <button> DENTRO do <li>, então dimensioná-lo direto não teria efeito nenhum:
   o item flex é o <li>. O teto evita dois cards de meia tela no desktop. */
.preview__lista > li {
  flex: 1 1 132px;
  max-width: 168px;
  display: flex;
}

.lead-card,
.preview__foe {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 12px 8px;
  border: 2px solid var(--border, #2a2f3a);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.04);
}

.lead-card {
  cursor: pointer;
  color: inherit;
}

/* Ainda por escolher: borda amarela pulsando diz "isto é para tocar". */
.lead-card--escolhivel {
  border-color: var(--yellow, #ffcb05);
  animation: pick-pulso 1.2s ease-in-out infinite;
}

.lead-card--escolhivel:active {
  transform: scale(0.97);
}

.lead-card:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* O escolhido fica aceso enquanto os outros apagam. */
.lead-card--escolhido,
.lead-card--escolhido:disabled {
  opacity: 1;
  border-color: var(--success-text);
  background: var(--success-bg);
}

/* Só o rosto, como no avatar da lista: a sprite de corpo inteiro reduzida a
   64px virava um boneco minúsculo. */
.lead-card__face {
  width: 64px;
  height: 64px;
  object-fit: cover;
  object-position: top;
  border-radius: 50%;
  border: 2px solid var(--yellow, #ffcb05);
  background: var(--bg-surface);
}

.lead-card__nome {
  font-size: 10px;
  color: white;
  text-align: center;
}

.lead-card__cta {
  margin-top: 4px;
  padding: 6px 10px;
  border-radius: 999px;
  font-size: 9px;
  background: var(--yellow, #ffcb05);
  color: #1a1a1a;
}

.lead-card--escolhido .lead-card__cta {
  background: var(--success-text);
}

/* O time do rival é informação, não alvo de toque. */
.preview--rival .preview__titulo {
  color: var(--text-muted, #8b93a7);
}

.preview__foe {
  opacity: 0.75;
}

@keyframes pick-pulso {
  50% {
    box-shadow: 0 0 0 4px rgba(255, 203, 5, 0.25);
  }
}

@media (prefers-reduced-motion: reduce) {
  .lead-card--escolhivel,
  .slots__confirmar--pronto {
    animation: none;
  }
}

.exemplar-card--no-time {
  border-color: var(--yellow, #ffcb05);
  background: rgba(255, 203, 5, 0.12);
}

.pick__header-acoes {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
  flex-shrink: 0;
}

.pick__sair {
  min-height: 32px;
  padding: 0 10px;
  border-radius: var(--radius);
  background: rgba(0, 0, 0, 0.25);
  color: rgba(255, 255, 255, 0.9);
  border: 1px solid rgba(255, 255, 255, 0.25);
  font-size: 12px;
  white-space: nowrap;
  cursor: pointer;
}

.pick__sair:disabled {
  opacity: 0.5;
  cursor: default;
}

/* Estado vazio: o aviso e a saída no mesmo bloco, centralizados. */
.pick__vazio {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 24px 16px;
  border-radius: var(--radius-lg);
  background: var(--bg-card);
  border: 2px solid var(--border);
  text-align: center;
}

.pick__vazio-titulo {
  margin: 0;
  font-size: 10px;
  color: var(--yellow);
}

.pick__vazio-btn {
  min-height: 44px;
  padding: 0 16px;
  border-radius: 10px;
  background: var(--yellow, #ffcb05);
  color: #1a1a1a;
  border: 2px solid var(--yellow, #ffcb05);
  font-size: 10px;
  cursor: pointer;
}

.pick__timer {
  font-size: 18px;
  color: white;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.25);
  border-radius: var(--radius);
  padding: 8px 12px;
}

.pick__timer--low {
  color: var(--yellow);
  animation: pick-blink 1s steps(2) infinite;
}

@keyframes pick-blink {
  50% {
    opacity: 0.4;
  }
}

/* `flex: 1` e `overflow-y` já vêm da classe utilitária `.page`. */
.pick__main {
  padding: 20px 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.pick__hint,
.pick__empty {
  color: var(--text-muted);
  font-size: 13px;
  margin: 0;
}

.pick__grid {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 12px;
}

.pick-card {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 14px 10px;
  border-radius: var(--radius-lg);
  background: var(--bg-card);
  border: 2px solid var(--border);
  color: var(--text);
  cursor: pointer;
  transition:
    transform 0.15s,
    border-color 0.15s;
}

.pick-card:not(:disabled):active {
  transform: scale(0.97);
  border-color: var(--yellow);
}

.pick-card:disabled {
  opacity: 0.5;
  cursor: default;
}

.pick-card__avatar {
  position: relative;
  width: 64px;
  height: 64px;
  border-radius: 50%;
  border: 2px solid var(--yellow);
  background: var(--bg-surface);
}

.pick-card__avatar img {
  border-radius: 50%;
}

.pick-card__count {
  position: absolute;
  right: -4px;
  bottom: -4px;
  padding: 3px 6px;
  border-radius: 999px;
  font-size: 8px;
  color: var(--text-primary);
  background: var(--yellow);
  border: 1px solid var(--bg-deep);
}

.pick-card__avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  /* Topo: sprite de corpo inteiro num avatar pequeno — ver ProfCard.vue. */
  object-position: top;
}

.pick-card__name {
  font-size: 10px;
}

/* ── Etapa 2: exemplares ──────────────────────────────────────────────────── */
.pick__subhead {
  display: flex;
  align-items: center;
  gap: 10px;
}

.pick__back {
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-muted);
  border: 1px solid var(--border);
  border-radius: 20px;
  padding: 7px 12px;
  font-size: 8px;
}

.pick__back:active {
  transform: translateY(1px);
}

.pick__subtitle {
  font-size: 12px;
  color: var(--yellow);
}

.exemplares {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 14px;
}

.exemplar-card {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  text-align: left;
  border-radius: var(--radius-lg);
  background: var(--bg-card);
  border: 2px solid var(--border);
  color: var(--text);
  cursor: pointer;
  transition:
    transform 0.15s,
    border-color 0.15s;
}

.exemplar-card:not(:disabled):active {
  transform: scale(0.99);
  border-color: var(--yellow);
}

.exemplar-card:disabled {
  opacity: 0.5;
  cursor: default;
}

.exemplar-card__head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.exemplar-card__idx {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  color: var(--yellow);
  font-size: 8px;
}

.exemplar-card__hint {
  font-size: 11px;
  color: var(--text-muted);
}
.exemplar-card__stars {
  margin-left: auto;
}

.exemplar-card__moves {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.exemplar-card__move {
  font-size: 11px;
  padding: 3px 8px;
  border-radius: 999px;
  background: var(--bg-deep);
  border: 1px solid var(--border);
  color: var(--text-muted);
}

.pick__status {
  min-height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.pick__waiting {
  font-size: 10px;
  color: var(--yellow);
  animation: pick-blink 1.2s steps(2) infinite;
}

.pick__foe-picked {
  font-size: 13px;
  color: var(--text-muted);
}
</style>
