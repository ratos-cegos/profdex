<script setup>
/**
 * Quiz Treino — o aluno praticando sozinho, no próprio celular.
 *
 * É a mesma pergunta da bancada do estande, mas sem nada em jogo: não pontua,
 * não captura, não entra no cooldown de 10 minutos e pode ser repetida à
 * vontade. Por isso três coisas da bancada somem aqui:
 *
 *  - **Sem matrícula**: quem está logado é quem pratica. Na bancada a matrícula
 *    é digitada a cada rodada porque o tablet é compartilhado por uma fila.
 *  - **Sem cronômetro**: os 60s existem para dar conta da fila do evento.
 *    Treinando, pressa só atrapalha quem está aprendendo.
 *  - **Correção local**: o gabarito vem junto com a questão (não há o que
 *    burlar sem prêmio), então o acerto/erro aparece no toque, sem ida ao
 *    servidor entre uma alternativa e a próxima.
 */
import { computed, onBeforeUnmount, ref } from 'vue'
import { useRouter } from 'vue-router'
import BottomNav from '../components/BottomNav.vue'
import TypeIcon from '../components/TypeIcon.vue'
import { TYPE_CYCLE, getType, legibleColor } from '../data/types'
import api from '../services/api'
import { useMetricsStore } from '../stores/metrics'

const router = useRouter()
const metrics = useMetricsStore()

const etapa = ref('tema') // tema | pergunta | fim
const carregando = ref(false)
const erro = ref('')

const temas = ref([])
const temaEscolhido = ref(null)
const questoes = ref([])
const indice = ref(0)
const escolhida = ref(null)
const acertos = ref(0)

// Quanto o resultado fica na tela antes de virar a página. Curto o bastante
// para não entediar quem já entendeu, longo o bastante para dar tempo de ler a
// alternativa certa quando se errou.
const PAUSA_MS = 1400
let avanco = null

const questaoAtual = computed(() => questoes.value[indice.value] ?? null)
const respondida = computed(() => escolhida.value !== null)
const acertou = computed(
  () => respondida.value && escolhida.value === questaoAtual.value?.correctIndex,
)
const temaAtual = computed(() =>
  temaEscolhido.value ? getType(temaEscolhido.value) : null,
)
const cor = computed(() => temaAtual.value?.color ?? 'var(--unifil-gold)')

/**
 * A grade sai sempre completa: os 9 temas vêm da constante local e a contagem
 * do servidor é mesclada por id. Sem isso a tela ficaria vazia enquanto o fetch
 * não volta — e quebrada de vez se ele falhar.
 */
const temasExibidos = computed(() =>
  TYPE_CYCLE.map((t) => ({
    ...t,
    questoes: temas.value.find((x) => x.theme === t.id)?.questoes ?? 0,
    // O ícone herda `currentColor`. A cor canônica do tipo é feita para
    // PREENCHER área, não para virar traço sobre fundo escuro: o NPI (#495057)
    // daria 1,7:1 no fundo do card e sumiria. `legibleColor` clareia até 4,5:1
    // mantendo o matiz.
    corIcone: legibleColor(t.color),
  })),
)

function mensagemDeErro(e, padrao) {
  if (!e.response) return 'Sem conexão com o servidor.'
  const dados = e.response.data
  if (typeof dados?.message === 'string') return dados.message
  if (Array.isArray(dados?.message)) return dados.message[0]
  return padrao
}

async function carregarTemas() {
  try {
    const { data } = await api.get('/quiz/treino/themes')
    temas.value = data
  } catch {
    // A grade já renderiza sem isso; a contagem é enfeite, não requisito.
  }
}
carregarTemas()

async function comecar(themeId) {
  if (carregando.value) return
  carregando.value = true
  erro.value = ''
  try {
    const { data } = await api.get('/quiz/treino/questions', {
      params: { theme: themeId, limit: 10 },
    })
    if (!data.questoes.length) {
      erro.value = 'Esse tema ainda não tem questões cadastradas.'
      return
    }
    temaEscolhido.value = themeId
    questoes.value = data.questoes
    indice.value = 0
    escolhida.value = null
    acertos.value = 0
    etapa.value = 'pergunta'
  } catch (e) {
    erro.value = mensagemDeErro(e, 'Não foi possível carregar as questões.')
  } finally {
    carregando.value = false
  }
}

