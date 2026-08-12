<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import api from '../services/api'
import { TYPE_CYCLE, getType } from '../data/types'

const router = useRouter()

const carregando = ref(true)
const erro = ref('')
const stats = ref(null)
const pagina = ref(null)

const filtroTema = ref('')
const filtroMatricula = ref('')
const filtroResultado = ref('') // '' | 'true' | 'false'
const offset = ref(0)
const LIMITE = 50

const DIFICULDADES = { facil: 'Fácil', media: 'Média', dificil: 'Difícil' }

const rotuloTema = (id) => getType(id)?.label ?? id
const corTema = (id) => getType(id)?.color ?? 'var(--text-muted)'

async function carregar() {
  carregando.value = true
  erro.value = ''
  try {
    const params = { limit: LIMITE, offset: offset.value }
    if (filtroTema.value) params.theme = filtroTema.value
    if (filtroMatricula.value.trim()) params.matricula = filtroMatricula.value.trim()
    if (filtroResultado.value) params.correct = filtroResultado.value

    const [s, a] = await Promise.all([
      api.get('/admin/quiz/stats'),
      api.get('/admin/quiz/attempts', { params }),
    ])
    stats.value = s.data
    pagina.value = a.data
  } catch (e) {
    erro.value =
      e.response?.status === 403
        ? 'Esta área é restrita a administradores.'
        : 'Não foi possível carregar as tentativas.'
  } finally {
    carregando.value = false
  }
}

onMounted(carregar)

// Trocar filtro volta para a primeira página: manter o offset mostraria uma
// página vazia de um resultado que agora tem 3 linhas.
let debounce = null
watch([filtroTema, filtroResultado], () => {
  offset.value = 0
  void carregar()
})
watch(filtroMatricula, () => {
  offset.value = 0
  if (debounce) clearTimeout(debounce)
  debounce = setTimeout(() => void carregar(), 350)
})

const temMais = computed(
  () => pagina.value && offset.value + LIMITE < pagina.value.total,
)

function proxima() {
  offset.value += LIMITE
  void carregar()
}
function anterior() {
  offset.value = Math.max(0, offset.value - LIMITE)
  void carregar()
}

const porTema = computed(() => {
  const mapa = new Map((stats.value?.porTema ?? []).map((t) => [t.chave, t]))
  return TYPE_CYCLE.map((t) => ({
    id: t.id,
    label: t.label,
    icon: t.icon,
    color: t.color,
    ...(mapa.get(t.id) ?? { tentativas: 0, acertos: 0, taxa: null }),
  }))
})

const quando = (iso) =>
  new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
</script>

