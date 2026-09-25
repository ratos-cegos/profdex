<script setup>
import { computed, onMounted, ref } from 'vue'
import TypeIcon from '../components/TypeIcon.vue'
import { getType, legibleColor } from '../data/types'
import api from '../services/api'

// Fichas de captura — estoque e tiragem nova.
//
// Três coisas moldam esta tela e valem ser lembradas antes de mexer:
//
// 1. O banco guarda só `sha256(token)`. UMA FICHA GERADA NÃO PODE SER
//    REIMPRESSA: a folha que abre depois de gerar é a única vez que aqueles
//    QRs existem. Por isso o aviso é fixo, não um toast que some.
// 2. Uma tiragem nova não invalida as anteriores (é decisão do sistema —
//    imprimir mais não pode inutilizar papel que já está com aluno). Daí a
//    coluna "vivas no total" ao lado das contagens da última tiragem: sem ela,
//    ler "1 ficha de IA" leva a reimprimir o que já está circulando.
// 3. A ficha vale por TIPO: a bancada entrega a do tema da questão que o aluno
//    acertou, e quem sai é sorteado no scan. Tipo SEM PROFESSOR ATIVO é papel
//    que não captura nada — por isso a linha é marcada e a tiragem dele exige
//    confirmação extra.

const TETO_COPIAS = 20

const carregando = ref(true)
const erro = ref('')
const ultimaTiragem = ref(null)
const tipos = ref([])

const copias = ref(1)
const selecionadas = ref(new Set())
const plano = ref(null)
const simulando = ref(false)
const gerando = ref(false)
const erroGeracao = ref('')
// Confirmação de que o admin sabe que vai imprimir ficha de tipo vazio.
const confirmouVazios = ref(false)
// Só preenchido quando o navegador bloqueia o pop-up: a folha existe e não pode
// ser perdida por causa de uma configuração do navegador.
const folhaUrl = ref(null)

const totalVivas = computed(() => tipos.value.reduce((s, t) => s + t.alive, 0))
const totalResgatadas = computed(() =>
  tipos.value.reduce((s, t) => s + t.redeemedTotal, 0),
)

// Nada marcado = todos, que é o padrão do script. O texto do botão precisa
// dizer isso, senão "gerar sem marcar nada" parece um engano.
const alvo = computed(() =>
  selecionadas.value.size ? [...selecionadas.value] : undefined,
)
const quantosTipos = computed(() => selecionadas.value.size || tipos.value.length)

// Os tipos que entram na tiragem e não têm ninguém para entregar. É o que
// transforma "Gerar" em "Gerar mesmo assim".
const vaziosNaTiragem = computed(() =>
  tipos.value.filter(
    (t) =>
      t.professors === 0 &&
      (!selecionadas.value.size || selecionadas.value.has(t.type)),
  ),
)

// A cor canônica preenche área; em traço sobre fundo escuro o cinza da Eng. de
// Software (#495057) daria 1,7:1. `legibleColor` clareia mantendo o matiz.
const corDoTipo = (id) => legibleColor(getType(id)?.color ?? '#888')

function mensagemDeErro(e, padrao) {
  return e?.response?.data?.message ?? padrao
}

function alternar(type) {
  const proximo = new Set(selecionadas.value)
  if (proximo.has(type)) proximo.delete(type)
  else proximo.add(type)
  selecionadas.value = proximo
  // O plano vira mentira assim que a seleção muda.
  plano.value = null
}

function limparSelecao() {
  selecionadas.value = new Set()
  plano.value = null
}

async function carregar() {
  carregando.value = true
  erro.value = ''
  try {
    const { data } = await api.get('/admin/capture-tokens')
    ultimaTiragem.value = data.lastBatch
    tipos.value = data.types
    raros.value = data.rares ?? []
  } catch (e) {
    erro.value = mensagemDeErro(e, 'Não foi possível carregar o estoque.')
  } finally {
    carregando.value = false
  }
}

async function simular() {
  simulando.value = true
  erroGeracao.value = ''
  plano.value = null
  try {
    const { data } = await api.post('/admin/capture-tokens/preview', {
      copies: copias.value,
      types: alvo.value,
    })
    plano.value = data
  } catch (e) {
    erroGeracao.value = mensagemDeErro(e, 'Não foi possível simular a tiragem.')
  } finally {
    simulando.value = false
  }
}

