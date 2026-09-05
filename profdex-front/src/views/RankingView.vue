<script setup>
import { computed, nextTick, onMounted, ref } from 'vue'
import api from '../services/api'
import BottomNav from '../components/BottomNav.vue'
import AppHeader from '../components/AppHeader.vue'
import PointsLeaderboard from '../components/PointsLeaderboard.vue'
import TopTabs from '../components/TopTabs.vue'

// Esta tela era um protótipo com dados fixos de `src/data/ranking.js`, enquanto o
// ranking real (Elo de PvP) vivia como aba interna da BatalhaView. Agora existe
// um ranking só: o de verdade, aqui, alcançado pela aba superior.
//
// As abas ABAIXO são internas desta tela e não têm relação com o TopTabs, que é
// a navegação externa (Batalha ↔ Ranking ↔ Treino). Misturar as duas viraria
// quatro níveis de navegação empilhados na mesma dobra.

// Emblema por tier (cores/emoji seguem docs/BATALHA-PVP.md).
const TIER_BADGE = {
  Bronze: '🥉',
  Prata: '🥈',
  Ouro: '🥇',
  Platina: '💠',
  Diamante: '💎',
  Mestre: '👑',
}

// Cada aba é uma fonte de dados diferente com o MESMO formato de resposta
// (entries + me + paginação), então só muda o endpoint e como a linha vira
// pontuação/detalhe na lista.
const ABAS = [
  {
    id: 'elo',
    rotulo: 'ELO',
    endpoint: '/rankings/battle',
    unidade: 'ELO',
    vazio: 'Ninguém pontuou ainda — vença a primeira batalha do evento!',
    semPosicao: 'Você ainda não pontuou — desafie alguém na aba Batalha!',
  },
  {
    id: 'capturas',
    rotulo: 'CAPTURAS',
    endpoint: '/rankings/captures',
    unidade: 'capturas',
    vazio: 'Ninguém capturou ainda — o primeiro QR do evento é seu!',
    semPosicao: 'Você ainda não capturou ninguém — leia um QR no estande!',
  },
  {
    id: 'dex',
    rotulo: 'DEX',
    endpoint: '/rankings/dex',
    unidade: '% da dex',
    vazio: 'Ninguém abriu a dex ainda — seja o primeiro!',
    semPosicao: 'Você ainda não capturou ninguém — leia um QR no estande!',
  },
]

// Um estado por aba, mantido depois de carregado: voltar para uma aba já vista
// não refaz a requisição nem devolve a lista ao topo.
const estados = ref(
  Object.fromEntries(
    ABAS.map((aba) => [aba.id, { dados: null, carregando: false, erro: null, rolagem: 0 }]),
  ),
)
const abaAtiva = ref(ABAS[0].id)
const conteudo = ref(null)

// Uma requisição em voo por aba: sem isso, dois cliques rápidos em "CARREGAR
// MAIS" (ou uma troca de aba durante o carregamento) anexam a mesma página duas
// vezes.
const emVoo = new Map()

const aba = computed(() => ABAS.find((a) => a.id === abaAtiva.value))
const estado = computed(() => estados.value[abaAtiva.value])
const ranking = computed(() => estado.value.dados)

async function carregar(abaId, pagina = 1) {
  const chave = `${abaId}:${pagina}`
  if (emVoo.has(chave)) return emVoo.get(chave)

  const alvo = estados.value[abaId]
  const config = ABAS.find((a) => a.id === abaId)
  alvo.carregando = true
  alvo.erro = null

  const requisicao = api
    .get(config.endpoint, { params: { page: pagina } })
    .then(({ data }) => {
      // Página 1 substitui; seguintes anexam ("carregar mais").
      alvo.dados =
        pagina === 1 || !alvo.dados
          ? data
          : { ...data, entries: [...alvo.dados.entries, ...data.entries] }
    })
    .catch(() => {
      alvo.erro = 'Não deu para carregar o ranking. Tente de novo.'
    })
    .finally(() => {
      alvo.carregando = false
      emVoo.delete(chave)
    })

  emVoo.set(chave, requisicao)
  return requisicao
}

async function trocarAba(abaId) {
  if (abaId === abaAtiva.value) return

  // A rolagem é do container da página, e cada aba tem uma lista de altura
  // diferente — guardar por aba evita a lista nova "herdar" o scroll da antiga.
  estados.value[abaAtiva.value].rolagem = conteudo.value?.scrollTop ?? 0
  abaAtiva.value = abaId

  if (!estados.value[abaId].dados) await carregar(abaId, 1)
  await nextTick()
  if (conteudo.value) conteudo.value.scrollTop = estados.value[abaId].rolagem
}

const temMais = computed(
  () => ranking.value && ranking.value.entries.length < ranking.value.total,
)

const vazio = computed(() => ranking.value && !ranking.value.entries.length)

