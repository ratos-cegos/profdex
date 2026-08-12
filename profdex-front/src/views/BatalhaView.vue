<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import api from '../services/api'
import { useAuthStore } from '../stores/auth'
import { useProfessorsStore } from '../stores/professors'
import { useBattleStore } from '../stores/battle'

const router = useRouter()
const route = useRoute()
const store = useProfessorsStore()
const battle = useBattleStore()
const auth = useAuthStore()

// Relógio para as contagens regressivas dos convites (1 tick/segundo).
const now = ref(Date.now())
let clock = null

onMounted(() => {
  if (!store.professors.length) store.fetch().catch(() => {})
  // Conecta no lobby PvP. A conexão é do app, não da tela: seguimos "online"
  // (e convidáveis) ao navegar — por isso não desconectamos no unmount.
  battle.connect()
  clock = setInterval(() => {
    now.value = Date.now()
  }, 1000)
})

onUnmounted(() => {
  if (clock) clearInterval(clock)
  if (searchDebounce) clearTimeout(searchDebounce)
  // A conexão continua (é do app), mas sair da tela com a lista aberta deixaria
  // o servidor mandando eventos de presença para ninguém.
  if (lobbyOpen.value) battle.unsubscribeLobby()
})

function secondsLeft(expiresAt) {
  return Math.max(0, Math.ceil((expiresAt - now.value) / 1000))
}

// ── Convites recebidos ────────────────────────────────────────────────────
// Cada convite vive 60s e qualquer um do lobby pode mandar o seu, então numa
// sala cheia eles chegam vários de uma vez. Empilhados como banners, empurram
// o resto da tela para fora — viram uma lista rolável de altura fixa: quem
// expira primeiro fica no topo, e o resto rola sem mexer no layout.
const INVITE_RENDER_CAP = 20

const sortedInvites = computed(() =>
  [...battle.incomingInvites].sort((a, b) => a.expiresAt - b.expiresAt),
)

const visibleInvites = computed(() => sortedInvites.value.slice(0, INVITE_RENDER_CAP))

const hiddenInviteCount = computed(() => sortedInvites.value.length - visibleInvites.value.length)

// Com a caixa cheia, recusar um a um é pior que o problema original.
function declineAll() {
  for (const invite of [...battle.incomingInvites]) battle.declineInvite(invite.inviteId)
}

// ── Modal de jogadores online ─────────────────────────────────────────────
// A lista fica atrás de um botão e é o SERVIDOR quem pagina (50 por resposta) e
// busca: enquanto o modal está fechado o servidor não manda nada de presença.
// Antes ele empurrava o lobby inteiro para todo mundo o tempo todo — ver
// docs/CARGA-PVP.md.
const lobbyOpen = ref(false)
const lobbySearch = ref('')
const lobbyLoading = ref(false)
let searchDebounce = null

const visibleOpponents = computed(() => battle.opponents)

// Quantos ficaram de fora da página atual — só faz sentido sem busca ativa.
const hiddenCount = computed(() =>
  lobbySearch.value.trim()
    ? 0
    : Math.max(0, battle.opponentCount - battle.opponents.length),
)

async function openLobby() {
  lobbySearch.value = ''
  lobbyOpen.value = true
  lobbyLoading.value = true
  await battle.subscribeLobby()
  lobbyLoading.value = false
}

function closeLobby() {
  lobbyOpen.value = false
  if (searchDebounce) clearTimeout(searchDebounce)
  battle.unsubscribeLobby()
}

// Busca no servidor, com folga para não disparar uma consulta por tecla.
watch(lobbySearch, (term) => {
  if (!lobbyOpen.value) return
  if (searchDebounce) clearTimeout(searchDebounce)
  searchDebounce = setTimeout(() => battle.searchLobby(term.trim()), 300)
})

function challenge(player) {
  battle.clearError()
  battle.sendInvite(player.id)
  // Fecha o modal: o estado do convite (contagem regressiva, resposta) aparece
  // na tela principal, então manter a lista aberta só esconderia o retorno.
  closeLobby()
}

// ── Aba Ranking (batalha) ─────────────────────────────────────────────────
// A aba de ranking da Pokédex (completar a coleção) entrará ao lado no futuro.
const tab = ref('batalha') // 'batalha' | 'ranking'
const ranking = ref(null) // { entries, me, page, pageSize, total }
const rankingLoading = ref(false)
const rankingError = ref(null)