/**
 * Gera e abre a folha numa aba nova.
 *
 * A resposta é HTML, não JSON: a folha é artefato de impressão, com o CSS de
 * `@media print` que o script já provou em papel. Ela vira Blob URL porque a
 * chamada é um POST autenticado — não dá para apontar `window.open` para ela.
 */
async function gerar() {
  // Tipo sem professor rende papel que só devolve erro para o aluno. O servidor
  // recusa por padrão; aqui a confirmação é dada explicitamente, com a lista do
  // que está vazio na frente de quem decide.
  if (vaziosNaTiragem.value.length && !confirmouVazios.value) {
    erroGeracao.value =
      `Sem professor ativo: ${vaziosNaTiragem.value.map((t) => t.label).join(', ')}. ` +
      'Essas fichas não capturam nada até alguém ser cadastrado. Marque a ' +
      'confirmação abaixo para imprimir mesmo assim.'
    return
  }

  gerando.value = true
  erroGeracao.value = ''
  try {
    await abrirFolha('/admin/capture-tokens/batch', {
      copies: copias.value,
      types: alvo.value,
      allowEmpty: confirmouVazios.value,
    })
    plano.value = null
  } catch (e) {
    erroGeracao.value = mensagemDeErro(e, 'Não foi possível gerar a tiragem.')
  } finally {
    gerando.value = false
  }
}

/**
 * Pede a folha e a abre numa aba. Compartilhado pelas duas tiragens (por tipo e
 * de raro) porque o cuidado com o pop-up bloqueado vale igual nas duas: a folha
 * é a ÚNICA vez que aqueles QRs existem, e perdê-la por configuração de
 * navegador custaria a tiragem inteira.
 */
async function abrirFolha(rota, corpo) {
  let url = null
  try {
    const { data } = await api.post(rota, corpo, { responseType: 'blob' })
    url = URL.createObjectURL(new Blob([data], { type: 'text/html' }))
    const aba = window.open(url, '_blank', 'noopener')
    if (!aba) {
      erroGeracao.value =
        'As fichas foram geradas, mas o navegador bloqueou a aba. Libere pop-ups e use o link abaixo — ele vale só nesta página.'
      folhaUrl.value = url
      url = null // não revogar: o link ainda vai ser usado
    }
    await carregar()
  } finally {
    // A aba já carregou o documento; segurar a URL só vazaria memória.
    if (url) setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }
}

// ── Raros ───────────────────────────────────────────────────────────────────
// Pilha PRÓPRIA por raro, e nunca no mesmo formulário da tiragem por tipo:
// misturar as duas no mesmo papel acaba com o raro nos primeiros 10 minutos de
// evento (tarefa 15).
const raros = ref([])
const copiasRaras = ref(10)
const gerandoRaroId = ref(null)

async function gerarRaro(raro) {
  const ok = window.confirm(
    `Imprimir ${copiasRaras.value} ficha(s) de ✦ ${raro.name}?\n\n` +
      `Elas exigem 5 acertos em CADA tema: ${raro.label}.\n\n` +
      'A folha abre em outra aba e NÃO pode ser reimpressa — o banco guarda ' +
      'só o hash dos QRs. Mantenha esta pilha separada das fichas por tipo.',
  )
  if (!ok) return

  gerandoRaroId.value = raro.professorId
  erroGeracao.value = ''
  try {
    await abrirFolha('/admin/capture-tokens/rare-batch', {
      professorId: raro.professorId,
      copies: copiasRaras.value,
    })
  } catch (e) {
    erroGeracao.value = mensagemDeErro(
      e,
      `Não foi possível gerar as fichas de ${raro.name}.`,
    )
  } finally {
    gerandoRaroId.value = null
  }
}

const dataLegivel = (iso) =>
  new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

onMounted(carregar)
</script>

