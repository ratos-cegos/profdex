<script setup>
/**
 * Painel do Quiz Treino — separado do painel do Quiz da Bancada, de propósito.
 *
 * O treino é livre: não vale ponto, não captura professor e não entra no
 * ranking. Misturar os dois números na mesma tela faria alguém ler volume de
 * treino como participação no evento, que é exatamente a confusão que a
 * separação existe para evitar.
 *
 * Os dados vêm de `metrics_hourly` (pré-agregado pelo rollup), nunca da trilha
 * bruta de `app_events` nem de `quiz_attempts`.
 */
import { computed, onMounted, ref } from 'vue'
import api from '../services/api'
import TypeIcon from '../components/TypeIcon.vue'
import { getType, legibleColor } from '../data/types'

const carregando = ref(true)
const erro = ref('')
const dados = ref(null)
const dias = ref(7)

const JANELAS = [
  { valor: 1, rotulo: '24h' },
  { valor: 7, rotulo: '7 dias' },
  { valor: 30, rotulo: '30 dias' },
]

async function carregar() {
  carregando.value = true
  erro.value = ''
  try {
    const { data } = await api.get('/admin/metrics/practice-quiz', {
      params: { days: dias.value },
    })
    dados.value = data
  } catch (e) {
    erro.value = e.response
      ? (e.response.data?.message ?? 'Não foi possível carregar as métricas.')
      : 'Sem conexão com o servidor.'
  } finally {
    carregando.value = false
  }
}

function trocarJanela(valor) {
  dias.value = valor
  void carregar()
}

onMounted(carregar)

/**
 * Enriquece o recorte do servidor com o que é só de apresentação (rótulo, cor,
 * cor legível do ícone). O servidor manda `tema` como id; quem sabe desenhar
 * um tipo é o front.
 */
const porTema = computed(() =>
  (dados.value?.porTema ?? []).map((t) => {
    const tipo = getType(t.tema)
    const cor = tipo?.color ?? '#495057'
    return {
      ...t,
      label: tipo?.label ?? t.tema,
      color: cor,
      corIcone: legibleColor(cor),
    }
  }),
)

/** O tema mais treinado, para a barra dar noção de proporção entre eles. */
const maiorVolume = computed(() =>
  porTema.value.reduce((max, t) => Math.max(max, t.respostas), 0),
)

const semDados = computed(() => !carregando.value && !erro.value && dados.value?.total === 0)
</script>

<template>
  <div class="treino-admin">
    <header class="treino-admin__head">
      <div>
        <span class="pixel bloco__titulo">QUIZ TREINO</span>
        <p class="treino-admin__sub">
          Prática livre dos alunos. Não vale ponto, não captura professor e não
          entra no ranking — estes números são de uso, não de competição.
        </p>
      </div>

      <div class="janelas" role="group" aria-label="Período">
        <button
          v-for="j in JANELAS"
          :key="j.valor"
          class="janela"
          :class="{ 'janela--ativa': dias === j.valor }"
          type="button"
          :disabled="carregando"
          @click="trocarJanela(j.valor)"
        >
          {{ j.rotulo }}
        </button>
      </div>
    </header>

    <p v-if="erro" class="erro" aria-live="polite">{{ erro }}</p>
    <p v-else-if="carregando" class="aviso">Carregando…</p>

    <template v-else-if="dados">
      <!-- Números do topo -->
      <section class="cartoes" aria-label="Resumo">
        <div class="cartao">
          <span class="cartao__valor">{{ dados.total }}</span>
          <span class="cartao__rotulo">Respostas de treino</span>
        </div>
        <div class="cartao">
          <span class="cartao__valor">{{ dados.acertos }}</span>
          <span class="cartao__rotulo">Acertos</span>
        </div>
        <div class="cartao">
          <span class="cartao__valor">
            <template v-if="dados.taxa !== null">{{ dados.taxa }}%</template>
            <template v-else>—</template>
          </span>
          <span class="cartao__rotulo">Taxa de acerto</span>
        </div>
      </section>

      <p v-if="semDados" class="aviso">
        Ninguém treinou nesse período ainda.
      </p>

      <!-- Por matéria -->
      <section v-else class="bloco" aria-label="Treino por matéria">
        <span class="pixel bloco__titulo">POR MATÉRIA</span>
        <ul class="temas">
          <li
            v-for="t in porTema"
            :key="t.tema"
            class="tema"
            :class="{ 'tema--vazio': !t.respostas }"
            :style="{ '--cor': t.color, '--cor-icone': t.corIcone }"
          >
            <TypeIcon class="tema__icone" :type="t.tema" :size="18" />
            <span class="tema__nome">{{ t.label }}</span>
            <span class="tema__num">
              <template v-if="t.respostas">
                {{ t.acertos }}/{{ t.respostas }} · {{ t.taxa }}%
              </template>
              <template v-else>sem treino</template>
            </span>
            <!-- Barra proporcional ao tema mais treinado: a contagem sozinha não
                 mostra que uma matéria está sendo ignorada em relação às outras. -->
            <div class="barra" aria-hidden="true">
              <div
                class="barra__preenchida"
                :style="{ width: maiorVolume ? `${(t.respostas / maiorVolume) * 100}%` : '0%' }"
              ></div>
            </div>
          </li>
        </ul>
      </section>
    </template>
  </div>
</template>

<style scoped>
.treino-admin {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 16px;
}

.treino-admin__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.treino-admin__sub {
  margin: 6px 0 0;
  max-width: 62ch;
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-muted);
}

.bloco__titulo {
  font-size: 9px;
  color: var(--yellow);
}

.janelas {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.janela {
  min-height: 34px;
  padding: 0 12px;
  cursor: pointer;
  font-size: 12px;
  color: var(--text-muted);
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
}

.janela--ativa {
  color: var(--text);
  border-color: var(--yellow);
}

.janela:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.erro,
.aviso {
  margin: 0;
  font-size: 13px;
  color: var(--text-muted);
}

.erro {
  color: var(--error);
}

/* ── Cartões e blocos: mesma receita da aba do quiz de bancada ───────────── */

.cartoes {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 8px;
}

.cartao {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px;
  border-radius: var(--radius);
  background: var(--bg-card);
  border: 1px solid var(--border);
}

.cartao__valor {
  font-size: 22px;
  font-weight: 900;
  color: var(--text);
}

.cartao__rotulo {
  font-size: 11px;
  color: var(--text-muted);
}

.bloco {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
  border-radius: var(--radius-lg);
  background: var(--bg-card);
  border: 1px solid var(--border);
}

.temas {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 8px;
}

.tema {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: var(--radius);
  background: var(--bg-surface);
  border-left: 4px solid var(--cor);
}

/* Um tema sem treino nenhum continua na grade (o zero é o dado), mas recuado
   para não competir com os que têm volume. */
.tema--vazio {
  opacity: 0.55;
}

.tema__icone {
  color: var(--cor-icone);
  flex-shrink: 0;
}

.tema__nome {
  font-size: 12px;
  color: var(--text);
}

.tema__num {
  font-size: 11px;
  color: var(--text-muted);
  white-space: nowrap;
}

.barra {
  grid-column: 1 / -1;
  height: 4px;
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.08);
  overflow: hidden;
}

.barra__preenchida {
  height: 100%;
  background: var(--cor);
}
</style>