async function loadRanking(page = 1) {
  rankingLoading.value = true
  rankingError.value = null
  try {
    const { data } = await api.get('/rankings/battle', { params: { page } })
    // Página 1 substitui; seguintes anexam ("carregar mais").
    ranking.value =
      page === 1 || !ranking.value
        ? data
        : { ...data, entries: [...ranking.value.entries, ...data.entries] }
  } catch {
    rankingError.value = 'Não deu para carregar o ranking. Tente de novo.'
  } finally {
    rankingLoading.value = false
  }
}

const hasMoreRanking = computed(
  () => ranking.value && ranking.value.entries.length < ranking.value.total,
)

// Emblema por tier (cores/emoji seguem docs/BATALHA-PVP.md).
const TIER_BADGE = {
  Bronze: '🥉',
  Prata: '🥈',
  Ouro: '🥇',
  Platina: '💠',
  Diamante: '💎',
  Mestre: '👑',
}

watch(tab, (t) => {
  if (t === 'ranking') loadRanking(1)
})

// Usa o professor vindo da query (?profId=X) ou fallback para o primeiro capturado
const selectedProfessor = computed(() => {
  const profId = route.query.profId
  if (profId) {
    return store.professors.find((p) => String(p.id) === String(profId)) || null
  }
  return (
    store.professors.find((p) => p.captured) ||
    store.professors.find((p) => p.discovered) ||
    store.professors[0] ||
    null
  )
})

// O parâmetro da rota usa o slug (legível e compartilhável: /arena/eron); o
// store resolve tanto slug quanto o UUID do banco.
function routeToCharacter(name) {
  const professor = selectedProfessor.value
  router.push({
    name,
    params: { id: professor?.slug || professor?.id || 'modelo-padrao' },
    state: {
      character: {
        id: professor?.id || 'modelo-padrao',
        name: professor?.name || 'Professor',
        slug: professor?.slug || 'professor',
        modelUrl: professor?.modelUrl,
      },
    },
  })
}

function goToArena() {
  routeToCharacter('arena')
}

function goToRanking() {
  router.push({ name: 'ranking' })
}

function openBattleGuide() {
  router.push({ name: 'battle-guide' })
}

function goBack() {
  router.push({ name: 'profdex' })
}
</script>

