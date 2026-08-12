<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import BottomNav from '../components/BottomNav.vue'
import TopTabs from '../components/TopTabs.vue'
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

// O ranking vive na rota `/ranking` (RankingView), alcançada pela aba superior.

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
      <TopTabs />

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

      <section class="battle-options" aria-label="Opções de batalha">
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
          <span class="option-icon option-icon--arte">
            <img class="option-icon__img" src="/icons/batalha.png" alt="" aria-hidden="true" />
          </span>
          <span class="pixel option-label">Batalha</span>
        </button>

        <button class="battle-option" type="button">
          <span class="option-icon">QZ</span>
          <span class="pixel option-label">Quiz</span>
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

    <BottomNav />

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

/* Opções de batalha */
.battle-options {
  width: 100%;
  display: grid;
  gap: 12px;
}

.battle-option {
  width: 100%;
  min-height: 76px;
  display: grid;
  grid-template-columns: var(--option-icon) 1fr;
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

.battle-option--guide {
  border-color: var(--ds-green);
}

.battle-option--admin {
  border-color: var(--text-muted);
}

.option-icon {
  width: var(--option-icon);
  height: var(--option-icon);
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: var(--bg-surface);
  color: var(--yellow);
  border: 2px solid var(--border);
  font-size: 24px;
  font-weight: 900;
}

/* Disco que abriga pixel art: o disco vira só a moldura e a arte ocupa quase
   todo o diâmetro, em vez de ficar um emoji pequeno perdido no meio. */
.option-icon--arte {
  padding: 4px;
  background: var(--surface);
}

.option-icon__img {
  width: 100%;
  height: 100%;
  /* No disco redondo a arte larga é limitada pelo diâmetro; `contain` garante
     que ela caiba inteira em vez de vazar pela borda. */
  object-fit: contain;
  image-rendering: pixelated;
  pointer-events: none;
}

.option-label {
  font-size: 12px;
  text-align: left;
}

</style>
