<script setup>
import { computed, onMounted, ref } from 'vue'
import api from '../services/api'

// Fichas de captura — estoque e tiragem nova.
//
// Duas coisas moldam esta tela e valem ser lembradas antes de mexer:
//
// 1. O banco guarda só `sha256(token)`. UMA FICHA GERADA NÃO PODE SER
//    REIMPRESSA: a folha que abre depois de gerar é a única vez que aqueles
//    QRs existem. Por isso o aviso é fixo, não um toast que some.
// 2. Uma tiragem nova não invalida as anteriores (é decisão do sistema —
//    imprimir mais não pode inutilizar papel que já está com aluno). Daí a
//    coluna "vivas no total" ao lado das contagens da última tiragem: sem ela,
//    ler "1 ficha do Eron" leva a reimprimir o que já está circulando.

const TETO_COPIAS = 20

const carregando = ref(true)
const erro = ref('')
const ultimaTiragem = ref(null)
const variantes = ref([])

const copias = ref(1)
const selecionadas = ref(new Set())
const plano = ref(null)
const simulando = ref(false)
const gerando = ref(false)
const erroGeracao = ref('')
// Só preenchido quando o navegador bloqueia o pop-up: a folha existe e não pode
// ser perdida por causa de uma configuração do navegador.
const folhaUrl = ref(null)

const totalVivas = computed(() => variantes.value.reduce((s, v) => s + v.alive, 0))
const totalResgatadas = computed(() =>
  variantes.value.reduce((s, v) => s + v.redeemedTotal, 0),
)

// Nada marcado = todas, que é o padrão do script. O texto do botão precisa
// dizer isso, senão "gerar sem marcar nada" parece um engano.
const alvo = computed(() =>
  selecionadas.value.size ? [...selecionadas.value] : undefined,
)
const quantasVariantes = computed(() =>
  selecionadas.value.size || variantes.value.length,
)

function mensagemDeErro(e, padrao) {
  return e?.response?.data?.message ?? padrao
}

function alternar(variantId) {
  const proximo = new Set(selecionadas.value)
  if (proximo.has(variantId)) proximo.delete(variantId)
  else proximo.add(variantId)
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
    variantes.value = data.variants
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
      variantIds: alvo.value,
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
  gerando.value = true
  erroGeracao.value = ''
  let url = null
  try {
    const { data } = await api.post(
      '/admin/capture-tokens/batch',
      { copies: copias.value, variantIds: alvo.value },
      { responseType: 'blob' },
    )
    url = URL.createObjectURL(new Blob([data], { type: 'text/html' }))
    const aba = window.open(url, '_blank', 'noopener')
    if (!aba) {
      erroGeracao.value =
        'As fichas foram geradas, mas o navegador bloqueou a aba. Libere pop-ups e use o link abaixo — ele vale só nesta página.'
      folhaUrl.value = url
      url = null // não revogar: o link ainda vai ser usado
    }
    plano.value = null
    await carregar()
  } catch (e) {
    erroGeracao.value = mensagemDeErro(e, 'Não foi possível gerar a tiragem.')
  } finally {
    gerando.value = false
    // A aba já carregou o documento; segurar a URL só vazaria memória.
    if (url) setTimeout(() => URL.revokeObjectURL(url), 60_000)
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
            <span class="resumo__rotulo">Cópias por variante</span>
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
          <h2 class="bloco__titulo">Estoque por combinação de tipos</h2>
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
                <th scope="col">Professor</th>
                <th scope="col">Tipos</th>
                <th scope="col" class="num">Nesta tiragem</th>
                <th scope="col" class="num">Resgatadas</th>
                <th scope="col" class="num">Vivas (total)</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="v in variantes"
                :key="v.variantId"
                :class="{ 'linha--marcada': selecionadas.has(v.variantId) }"
              >
                <td class="col-check">
                  <input
                    type="checkbox"
                    :checked="selecionadas.has(v.variantId)"
                    :aria-label="`Incluir ${v.professor.name} de ${v.label} na tiragem`"
                    @change="alternar(v.variantId)"
                  />
                </td>
                <td>{{ v.professor.name }}</td>
                <td>{{ v.label }}</td>
                <td class="num">{{ v.lastBatch.total }}</td>
                <td class="num">{{ v.lastBatch.redeemed }}</td>
                <td class="num" :class="{ 'num--zero': v.alive === 0 }">
                  {{ v.alive }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
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
            Cópias por combinação
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
            {{ selecionadas.size ? `${selecionadas.size} combinação(ões) marcada(s)` : 'Nada marcado — sai a tiragem completa' }}
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
            {{ copias }} × {{ quantasVariantes }} combinação(ões).
          </p>
          <ul class="plano__lista">
            <li v-for="l in plano.lines" :key="l.variantId">
              {{ l.professor }} · {{ l.label }} ×{{ l.copies }}
            </li>
          </ul>
        </div>

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
