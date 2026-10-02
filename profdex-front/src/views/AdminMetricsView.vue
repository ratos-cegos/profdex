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

// Professores raros. Esta é a ÚNICA tela onde progresso de raro aparece — e
// pode, porque o painel nunca fica virado para aluno. É ela que compensa a
// bancada não ter aviso prévio (tarefa 15, decisão 16).
const raros = ref({ capturas: [], porRaro: [], aUmAcerto: [] })

// Raid do lendário. `clears` é a FILA DO PRÊMIO, em ordem de chegada: é a
// única fonte da resposta "quem capturou primeiro?", e ela vale um prêmio
// físico. Não aparece no app durante o evento de propósito (tarefa 18,
// decisão 20) — anunciar que o primeiro lugar já saiu tira o motivo de os
// outros tentarem.
const raid = ref({ lendario: null, clears: [], funil: null, desbloqueios: 0 })

// Hora e dia curtos: a pergunta do painel é "quando foi", e o evento dura dias.
const horaLegivel = (iso) =>
  new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })

const numero = (v) => (v ?? 0).toLocaleString('pt-BR')

// ── Relatório (dia ou semana) ───────────────────────────────────────────────
// `exportando` guarda QUAL período está gerando ('dia' | 'semana' | null), e não
// um booleano: com dois botões, um booleano acenderia "Gerando…" nos dois e o
// organizador não saberia qual pedido está no ar.
const exportando = ref(null)
const erroRelatorio = ref(null)

/**
 * O dia do relatório, `AAAA-MM-DD`. Começa em HOJE porque é o caso de quase
 * toda exportação: o organizador tira o relatório no fim da feira.
 *
 * `en-CA` porque é o locale cujo formato de data já é ISO, que é o que o
 * `<input type="date">` exige. Sem o `sv-SE`/`en-CA`, `toISOString()` daria o
 * dia em UTC — às 22h daqui, o dia seguinte, e o seletor abriria na data errada
 * justamente no horário do evento.
 */
const hoje = () =>
  new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())

const diaDoRelatorio = ref(hoje())
const maxDia = hoje()

/**
 * Abre o relatório numa aba nova, pronto para o "Salvar como PDF" do navegador.
 * Mesmo caminho da folha de fichas (AdminFichasView).
 *
 * `periodo` é `'dia'` (o turno do estande daquele dia, barra por hora) ou
 * `'semana'` (os sete dias que terminam nele, barra por dia). A data escolhida
 * é o ÚLTIMO dia nos dois casos, não o primeiro: o seletor já abre em hoje, e é
 * daí que a semana conta para trás — pedir "a semana até hoje" é o que o
 * organizador quer no fim da feira, sem ter de calcular a segunda-feira.
 *
 * Blob em vez de apontar `window.open` para a URL: a rota é autenticada por
 * cookie e o axios é quem trata o 401 do painel inteiro. Com a aba apontada
 * para a URL crua, uma sessão expirada mostraria um JSON de erro em vez do
 * aviso de "entre de novo" que o resto da tela dá.
 */
