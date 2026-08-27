<script setup>
import { computed, onMounted, ref } from 'vue'
import api from '../services/api'
import BottomNav from '../components/BottomNav.vue'
import AppHeader from '../components/AppHeader.vue'
import PointsLeaderboard from '../components/PointsLeaderboard.vue'
import TopTabs from '../components/TopTabs.vue'

// Esta tela era um protótipo com dados fixos de `src/data/ranking.js`, enquanto o
// ranking real (Elo de PvP) vivia como aba interna da BatalhaView. Agora existe
// um ranking só: o de verdade, aqui, alcançado pela aba superior.

// Emblema por tier (cores/emoji seguem docs/BATALHA-PVP.md).
const TIER_BADGE = {
  Bronze: '🥉',
  Prata: '🥈',
  Ouro: '🥇',
  Platina: '💠',
  Diamante: '💎',
  Mestre: '👑',
}

const ranking = ref(null) // { entries, me, page, pageSize, total }
const carregando = ref(false)
const erro = ref(null)

async function carregar(pagina = 1) {
  carregando.value = true
  erro.value = null
  try {
    const { data } = await api.get('/rankings/battle', { params: { page: pagina } })
    // Página 1 substitui; seguintes anexam ("carregar mais").
    ranking.value =
      pagina === 1 || !ranking.value
        ? data
        : { ...data, entries: [...ranking.value.entries, ...data.entries] }
  } catch {
    erro.value = 'Não deu para carregar o ranking. Tente de novo.'
  } finally {
    carregando.value = false
  }
}

const temMais = computed(
  () => ranking.value && ranking.value.entries.length < ranking.value.total,
)

const vazio = computed(() => ranking.value && !ranking.value.entries.length)

// Adapta o formato da API ao que o PointsLeaderboard consome.
const jogadores = computed(() =>
  (ranking.value?.entries || []).map((entrada) => ({
    id: entrada.id,
    nome: entrada.name,
    pontuacao: entrada.rating,
    // Ex.: "🥉 Bronze · 1V·0D" — o emblema acompanha o nome do tier.
    detalhe: [
      [TIER_BADGE[entrada.tier], entrada.tier].filter(Boolean).join(' '),
      `${entrada.wins}V·${entrada.losses}D`,
    ].join(' · '),
    destaque: entrada.id === ranking.value?.me?.id,
  })),
)

onMounted(() => carregar(1))
</script>

<template>
  <div class="ranking-screen">
    <AppHeader title="RANKING" subtitle="TOP TREINADORES"><template #left><span aria-hidden="true">🏆</span></template></AppHeader>

    <main class="ranking-page page">
      <TopTabs />

      <p v-if="carregando && !ranking" class="ranking-hint">Carregando…</p>
      <p v-else-if="erro" class="ranking-hint" role="alert">{{ erro }}</p>
      <p v-else-if="vazio" class="ranking-hint">
        Ninguém pontuou ainda — vença a primeira batalha do evento!
      </p>

      <PointsLeaderboard
        v-if="jogadores.length"
        :users="jogadores"
        unidade="ELO"
        :mostrar-cabecalho="false"
      />

      <button
        v-if="temMais"
        class="pixel ranking-more"
        type="button"
        :disabled="carregando"
        @click="carregar(ranking.page + 1)"
      >
        {{ carregando ? '…' : 'CARREGAR MAIS' }}
      </button>

      <!-- Sua posição, mesmo fora do topo da lista -->
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
    </main>

    <BottomNav />
  </div>
</template>

<style scoped>
/* Fica no fluxo do `#app` (que já limita a 480px e centraliza). A versão
   anterior usava `position: fixed; inset: 0`, escapando desse limite — era o que
   fazia esta tela ter largura diferente de todas as outras rotas. */
.ranking-screen {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg);
}

.ranking-header {
  position: relative;
  flex-shrink: 0;
  padding: 16px 20px 28px;
  background: linear-gradient(160deg, var(--red-dark), var(--red));
}

.ranking-header::after {
  content: '';
  position: absolute;
  right: 0;
  bottom: -1px;
  left: 0;
  height: 20px;
  border-radius: 20px 20px 0 0;
  background: var(--bg);
}

.ranking-header__label {
  display: block;
  margin-bottom: 5px;
  color: var(--yellow);
  font-size: 7px;
}

.ranking-header__title {
  color: var(--text-primary);
  font-size: 18px;
  text-shadow: 2px 2px 0 rgba(0, 0, 0, 0.3);
}

.ranking-page {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 16px 12px 12px;
}

/* Scanline discreta, no espírito de tela CRT. Depende do `position: relative`
   acima para se ancorar na área rolável, e não na tela inteira. */
.ranking-page::before {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  opacity: 0.18;
  background-image: linear-gradient(rgba(255, 255, 255, 0.018) 1px, transparent 1px);
  background-size: 100% 5px;
}

.ranking-hint {
  margin: 8px 0;
  color: var(--text-muted);
  font-size: 13px;
  text-align: center;
}

.ranking-more {
  min-height: 40px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--bg-card);
  color: var(--text);
  font-size: 8px;
  cursor: pointer;
  transition: border-color 0.15s ease;
}

.ranking-more:hover:not(:disabled) {
  border-color: var(--yellow);
}

.ranking-more:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* Fica colada no rodapé enquanto a lista rola — a própria posição é o dado que o
   jogador mais procura e sumiria ao descer. Sem `margin-top: auto`: com poucos
   jogadores isso a empurrava para o fim da tela e abria um vão morto no meio. */
.rank-me {
  position: sticky;
  bottom: 0;
  z-index: 3;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px;
  border: 2px solid var(--yellow);
  border-radius: var(--radius);
  background: var(--bg-surface);
  box-shadow: 0 -8px 20px rgba(0, 0, 0, 0.55);
}

.rank-me__pos {
  font-size: 10px;
  color: var(--yellow);
}

.rank-me__name {
  flex: 1;
  overflow: hidden;
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rank-me__tier {
  font-size: 9px;
  color: var(--yellow);
}
</style>