// `me.played` é do ladder de batalha; `me.ranked`, dos de coleção. As duas
// respondem à mesma pergunta: este aluno tem posição para mostrar?
const noRanking = computed(() => {
  const me = ranking.value?.me
  return Boolean(me && (me.played ?? me.ranked))
})

/** Pontuação e detalhe de uma linha, conforme a aba. */
function adaptar(entrada) {
  if (abaAtiva.value === 'elo') {
    return {
      pontuacao: entrada.rating,
      // Ex.: "🥉 Bronze · 1V·0D" — o emblema acompanha o nome do tier.
      detalhe: [
        [TIER_BADGE[entrada.tier], entrada.tier].filter(Boolean).join(' '),
        `${entrada.wins}V·${entrada.losses}D`,
      ].join(' · '),
    }
  }
  if (abaAtiva.value === 'dex') {
    return {
      pontuacao: entrada.percent,
      detalhe: `${entrada.total} de ${ranking.value?.dexTotal ?? '?'} professores`,
    }
  }
  return { pontuacao: entrada.total, detalhe: null }
}

// Adapta o formato da API ao que o PointsLeaderboard consome.
const jogadores = computed(() =>
  (ranking.value?.entries || []).map((entrada) => ({
    id: entrada.id,
    nome: entrada.name,
    destaque: entrada.id === ranking.value?.me?.id,
    ...adaptar(entrada),
  })),
)

/** Linha do rodapé fixo: a posição do próprio aluno, na unidade da aba. */
const minhaPosicao = computed(() => {
  const me = ranking.value?.me
  if (!me || !noRanking.value) return null
  const { pontuacao, detalhe } = adaptar(me)
  return {
    position: me.position,
    name: me.name,
    resumo: [`${pontuacao} ${aba.value.unidade}`, detalhe].filter(Boolean).join(' · '),
  }
})

onMounted(() => carregar(abaAtiva.value, 1))
</script>

<template>
  <div class="ranking-screen">
    <AppHeader title="RANKING" subtitle="TOP TREINADORES"><template #left><span aria-hidden="true">🏆</span></template></AppHeader>

    <main ref="conteudo" class="ranking-page page">
      <TopTabs />

      <!-- Abas INTERNAS: a mesma tela, três fontes de dados. -->
      <div class="rank-abas" role="tablist" aria-label="Tipo de ranking">
        <button
          v-for="opcao in ABAS"
          :key="opcao.id"
          class="pixel rank-abas__btn"
          :class="{ 'rank-abas__btn--ativa': opcao.id === abaAtiva }"
          type="button"
          role="tab"
          :aria-selected="opcao.id === abaAtiva"
          @click="trocarAba(opcao.id)"
        >
          {{ opcao.rotulo }}
        </button>
      </div>

      <p v-if="estado.carregando && !ranking" class="ranking-hint">Carregando…</p>
      <p v-else-if="estado.erro" class="ranking-hint" role="alert">{{ estado.erro }}</p>
      <p v-else-if="vazio" class="ranking-hint">{{ aba.vazio }}</p>

      <PointsLeaderboard
        v-if="jogadores.length"
        :users="jogadores"
        :unidade="aba.unidade"
        :mostrar-cabecalho="false"
      />

      <button
        v-if="temMais"
        class="pixel ranking-more"
        type="button"
        :disabled="estado.carregando"
        @click="carregar(abaAtiva, ranking.page + 1)"
      >
        {{ estado.carregando ? '…' : 'CARREGAR MAIS' }}
      </button>

      <!-- Sua posição, mesmo fora do topo da lista -->
      <div v-if="ranking?.me" class="rank-me">
        <template v-if="minhaPosicao">
          <span class="pixel rank-me__pos">#{{ minhaPosicao.position }}</span>
          <span class="rank-me__name">Você · {{ minhaPosicao.name }}</span>
          <span class="pixel rank-me__tier">{{ minhaPosicao.resumo }}</span>
        </template>
        <span v-else class="rank-me__name">{{ aba.semPosicao }}</span>
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

/* Segmented control das abas internas. Visualmente mais leve que o TopTabs de
   propósito: são níveis diferentes de navegação e não podem competir. */
.rank-abas {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
  padding: 4px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--bg-card);
}

.rank-abas__btn {
  min-height: 38px;
  border: 0;
  border-radius: calc(var(--radius) - 4px);
  background: transparent;
  color: var(--text-muted);
  font-size: 8px;
  cursor: pointer;
  transition:
    background 0.15s ease,
    color 0.15s ease;
}

.rank-abas__btn--ativa {
  background: var(--bg-surface);
  color: var(--yellow);
}

.rank-abas__btn:focus-visible {
  outline: 2px solid var(--unifil-gold);
  outline-offset: 2px;
}

@media (hover: hover) {
  .rank-abas__btn:not(.rank-abas__btn--ativa):hover {
    color: var(--text);
  }
}

@media (prefers-reduced-motion: reduce) {
  .rank-abas__btn {
    transition: none;
  }
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
