<script setup>
import { computed, onMounted, ref } from 'vue'
import api from '../services/api'
import { getType } from '../data/types'

// Errata — a primeira tela de ESCRITA do painel (o resto é leitura, ver
// docs/METRICAS.md). Ela mostra o gabarito, então vive dentro do AdminLayout e
// não pode ser alcançada a partir da bancada, que é virada para o aluno.
//
// Três seções na mesma tela porque é o mesmo fluxo, tocado por pessoas
// diferentes ao longo do dia: o operador abre, o revisor julga, o operador dá o
// check. Separar em três rotas obrigaria a fila da bancada a esperar navegação.

const SECOES = [
  { id: 'abrir', label: 'Abrir' },
  { id: 'revisar', label: 'Revisar' },
  { id: 'vouchers', label: 'Vouchers' },
]

const DIFICULDADES = { facil: 'Fácil', media: 'Média', dificil: 'Difícil' }
const rotuloTema = (id) => getType(id)?.label ?? id

const secao = ref('abrir')

// ── Abrir ───────────────────────────────────────────────────────────────────
const codigo = ref('')
const matricula = ref('')
const observacao = ref('')
const abrindo = ref(false)
const erroAbrir = ref('')
const abertaAgora = ref(null)

async function abrirErrata() {
  abrindo.value = true
  erroAbrir.value = ''
  abertaAgora.value = null
  try {
    const { data } = await api.post('/admin/errata', {
      code: codigo.value.trim(),
      matricula: matricula.value.trim(),
      notes: observacao.value.trim() || undefined,
    })
    abertaAgora.value = data
    codigo.value = ''
    matricula.value = ''
    observacao.value = ''
    // A fila de revisão acabou de mudar; recarregar aqui evita o revisor
    // encontrar uma lista velha ao trocar de seção.
    await carregarErratas()
  } catch (e) {
    erroAbrir.value = mensagemDeErro(e, 'Não foi possível abrir a contestação.')
  } finally {
    abrindo.value = false
  }
}

// ── Revisar ─────────────────────────────────────────────────────────────────
const erratas = ref([])
const carregandoErratas = ref(false)
const erroErratas = ref('')
const filtroStatus = ref('aberta')
const expandida = ref(null)
const rascunhos = ref({})
const salvando = ref('')
const erroRevisao = ref('')

async function carregarErratas() {
  carregandoErratas.value = true
  erroErratas.value = ''
  try {
    const params = filtroStatus.value ? { status: filtroStatus.value } : {}
    const { data } = await api.get('/admin/errata', { params })
    erratas.value = data
  } catch (e) {
    erroErratas.value = mensagemDeErro(e, 'Não foi possível carregar as contestações.')
  } finally {
    carregandoErratas.value = false
  }
}

/**
 * O rascunho é uma CÓPIA da questão: enquanto o admin edita, a lista continua
 * mostrando o que está valendo no banco. Só o "Salvar correção" promove.
 */
function alternar(errata) {
  if (expandida.value === errata.id) {
    expandida.value = null
    return
  }
  expandida.value = errata.id
  rascunhos.value[errata.id] = {
    prompt: errata.questao.prompt,
    options: [...errata.questao.options],
    answer: errata.questao.answer,
    active: errata.questao.active,
  }
}

async function salvarCorrecao(errata) {
  const rascunho = rascunhos.value[errata.id]
  salvando.value = errata.id
  erroRevisao.value = ''
  try {
    await api.patch(`/admin/quiz/questions/${errata.questao.id}`, {
      prompt: rascunho.prompt.trim(),
      options: rascunho.options.map((o) => o.trim()),
      answer: rascunho.answer,
      active: rascunho.active,
    })
    await carregarErratas()
  } catch (e) {
    erroRevisao.value = mensagemDeErro(e, 'Não foi possível salvar a correção.')
  } finally {
    salvando.value = ''
  }
}

