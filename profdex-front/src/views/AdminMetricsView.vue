<script setup>
import { computed, onMounted, ref } from 'vue'
import api from '../services/api'

const loading = ref(true)
const error = ref(null)

const overview = ref(null)
const funnel = ref([])
const engagement = ref([])
const retention = ref(null)
const interacoes = ref(null)

const numero = (v) => (v ?? 0).toLocaleString('pt-BR')

// Série horária. O seletor troca a métrica sem recarregar o resto do painel.
const SERIES = [
  { key: 'interactions', label: 'Interações' },
  { key: 'logged_users', label: 'Usuários logados' },
  { key: 'active_users', label: 'Usuários interagindo' },
  { key: 'sessions_started', label: 'Sessões abertas' },
  { key: 'active_minutes', label: 'Minutos ativos' },
  { key: 'event_professor_captured', label: 'Capturas' },
  { key: 'event_battle_finished', label: 'Batalhas' },
]
const serieAtual = ref('logged_users')
const serie = ref(null)
const serieLoading = ref(false)
const horas = ref(24)

async function carregarSerie() {
  serieLoading.value = true
  try {
    const { data } = await api.get('/admin/metrics/series', {
      params: { metric: serieAtual.value, hours: horas.value },
    })
    serie.value = data
  } catch {
    serie.value = null
  } finally {
    serieLoading.value = false
  }
}

onMounted(async () => {
  try {
    const [o, f, e, r, i] = await Promise.all([
      api.get('/admin/metrics/overview'),
      api.get('/admin/metrics/funnel'),
      api.get('/admin/metrics/engagement', { params: { limit: 20 } }),
      api.get('/admin/metrics/retention'),
      api.get('/admin/metrics/interactions'),
    ])
    overview.value = o.data
    funnel.value = f.data
    engagement.value = e.data
    retention.value = r.data
    interacoes.value = i.data
    await carregarSerie()
  } catch (e) {
    error.value =
      e.response?.status === 403
        ? 'Esta área é restrita a administradores.'
        : 'Não foi possível carregar as métricas.'
  } finally {
    loading.value = false
  }
})

// ── Gráfico ───────────────────────────────────────────────────────────────
// Barras em CSS puro: um gráfico deste tamanho não justifica uma biblioteca,
// e o app roda em celular no meio de um evento.
const maxValor = computed(() =>
  Math.max(1, ...(serie.value?.points ?? []).map((p) => p.value)),
)

const barras = computed(() =>
  (serie.value?.points ?? []).map((p) => ({
    hora: new Date(p.bucket).getHours().toString().padStart(2, '0') + 'h',
    valor: p.value,
    altura: Math.round((p.value / maxValor.value) * 100),
  })),
)

// Percentual de cada etapa em relação ao topo do funil.
const funnelPct = (total) => {
  const base = funnel.value[0]?.total || 0
  return base ? Math.round((total / base) * 100) : 0
}

const labelSerie = computed(
  () => SERIES.find((s) => s.key === serieAtual.value)?.label ?? serieAtual.value,
)
</script>