<template>
  <div class="tela">
    <header class="cabecalho">
      <div>
        <h1 class="titulo">Fichas de Captura</h1>
        <p class="sub">
          Cada ficha vale uma única captura. Uma tiragem nova não invalida as
          anteriores — por isso a coluna <strong>vivas</strong> soma todas as
          tiragens, e é ela que diz se ainda falta papel.
        </p>
      </div>
      <button class="botao" type="button" :disabled="carregando" @click="carregar">
        Atualizar
      </button>
    </header>

    <p v-if="erro" class="aviso aviso--erro">{{ erro }}</p>
    <p v-else-if="carregando" class="aviso">Carregando estoque…</p>

    <template v-else>
      <!-- Última tiragem -->
      <section class="bloco">
        <h2 class="bloco__titulo">Última tiragem</h2>
        <div v-if="ultimaTiragem" class="resumo">
          <div class="resumo__item">
            <span class="resumo__rotulo">Gerada em</span>
            <strong>{{ dataLegivel(ultimaTiragem.createdAt) }}</strong>
          </div>
          <div class="resumo__item">
            <span class="resumo__rotulo">Por</span>
            <strong>
              {{ ultimaTiragem.createdBy ?? 'script (sem autor)' }}
              <span v-if="ultimaTiragem.source === 'cli'" class="etiqueta">CLI</span>
            </strong>
          </div>
          <div class="resumo__item">
            <span class="resumo__rotulo">Fichas</span>
            <strong>{{ ultimaTiragem.total }}</strong>
          </div>
          <div class="resumo__item">
            <span class="resumo__rotulo">Cópias por tipo</span>
            <strong>{{ ultimaTiragem.copies }}</strong>
          </div>
        </div>
        <p v-else class="aviso">
          Nenhuma tiragem registrada ainda. Gere a primeira abaixo.
        </p>
      </section>

      <!-- Estoque -->
      <section class="bloco">
        <div class="bloco__head">
          <h2 class="bloco__titulo">Estoque por tipo</h2>
          <span class="bloco__meta">
            {{ totalVivas }} vivas · {{ totalResgatadas }} resgatadas
          </span>
        </div>

        <div class="tabela-rolagem">
          <table class="tabela">
            <thead>
              <tr>
                <th scope="col" class="col-check">
                  <span class="sr-only">Incluir na tiragem</span>
                </th>
                <th scope="col">Tipo</th>
                <th scope="col" class="num">Professores</th>
                <th scope="col" class="num">Nesta tiragem</th>
                <th scope="col" class="num">Resgatadas</th>
                <th scope="col" class="num">Vivas (total)</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="t in tipos"
                :key="t.type"
                :class="{
                  'linha--marcada': selecionadas.has(t.type),
                  'linha--vazia': t.professors === 0,
                }"
              >
                <td class="col-check">
                  <input
                    type="checkbox"
                    :checked="selecionadas.has(t.type)"
                    :aria-label="`Incluir fichas de ${t.label} na tiragem`"
                    @change="alternar(t.type)"
                  />
                </td>
                <td>
                  <span class="tipo">
                    <TypeIcon
                      class="tipo__icone"
                      :type="t.type"
                      :size="18"
                      :style="{ color: corDoTipo(t.type) }"
                    />
                    {{ t.label }}
                  </span>
                </td>
                <td class="num">
                  <span v-if="t.professors === 0" class="etiqueta etiqueta--alerta">
                    nenhum
                  </span>
                  <template v-else>{{ t.professors }}</template>
                </td>
                <td class="num">{{ t.lastBatch.total }}</td>
                <td class="num">{{ t.lastBatch.redeemed }}</td>
                <td class="num" :class="{ 'num--zero': t.alive === 0 }">
                  {{ t.alive }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <p v-if="tipos.some((t) => t.professors === 0)" class="aviso aviso--erro">
          Tipos sem professor ativo não capturam nada: quem escanear recebe um
          aviso e a ficha <strong>não</strong> é consumida — o aluno volta para a
          fila da bancada. Cadastre um professor do tipo antes de imprimir.
        </p>
      </section>

      <!-- Raros ✦.
           Bloco SEPARADO, com tiragem por raro. Nunca no formulário da tiragem
           por tipo: as duas pilhas no mesmo papel acabam com o raro nos
           primeiros 10 minutos de evento. -->
      <section v-if="raros.length" class="bloco bloco--raro">
        <div class="bloco__head">
          <h2 class="bloco__titulo">Raros ✦</h2>
          <span class="bloco__meta">{{ raros.length }} em circulação</span>
        </div>

        <p class="form__nota">
          Cada raro tem <strong>pilha própria</strong>, rotulada com o nome dele.
          O <strong>servidor</strong> recusa quem não destravou os temas — e a
          ficha recusada <strong>não</strong> é consumida, volta para a pilha.
        </p>

        <label class="campo-rotulo">
          Cópias por tiragem
          <input
            v-model.number="copiasRaras"
            class="campo"
            type="number"
            min="1"
            :max="TETO_COPIAS"
          />
        </label>

        <ul class="raros">
          <li v-for="r in raros" :key="r.professorId" class="raro">
            <div class="raro__id">
              <strong class="raro__nome">✦ {{ r.name }}</strong>
              <span class="raro__gate">exige 5 acertos em {{ r.label }}</span>
            </div>

            <div class="raro__numeros">
              <span class="raro__vivas" :class="{ 'raro__vivas--zero': !r.alive }">
                {{ r.alive }} vivas
              </span>
              <span class="raro__resgatadas">{{ r.redeemedTotal }} resgatadas</span>
            </div>

            <button
              class="botao botao--principal botao--pequeno"
              type="button"
              :disabled="gerandoRaroId === r.professorId || gerando"
              @click="gerarRaro(r)"
            >
              {{
                gerandoRaroId === r.professorId
                  ? 'Gerando…'
                  : `Imprimir ${copiasRaras} fichas`
              }}
            </button>
          </li>
        </ul>
      </section>

      <!-- Tiragem nova -->
      <section class="bloco">
        <h2 class="bloco__titulo">Gerar tiragem</h2>

        <p class="aviso aviso--forte">
          A folha abre uma única vez. <strong>Fichas geradas não podem ser
          reimpressas</strong> — o banco guarda só o hash do código. Imprima
          antes de fechar a aba.
        </p>

        <div class="form">
          <label class="campo-rotulo">
            Cópias por tipo
            <input
              v-model.number="copias"
              class="campo"
              type="number"
              min="1"
              :max="TETO_COPIAS"
              @input="plano = null"
            />
          </label>

          <p class="form__nota">
            {{ selecionadas.size ? `${selecionadas.size} tipo(s) marcado(s)` : 'Nada marcado — sai a roda completa' }}
            <button
              v-if="selecionadas.size"
              class="link"
              type="button"
              @click="limparSelecao"
            >
              limpar seleção
            </button>
          </p>
        </div>

        <p v-if="erroGeracao" class="aviso aviso--erro">{{ erroGeracao }}</p>
        <p v-if="folhaUrl" class="aviso">
          <a :href="folhaUrl" target="_blank" rel="noopener">Abrir a folha gerada →</a>
        </p>

        <div v-if="plano" class="plano">
          <p class="plano__linha">
            <strong>{{ plano.total }}</strong> fichas —
            {{ copias }} × {{ quantosTipos }} tipo(s).
          </p>
          <ul class="plano__lista">
            <li
              v-for="l in plano.lines"
              :key="l.type"
              :class="{ 'plano__item--vazio': l.professors === 0 }"
            >
              {{ l.label }} ×{{ l.copies }}
              <span v-if="l.professors === 0" class="etiqueta etiqueta--alerta">
                sem professor
              </span>
              <span v-else class="plano__meta">
                {{ l.professors }} professor(es)
              </span>
            </li>
          </ul>
        </div>

        <label v-if="vaziosNaTiragem.length" class="confirmacao">
          <input v-model="confirmouVazios" type="checkbox" />
          <span>
            Imprimir mesmo assim
            <strong>{{ vaziosNaTiragem.map((t) => t.label).join(', ') }}</strong>,
            sabendo que essas fichas ainda não capturam nada.
          </span>
        </label>

        <div class="acoes">
          <button
            class="botao"
            type="button"
            :disabled="simulando || gerando"
            @click="simular"
          >
            {{ simulando ? 'Simulando…' : 'Simular' }}
          </button>
          <button
            class="botao botao--principal"
            type="button"
            :disabled="!plano || gerando"
            @click="gerar"
          >
            {{ gerando ? 'Gerando…' : 'Gerar e imprimir' }}
          </button>
        </div>
        <p class="form__nota">
          Simule antes: é o passo que impede uma tiragem de centenas de fichas
          por engano. Para revogar fichas não resgatadas, use a linha de comando
          (<code>npm run qr:generate -- --revoke-unredeemed --yes</code>) — ela
          invalida papel que já está com aluno.
        </p>
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
  max-width: 62ch;
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-muted);
}