<template>
  <div class="tela">
    <header class="cabecalho">
      <div>
        <h2 class="pixel titulo">Quiz da bancada</h2>
        <p class="sub">
          Tentativas registradas no estande. Cada aluno tem 60s por questão e
          10 minutos de espera por tema.
        </p>
      </div>
      <button
        class="botao botao--principal"
        type="button"
        @click="router.push({ name: 'admin-quiz-bancada' })"
      >
        Abrir a bancada
      </button>
    </header>

    <p v-if="erro" class="aviso aviso--erro" role="alert">{{ erro }}</p>

    <template v-else>
      <!-- Resumo -->
      <section v-if="stats" class="cartoes" aria-label="Resumo do quiz">
        <div class="cartao">
          <span class="cartao__valor">{{ stats.geral.tentativas }}</span>
          <span class="cartao__rotulo">Tentativas</span>
        </div>
        <div class="cartao">
          <span class="cartao__valor">{{ stats.geral.acertos }}</span>
          <span class="cartao__rotulo">Acertos</span>
        </div>
        <div class="cartao">
          <span class="cartao__valor">
            {{ stats.geral.taxa === null ? '—' : stats.geral.taxa + '%' }}
          </span>
          <span class="cartao__rotulo">Taxa de acerto</span>
        </div>
        <div
          v-for="d in stats.porDificuldade"
          :key="d.chave"
          class="cartao cartao--menor"
        >
          <span class="cartao__valor">
            {{ d.taxa === null ? '—' : d.taxa + '%' }}
          </span>
          <span class="cartao__rotulo">{{ DIFICULDADES[d.chave] ?? d.chave }}</span>
        </div>
      </section>

      <!-- Por tema -->
      <section class="bloco" aria-label="Desempenho por tema">
        <span class="pixel bloco__titulo">POR TEMA</span>
        <ul class="temas">
          <li
            v-for="t in porTema"
            :key="t.id"
            class="tema"
            :style="{ '--cor': t.color }"
          >
            <span class="tema__icone">{{ t.icon }}</span>
            <span class="tema__nome">{{ t.label }}</span>
            <span class="tema__num">
              {{ t.acertos }}/{{ t.tentativas }}
              <template v-if="t.taxa !== null"> · {{ t.taxa }}%</template>
            </span>
          </li>
        </ul>
      </section>

      <!-- Tentativas -->
      <section class="bloco" aria-label="Tentativas">
        <header class="bloco__head">
          <span class="pixel bloco__titulo">TENTATIVAS</span>
          <div class="filtros">
            <input
              v-model="filtroMatricula"
              class="campo"
              type="search"
              placeholder="Matrícula"
              aria-label="Filtrar por matrícula"
            />
            <select v-model="filtroTema" class="campo" aria-label="Filtrar por tema">
              <option value="">Todos os temas</option>
              <option v-for="t in TYPE_CYCLE" :key="t.id" :value="t.id">
                {{ t.label }}
              </option>
            </select>
            <select
              v-model="filtroResultado"
              class="campo"
              aria-label="Filtrar por resultado"
            >
              <option value="">Acertos e erros</option>
              <option value="true">Só acertos</option>
              <option value="false">Só erros</option>
            </select>
          </div>
        </header>

        <p v-if="carregando" class="aviso">Carregando…</p>
        <p v-else-if="!pagina?.itens.length" class="aviso">
          Nenhuma tentativa com esses filtros.
        </p>

        <div v-else class="tabela-rolagem">
          <table class="tabela">
            <thead>
              <tr>
                <th>Quando</th>
                <th>Aluno</th>
                <th>Tema</th>
                <th>Nível</th>
                <th>Tempo</th>
                <th>Resultado</th>
                <th>Operador</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="t in pagina.itens" :key="t.id">
                <td class="nowrap">{{ quando(t.quando) }}</td>
                <td>
                  <span class="aluno">{{ t.aluno }}</span>
                  <span class="matricula">{{ t.matricula }}</span>
                </td>
                <td>
                  <span class="etiqueta" :style="{ '--cor': corTema(t.theme) }">
                    {{ rotuloTema(t.theme) }}
                  </span>
                </td>
                <td>{{ DIFICULDADES[t.difficulty] ?? t.difficulty }}</td>
                <td class="nowrap">{{ t.segundos }}s</td>
                <td>
                  <span :class="['resultado', t.correct ? 'resultado--ok' : 'resultado--erro']">
                    {{ t.correct ? 'Acertou' : 'Errou' }}
                  </span>
                </td>
                <td class="operador">{{ t.operador }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <footer v-if="pagina" class="paginacao">
          <button
            class="botao"
            type="button"
            :disabled="offset === 0"
            @click="anterior"
          >
            ← Anteriores
          </button>
          <span class="paginacao__info">
            {{ pagina.total ? offset + 1 : 0 }}–{{
              Math.min(offset + LIMITE, pagina.total)
            }}
            de {{ pagina.total }}
          </span>
          <button class="botao" type="button" :disabled="!temMais" @click="proxima">
            Próximas →
          </button>
        </footer>
      </section>
    </template>
  </div>
</template>

<style scoped>
.tela {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.cabecalho {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.titulo {
  margin: 0;
  font-size: 15px;
  color: var(--text);
}

.sub {
  margin: 6px 0 0;
  max-width: 52ch;
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-muted);
}

.botao {
  min-height: 38px;
  padding: 0 14px;
  border-radius: var(--radius);
  background: var(--bg-surface);
  color: var(--text);
  border: 1px solid var(--border);
  font-size: 13px;
  cursor: pointer;
}

.botao:disabled {
  opacity: 0.45;
  cursor: default;
}

.botao--principal {
  background: var(--red-dark);
  border-color: var(--red-light);
  color: #fff;
  font-weight: 700;
}

.aviso {
  margin: 8px 0;
  font-size: 13px;
  color: var(--text-muted);
  text-align: center;
}

.aviso--erro {
  color: var(--red-light);
}

/* Cartões */
.cartoes {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
  gap: 10px;
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
  color: var(--yellow);
}

.cartao--menor .cartao__valor {
  font-size: 17px;
  color: var(--text);
}

.cartao__rotulo {
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

.filtros {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.campo {
  min-height: 36px;
  padding: 0 10px;
  border-radius: var(--radius);
  background: var(--bg-surface);
  color: var(--text);
  border: 1px solid var(--border);
  font-size: 13px;
}

/* Temas */
.temas {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
  gap: 8px;
}

.tema {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: var(--radius);
  background: var(--bg-surface);
  border-left: 4px solid var(--cor);
}

.tema__icone {
  font-size: 16px;
}

.tema__nome {
  flex: 1;
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tema__num {
  font-size: 12px;
  color: var(--text-muted);
  white-space: nowrap;
}

/* Tabela */
.tabela-rolagem {
  overflow-x: auto;
}

.tabela {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.tabela th,
.tabela td {
  padding: 8px 10px;
  text-align: left;
  border-bottom: 1px solid var(--border);
  vertical-align: top;
}

.tabela th {
  font-size: 11px;
  color: var(--text-muted);
  font-weight: 600;
  white-space: nowrap;
}

.nowrap {
  white-space: nowrap;
}

.aluno {
  display: block;
}

.matricula {
  display: block;
  font-size: 11px;
  color: var(--text-muted);
}

.operador {
  font-size: 12px;
  color: var(--text-muted);
}

.etiqueta {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  background: color-mix(in srgb, var(--cor) 22%, transparent);
  border: 1px solid var(--cor);
  white-space: nowrap;
}

.resultado {
  font-weight: 700;
  font-size: 12px;
}

.resultado--ok {
  color: #4ade80;
}

.resultado--erro {
  color: var(--red-light);
}

.paginacao {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}

.paginacao__info {
  font-size: 12px;
  color: var(--text-muted);
}
</style>