<template>
  <div class="batalha">
    <header class="batalha__header">
      <button class="back-btn" type="button" @click="goBack">← Voltar</button>
      <div class="header__info">
        <span class="pixel eyebrow">ÁREA DE BATALHA</span>
        <h1 class="pixel header__title">
          <!-- {{ selectedProfessor ? `Prof. ${selectedProfessor.name}` : 'BATALHA' }} -->
            {{ selectedProfessor ? `Professores` : 'BATALHA' }}
        </h1>
      </div>
    </header>

    <main class="batalha__main page">
      <!-- Tabs: Batalha | Ranking (a aba de ranking da Pokédex entra aqui depois) -->
      <div class="tabs" role="tablist">
        <button
          class="pixel tabs__btn"
          :class="{ 'tabs__btn--active': tab === 'batalha' }"
          type="button"
          role="tab"
          :aria-selected="tab === 'batalha'"
          @click="tab = 'batalha'"
        >
          ⚔️ Batalha
        </button>
        <button
          class="pixel tabs__btn"
          :class="{ 'tabs__btn--active': tab === 'ranking' }"
          type="button"
          role="tab"
          :aria-selected="tab === 'ranking'"
          @click="tab = 'ranking'"
        >
          🏆 Ranking
        </button>
      </div>

      <!-- Convites recebidos: lista rolável com contagem regressiva (em qualquer aba) -->
      <section
        v-if="battle.incomingInvites.length"
        class="invites"
        aria-live="polite"
      >
        <header class="invites__header">
          <span class="pixel invites__title">
            {{ battle.incomingInvites.length === 1 ? 'DESAFIO!' : 'DESAFIOS' }}
            <template v-if="battle.incomingInvites.length > 1">
              ({{ battle.incomingInvites.length }})
            </template>
          </span>
          <button
            v-if="battle.incomingInvites.length > 1"
            class="invites__decline-all"
            type="button"
            @click="declineAll"
          >
            Recusar todos
          </button>
        </header>

        <ul class="invites__list">
          <li v-for="invite in visibleInvites" :key="invite.inviteId" class="invite-row">
            <span class="invite-row__info">
              <span class="invite-row__name">{{ invite.from.name }}</span>
              <span
                class="pixel invite-row__timer"
                :class="{ 'invite-row__timer--urgent': secondsLeft(invite.expiresAt) <= 10 }"
              >
                {{ secondsLeft(invite.expiresAt) }}s
              </span>
            </span>
            <span class="invite-row__actions">
              <button
                class="invite-row__btn invite-row__btn--accept"
                type="button"
                @click="battle.acceptInvite(invite.inviteId)"
              >
                Aceitar
              </button>
              <button
                class="invite-row__btn"
                type="button"
                :aria-label="`Recusar desafio de ${invite.from.name}`"
                @click="battle.declineInvite(invite.inviteId)"
              >
                ✕
              </button>
            </span>
          </li>
        </ul>

        <p v-if="hiddenInviteCount > 0" class="invites__more">
          +{{ hiddenInviteCount }} aguardando na fila
        </p>
      </section>

      <!-- Erros de comando (cooldown, jogador ocupado…) -->
      <p v-if="battle.lastError" class="lobby-error" role="alert">
        {{ battle.lastError }}
        <button class="lobby-error__close" type="button" @click="battle.clearError">✕</button>
      </p>

      <!-- Convite enviado: fica na tela principal, já que o modal fecha ao enviar -->
      <p v-if="battle.outgoingInvite" class="outgoing" aria-live="polite">
        Desafio enviado para <strong>{{ battle.outgoingInvite.to.name }}</strong> ·
        {{ secondsLeft(battle.outgoingInvite.expiresAt) }}s
      </p>

      <!-- Aba Ranking -->
      <section v-if="tab === 'ranking'" class="ranking-tab" aria-label="Ranking de batalha">
        <p v-if="rankingLoading && !ranking" class="ranking-tab__hint">Carregando…</p>
        <p v-else-if="rankingError" class="ranking-tab__hint">{{ rankingError }}</p>
        <p v-else-if="ranking && !ranking.entries.length" class="ranking-tab__hint">
          Ninguém pontuou ainda — vença a primeira batalha do evento!
        </p>

        <template v-if="ranking?.entries.length">
          <ol class="ranking-tab__list">
            <li
              v-for="entry in ranking.entries"
              :key="entry.id"
              class="rank-row"
              :class="{ 'rank-row--me': entry.id === ranking.me?.id }"
            >
              <span class="pixel rank-row__pos">#{{ entry.position }}</span>
              <span class="rank-row__name">{{ entry.name }}</span>
              <span class="rank-row__record">{{ entry.wins }}V·{{ entry.losses }}D</span>
              <span class="pixel rank-row__tier">
                {{ TIER_BADGE[entry.tier] }} {{ entry.rating }}
              </span>
            </li>
          </ol>

          <button
            v-if="hasMoreRanking"
            class="pixel ranking-tab__more"
            type="button"
            :disabled="rankingLoading"
            @click="loadRanking(ranking.page + 1)"
          >
            {{ rankingLoading ? '…' : 'CARREGAR MAIS' }}
          </button>
        </template>

        <!-- Sua posição, mesmo fora do topo -->
        <div v-if="ranking?.me" class="rank-me">
          <template v-if="ranking.me.played">
            <span class="pixel rank-me__pos">#{{ ranking.me.position }}</span>
            <span class="rank-me__name">Você · {{ ranking.me.name }}</span>
            <span class="pixel rank-me__tier">
              {{ TIER_BADGE[ranking.me.tier] }} {{ ranking.me.rating }} · {{ ranking.me.tier }}
            </span>
          </template>
          <span v-else class="rank-me__name">
            Você ainda não pontuou — desafie alguém na aba Batalha!
          </span>
        </div>
      </section>

      <section v-show="tab === 'batalha'" class="battle-options" aria-label="Opções de batalha">
        <button
          class="battle-option battle-option--online"
          type="button"
          :disabled="!battle.connected"
          @click="openLobby"
        >
          <span class="option-icon option-icon--online">
            <span class="lobby__dot" :class="{ 'lobby__dot--on': battle.connected }"></span>
          </span>
          <span class="option-text">
            <span class="pixel option-label">Jogadores online</span>
            <span class="option-sub">
              <template v-if="battle.unauthorized">Sessão expirada — refaça o login</template>
              <template v-else-if="!battle.connected">Conectando…</template>
              <template v-else-if="!battle.opponentCount">Ninguém online agora</template>
              <template v-else>
                {{ battle.opponentCount }}
                {{ battle.opponentCount === 1 ? 'jogador disponível' : 'jogadores disponíveis' }}
              </template>
            </span>
          </span>
        </button>

        <button
          class="battle-option battle-option--primary"
          type="button"
          @click="goToArena"
        >
          <span class="option-icon">⚔️</span>
          <span class="pixel option-label">Batalha</span>
        </button>

        <button class="battle-option" type="button">
          <span class="option-icon">QZ</span>
          <span class="pixel option-label">Quiz</span>
        </button>

        <button
          class="battle-option battle-option--ranking"
          type="button"
          @click="goToRanking"
        >
          <span class="option-icon">🏆</span>
          <span class="pixel option-label">Ranking</span>
        </button>

        <button
          class="battle-option battle-option--guide"
          type="button"
          @click="openBattleGuide"
        >
          <span class="option-icon">📖</span>
          <span class="pixel option-label">Instruções de Batalha</span>
        </button>

        <!-- Só para contas administrativas (@unifil.br): métricas (leitura) e
             a bancada do quiz do evento. -->
        <button
          v-if="auth.user?.role === 'admin'"
          class="battle-option battle-option--admin"
          type="button"
          @click="router.push({ name: 'admin-metricas' })"
        >
          <span class="option-icon">📊</span>
          <span class="pixel option-label">Painel Administrativo</span>
        </button>
      </section>
    </main>

    <nav class="batalha__nav">
      <button class="nav-btn" @click="router.push({ name: 'profdex' })">
        <span class="nav-icon">📒</span>
        <span class="pixel nav-label">ProfDex</span>
      </button>
      <button class="nav-btn nav-btn--primary" @click="router.push({ name: 'scan' })">
        <span class="nav-icon">📷</span>
        <span class="pixel nav-label">Scanear</span>
      </button>
      <button class="nav-btn nav-btn--active" @click="router.push({ name: 'batalha' })">
        <span class="nav-icon nav-icon--text">BT</span>
        <span class="pixel nav-label">Batalha</span>
      </button>
    </nav>

    <!-- Modal: jogadores online -->
    <div
      v-if="lobbyOpen"
      class="modal"
      role="dialog"
      aria-modal="true"
      aria-label="Jogadores online"
      @click.self="closeLobby"
    >
      <div class="modal__panel">
        <header class="modal__header">
          <span class="pixel modal__title">
            JOGADORES ONLINE ({{ battle.opponentCount }})
          </span>
          <button class="modal__close" type="button" aria-label="Fechar" @click="closeLobby">
            ✕
          </button>
        </header>

        <input
          v-model="lobbySearch"
          class="modal__search"
          type="search"
          placeholder="Buscar por nome…"
          autocomplete="off"
        />

        <p v-if="lobbyLoading" class="modal__empty">Carregando…</p>
        <p v-else-if="!battle.opponents.length && lobbySearch.trim()" class="modal__empty">
          Nenhum jogador com esse nome.
        </p>
        <p v-else-if="!battle.opponents.length" class="modal__empty">
          Ninguém mais online agora. Chame a galera!
        </p>

        <ul v-else class="modal__list">
          <li v-for="player in visibleOpponents" :key="player.id" class="lobby__player">
            <span class="lobby__name">{{ player.name }}</span>
            <span
              v-if="player.status === 'em_batalha'"
              class="pixel lobby__status lobby__status--busy"
            >
              EM BATALHA
            </span>
            <span
              v-else-if="battle.outgoingInvite?.to.id === player.id"
              class="pixel lobby__status lobby__status--waiting"
            >
              {{ secondsLeft(battle.outgoingInvite.expiresAt) }}s…
            </span>
            <button
              v-else
              class="pixel lobby__challenge"
              type="button"
              :disabled="!!battle.outgoingInvite"
              @click="challenge(player)"
            >
              DESAFIAR
            </button>
          </li>
        </ul>

        <p v-if="hiddenCount > 0" class="modal__more">
          +{{ hiddenCount }} não exibidos — use a busca para achar alguém.
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.batalha {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.batalha__header {
  background: linear-gradient(160deg, var(--red-dark), var(--red));
  padding: 18px 20px 30px;
  position: relative;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 14px;
}

.batalha__header::after {
  content: '';
  position: absolute;
  right: 0;
  bottom: -1px;
  left: 0;
  height: 20px;
  background: var(--bg);
  border-radius: 20px 20px 0 0;
}

.back-btn {
  position: relative;
  z-index: 1;
  min-height: 38px;
  padding: 0 14px;
  border-radius: var(--radius);
  background: rgba(0, 0, 0, 0.25);
  color: rgba(255, 255, 255, 0.88);
  border: 1px solid rgba(255, 255, 255, 0.2);
  white-space: nowrap;
}

.header__info {
  flex: 1;
  min-width: 0;
}

.eyebrow {
  display: block;
  margin-bottom: 4px;
  color: var(--yellow);
  font-size: 8px;
}

.header__title {
  font-size: 18px;
  color: white;
  text-shadow: 2px 2px 0 rgba(0, 0, 0, 0.3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.batalha__main {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  padding: 20px 16px;
  gap: 20px;
  overflow-y: auto;
}

/* Lobby de jogadores online */
.lobby__dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--text-muted);
}

.lobby__dot--on {
  background: var(--ds-green);
  box-shadow: 0 0 6px var(--ds-green);
}

.lobby__player {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 12px;
  border-radius: var(--radius);
  background: var(--bg-surface);
  border: 1px solid var(--border);
}

.lobby__name {
  font-size: 14px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lobby__status {
  flex-shrink: 0;
  font-size: 7px;
  color: var(--ds-green);
}

.lobby__status--busy {
  color: var(--red-light);
}

.lobby__status--waiting {
  color: var(--yellow);
}

.lobby__challenge {
  flex-shrink: 0;
  min-height: 34px;
  padding: 0 12px;
  font-size: 8px;
  border-radius: var(--radius);
  background: var(--red-dark);
  color: white;
  border: 1px solid var(--red-light);
  cursor: pointer;
}

.lobby__challenge:disabled {
  opacity: 0.4;
  cursor: default;
}

/* Botão que abre o modal de online */
.battle-option--online {
  border-color: var(--ds-green);
}

.battle-option--online:disabled {
  opacity: 0.6;
  cursor: default;
}

.option-icon--online {
  font-size: 0; /* o conteúdo é só a bolinha de status */
}

.option-text {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.option-sub {
  font-size: 12px;
  color: var(--text-muted);
  text-align: left;
}

/* Convite enviado (fica na tela principal, fora do modal) */
.outgoing {
  width: 100%;
  margin: 0;
  padding: 10px 14px;
  border-radius: var(--radius);
  background: var(--bg-card);
  border: 1px solid var(--yellow);
  color: var(--text);
  font-size: 13px;
}

/* Modal de jogadores online */
.modal {
  position: fixed;
  inset: 0;
  z-index: 20;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  background: rgba(0, 0, 0, 0.65);
}

.modal__panel {
  width: 100%;
  max-width: 520px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px 16px calc(16px + env(safe-area-inset-bottom));
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
  background: var(--bg-card);
  border: 2px solid var(--border);
  border-bottom: none;
}

.modal__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.modal__title {
  font-size: 10px;
  color: var(--yellow);
}

.modal__close {
  min-width: 38px;
  min-height: 38px;
  border-radius: var(--radius);
  background: var(--bg-surface);
  color: var(--text);
  border: 1px solid var(--border);
  font-size: 14px;
  cursor: pointer;
}

.modal__search {
  width: 100%;
  min-height: 42px;
  padding: 0 12px;
  border-radius: var(--radius);
  background: var(--bg-surface);
  color: var(--text);
  border: 1px solid var(--border);
  font-size: 14px;
}

.modal__empty,
.modal__more {
  margin: 0;
  color: var(--text-muted);
  font-size: 13px;
  text-align: center;
}

.modal__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 8px;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}

/* Convites recebidos */
.invites {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 14px;
  border-radius: var(--radius-lg);
  background: var(--bg-card);
  border: 2px solid var(--yellow);
}

.invites__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.invites__title {
  font-size: 9px;
  color: var(--yellow);
}

.invites__decline-all {
  flex-shrink: 0;
  min-height: 32px;
  padding: 0 10px;
  border-radius: var(--radius);
  background: transparent;
  color: var(--text-muted);
  border: 1px solid var(--border);
  font-size: 12px;
  cursor: pointer;
}

/* Altura fixa: a lista rola por dentro em vez de empurrar a tela. O limite
   equivale a ~3 linhas — o bastante para a próxima aparecer meio cortada e
   sinalizar que há mais. */
.invites__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 6px;
  max-height: 172px;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}

.invite-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 10px;
  border-radius: var(--radius);
  background: var(--bg-surface);
  border: 1px solid var(--border);
}