function responder(i) {
  if (respondida.value) return
  escolhida.value = i
  if (acertou.value) acertos.value += 1

  // Treino não pontua: o evento vale 0 ponto e 0 interação, e existe só para
  // saber se a tela é usada. Nunca derruba a resposta se falhar.
  try {
    metrics.track('quiz_practice_answered', {
      metadata: { theme: temaEscolhido.value, correct: acertou.value },
    })
  } catch {
    // silencioso de propósito
  }

  avanco = setTimeout(proxima, PAUSA_MS)
}

function proxima() {
  limparAvanco()
  escolhida.value = null
  if (indice.value + 1 >= questoes.value.length) {
    etapa.value = 'fim'
    return
  }
  indice.value += 1
}

function limparAvanco() {
  if (avanco) clearTimeout(avanco)
  avanco = null
}

function trocarTema() {
  limparAvanco()
  etapa.value = 'tema'
  temaEscolhido.value = null
  questoes.value = []
  escolhida.value = null
  erro.value = ''
  void carregarTemas()
}

function repetir() {
  const tema = temaEscolhido.value
  limparAvanco()
  void comecar(tema)
}

function voltar() {
  limparAvanco()
  router.push({ name: 'batalha' })
}

onBeforeUnmount(limparAvanco)

/** Classe de cada alternativa depois da resposta. */
function classeOpcao(i) {
  if (!respondida.value) return ''
  // A correta é destacada SEMPRE, inclusive quando o aluno errou — é o único
  // momento em que ele descobre qual era, e esconder isso torna o treino inútil.
  if (i === questaoAtual.value.correctIndex) return 'opcao--certa'
  if (i === escolhida.value) return 'opcao--errada'
  return 'opcao--apagada'
}

const DIFICULDADES = { facil: 'Fácil', media: 'Média', dificil: 'Difícil' }
</script>

<template>
  <div class="treino" :style="{ '--tema': cor }">
    <header class="treino__header">
      <button class="back-btn" type="button" @click="voltar">← Voltar</button>
      <div class="header__info">
        <span class="pixel eyebrow">QUIZ TREINO</span>
        <h1 class="pixel header__title">
          {{ temaAtual ? temaAtual.label : 'ESCOLHA A MATÉRIA' }}
        </h1>
      </div>
      <button
        v-if="etapa !== 'tema'"
        class="back-btn back-btn--trocar"
        type="button"
        @click="trocarTema"
      >
        Trocar
      </button>
    </header>

    <main class="treino__main page">
      <p class="treino__aviso">
        Treino livre — jogue quantas vezes quiser. Não vale ponto nem captura
        professor.
      </p>

      <p v-if="erro" class="error-msg" aria-live="polite">{{ erro }}</p>

      <!-- 1. Escolha da matéria -->
      <section v-if="etapa === 'tema'" class="quadro">
        <div class="quadro__titulo">Sobre o que você quer treinar?</div>
        <div class="temas">
          <button
            v-for="t in temasExibidos"
            :key="t.id"
            class="tema"
            type="button"
            :style="{ '--tema': t.color, '--tema-icone': t.corIcone }"
            :disabled="carregando || !t.questoes"
            @click="comecar(t.id)"
          >
            <TypeIcon class="tema__icone" :type="t.id" :size="26" />
            <span class="pixel tema__nome">{{ t.label }}</span>
            <span class="tema__qtd">
              {{ t.questoes ? `${t.questoes} questões` : 'sem questões' }}
            </span>
          </button>
        </div>
      </section>

      <!-- 2. Questão -->
      <section v-else-if="etapa === 'pergunta' && questaoAtual" class="quadro">
        <div class="progresso">
          <span class="pixel progresso__contador">
            {{ indice + 1 }}/{{ questoes.length }}
          </span>
          <span class="progresso__dif">
            {{ DIFICULDADES[questaoAtual.difficulty] ?? questaoAtual.difficulty }}
          </span>
          <span class="pixel progresso__placar">{{ acertos }} ✓</span>
        </div>

        <div class="barra" aria-hidden="true">
          <div
            class="barra__preenchida"
            :style="{ width: `${((indice + 1) / questoes.length) * 100}%` }"
          ></div>
        </div>

        <h2 class="enunciado">{{ questaoAtual.prompt }}</h2>

        <div class="opcoes">
          <button
            v-for="(opcao, i) in questaoAtual.options"
            :key="i"
            class="opcao"
            :class="classeOpcao(i)"
            type="button"
            :disabled="respondida"
            @click="responder(i)"
          >
            <span class="opcao__letra">{{ 'ABCDE'[i] }}</span>
            <span class="opcao__texto">{{ opcao }}</span>
          </button>
        </div>

        <p v-if="respondida" class="veredito" aria-live="polite">
          <template v-if="acertou">Acertou!</template>
          <template v-else>
            A resposta certa é
            <strong>{{ questaoAtual.options[questaoAtual.correctIndex] }}</strong>
          </template>
        </p>

        <!-- É o treino: entender por que errou vale mais do que o placar. -->
        <p v-if="respondida && questaoAtual.explanation" class="explicacao">
          {{ questaoAtual.explanation }}
        </p>
      </section>

      <!-- 3. Fim da rodada -->
      <section v-else-if="etapa === 'fim'" class="quadro quadro--fim">
        <div class="quadro__titulo">Fim da rodada</div>
        <p class="placar">
          <strong>{{ acertos }}</strong> de {{ questoes.length }}
        </p>
        <p class="placar__tema">{{ temaAtual?.label }}</p>
        <div class="acoes">
          <button class="btn-acao" type="button" @click="repetir">
            <span class="pixel">PRATICAR DE NOVO</span>
          </button>
          <button class="btn-acao btn-acao--vazio" type="button" @click="trocarTema">
            <span class="pixel">TROCAR DE MATÉRIA</span>
          </button>
        </div>
      </section>
    </main>

    <BottomNav />
  </div>