async function julgar(errata, status) {
  salvando.value = errata.id
  erroRevisao.value = ''
  try {
    await api.patch(`/admin/errata/${errata.id}`, { status })
    expandida.value = null
    await carregarErratas()
  } catch (e) {
    erroRevisao.value = mensagemDeErro(e, 'Não foi possível registrar a decisão.')
  } finally {
    salvando.value = ''
  }
}

// ── Vouchers ────────────────────────────────────────────────────────────────
const buscaMatricula = ref('')
const buscando = ref(false)
const erroVouchers = ref('')
const resultadoVouchers = ref(null)
const resgatando = ref('')

async function buscarVouchers() {
  if (!buscaMatricula.value.trim()) return
  buscando.value = true
  erroVouchers.value = ''
  try {
    const { data } = await api.get('/vouchers', {
      params: { matricula: buscaMatricula.value.trim() },
    })
    resultadoVouchers.value = data
  } catch (e) {
    resultadoVouchers.value = null
    erroVouchers.value = mensagemDeErro(e, 'Não foi possível buscar os vouchers.')
  } finally {
    buscando.value = false
  }
}

async function resgatar(voucher) {
  resgatando.value = voucher.id
  erroVouchers.value = ''
  try {
    await api.post(`/vouchers/${voucher.id}/redeem`)
    await buscarVouchers()
  } catch (e) {
    // 409 é o caso real da mesa: outro operador já deu o check.
    erroVouchers.value = mensagemDeErro(e, 'Não foi possível dar o check.')
    await buscarVouchers()
  } finally {
    resgatando.value = ''
  }
}

const disponiveis = computed(
  () => resultadoVouchers.value?.vouchers.filter((v) => v.status === 'disponivel') ?? [],
)
const jaUsados = computed(
  () => resultadoVouchers.value?.vouchers.filter((v) => v.status !== 'disponivel') ?? [],
)

// ── Comuns ──────────────────────────────────────────────────────────────────
function mensagemDeErro(e, padrao) {
  if (e.response?.status === 403) return 'Esta área é restrita a administradores.'
  // A mensagem do servidor é escrita para o operador ler em voz alta
  // ("Nenhuma questão com o código #0000"), então vale mais que a genérica.
  const doServidor = e.response?.data?.message
  return typeof doServidor === 'string' ? doServidor : padrao
}

const quando = (iso) =>
  new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })

onMounted(carregarErratas)
</script>