<template>
  <div class="admin">
    <main class="admin__main">
      <p v-if="loading" class="hint">Carregando…</p>
      <p v-else-if="error" class="hint hint--error" role="alert">{{ error }}</p>

      <template v-else>
        <!-- Número-síntese do evento: tudo que os alunos fizeram, na mesma
             régua. A quebra fica logo abaixo para o número não ser opaco. -->
        <section v-if="interacoes" class="destaque" aria-label="Total de interações">
          <span class="pixel destaque__rotulo">TOTAL DE INTERAÇÕES</span>
          <strong class="destaque__valor">{{ numero(interacoes.total) }}</strong>
          <span class="destaque__hoje">{{ numero(interacoes.hoje) }} hoje</span>

          <ul v-if="interacoes.fontes.length" class="fontes">
            <li v-for="f in interacoes.fontes" :key="f.fonte" class="fonte">
              <div class="fonte__topo">
                <span class="fonte__nome">{{ f.fonte }}</span>
                <span class="fonte__num">{{ numero(f.interacoes) }} · {{ f.pct }}%</span>
              </div>
              <div class="fonte__trilho">
                <div class="fonte__preenchido" :style="{ width: f.pct + '%' }"></div>
              </div>
              <span v-if="f.ocorrencias" class="fonte__detalhe">
                {{ numero(f.ocorrencias) }} × {{ f.peso }}
              </span>
            </li>
          </ul>
          <p v-else class="hint">
            Ainda sem interações agregadas — o rollup roda a cada 5 minutos.
          </p>
        </section>

        <!-- Números do dia -->
        <section class="cards" aria-label="Resumo de hoje">
          <div class="card">
            <span class="card__value">{{ overview.dau }}</span>
            <span class="card__label">Usuários hoje</span>
          </div>
          <div class="card">
            <span class="card__value">{{ overview.wau }}</span>
            <span class="card__label">Na semana</span>
          </div>
          <div class="card">
            <span class="card__value">{{ overview.sessionsToday }}</span>
            <span class="card__label">Sessões hoje</span>
          </div>
          <div class="card">
            <span class="card__value">{{ overview.avgSessionMinutes }}min</span>
            <span class="card__label">Média por sessão</span>
          </div>
          <div class="card">
            <span class="card__value">{{ overview.activeMinutesToday }}</span>
            <span class="card__label">Minutos ativos hoje</span>
          </div>
          <div class="card">
            <span class="card__value">{{ overview.capturesToday }}</span>
            <span class="card__label">Capturas hoje</span>
          </div>
          <div class="card">
            <span class="card__value">{{ overview.battlesToday }}</span>
            <span class="card__label">Batalhas hoje</span>
          </div>
          <div class="card">
            <span class="card__value">{{ overview.totalUsers }}</span>
            <span class="card__label">Cadastrados</span>
          </div>
        </section>

        <!-- Série horária -->
        <section class="bloco" aria-label="Série por hora">
          <header class="bloco__head">
            <span class="pixel bloco__titulo">POR HORA</span>
            <div class="bloco__acoes">
              <select v-model="serieAtual" class="select" @change="carregarSerie">
                <option v-for="s in SERIES" :key="s.key" :value="s.key">
                  {{ s.label }}
                </option>
              </select>
              <select v-model.number="horas" class="select" @change="carregarSerie">
                <option :value="24">24h</option>
                <option :value="72">3 dias</option>
                <option :value="168">7 dias</option>
              </select>
            </div>
          </header>

          <p v-if="serieLoading" class="hint">Carregando…</p>
          <p v-else-if="!barras.length" class="hint">
            Ainda sem dados — os agregados são calculados a cada 5 minutos.
          </p>
          <div v-else class="grafico" :aria-label="`${labelSerie} por hora`">
            <div v-for="(b, i) in barras" :key="i" class="grafico__col">
              <span class="grafico__valor">{{ b.valor }}</span>
              <div class="grafico__barra" :style="{ height: b.altura + '%' }"></div>
              <span class="grafico__hora">{{ b.hora }}</span>
            </div>
          </div>
        </section>

        <!-- Funil -->
        <section class="bloco" aria-label="Funil de adoção">
          <span class="pixel bloco__titulo">FUNIL</span>
          <div v-for="etapa in funnel" :key="etapa.etapa" class="funil__linha">
            <div class="funil__topo">
              <span class="funil__nome">{{ etapa.etapa }}</span>
              <span class="funil__num">
                {{ etapa.total }} · {{ funnelPct(etapa.total) }}%
              </span>
            </div>
            <div class="funil__trilho">
              <div class="funil__preenchido" :style="{ width: funnelPct(etapa.total) + '%' }"></div>
            </div>
          </div>
        </section>

        <!-- Retenção -->
        <section v-if="retention" class="bloco" aria-label="Retenção D1">
          <span class="pixel bloco__titulo">RETENÇÃO D1</span>
          <p class="retencao">
            <template v-if="retention.taxa !== null">
              <strong>{{ retention.taxa }}%</strong> — {{ retention.voltaramHoje }} de
              {{ retention.novosOntem }} que estrearam ontem voltaram hoje.
            </template>
            <template v-else>Ninguém estreou ontem; sem base para calcular.</template>
          </p>
        </section>

        <!-- Engajamento -->
        <section class="bloco" aria-label="Ranking de engajamento">
          <span class="pixel bloco__titulo">ENGAJAMENTO</span>
          <p v-if="!engagement.length" class="hint">Ninguém pontuou ainda.</p>
          <ol v-else class="lista">
            <li v-for="u in engagement" :key="u.id" class="linha">
              <span class="pixel linha__pos">#{{ u.position }}</span>
              <span class="linha__nome">{{ u.name }}</span>
              <span class="linha__extra">{{ u.captures }}📕 · {{ u.wins }}V</span>
              <span class="pixel linha__score">{{ u.score }}</span>
            </li>
          </ol>
        </section>
      </template>
    </main>
  </div>