</template>

<style scoped>
.treino {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg-deep);
  color: var(--text-primary);
}

/* Mesmo cabeçalho da área de batalha, para a tela não parecer de outro app. */
.treino__header {
  background: linear-gradient(160deg, var(--red-dark), var(--red));
  padding: 18px 20px 30px;
  position: relative;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 14px;
}

.treino__header::after {
  content: '';
  position: absolute;
  right: 0;
  bottom: -1px;
  left: 0;
  height: 20px;
  background: var(--bg);
  border-radius: 20px 20px 0 0;
}

.back-btn {
  position: relative;
  z-index: 1;
  min-height: 38px;
  padding: 0 14px;
  border-radius: var(--radius);
  background: rgba(0, 0, 0, 0.25);
  color: rgba(255, 255, 255, 0.88);
  border: 1px solid rgba(255, 255, 255, 0.2);
  font-size: 12px;
  cursor: pointer;
}

.back-btn--trocar {
  margin-left: auto;
}

.header__info {
  position: relative;
  z-index: 1;
  min-width: 0;
}

.eyebrow {
  display: block;
  margin-bottom: 4px;
  color: var(--yellow);
  font-size: 8px;
}

.header__title {
  font-size: 14px;
  color: white;
  text-shadow: 2px 2px 0 rgba(0, 0, 0, 0.3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* `flex: 1` e `overflow-y` vêm da utilitária `.page`; sem ela o conteúdo é
   cortado em vez de rolar, porque `#app` é `overflow: hidden`. */
.treino__main {
  display: flex;
  flex-direction: column;
  padding: 16px;
  gap: 14px;
}

.treino__aviso {
  font-size: 10px;
  line-height: 1.6;
  color: var(--text-muted);
  text-align: center;
}

/* Moldura GBA: a mesma receita da tela inicial. A classe `pokemon-frame` usada
   por outras views não define nada — o desenho vem daqui. */
.quadro {
  padding: 18px 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  background: var(--surface);
  border: 4px solid var(--unifil-orange);
  box-shadow:
    inset 0 0 0 2px var(--unifil-gold),
    inset 0 0 0 4px var(--surface);
  border-radius: 4px;
}

.quadro__titulo {
  font-family: var(--font-pixel);
  font-size: 10px;
  color: var(--unifil-gold);
  text-transform: uppercase;
  text-align: center;
  line-height: 1.5;
}

/* ── Escolha da matéria ─────────────────────────────────────────────────── */

.temas {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(92px, 1fr));
  gap: 10px;
}

.tema {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 12px 6px;
  cursor: pointer;
  color: var(--text-primary);
  border: 2px solid var(--tema);
  border-radius: var(--radius);
  background: color-mix(in srgb, var(--tema) 22%, rgba(0, 0, 0, 0.35));
  transition:
    transform 0.12s ease,
    filter 0.12s ease;
}

.tema:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.tema:not(:disabled):active {
  transform: translateY(2px);
  filter: brightness(1.1);
}

/* O SVG ja vem com width/height do `size`; aqui so entra a cor, que ele herda
   via `currentColor`. */
.tema__icone {
  color: var(--tema-icone);
  flex-shrink: 0;
}

.tema__nome {
  font-size: 8px;
  line-height: 1.4;
  text-align: center;
}

.tema__qtd {
  font-size: 8px;
  color: var(--text-muted);
}

/* ── Questão ────────────────────────────────────────────────────────────── */

.progresso {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 9px;
  color: var(--text-muted);
}

.progresso__contador,
.progresso__placar {
  font-size: 9px;
  color: var(--unifil-gold);
}

.progresso__dif {
  text-transform: uppercase;
}

.barra {
  height: 6px;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.12);
  overflow: hidden;
}