<template>
  <div class="tela">
    <header class="cabecalho">
      <div>
        <h2 class="pixel titulo">Errata</h2>
        <p class="sub">
          O aluno contesta a questão pelo código de 4 dígitos. Se a errata for procedente, ele ganha
          um voucher que vale um QR sem responder outra pergunta — e o operador dá o check aqui na
          hora de entregar a ficha.
        </p>
      </div>
    </header>

    <nav class="segmentos" role="tablist" aria-label="Seções da errata">
      <button
        v-for="s in SECOES"
        :key="s.id"
        class="segmento"
        :class="{ 'segmento--ativo': secao === s.id }"
        type="button"
        role="tab"
        :aria-selected="secao === s.id"
        @click="secao = s.id"
      >
        {{ s.label }}
      </button>
    </nav>

    <!-- ── Abrir ────────────────────────────────────────────────────────── -->
    <section v-if="secao === 'abrir'" class="bloco" aria-label="Abrir contestação">
      <span class="pixel bloco__titulo">MARCAR QUESTÃO COMO QUESTIONADA</span>

      <form class="form" @submit.prevent="abrirErrata">
        <label class="campo-rotulo">
          Código da questão
          <input
            v-model="codigo"
            class="campo campo--codigo"
            inputmode="numeric"
            pattern="[0-9]*"
            maxlength="4"
            placeholder="4821"
            required
          />
        </label>

        <label class="campo-rotulo">
          Matrícula do aluno
          <input
            v-model="matricula"
            class="campo"
            inputmode="numeric"
            placeholder="202312345"
            required
          />
        </label>

        <label class="campo-rotulo campo-rotulo--largo">
          O que o aluno alegou (opcional)
          <input
            v-model="observacao"
            class="campo"
            maxlength="500"
            placeholder="Ex.: diz que há duas alternativas certas"
          />
        </label>

        <button class="botao botao--principal" type="submit" :disabled="abrindo">
          {{ abrindo ? 'Registrando…' : 'Marcar como questionada' }}
        </button>
      </form>

      <p v-if="erroAbrir" class="aviso aviso--erro" role="alert">{{ erroAbrir }}</p>

      <div v-if="abertaAgora" class="confirmacao">
        <p class="confirmacao__titulo">Contestação registrada — #{{ abertaAgora.questao.code }}</p>
        <p class="confirmacao__linha">
          {{ abertaAgora.aluno.name }} · {{ abertaAgora.aluno.matricula }}
        </p>
        <p class="confirmacao__enunciado">{{ abertaAgora.questao.prompt }}</p>
        <p v-if="abertaAgora.tentativa" class="confirmacao__linha">
          Ele respondeu a alternativa
          {{
            abertaAgora.tentativa.answerIndex === null
              ? '— (tempo esgotado)'
              : abertaAgora.tentativa.answerIndex + 1
          }}
          e
          {{ abertaAgora.tentativa.correct ? 'acertou' : 'errou' }}.
        </p>
        <p v-else class="confirmacao__linha">
          Não há tentativa registrada deste aluno nesta questão.
        </p>
      </div>
    </section>

    <!-- ── Revisar ──────────────────────────────────────────────────────── -->
    <section v-if="secao === 'revisar'" class="bloco" aria-label="Revisar contestações">
      <header class="bloco__head">
        <span class="pixel bloco__titulo">FILA DE REVISÃO</span>
        <select
          v-model="filtroStatus"
          class="campo"
          aria-label="Filtrar por situação"
          @change="carregarErratas"
        >
          <option value="aberta">Abertas</option>
          <option value="procedente">Procedentes</option>
          <option value="improcedente">Improcedentes</option>
          <option value="">Todas</option>
        </select>
      </header>

      <p v-if="erroErratas" class="aviso aviso--erro" role="alert">{{ erroErratas }}</p>
      <p v-else-if="carregandoErratas" class="aviso">Carregando…</p>
      <p v-else-if="!erratas.length" class="aviso">Nenhuma contestação nesta situação.</p>

      <ul v-else class="lista">
        <li v-for="e in erratas" :key="e.id" class="item">
          <button class="item__topo" type="button" @click="alternar(e)">
            <span class="pixel item__codigo">#{{ e.questao.code }}</span>
            <span class="item__meio">
              <span class="item__aluno">{{ e.aluno.name }} · {{ e.aluno.matricula }}</span>
              <span class="item__enunciado">{{ e.questao.prompt }}</span>
            </span>
            <span class="etiqueta" :class="`etiqueta--${e.status}`">{{ e.status }}</span>
          </button>

          <div v-if="expandida === e.id && rascunhos[e.id]" class="item__corpo">
            <p class="meta">
              Aberta por {{ e.abertaPor }} em {{ quando(e.criadaEm) }} ·
              {{ rotuloTema(e.questao.theme) }} ·
              {{ DIFICULDADES[e.questao.difficulty] ?? e.questao.difficulty }}
            </p>
            <p v-if="e.notes" class="meta meta--alegacao">"{{ e.notes }}"</p>
            <p v-if="e.tentativa" class="meta">
              O aluno marcou a alternativa
              {{ e.tentativa.answerIndex === null ? '—' : e.tentativa.answerIndex + 1 }}
              e {{ e.tentativa.correct ? 'acertou' : 'errou' }}
              <template v-if="e.tentativa.annulled"> · tentativa anulada</template>
            </p>

            <label class="campo-rotulo campo-rotulo--largo">
              Enunciado
              <textarea v-model="rascunhos[e.id].prompt" class="campo campo--area" rows="2" />
            </label>

            <fieldset class="alternativas">
              <legend class="campo-rotulo">Alternativas e gabarito</legend>
              <label v-for="(_, i) in rascunhos[e.id].options" :key="i" class="alternativa">
                <input
                  v-model="rascunhos[e.id].answer"
                  type="radio"
                  :value="i"
                  :name="`gabarito-${e.id}`"
                />
                <input v-model="rascunhos[e.id].options[i]" class="campo" />
              </label>
            </fieldset>

            <label class="ativa">
              <input v-model="rascunhos[e.id].active" type="checkbox" />
              Questão ativa (desmarque para tirá-la do sorteio)
            </label>

            <p v-if="erroRevisao" class="aviso aviso--erro" role="alert">{{ erroRevisao }}</p>

            <div class="acoes">
              <button
                class="botao"
                type="button"
                :disabled="salvando === e.id"
                @click="salvarCorrecao(e)"
              >
                Salvar correção
              </button>
              <template v-if="e.status === 'aberta'">
                <button
                  class="botao botao--principal"
                  type="button"
                  :disabled="salvando === e.id"
                  @click="julgar(e, 'procedente')"
                >
                  Procedente (emite voucher)
                </button>
                <button
                  class="botao"
                  type="button"
                  :disabled="salvando === e.id"
                  @click="julgar(e, 'improcedente')"
                >
                  Improcedente
                </button>
              </template>
              <span v-else class="meta">
                Julgada por {{ e.resolvidaPor }} em {{ quando(e.resolvidaEm) }}
              </span>
            </div>
          </div>
        </li>
      </ul>
    </section>

    <!-- ── Vouchers ─────────────────────────────────────────────────────── -->
    <section v-if="secao === 'vouchers'" class="bloco" aria-label="Vouchers">
      <span class="pixel bloco__titulo">CHECK DO VOUCHER</span>

      <form class="form form--busca" @submit.prevent="buscarVouchers">
        <label class="campo-rotulo">
          Matrícula do aluno
          <!-- Teclado numérico e alvo grande: a fila da bancada é o gargalo, e
               esta tela tem de resolver em dois toques. -->
          <input
            v-model="buscaMatricula"
            class="campo campo--grande"
            inputmode="numeric"
            placeholder="202312345"
            required
          />
        </label>
        <button class="botao botao--principal botao--grande" type="submit" :disabled="buscando">
          {{ buscando ? 'Buscando…' : 'Buscar' }}
        </button>
      </form>

      <p v-if="erroVouchers" class="aviso aviso--erro" role="alert">{{ erroVouchers }}</p>

      <template v-if="resultadoVouchers">
        <p class="meta">
          {{ resultadoVouchers.aluno.name }} · {{ resultadoVouchers.aluno.matricula }}
        </p>

        <p v-if="!disponiveis.length" class="aviso">Nenhum voucher disponível para este aluno.</p>

        <ul v-else class="lista">
          <li v-for="v in disponiveis" :key="v.id" class="voucher">
            <span class="voucher__info">
              <strong>Errata da questão #{{ v.questaoCode ?? '—' }}</strong>
              <span class="meta">
                {{ v.theme ? rotuloTema(v.theme) : 'Sem tema' }} · emitido em
                {{ quando(v.criadoEm) }}
              </span>
            </span>
            <button
              class="botao botao--principal botao--grande"
              type="button"
              :disabled="resgatando === v.id"
              @click="resgatar(v)"
            >
              {{ resgatando === v.id ? '…' : 'Dar check ✓' }}
            </button>
          </li>
        </ul>

        <details v-if="jaUsados.length" class="usados">
          <summary>{{ jaUsados.length }} já resgatado(s)</summary>
          <ul class="lista">
            <li v-for="v in jaUsados" :key="v.id" class="voucher voucher--usado">
              <span class="voucher__info">
                <strong>Errata da questão #{{ v.questaoCode ?? '—' }}</strong>
                <span class="meta">
                  {{ v.status }}
                  <template v-if="v.resgatadoEm"> em {{ quando(v.resgatadoEm) }}</template>
                </span>
              </span>
            </li>
          </ul>
        </details>
      </template>
    </section>
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
  max-width: 62ch;
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-muted);
}