.invite-row__info {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.invite-row__name {
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.invite-row__timer {
  flex-shrink: 0;
  font-size: 7px;
  color: var(--text-muted);
}

.invite-row__timer--urgent {
  color: var(--red-light);
}

.invite-row__actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}

.invite-row__btn {
  min-height: 34px;
  padding: 0 10px;
  border-radius: var(--radius);
  background: var(--bg-card);
  color: var(--text);
  border: 1px solid var(--border);
  font-size: 12px;
  cursor: pointer;
}

.invite-row__btn--accept {
  background: var(--red-dark);
  border-color: var(--red-light);
  color: white;
}

.invites__more {
  margin: 0;
  color: var(--text-muted);
  font-size: 12px;
  text-align: center;
}

/* Erro de comando */
.lobby-error {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin: 0;
  padding: 10px 14px;
  border-radius: var(--radius);
  background: var(--bg-card);
  border: 1px solid var(--red-light);
  color: var(--red-light);
  font-size: 13px;
}

.lobby-error__close {
  background: transparent;
  color: var(--text-muted);
  font-size: 14px;
  cursor: pointer;
}

/* Tabs */
.tabs {
  width: 100%;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.tabs__btn {
  min-height: 42px;
  font-size: 9px;
  border-radius: var(--radius);
  background: var(--bg-card);
  color: var(--text-muted);
  border: 2px solid var(--border);
  cursor: pointer;
}

.tabs__btn--active {
  color: var(--yellow);
  border-color: var(--yellow);
}

/* Aba Ranking */
.ranking-tab {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.ranking-tab__hint {
  margin: 8px 0;
  color: var(--text-muted);
  font-size: 13px;
  text-align: center;
}

.ranking-tab__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 6px;
}

.rank-row {
  display: grid;
  grid-template-columns: 44px 1fr auto auto;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-radius: var(--radius);
  background: var(--bg-card);
  border: 1px solid var(--border);
}

.rank-row--me {
  border-color: var(--yellow);
}

.rank-row__pos {
  font-size: 8px;
  color: var(--text-muted);
}

.rank-row__name {
  font-size: 14px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rank-row__record {
  font-size: 11px;
  color: var(--text-muted);
}

.rank-row__tier {
  font-size: 9px;
  color: var(--yellow);
}

.ranking-tab__more {
  min-height: 40px;
  font-size: 8px;
  border-radius: var(--radius);
  background: var(--bg-card);
  color: var(--text);
  border: 1px solid var(--border);
  cursor: pointer;
}

.rank-me {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px;
  border-radius: var(--radius);
  background: var(--bg-surface);
  border: 2px solid var(--yellow);
}

.rank-me__pos {
  font-size: 10px;
  color: var(--yellow);
}

.rank-me__name {
  flex: 1;
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rank-me__tier {
  font-size: 9px;
  color: var(--yellow);
}

/* Opções de batalha */
.battle-options {
  width: 100%;
  display: grid;
  gap: 12px;
}

.battle-option {
  width: 100%;
  min-height: 72px;
  display: grid;
  grid-template-columns: 52px 1fr;
  align-items: center;
  gap: 14px;
  padding: 12px 16px;
  border-radius: var(--radius-lg);
  background: var(--bg-card);
  color: var(--text);
  border: 2px solid var(--border);
  transition: transform 0.15s, border-color 0.15s;
  cursor: pointer;
}

.battle-option:active {
  transform: scale(0.98);
}

.battle-option--primary {
  border-color: var(--red-light);
}

.battle-option--ranking {
  border-color: var(--yellow);
}

.battle-option--guide {
  border-color: var(--ds-green);
}

.battle-option--admin {
  border-color: var(--text-muted);
}

.option-icon {
  width: 52px;
  height: 52px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: var(--bg-surface);
  color: var(--yellow);
  border: 2px solid var(--border);
  font-size: 22px;
  font-weight: 900;
}

.option-label {
  font-size: 12px;
  text-align: left;
}

/* Navegação */
.batalha__nav {
  background: var(--bg-card);
  border-top: 1px solid var(--border);
  display: flex;
  padding: 8px 0 calc(8px + env(safe-area-inset-bottom));
  flex-shrink: 0;
}

.nav-btn {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  background: transparent;
  color: var(--text-muted);
  padding: 8px 4px;
  border-radius: var(--radius);
}

.nav-btn--active {
  color: var(--yellow);
}

.nav-btn--primary {
  color: var(--red-light);
}

.nav-icon {
  font-size: 22px;
}

.nav-icon--text {
  font-size: 13px;
  font-weight: 900;
}

.nav-label {
  font-size: 7px;
}
</style>