.barra__preenchida {
  height: 100%;
  background: var(--tema);
  transition: width 0.25s ease;
}

.enunciado {
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-primary);
  font-weight: normal;
}

.opcoes {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.opcao {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px;
  text-align: left;
  cursor: pointer;
  color: var(--text-primary);
  background: rgba(255, 255, 255, 0.05);
  border: 2px solid var(--surface-border);
  border-radius: var(--radius);
  transition:
    background 0.15s ease,
    border-color 0.15s ease,
    opacity 0.15s ease;
}

.opcao:not(:disabled):active {
  transform: translateY(1px);
}

.opcao__letra {
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  display: grid;
  place-items: center;
  border-radius: 4px;
  background: var(--tema);
  color: #fff;
  font-family: var(--font-pixel);
  font-size: 9px;
}

.opcao__texto {
  font-size: 12px;
  line-height: 1.5;
}

.opcao--certa {
  background: var(--success-bg);
  border-color: var(--success-text);
}

.opcao--certa .opcao__letra {
  background: var(--success-text);
  color: #10240a;
}

.opcao--errada {
  background: rgba(255, 107, 107, 0.15);
  border-color: var(--error);
}

.opcao--errada .opcao__letra {
  background: var(--error);
}

.opcao--apagada {
  opacity: 0.45;
}

.veredito {
  font-size: 11px;
  line-height: 1.6;
  text-align: center;
  color: var(--text-primary);
}

.explicacao {
  margin-top: 8px;
  padding: 10px 12px;
  border-radius: var(--radius);
  background: var(--bg-deep);
  color: var(--text-muted);
  font-size: 11px;
  line-height: 1.6;
  text-align: center;
}

/* ── Fim ────────────────────────────────────────────────────────────────── */

.quadro--fim {
  align-items: center;
  text-align: center;
}

.placar {
  font-family: var(--font-pixel);
  font-size: 12px;
  color: var(--text-primary);
}

.placar strong {
  font-size: 22px;
  color: var(--unifil-gold);
}

.placar__tema {
  font-size: 10px;
  color: var(--text-muted);
}

.acoes {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.btn-acao {
  width: 100%;
  padding: 13px;
  cursor: pointer;
  background: var(--unifil-orange);
  border: 3px solid var(--surface-border);
  box-shadow:
    inset -3px -3px 0 var(--surface-border),
    inset 3px 3px 0 var(--unifil-gold);
  color: var(--text-primary);
}

.btn-acao span {
  font-size: 10px;
  text-shadow: 2px 2px 0 var(--surface);
}

.btn-acao--vazio {
  background: var(--surface);
  box-shadow: none;
  border-color: var(--unifil-orange);
}

.btn-acao:active {
  transform: scale(0.98);
}

@media (prefers-reduced-motion: reduce) {
  .tema,
  .opcao,
  .barra__preenchida,
  .btn-acao {
    transition: none;
  }

  .tema:not(:disabled):active,
  .opcao:not(:disabled):active,
  .btn-acao:active {
    transform: none;
  }
}
</style>