</template>

<style scoped>
.admin {
  min-height: 100%;
  display: flex;
  flex-direction: column;
}

.admin__main {
  flex: 1;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.hint {
  margin: 8px 0;
  color: var(--text-muted);
  font-size: 13px;
  text-align: center;
}

.hint--error {
  color: var(--red-light);
}

/* Destaque de interações */
.destaque {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 18px 14px;
  border-radius: var(--radius-lg);
  background: var(--bg-card);
  border: 1px solid var(--yellow);
}

.destaque__rotulo {
  font-size: 9px;
  color: var(--yellow);
}

.destaque__valor {
  font-size: 40px;
  line-height: 1.1;
  font-weight: 900;
  color: var(--text);
}

.destaque__hoje {
  font-size: 12px;
  color: var(--text-muted);
}

.fontes {
  list-style: none;
  margin: 14px 0 0;
  padding: 0;
  width: 100%;
  display: grid;
  gap: 10px;
}

.fonte {
  display: grid;
  gap: 3px;
}

.fonte__topo {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
}

.fonte__nome {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fonte__num {
  flex-shrink: 0;
  color: var(--text-muted);
}

.fonte__trilho {
  height: 6px;
  border-radius: 3px;
  background: var(--bg-surface);
  overflow: hidden;
}

.fonte__preenchido {
  height: 100%;
  background: linear-gradient(90deg, var(--yellow), var(--red));
}

.fonte__detalhe {
  font-size: 10px;
  color: var(--text-muted);
}

/* Cartões do topo */
.cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 10px;
}

.card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px;
  border-radius: var(--radius);
  background: var(--bg-card);
  border: 1px solid var(--border);
}

.card__value {
  font-size: 22px;
  font-weight: 900;
  color: var(--yellow);
}

.card__label {
  font-size: 11px;
  color: var(--text-muted);
}

/* Blocos */
.bloco {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
  border-radius: var(--radius-lg);
  background: var(--bg-card);
  border: 1px solid var(--border);
}

.bloco__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}

.bloco__titulo {
  font-size: 9px;
  color: var(--yellow);
}

.bloco__acoes {
  display: flex;
  gap: 8px;
}

.select {
  min-height: 34px;
  padding: 0 8px;
  border-radius: var(--radius);
  background: var(--bg-surface);
  color: var(--text);
  border: 1px solid var(--border);
  font-size: 12px;
}

/* Gráfico de barras */
.grafico {
  display: flex;
  align-items: flex-end;
  gap: 4px;
  height: 180px;
  overflow-x: auto;
  padding-top: 16px;
}

.grafico__col {
  flex: 1 0 28px;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  gap: 2px;
}

.grafico__valor {
  font-size: 9px;
  color: var(--text-muted);
}

.grafico__barra {
  width: 100%;
  min-height: 2px;
  border-radius: 3px 3px 0 0;
  background: linear-gradient(180deg, var(--yellow), var(--red));
}

.grafico__hora {
  font-size: 9px;
  color: var(--text-muted);
  white-space: nowrap;
}

/* Funil */
.funil__linha {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.funil__topo {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
}

.funil__nome {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.funil__num {
  flex-shrink: 0;
  color: var(--text-muted);
}

.funil__trilho {
  height: 8px;
  border-radius: 4px;
  background: var(--bg-surface);
  overflow: hidden;
}

.funil__preenchido {
  height: 100%;
  background: var(--yellow);
}

.retencao {
  margin: 0;
  font-size: 13px;
}

.retencao strong {
  color: var(--yellow);
  font-size: 18px;
}

/* Lista de engajamento */
.lista {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 6px;
}

.linha {
  display: grid;
  grid-template-columns: 40px 1fr auto auto;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: var(--radius);
  background: var(--bg-surface);
  border: 1px solid var(--border);
}

.linha__pos {
  font-size: 8px;
  color: var(--text-muted);
}

.linha__nome {
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.linha__extra {
  font-size: 11px;
  color: var(--text-muted);
}

.linha__score {
  font-size: 9px;
  color: var(--yellow);
}
</style>