async function exportarRelatorio(periodo = 'dia') {
  if (exportando.value || !diaDoRelatorio.value) return
  exportando.value = periodo
  erroRelatorio.value = null
  let url = null
  try {
    const { data } = await api.get('/admin/metrics/report', {
      params: { date: diaDoRelatorio.value, periodo },
      responseType: 'blob',
    })
    url = URL.createObjectURL(data)
    const aba = window.open(url, '_blank', 'noopener')
    if (!aba) {
      erroRelatorio.value =
        'O navegador bloqueou a aba. Libere os pop-ups deste site e tente de novo.'
    }
  } catch {
    erroRelatorio.value = 'Não foi possível gerar o relatório. Tente de novo.'
  } finally {
    // Só depois de a aba ter lido o blob. Revogar na hora deixaria a página em
    // branco em parte dos navegadores.
    if (url) setTimeout(() => URL.revokeObjectURL(url), 60_000)
    exportando.value = null
  }
}

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
    const [o, f, e, r, i, raro, raidData] = await Promise.all([
      api.get('/admin/metrics/overview'),
      api.get('/admin/metrics/funnel'),
      api.get('/admin/metrics/engagement', { params: { limit: 20 } }),
      api.get('/admin/metrics/retention'),
      api.get('/admin/metrics/interactions'),
      api.get('/admin/metrics/rares'),
      api.get('/admin/metrics/raid'),
    ])
    overview.value = o.data
    funnel.value = f.data
    engagement.value = e.data
    retention.value = r.data
    interacoes.value = i.data
    raros.value = raro.data
    raid.value = raidData.data
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
        <!-- Relatório para levar impresso. Fica no topo porque é a ação que o
             organizador procura com pressa, no fim do dia.

             Dois botões em vez de um seletor de período: são duas AÇÕES, e com
             um seletor o organizador teria de trocá-lo antes de clicar — um
             passo a mais, feito com pressa, cujo erro só aparece depois de o
             papel sair da impressora. A data é a mesma para os dois: o último
             dia da semana e o dia do relatório diário. -->
        <section class="relatorio" aria-label="Relatório do estande">
          <div class="relatorio__texto">
            <strong>Relatório do estande · 17h às 24h</strong>
            <span>Interações, bancada, capturas, batalhas e alunos — com gráficos.</span>
          </div>
          <div class="relatorio__acoes">
            <label class="relatorio__data">
              <span class="relatorio__rotulo">Dia</span>
              <input
                v-model="diaDoRelatorio"
                type="date"
                class="select"
                :max="maxDia"
              />
            </label>
            <button
              type="button"
              class="botao"
              :disabled="!!exportando || !diaDoRelatorio"
              @click="exportarRelatorio('dia')"
            >
              {{ exportando === 'dia' ? 'Gerando…' : 'PDF do dia' }}
            </button>
            <button
              type="button"
              class="botao botao--semana"
              :disabled="!!exportando || !diaDoRelatorio"
              title="Os 7 dias que terminam na data escolhida, consolidados"
              @click="exportarRelatorio('semana')"
            >
              {{ exportando === 'semana' ? 'Gerando…' : 'PDF da semana' }}
            </button>
          </div>
        </section>
        <p class="relatorio__nota">
          A semana consolida os sete turnos que terminam na data escolhida — uma
          barra por dia. Soma o mesmo que os sete relatórios diários; só
          "alunos no evento" é menor, porque conta alunos distintos.
        </p>
        <p v-if="erroRelatorio" class="hint hint--error" role="alert">
          {{ erroRelatorio }}
        </p>

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

        <!-- Raros ✦.
             `destravaram` vs `capturaram` lado a lado é o número que diz,
             DURANTE o evento, se o 5 está calibrado: 30 destravaram e 2
             capturaram significa que faltou papel ou que o operador não
             entendeu o aviso da bancada. -->
        <section class="bloco bloco--raro" aria-label="Professores raros">
          <span class="pixel bloco__titulo">RAROS ✦</span>

          <p v-if="!raros.porRaro.length" class="hint">
            Nenhum professor raro cadastrado.
          </p>

          <template v-else>
            <ul class="lista">
              <li v-for="r in raros.porRaro" :key="r.professorId" class="linha">
                <span class="linha__nome linha__nome--raro">✦ {{ r.name }}</span>
                <span class="linha__extra">
                  {{ r.destravaram }} destravaram · {{ r.capturaram }} capturaram
                </span>
                <span
                  class="pixel linha__score"
                  :class="{ 'linha__score--alerta': !r.estoqueVivo }"
                >
                  {{ r.estoqueVivo }} fichas
                </span>
              </li>
            </ul>

            <!-- A um acerto. É a mitigação de "o aluno nunca vê progresso":
                 quem administra vê e avisa a mesa. -->
            <template v-if="raros.aUmAcerto.length">
              <span class="pixel bloco__sub">A UM ACERTO</span>
              <ul class="lista">
                <li
                  v-for="(a, i) in raros.aUmAcerto"
                  :key="`${a.matricula}-${a.theme}-${i}`"
                  class="linha"
                >
                  <span class="linha__nome">{{ a.name }}</span>
                  <span class="linha__extra">{{ a.matricula }}</span>
                  <span class="linha__extra">{{ a.theme }}</span>
                </li>
              </ul>
            </template>

            <span class="pixel bloco__sub">QUEM CAPTUROU</span>
            <p v-if="!raros.capturas.length" class="hint">
              Nenhum raro capturado ainda.
            </p>
            <ul v-else class="lista">
              <li
                v-for="(c, i) in raros.capturas"
                :key="`${c.matricula}-${i}`"
                class="linha"
              >
                <span class="linha__nome">{{ c.name }}</span>
                <span class="linha__extra">{{ c.matricula }}</span>
                <span class="linha__extra linha__extra--raro">✦ {{ c.professor }}</span>
                <span class="linha__extra">{{ horaLegivel(c.capturedAt) }}</span>
              </li>
            </ul>
          </template>
        </section>

        <!-- Raid ⚡.
             Duas leituras, e a segunda é a que decide uma AÇÃO: a taxa de
             vitória diz se o 4× ficou justo, e ela é acionável enquanto
             `raid.hp_multiplier` ainda dá para mexer em /admin/configuracoes,
             sem deploy. A primeira, a fila, é o prêmio. -->
        <section class="bloco bloco--raid" aria-label="Raid do lendário">
          <span class="pixel bloco__titulo">RAID ⚡</span>

          <p v-if="!raid.lendario" class="hint">
            Nenhum professor lendário cadastrado.
          </p>

          <template v-else>
            <ul class="lista">
              <li class="linha">
                <span class="linha__nome linha__nome--raid">
                  ⚡ {{ raid.lendario.name }}
                </span>
                <span class="linha__extra">{{ raid.lendario.types.join(' · ') }}</span>
              </li>
            </ul>

            <span class="pixel bloco__sub">FUNIL</span>
            <ul class="lista">
              <li class="linha">
                <span class="linha__nome">Destravaram a raid</span>
                <span class="linha__extra">{{ raid.funil.desbloqueios }}</span>
              </li>
              <li class="linha">
                <span class="linha__nome">Tentativas</span>
                <span class="linha__extra">{{ raid.funil.tentativas }}</span>
              </li>
              <li class="linha">
                <span class="linha__nome">Vitórias</span>
                <span class="linha__extra">{{ raid.funil.vitorias }}</span>
              </li>
              <li class="linha">
                <span class="linha__nome">Taxa de vitória</span>
                <span class="linha__extra">
                  {{ raid.funil.taxa === null ? '—' : `${raid.funil.taxa}%` }}
                </span>
              </li>
            </ul>

            <span class="pixel bloco__sub">FILA DO PRÊMIO</span>
            <p v-if="!raid.clears.length" class="hint">
              Ninguém capturou o lendário ainda.
            </p>
            <ul v-else class="lista">
              <li
                v-for="c in raid.clears"
                :key="c.matricula"
                class="linha"
                :class="{ 'linha--primeiro': c.posicao === 1 }"
              >
                <span class="linha__nome linha__nome--raid">
                  {{ c.posicao }}º {{ c.name }}
                </span>
                <span class="linha__extra">{{ c.matricula }}</span>
                <span class="linha__extra">{{ horaLegivel(c.clearedAt) }}</span>
                <span class="linha__extra">
                  {{ c.attempts }}ª tentativa
                </span>
              </li>
            </ul>
          </template>
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