.bloco {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--bg-surface);
}

.bloco__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.bloco__titulo {
  margin: 0;
  font-size: 13px;
  color: var(--yellow);
}

.bloco__meta {
  font-size: 12px;
  color: var(--text-muted);
}

.resumo {
  display: flex;
  flex-wrap: wrap;
  gap: 24px;
}

.resumo__item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 13px;
}

.resumo__rotulo {
  font-size: 11px;
  color: var(--text-muted);
}

.etiqueta {
  margin-left: 6px;
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--bg-card);
  color: var(--text-muted);
  font-size: 10px;
}

/* "nenhum professor" não pode passar como mais um número apagado da tabela:
   é a diferença entre imprimir ficha e imprimir papel sem uso. */
.etiqueta--alerta {
  background: color-mix(in srgb, var(--error) 22%, transparent);
  color: var(--error);
  font-weight: 700;
}

.tipo {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.tipo__icone {
  flex: none;
}

.linha--vazia {
  background: color-mix(in srgb, var(--error) 7%, transparent);
}

.plano__item--vazio {
  color: var(--error);
}

.plano__meta {
  color: var(--text-muted);
  font-size: 11px;
}

/* Confirmação de imprimir tipo vazio: some quando não há tipo vazio na
   tiragem, então nunca vira caixinha que o operador marca por hábito. */
.confirmacao {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-top: 12px;
  padding: 10px 12px;
  border: 1px solid var(--error);
  border-radius: var(--radius);
  background: color-mix(in srgb, var(--error) 8%, transparent);
  font-size: 12px;
  line-height: 1.4;
}

/* A tabela é larga e o painel roda em tablet: a rolagem é dela, não da página. */
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
  white-space: nowrap;
}

