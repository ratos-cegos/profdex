<script setup>
import { computed, nextTick, onMounted, ref } from 'vue'
import api from '../services/api'
import BottomNav from '../components/BottomNav.vue'
import AppHeader from '../components/AppHeader.vue'
import PixelIcon from '../components/PixelIcon.vue'
import PointsLeaderboard from '../components/PointsLeaderboard.vue'
import TopTabs from '../components/TopTabs.vue'
import { TIER_ICONE } from '../data/pixelIcons'
import { formatarPontos } from '../components/leaderboard/formato'
import { abreviarNome } from '../services/abreviar-nome'

// Esta tela era um protótipo com dados fixos de `src/data/ranking.js`, enquanto o
// ranking real (Elo de PvP) vivia como aba interna da BatalhaView. Agora existe
// um ranking só: o de verdade, aqui, alcançado pela aba superior.
//
// As abas ABAIXO são internas desta tela e não têm relação com o TopTabs, que é
// a navegação externa (Batalha ↔ Ranking ↔ Treino). Misturar as duas viraria
// quatro níveis de navegação empilhados na mesma dobra.

// Cada aba é uma fonte de dados diferente com o MESMO formato de resposta
// (entries + me + paginação), então só muda o endpoint e como a linha vira
// pontuação/detalhe na lista.
const ABAS = [
  {
    id: 'elo',
    rotulo: 'ELO',
    endpoint: '/rankings/battle',
    // O número é o rating de batalha, mas para quem joga ele é "pontos": ao lado
    // do nome aparece "1.000 pts", não "1.000 ELO".
    unidade: 'pts',
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
      // O tier vai separado: quem desenha a linha põe o emblema pixel dele ao
      // lado do nome ("[escudo] Bronze · 1V·0D").
      tier: entrada.tier,
      detalhe: `${entrada.wins}V·${entrada.losses}D`,
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
    // Nomes do meio viram inicial ("Maria E. S. de Albuquerque"); o completo
    // fica para o `title` e o leitor de tela.
    nome: abreviarNome(entrada.name),
    nomeCompleto: entrada.name,
    destaque: entrada.id === ranking.value?.me?.id,
    ...adaptar(entrada),
  })),
)

/** Linha do rodapé fixo: a posição do próprio aluno, na unidade da aba. */
const minhaPosicao = computed(() => {
  const me = ranking.value?.me
  if (!me || !noRanking.value) return null
  const { pontuacao, tier, detalhe } = adaptar(me)
  return {
    position: me.position,
    name: abreviarNome(me.name),
    nomeCompleto: me.name,
    pontos: formatarPontos(pontuacao),
    tier,
    resumo: [tier, detalhe].filter(Boolean).join(' · '),
  }
})

onMounted(() => carregar(abaAtiva.value, 1))
</script>

<template>
  <div class="ranking-screen">
    <AppHeader title="RANKING" subtitle="TOP TREINADORES">
      <template #left><PixelIcon nome="trofeu" :escala="3" /></template>
    </AppHeader>

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

      <!-- A key por aba remonta o ranking na troca: o pódio sobe de novo com os
           números da aba nova, em vez de trocar os nomes por baixo dele. -->
      <PointsLeaderboard
        v-if="jogadores.length"
        :key="abaAtiva"
        :users="jogadores"
        :unidade="aba.unidade"
      />

      <button
        v-if="temMais"
        class="btn-pixel btn-pixel--ghost ranking-more"
        type="button"
        :disabled="estado.carregando"
        @click="carregar(abaAtiva, ranking.page + 1)"
      >
        {{ estado.carregando ? '…' : 'CARREGAR MAIS' }}
      </button>

      <!-- Sua posição, mesmo fora do topo da lista -->
      <div v-if="ranking?.me" class="rank-me" :class="{ 'rank-me--sem': !minhaPosicao }">
        <template v-if="minhaPosicao">
          <span class="pixel rank-me__pos">#{{ minhaPosicao.position }}</span>
          <span class="rank-me__quem">
            <span class="rank-me__name" :title="minhaPosicao.nomeCompleto">
              <!-- Fonte do corpo, não a pixel: a Press Start 2P perde o acento
                   em maiúscula e escreveria "VOCE". -->
              <span class="rank-me__voce">Você ·</span>
              {{ minhaPosicao.name }}
            </span>
            <span v-if="minhaPosicao.resumo" class="rank-me__detalhe">
              <PixelIcon
                v-if="TIER_ICONE[minhaPosicao.tier]"
                :nome="TIER_ICONE[minhaPosicao.tier]"
                :escala="1"
              />
              {{ minhaPosicao.resumo }}
            </span>
          </span>
          <span class="pixel rank-me__pts">
            <span>{{ minhaPosicao.pontos }}</span>
            <small>{{ aba.unidade }}</small>
          </span>
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
   propósito: são níveis diferentes de navegação e não podem competir. A aba
   ativa ganha o bisel de 8 bits dos botões da casa, "pressionada" na placa. */
.rank-abas {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 4px;
  padding: 4px;
  border: 2px solid var(--surface-border);
  border-radius: 4px;
  background: var(--bg-deep);
}

.rank-abas__btn {
  min-height: 40px;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: var(--text-muted);
  font-size: 8px;
  cursor: pointer;
  transition:
    background var(--dur-fast) steps(2, end),
    color var(--dur-fast) steps(2, end);
}

.rank-abas__btn--ativa {
  background: var(--unifil-orange);
  box-shadow:
    inset -2px -2px 0 var(--surface-border),
    inset 2px 2px 0 var(--unifil-gold);
  color: var(--text-primary);
  text-shadow: 2px 2px 0 var(--surface);
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
  align-self: center;
  min-width: 60%;
}

/* Fica colada no rodapé enquanto a lista rola — a própria posição é o dado que o
   jogador mais procura e sumiria ao descer. Sem `margin-top: auto`: com poucos
   jogadores isso a empurrava para o fim da tela e abria um vão morto no meio.
   É a caixa de diálogo GBA da landing, e o nome quebra linha em vez de cortar. */
.rank-me {
  position: sticky;
  bottom: 0;
  z-index: 3;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border: 4px solid var(--unifil-orange);
  border-radius: var(--radius);
  background: var(--surface);
  box-shadow:
    inset 0 0 0 2px var(--unifil-gold),
    inset 0 0 0 4px var(--surface),
    0 -8px 20px rgb(0 0 0 / 55%);
}

.rank-me--sem {
  grid-template-columns: 1fr;
}

.rank-me__pos {
  font-size: 11px;
  color: var(--unifil-gold);
}

.rank-me__quem {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.rank-me__name {
  font-size: 13px;
  font-weight: 700;
  line-height: 1.3;
  overflow-wrap: anywhere;
}

.rank-me__voce {
  color: var(--unifil-gold);
}

.rank-me__detalhe {
  display: flex;
  align-items: center;
  gap: 5px;
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 600;
}

.rank-me__pts {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
  font-size: 11px;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.rank-me__pts small {
  color: var(--unifil-gold);
  font-size: 7px;
}

@media (prefers-reduced-motion: no-preference) {
  .rank-me {
    animation: rank-me-sobe 200ms steps(3, end) 0.6s both;
  }
}

@keyframes rank-me-sobe {
  from {
    opacity: 0;
    transform: translateY(100%);
  }
}
</style>