.segmentos {
  display: flex;
  gap: 4px;
  padding: 4px;
  border-radius: var(--radius);
  background: var(--bg-surface);
  border: 1px solid var(--border);
  align-self: flex-start;
}

.segmento {
  min-height: 36px;
  padding: 0 16px;
  border: 0;
  border-radius: calc(var(--radius) - 4px);
  background: transparent;
  color: var(--text-muted);
  font-size: 13px;
  cursor: pointer;
}

.segmento--ativo {
  background: var(--bg-card);
  color: var(--yellow);
}

.bloco {
  display: flex;
  flex-direction: column;
  gap: 12px;
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

.form {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  align-items: flex-end;
}

.form--busca {
  align-items: flex-end;
}

.campo-rotulo {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 11px;
  color: var(--text-muted);
}

.campo-rotulo--largo {
  flex: 1;
  min-width: 220px;
}

.campo {
  min-height: 38px;
  padding: 0 10px;
  border-radius: var(--radius);
  background: var(--bg-surface);
  color: var(--text);
  border: 1px solid var(--border);
  font-size: 14px;
}

.campo--codigo {
  width: 7ch;
  letter-spacing: 0.2em;
  text-align: center;
}

.campo--grande {
  min-height: 48px;
  font-size: 18px;
}

.campo--area {
  padding: 8px 10px;
  min-height: 56px;
  font-family: inherit;
  line-height: 1.5;
  resize: vertical;
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

.botao--grande {
  min-height: 48px;
  padding: 0 22px;
  font-size: 15px;
}

.aviso {
  margin: 4px 0;
  font-size: 13px;
  color: var(--text-muted);
}

.aviso--erro {
  color: var(--red-light);
}

.confirmacao {
  padding: 12px;
  border-radius: var(--radius);
  background: var(--bg-surface);
  border-left: 4px solid var(--yellow);
}

.confirmacao__titulo {
  margin: 0 0 6px;
  font-weight: 700;
  font-size: 14px;
}

.confirmacao__linha {
  margin: 2px 0;
  font-size: 12px;
  color: var(--text-muted);
}

.confirmacao__enunciado {
  margin: 8px 0;
  font-size: 14px;
  line-height: 1.5;
}

.lista {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.item {
  border-radius: var(--radius);
  background: var(--bg-surface);
  border: 1px solid var(--border);
  overflow: hidden;
}

.item__topo {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: transparent;
  border: 0;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.item__codigo {
  font-size: 12px;
  color: var(--yellow);
  flex-shrink: 0;
}

.item__meio {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.item__aluno {
  font-size: 12px;
  color: var(--text-muted);
}

.item__enunciado {
  font-size: 14px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.item__corpo {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 0 12px 12px;
  border-top: 1px solid var(--border);
  padding-top: 12px;
}

.meta {
  margin: 0;
  font-size: 12px;
  color: var(--text-muted);
}

.meta--alegacao {
  font-style: italic;
  color: var(--text);
}

.alternativas {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  padding: 0;
  border: 0;
}

.alternativa {
  display: flex;
  align-items: center;
  gap: 10px;
}

.alternativa .campo {
  flex: 1;
}

.ativa {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text-muted);
}

.acoes {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
}

.etiqueta {
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 11px;
  border: 1px solid var(--border);
  white-space: nowrap;
  flex-shrink: 0;
}

.etiqueta--aberta {
  color: var(--yellow);
  border-color: var(--yellow);
}

.etiqueta--procedente {
  color: #4ade80;
  border-color: #4ade80;
}

.etiqueta--improcedente {
  color: var(--text-muted);
}

.voucher {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  padding: 12px;
  border-radius: var(--radius);
  background: var(--bg-surface);
  border: 1px solid var(--border);
}

.voucher--usado {
  opacity: 0.6;
}

.voucher__info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.usados summary {
  font-size: 12px;
  color: var(--text-muted);
  cursor: pointer;
  margin-bottom: 8px;
}
</style>