.tabela th {
  font-size: 11px;
  color: var(--text-muted);
  font-weight: 600;
}

.num {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

/* Zero fichas vivas é o motivo número um de abrir esta tela. */
.num--zero {
  color: var(--error);
  font-weight: 700;
}

.col-check {
  width: 36px;
}

.linha--marcada {
  background: var(--bg-card);
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}

.form {
  display: flex;
  align-items: flex-end;
  gap: 16px;
  flex-wrap: wrap;
}

.campo-rotulo {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
  color: var(--text-muted);
}

/* ── Raros ✦ ───────────────────────────────────────────────────────────── */
.bloco--raro {
  border-color: color-mix(in srgb, var(--raro) 45%, var(--border));
}

.bloco--raro .bloco__titulo {
  color: var(--raro);
}

.raros {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.raro {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  padding: 10px 12px;
  border: 1px solid color-mix(in srgb, var(--raro) 35%, var(--border));
  border-radius: var(--radius);
  background: var(--bg-card);
}

.raro__id {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 180px;
}

.raro__nome {
  color: var(--raro);
  font-size: 13px;
}

.raro__gate {
  font-size: 11px;
  color: var(--text-muted);
}

.raro__numeros {
  display: flex;
  gap: 10px;
  font-size: 11px;
  color: var(--text-muted);
}

.raro__vivas {
  font-weight: 700;
  color: var(--text);
}

/* Pilha no fim é o aviso que importa: sem papel, quem destravar não recebe. */
.raro__vivas--zero {
  color: var(--error);
}

.campo {
  width: 120px;
  min-height: 40px;
  padding: 0 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--bg-card);
  color: var(--text);
  font-size: 14px;
}

.form__nota {
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-muted);
}

.form__nota code {
  padding: 1px 5px;
  border-radius: 4px;
  background: var(--bg-card);
  font-size: 11px;
}

.link {
  margin-left: 6px;
  border: 0;
  background: none;
  color: var(--yellow);
  font-size: 12px;
  text-decoration: underline;
  cursor: pointer;
}

.plano {
  padding: 12px;
  border: 1px dashed var(--border);
  border-radius: var(--radius);
}

.plano__linha {
  margin: 0 0 8px;
  font-size: 13px;
}

.plano__lista {
  margin: 0;
  padding-left: 18px;
  font-size: 12px;
  line-height: 1.7;
  color: var(--text-muted);
}

.acoes {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.botao {
  min-height: 40px;
  padding: 0 16px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--bg-card);
  color: var(--text);
  font-size: 13px;
  cursor: pointer;
}

.botao:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.botao--principal {
  border-color: var(--yellow);
  color: var(--yellow);
  font-weight: 700;
}

.aviso {
  margin: 0;
  padding: 10px 12px;
  border-radius: var(--radius);
  background: var(--bg-card);
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-muted);
}

.aviso--erro {
  border: 1px solid var(--error);
  color: var(--error);
}

.aviso--forte {
  border: 1px solid var(--yellow);
  color: var(--text);
}

.aviso a {
  color: var(--yellow);
}
</style>