/* Relatório do estande (dia e semana) */
.relatorio {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  padding: 12px 14px;
  margin-bottom: 12px;
  border-radius: var(--radius-lg);
  background: var(--bg-card);
  border: 1px solid var(--border);
}

.relatorio__texto {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 13px;
}

.relatorio__texto span {
  color: var(--text-muted);
  font-size: 12px;
}

.relatorio__acoes {
  display: flex;
  align-items: flex-end;
  gap: 10px;
}

.relatorio__data {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.relatorio__rotulo {
  font-size: 11px;
  color: var(--text-muted);
}

/* Fica fora do card para não competir com os dois botões, mas colada nele: é a
   legenda deles, não um aviso solto da tela. */
.relatorio__nota {
  margin: -6px 0 14px;
  padding: 0 14px;
  color: var(--text-muted);
  font-size: 12px;
  line-height: 1.5;
}

.botao {
  padding: 9px 16px;
  border: none;
  border-radius: var(--radius);
  background: var(--red);
  color: #fff;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}

.botao:disabled {
  opacity: 0.6;
  cursor: progress;
}

/* A semana é a ação SECUNDÁRIA, e de propósito: o relatório do dia é o de todo
   dia. Dois botões preenchidos disputariam o olho e fariam o organizador parar
   para ler qual é qual, justamente no fim da feira. */
.botao--semana {
  background: transparent;
  color: var(--text-primary);
  border: 1px solid var(--border);
}

.botao--semana:hover:not(:disabled) {
  border-color: var(--red);
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

/* ── Raros ✦ ───────────────────────────────────────────────────────────── */
.bloco--raro {
  border-color: color-mix(in srgb, var(--raro) 40%, var(--border));
}

.bloco--raro .bloco__titulo {
  color: var(--raro);
}

.bloco__sub {
  margin-top: 4px;
  font-size: 8px;
  color: var(--text-muted);
}

.linha__nome--raro,
.linha__extra--raro {
  color: var(--raro);
}

/* ── Raid ⚡ ────────────────────────────────────────────────────────────── */
.bloco--raid {
  border-color: color-mix(in srgb, #ffd166 40%, var(--border));
}

.bloco--raid .bloco__titulo,
.linha__nome--raid {
  color: #ffd166;
}

/* O primeiro colocado é a razão de a tabela existir: ele ganha destaque para
   não ser confundido na hora de chamar o nome. */
.linha--primeiro {
  background: color-mix(in srgb, #ffd166 12%, transparent);
  border-radius: 6px;
}

/* Pilha no fim: quem destravar a partir daqui não recebe nada. */
.linha__score--alerta {
  color: var(--error);
}
</style>
