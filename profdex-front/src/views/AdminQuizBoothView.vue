<script setup>
/**
 * Bancada do quiz — tela de quiosque para o tablet do estande.
 *
 * Operada por um administrador, com o aluno do outro lado da mesa. O ciclo é
 * sempre o mesmo: matrícula → tema → 60 segundos de questão → resultado →
 * próximo aluno. A matrícula é pedida SEMPRE, porque quem responde muda a cada
 * rodada e nunca há sessão do aluno aqui.
 *
 * A matrícula entra por um numpad na tela, não pelo teclado: o aparelho fica
 * deitado na mesa virado para o aluno, e um <input> focado faria o teclado
 * virtual cobrir metade do quiosque. Não há campo de texto nenhum aqui — o
 * visor é só um espelho do valor digitado.
 *
 * O cronômetro daqui é conforto visual: quem decide se o tempo acabou é o
 * servidor, na hora de conferir a resposta.
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import api from '../services/api'
import TypeIcon from '../components/TypeIcon.vue'
import { TYPE_CYCLE, getType, legibleColor } from '../data/types'

const router = useRouter()

const etapa = ref('matricula') // matricula | tema | pergunta | resultado
const carregando = ref(false)
const erro = ref('')

const matricula = ref('')
const aluno = ref(null)
const temas = ref([])

const sessao = ref(null)
const resultado = ref(null)
const escolhida = ref(null)

// ── Cronômetro ──────────────────────────────────────────────────────────────
const restanteMs = ref(0)
let ticker = null
let deadline = 0

const segundos = computed(() => Math.max(0, Math.ceil(restanteMs.value / 1000)))
const fracao = computed(() =>
  sessao.value ? Math.max(0, restanteMs.value / sessao.value.durationMs) : 0,
)
const apertado = computed(() => segundos.value <= 10)

function iniciarCronometro(durationMs) {
  pararCronometro()
  // Conta a partir do relógio LOCAL: o do tablet pode estar defasado do
  // servidor, e a barra andando errado assusta o aluno sem necessidade.
  deadline = Date.now() + durationMs
  restanteMs.value = durationMs
  ticker = setInterval(() => {
    restanteMs.value = Math.max(0, deadline - Date.now())
    if (restanteMs.value === 0) {
      pararCronometro()
      void responder(null)
    }
  }, 200)
}

function pararCronometro() {
  if (ticker) clearInterval(ticker)
  ticker = null
}

onBeforeUnmount(pararCronometro)

// ── Fluxo ───────────────────────────────────────────────────────────────────

const temaAtual = computed(() => (sessao.value ? getType(sessao.value.question.theme) : null))

const cor = computed(() => temaAtual.value?.color ?? 'var(--red)')

const DIFICULDADES = { facil: 'FÁCIL', media: 'MÉDIA', dificil: 'DIFÍCIL' }

// ── Ficha rara ──────────────────────────────────────────────────────────────
// O servidor é quem decide o que aparece aqui. A tela NUNCA calcula progresso:
// ela fica virada para o aluno, e um "falta 1" revelaria para a fila inteira em
// que tema existe raro. Antes do gate fechado, `resultado.raro` vem nulo e esta
// tela é exatamente a de sempre (tarefa 15, decisão 15).
const raroLiberado = computed(() => resultado.value?.raro?.liberado ?? null)

// A pendência aparece nos dois lugares em que o operador olha: no resultado da
// rodada e no cartão do aluno, logo depois da matrícula.
const raroPendente = computed(() => resultado.value?.raro?.pendente ?? null)
const raroPendentesDoAluno = computed(() => aluno.value?.raroPendentes ?? [])

const rotuloDoTema = (id) => getType(id)?.label ?? id

// ── Cooldown dos temas, contando na tela ────────────────────────────────────
// O servidor diz quantos segundos faltam NO MOMENTO da consulta; daí em diante
// a contagem é local. Sem ela o número ficava congelado, e o aluno a quem
// faltavam 10s tinha de sair e digitar a matrícula de novo para o tema abrir.
// A contagem é relativa (segundos), então relógio do tablet defasado não
// importa — e quem decide continua sendo o `/start`, que recusa quem ainda está
// em cooldown.
const agora = ref(Date.now())
const liberacoes = ref(new Map())
let relogio = null

watch(aluno, (a) => {
  const base = Date.now()
  agora.value = base
  liberacoes.value = new Map(
    (a?.cooldowns ?? []).map((c) => [c.theme, base + c.segundosRestantes * 1000]),
  )
})

onMounted(() => {
  relogio = setInterval(() => (agora.value = Date.now()), 1000)
})
onBeforeUnmount(() => clearInterval(relogio))

const temasExibidos = computed(() =>
  TYPE_CYCLE.map((t) => {
    const dados = temas.value.find((x) => x.theme === t.id)
    const liberaEm = liberacoes.value.get(t.id) ?? 0
    return {
      ...t,
      questoes: dados?.questoes ?? 0,
      esperaSegundos: Math.max(0, Math.ceil((liberaEm - agora.value) / 1000)),
    }
  }),
)

// ── Numpad ──────────────────────────────────────────────────────────────────
// O servidor aceita até 40 caracteres, mas matrícula real é numérica e curta;
// o teto aqui só evita que uma criança segurando a tecla encha o visor.
const MAX_DIGITOS = 20
const TECLAS = ['1', '2', '3', '4', '5', '6', '7', '8', '9']

function digitar(digito) {
  if (matricula.value.length >= MAX_DIGITOS) return
  matricula.value += digito
  // O erro é do valor anterior: some assim que o operador começa a corrigir.
  erro.value = ''
}

function apagar() {
  matricula.value = matricula.value.slice(0, -1)
  erro.value = ''
}

function limpar() {
  matricula.value = ''
  erro.value = ''
}

/**
 * O teclado físico continua valendo — o numpad é o caminho principal, não uma
 * proibição. Sem <input> na tela não há nada com foco para receber as teclas,
 * então o listener é da janela e só age na etapa da matrícula.
 */
function aoTeclar(e) {
  if (etapa.value !== 'matricula' || carregando.value) return
  if (e.ctrlKey || e.metaKey || e.altKey) return

  if (e.key >= '0' && e.key <= '9' && e.key.length === 1) digitar(e.key)
  else if (e.key === 'Backspace') apagar()
  else if (e.key === 'Escape') limpar()
  else if (e.key === 'Enter') void identificar()
  else return

  e.preventDefault()
}

onMounted(() => window.addEventListener('keydown', aoTeclar))
onBeforeUnmount(() => window.removeEventListener('keydown', aoTeclar))

function mensagemDeErro(e, padrao) {
  if (!e.response) return 'Sem conexão com o servidor.'
  const dados = e.response.data
  if (typeof dados?.message === 'string') return dados.message
  if (Array.isArray(dados?.message)) return dados.message[0]
  return padrao
}

async function identificar() {
  const valor = matricula.value.trim()
  if (!valor) return
  carregando.value = true
  erro.value = ''
  try {
    const [a, t] = await Promise.all([
      api.get('/admin/quiz/aluno', { params: { matricula: valor } }),
      api.get('/admin/quiz/themes'),
    ])
    aluno.value = a.data
    temas.value = t.data
    etapa.value = 'tema'
  } catch (e) {
    erro.value = mensagemDeErro(e, 'Não foi possível identificar o aluno.')
  } finally {
    carregando.value = false
  }
}

async function comecar(tema) {
  carregando.value = true
  erro.value = ''
  try {
    const { data } = await api.post('/admin/quiz/start', {
      matricula: aluno.value.matricula,
      theme: tema.id,
    })
    sessao.value = data
    escolhida.value = null
    resultado.value = null
    etapa.value = 'pergunta'
    iniciarCronometro(data.durationMs)
  } catch (e) {
    erro.value = mensagemDeErro(e, 'Não foi possível sortear a questão.')
  } finally {
    carregando.value = false
  }
}

async function responder(indice) {
  if (!sessao.value || carregando.value) return
  pararCronometro()
  escolhida.value = indice
  carregando.value = true
  try {
    const corpo = { sessionId: sessao.value.sessionId }
    if (indice !== null) corpo.answerIndex = indice
    const { data } = await api.post('/admin/quiz/answer', corpo)
    resultado.value = data
    etapa.value = 'resultado'
  } catch (e) {
    erro.value = mensagemDeErro(e, 'Não foi possível registrar a resposta.')
    etapa.value = 'tema'
  } finally {
    carregando.value = false
  }
}

/** Volta ao início — é o botão que o operador mais usa no dia. */
function proximoAluno() {
  pararCronometro()
  matricula.value = ''
  aluno.value = null
  sessao.value = null
  resultado.value = null
  escolhida.value = null
  erro.value = ''
  etapa.value = 'matricula'
}

function voltarAosTemas() {
  pararCronometro()
  sessao.value = null
  resultado.value = null
  erro.value = ''
  etapa.value = 'tema'
  // Os cooldowns mudaram: recarrega o cartão do aluno em silêncio.
  void api
    .get('/admin/quiz/aluno', { params: { matricula: aluno.value.matricula } })
    .then(({ data }) => (aluno.value = data))
    .catch(() => {})
}

const LETRAS = ['A', 'B', 'C', 'D', 'E']

function formatarEspera(s) {
  const min = Math.floor(s / 60)
  const resto = s % 60
  return min ? `${min}min ${resto}s` : `${resto}s`
}
</script>

<template>
  <div class="bancada" :style="{ '--tema': cor }">
    <!-- ── Matrícula ──────────────────────────────────────────────────── -->
    <section v-if="etapa === 'matricula'" class="cena cena--matricula">
      <button class="sair" type="button" @click="router.push({ name: 'admin-quiz' })">
        ← Painel
      </button>

      <div class="identidade">
        <h1 class="pixel marca">QUIZ PROFDEX</h1>
        <p class="chamada">Digite sua matrícula<br />para começar</p>

        <div class="visor" role="status" aria-live="polite">
          <span class="visor__rotulo">MATRÍCULA</span>
          <span v-if="matricula" class="visor__valor">{{ matricula }}</span>
          <span v-else class="visor__vazio" aria-hidden="true">— — — — — —</span>
          <span class="visor__cursor" aria-hidden="true"></span>
        </div>

        <p v-if="erro" class="erro" role="alert">{{ erro }}</p>
        <p v-else class="dica">Use os números ao lado. Errou? Toque em ⌫</p>
      </div>

      <div class="painel-teclas">
        <div class="numpad">
          <button
            v-for="tecla in TECLAS"
            :key="tecla"
            class="tecla"
            type="button"
            :disabled="carregando"
            @click="digitar(tecla)"
          >
            {{ tecla }}
          </button>

          <button
            class="tecla tecla--auxiliar"
            type="button"
            :disabled="carregando || !matricula"
            aria-label="Apagar último dígito"
            @click="apagar"
          >
            ⌫
          </button>
          <button class="tecla" type="button" :disabled="carregando" @click="digitar('0')">
            0
          </button>
          <button
            class="tecla tecla--auxiliar"
            type="button"
            :disabled="carregando || !matricula"
            aria-label="Limpar matrícula"
            @click="limpar"
          >
            C
          </button>
        </div>

        <button
          class="acao acao--continuar"
          type="button"
          :disabled="carregando || !matricula"
          @click="identificar"
        >
          {{ carregando ? 'BUSCANDO…' : 'CONTINUAR' }}
        </button>
      </div>
    </section>

    <!-- ── Escolha do tema ────────────────────────────────────────────── -->
    <section v-else-if="etapa === 'tema'" class="cena">
      <header class="topo">
        <div>
          <span class="topo__eyebrow">ALUNO</span>
          <strong class="topo__nome">{{ aluno.name }}</strong>
          <span class="topo__matricula">{{ aluno.matricula }}</span>
        </div>
        <div class="topo__direita">
          <span class="topo__placar"> {{ aluno.acertos }}/{{ aluno.tentativas }} acertos </span>
          <button class="sair sair--inline" type="button" @click="proximoAluno">
            Trocar aluno
          </button>
        </div>
      </header>

      <!-- Ficha rara que este aluno conquistou e ainda não recebeu. Vem antes
           da rodada começar de propósito: é a única chance de entregar o papel
           de quem destravou horas atrás e voltou à fila. Não vaza nada — só
           chega aqui quem já viu a cena dourada. -->
      <p v-for="r in raroPendentesDoAluno" :key="r.name" class="tarja-raro">
        ✦ ficha rara pendente — <strong>{{ r.name }}</strong>
      </p>

      <p class="chamada chamada--pequena">Escolha o tema da pergunta</p>
      <p v-if="erro" class="erro" role="alert">{{ erro }}</p>

      <div class="grade-temas">
        <button
          v-for="t in temasExibidos"
          :key="t.id"
          class="carta"
          type="button"
          :style="{ '--tema': t.color, '--tema-icone': legibleColor(t.color) }"
          :disabled="carregando || !t.questoes || t.esperaSegundos > 0"
          @click="comecar(t)"
        >
          <TypeIcon class="carta__icone" :type="t.id" :size="36" />
          <span class="carta__nome">{{ t.label }}</span>
          <span v-if="t.esperaSegundos > 0" class="carta__aviso">
            aguarde {{ formatarEspera(t.esperaSegundos) }}
          </span>
          <span v-else-if="!t.questoes" class="carta__aviso">sem questões</span>
          <!-- O professor daquele tema NÃO aparece aqui: o aluno está olhando a
               tela e escolheria o tema pelo professor que ainda falta capturar,
               não pelo assunto. Ele só descobre quem procurar depois de acertar,
               na tela de resultado. -->
        </button>
      </div>
    </section>

    <!-- ── Pergunta ───────────────────────────────────────────────────── -->
    <section v-else-if="etapa === 'pergunta'" class="cena cena--pergunta">
      <header class="faixa">
        <span class="faixa__tema">
          <TypeIcon v-if="temaAtual" :type="temaAtual.id" :size="16" />
          {{ temaAtual?.label }}
        </span>
        <span class="faixa__nivel">
          {{ DIFICULDADES[sessao.question.difficulty] }}
        </span>
        <!-- Código da questão: é por ele que o aluno contesta ("a #4821 está
             errada"). Público de propósito — não revela nada do gabarito. -->
        <span class="faixa__codigo">#{{ sessao.question.code }}</span>
        <span class="faixa__aluno">{{ sessao.aluno.name }}</span>
        <span class="relogio" :class="{ 'relogio--apertado': apertado }"> {{ segundos }}s </span>
      </header>

      <div class="barra" aria-hidden="true">
        <div
          class="barra__cheia"
          :class="{ 'barra__cheia--apertado': apertado }"
          :style="{ width: fracao * 100 + '%' }"
        ></div>
      </div>

      <h2 class="enunciado">{{ sessao.question.prompt }}</h2>

      <div class="grade-alternativas">
        <button
          v-for="(opcao, i) in sessao.question.options"
          :key="i"
          class="alternativa"
          type="button"
          :disabled="carregando"
          @click="responder(i)"
        >
          <span class="alternativa__letra">{{ LETRAS[i] }}</span>
          <span class="alternativa__texto">{{ opcao }}</span>
        </button>
      </div>
    </section>

    <!-- ── Ficha rara: o acerto que fechou o gate ──────────────────────
         Cena PRÓPRIA, não um enfeite na tela de acerto. Ela é o único aviso
         que o operador recebe (ele descobre junto com o aluno — a mitigação
         é o painel, em /admin/metrics, não esta tela), e precisa ser legível
         de relance, de lado, com a fila andando. Fica até alguém tocar em
         "próximo aluno": sumir sozinha perderia a entrega. -->
    <section
      v-else-if="etapa === 'resultado' && raroLiberado"
      class="cena cena--centro cena--raro"
    >
      <span class="selo selo--raro">✦</span>
      <p class="raro__eyebrow">FICHA RARA</p>
      <h2 class="raro__nome">{{ raroLiberado.name }}</h2>
      <p class="raro__ordem">ENTREGUE A FICHA ✦ {{ raroLiberado.name.toUpperCase() }}</p>
      <p class="raro__apoio">
        {{ aluno?.name }} completou os 5 acertos em
        <strong>{{ raroLiberado.temas.map(rotuloDoTema).join(' e ') }}</strong
        >. Pegue a pilha com o nome dele.
      </p>
      <p class="codigo-questao">Questão #{{ resultado.code }}</p>

      <div class="botoes">
        <button class="acao acao--secundaria" type="button" @click="voltarAosTemas">
          OUTRO TEMA
        </button>
        <button class="acao" type="button" @click="proximoAluno">PRÓXIMO ALUNO</button>
      </div>
    </section>

    <!-- ── Resultado ──────────────────────────────────────────────────── -->
    <section
      v-else-if="etapa === 'resultado'"
      class="cena cena--centro"
      :class="resultado.correct ? 'cena--acerto' : 'cena--erro'"
    >
      <!-- Tarja de pendência: quem destravou às 10h e voltou às 15h não pode
           depender da memória do operador. -->
      <p v-if="raroPendente" class="tarja-raro">
        ✦ ficha rara pendente — <strong>{{ raroPendente.name }}</strong>
      </p>

      <span class="selo">{{ resultado.correct ? '✓' : '✕' }}</span>
      <h2 class="veredito">
        {{
          resultado.correct
            ? 'Acertou!'
            : resultado.expired
              ? 'Tempo esgotado'
              : 'Não foi dessa vez'
        }}
      </h2>

      <p v-if="!resultado.correct" class="gabarito">
        Resposta certa: <strong>{{ resultado.correctOption }}</strong>
      </p>

      <!-- É aqui que o aluno descobre que discorda do gabarito, então é aqui
           que ele precisa do número para contestar com o operador. -->
      <p class="codigo-questao">Questão #{{ resultado.code }}</p>

      <!-- Sem NOME de professor. Quem o aluno leva é sorteado no servidor, no
           instante do scan, e depende do que ele já tem — anunciar um nome aqui
           seria promessa que a captura não tem como cumprir. -->
      <p v-if="resultado.correct" class="instrucao">
        Agora escaneie o QR Code para capturar seu professor.
      </p>
      <p v-else class="instrucao">
        Este tema libera de novo em {{ resultado.cooldownMinutos }}
        {{ resultado.cooldownMinutos === 1 ? 'minuto' : 'minutos' }}. Enquanto
        isso dá para tentar outro tema.
      </p>

      <div class="botoes">
        <button class="acao acao--secundaria" type="button" @click="voltarAosTemas">
          OUTRO TEMA
        </button>
        <button class="acao" type="button" @click="proximoAluno">PRÓXIMO ALUNO</button>
      </div>
    </section>
  </div>
</template>

<style scoped>
/* Quiosque: ocupa a tela inteira e escala com ela. As medidas usam clamp()
   porque o mesmo layout roda em tablet deitado e em notebook touch. */
.bancada {
  position: fixed;
  inset: 0;
  display: flex;
  background:
    radial-gradient(
      circle at 50% 0%,
      color-mix(in srgb, var(--tema) 28%, transparent),
      transparent 60%
    ),
    var(--bg-deep, #10121a);
  color: var(--text, #fff);
  overflow: hidden;
}

.cena {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: clamp(12px, 2.2vh, 24px);
  padding: clamp(16px, 3vw, 40px);
}

.cena--centro {
  align-items: center;
  justify-content: center;
  text-align: center;
}

.sair {
  position: absolute;
  top: 16px;
  left: 16px;
  min-height: 40px;
  padding: 0 14px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.75);
  border: 1px solid rgba(255, 255, 255, 0.18);
  font-size: 13px;
  cursor: pointer;
}

.sair--inline {
  position: static;
}

.marca {
  margin: 0;
  font-size: clamp(20px, 4vw, 40px);
  color: var(--yellow, #f7c948);
  text-shadow: 3px 3px 0 rgba(0, 0, 0, 0.35);
}

.chamada {
  margin: 0;
  font-size: clamp(15px, 2.2vw, 22px);
  color: rgba(255, 255, 255, 0.75);
}

.chamada--pequena {
  font-size: clamp(13px, 1.6vw, 18px);
}

/* ── Matrícula: visor à esquerda, numpad à direita ─────────────────────────
   Duas colunas porque o quiosque vive deitado: empilhado, o numpad desceria
   abaixo da dobra e o operador teria de rolar a tela a cada aluno. */
.cena--matricula {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  justify-content: center;
  gap: clamp(24px, 5vw, 72px);
}

.identidade {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: clamp(10px, 2vh, 22px);
  min-width: 0;
}

.visor {
  position: relative;
  display: flex;
  align-items: baseline;
  gap: 12px;
  width: 100%;
  min-height: clamp(72px, 11vh, 112px);
  padding: clamp(10px, 1.6vh, 18px) clamp(16px, 2vw, 28px);
  border-radius: 16px;
  background: rgba(0, 0, 0, 0.35);
  border: 3px solid rgba(255, 255, 255, 0.2);
}

.visor__rotulo {
  flex-shrink: 0;
  font-size: clamp(9px, 1vw, 12px);
  letter-spacing: 2px;
  color: rgba(255, 255, 255, 0.4);
}

.visor__valor,
.visor__vazio {
  min-width: 0;
  /* tabular-nums: o visor não muda de largura enquanto o aluno digita. */
  font-variant-numeric: tabular-nums;
  font-size: clamp(30px, 5vw, 60px);
  font-weight: 800;
  letter-spacing: clamp(2px, 0.6vw, 8px);
  overflow-wrap: anywhere;
}

.visor__valor {
  color: var(--yellow, #f7c948);
}

.visor__vazio {
  color: rgba(255, 255, 255, 0.16);
}

.visor__cursor {
  width: 3px;
  height: clamp(26px, 4vw, 48px);
  background: var(--yellow, #f7c948);
  animation: piscar 1.1s steps(2, start) infinite;
}

@keyframes piscar {
  to {
    visibility: hidden;
  }
}

@media (prefers-reduced-motion: reduce) {
  .visor__cursor {
    animation: none;
  }
}

.dica {
  margin: 0;
  font-size: clamp(11px, 1.3vw, 15px);
  color: rgba(255, 255, 255, 0.45);
}

.painel-teclas {
  display: flex;
  flex-direction: column;
  gap: clamp(8px, 1.4vh, 14px);
  width: min(420px, 42vw);
}

.numpad {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: clamp(8px, 1.4vh, 14px);
}

.tecla {
  min-height: clamp(54px, 8.5vh, 96px);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.08);
  border: 3px solid rgba(255, 255, 255, 0.16);
  color: #fff;
  font-size: clamp(22px, 3.4vw, 40px);
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
  /* O alvo é o dedo de quem está do outro lado da mesa: sem seleção acidental
     e sem o atraso de 300ms do duplo-toque. */
  user-select: none;
  touch-action: manipulation;
}

.tecla:active:not(:disabled) {
  background: color-mix(in srgb, var(--tema) 42%, transparent);
  border-color: var(--tema);
  transform: translateY(2px);
}

.tecla:disabled {
  opacity: 0.3;
  cursor: default;
}

.tecla--auxiliar {
  background: rgba(255, 255, 255, 0.04);
  color: rgba(255, 255, 255, 0.7);
  font-size: clamp(18px, 2.6vw, 30px);
}

.acao--continuar {
  width: 100%;
}

/* Telas estreitas ou em pé: uma coluna só, visor em cima do numpad. */
@media (max-width: 820px), (orientation: portrait) {
  .cena--matricula {
    grid-template-columns: minmax(0, 1fr);
    justify-items: center;
    align-content: center;
  }

  .identidade {
    align-items: center;
    text-align: center;
    width: min(420px, 90vw);
  }

  .painel-teclas {
    width: min(420px, 90vw);
  }
}

.acao {
  min-height: clamp(56px, 8vh, 76px);
  padding: 0 28px;
  border-radius: 14px;
  background: var(--tema);
  color: #fff;
  border: none;
  font-size: clamp(16px, 2vw, 22px);
  font-weight: 800;
  letter-spacing: 1px;
  cursor: pointer;
  text-shadow: 0 2px 0 rgba(0, 0, 0, 0.3);
}

.acao:disabled {
  opacity: 0.45;
  cursor: default;
}

.acao--secundaria {
  background: rgba(255, 255, 255, 0.12);
  border: 2px solid rgba(255, 255, 255, 0.25);
}

.erro {
  margin: 0;
  max-width: 60ch;
  padding: 12px 16px;
  border-radius: 12px;
  background: rgba(255, 90, 90, 0.12);
  border: 1px solid rgba(255, 120, 120, 0.5);
  color: #ffb3b3;
  font-size: clamp(13px, 1.6vw, 17px);
  line-height: 1.5;
}

/* Topo da escolha de tema */
.topo {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.topo__eyebrow {
  display: block;
  font-size: 11px;
  letter-spacing: 2px;
  color: rgba(255, 255, 255, 0.45);
}

.topo__nome {
  font-size: clamp(18px, 2.6vw, 30px);
}

.topo__matricula {
  margin-left: 10px;
  font-size: clamp(12px, 1.4vw, 16px);
  color: rgba(255, 255, 255, 0.5);
}

.topo__direita {
  display: flex;
  align-items: center;
  gap: 12px;
}

.topo__placar {
  font-size: clamp(12px, 1.4vw, 16px);
  color: rgba(255, 255, 255, 0.6);
}

/* Grade de temas: 9 cartas que precisam caber sem rolagem no tablet deitado */
.grade-temas {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(clamp(140px, 18vw, 240px), 1fr));
  gap: clamp(8px, 1.4vw, 16px);
  overflow-y: auto;
}

.carta {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: clamp(96px, 16vh, 170px);
  padding: 12px;
  border-radius: 16px;
  background: color-mix(in srgb, var(--tema) 22%, rgba(0, 0, 0, 0.35));
  border: 3px solid var(--tema);
  color: #fff;
  cursor: pointer;
  text-align: center;
}

.carta:active:not(:disabled) {
  transform: translateY(2px);
}

.carta:disabled {
  opacity: 0.35;
  cursor: default;
}

/* O `size` do TypeIcon vira atributo width/height no SVG, e atributo de
   apresentacao perde para CSS -- entao o tamanho responsivo continua aqui. */
.carta__icone {
  width: clamp(26px, 4vw, 44px);
  height: auto;
  color: var(--tema-icone);
  flex-shrink: 0;
}

.carta__nome {
  font-size: clamp(13px, 1.6vw, 19px);
  font-weight: 700;
}

.carta__aviso {
  font-size: clamp(10px, 1.1vw, 13px);
  color: rgba(255, 255, 255, 0.7);
  line-height: 1.35;
}

/* Pergunta */
.cena--pergunta {
  justify-content: flex-start;
}

.faixa {
  display: flex;
  align-items: center;
  gap: clamp(8px, 1.6vw, 20px);
  flex-wrap: wrap;
  font-size: clamp(12px, 1.5vw, 18px);
}

.faixa__tema {
  /* O icone virou elemento e precisa alinhar com o nome do tema ao lado. */
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-weight: 800;
  color: var(--tema);
}

.faixa__nivel {
  padding: 3px 10px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.1);
  font-size: clamp(10px, 1.1vw, 13px);
  letter-spacing: 1px;
}

/* Discreto: serve para o aluno ditar o número se quiser contestar, e não pode
   competir com o enunciado nem com o cronômetro. */
.faixa__codigo {
  color: rgba(255, 255, 255, 0.45);
  font-size: clamp(10px, 1.1vw, 13px);
  letter-spacing: 1px;
}

.faixa__aluno {
  color: rgba(255, 255, 255, 0.55);
}

.relogio {
  margin-left: auto;
  font-size: clamp(22px, 3.4vw, 44px);
  font-weight: 900;
  font-variant-numeric: tabular-nums;
}

.relogio--apertado {
  color: #ff6b6b;
}

.barra {
  height: clamp(8px, 1.2vh, 14px);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.1);
  overflow: hidden;
}

.barra__cheia {
  height: 100%;
  background: var(--tema);
  /* A largura vem do cronômetro a cada 200ms; a transição só suaviza o passo. */
  transition: width 0.2s linear;
}

.barra__cheia--apertado {
  background: #ff6b6b;
}

.enunciado {
  margin: 0;
  font-size: clamp(20px, 3.4vw, 42px);
  line-height: 1.25;
}

.grade-alternativas {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(clamp(240px, 40%, 460px), 1fr));
  gap: clamp(8px, 1.4vw, 18px);
}

.alternativa {
  display: flex;
  align-items: center;
  gap: clamp(10px, 1.4vw, 18px);
  padding: clamp(12px, 2vw, 24px);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.06);
  border: 3px solid rgba(255, 255, 255, 0.16);
  color: #fff;
  font-size: clamp(15px, 2vw, 26px);
  text-align: left;
  cursor: pointer;
}

.alternativa:active:not(:disabled) {
  background: color-mix(in srgb, var(--tema) 30%, transparent);
  border-color: var(--tema);
}

.alternativa:disabled {
  opacity: 0.5;
  cursor: default;
}

.alternativa__letra {
  flex-shrink: 0;
  width: clamp(34px, 4vw, 54px);
  height: clamp(34px, 4vw, 54px);
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--tema);
  font-weight: 900;
  font-size: clamp(15px, 1.8vw, 24px);
}

.alternativa__texto {
  min-width: 0;
}

/* Resultado */
.cena--acerto {
  --tema: #2fbf71;
}

.cena--erro {
  --tema: #e5484d;
}

/* Ficha rara.
   Cor e escala de tipo deliberadamente diferentes do acerto comum: o operador
   olha esta tela de lado, com a fila andando, e precisa distinguir "acertou" de
   "entregue a ficha" sem ler. Fundo dourado inteiro, não um detalhe. */
.cena--raro {
  --tema: var(--raro);
  background:
    radial-gradient(circle at 50% 30%, rgba(245, 196, 81, 0.25), transparent 60%),
    var(--raro-deep);
}

.selo--raro {
  color: #2a1d00;
}

.raro__eyebrow {
  margin: 0;
  color: rgba(255, 255, 255, 0.75);
  font-size: clamp(13px, 1.6vw, 20px);
  font-weight: 700;
  letter-spacing: 0.35em;
}

.raro__nome {
  margin: 0;
  color: var(--raro);
  font-size: clamp(34px, 6.5vw, 82px);
  line-height: 1.05;
  text-shadow: 0 2px 16px rgba(0, 0, 0, 0.45);
}

/* A ordem para o OPERADOR, em imperativo. É o único aviso que ele recebe. */
.raro__ordem {
  margin: 0;
  padding: clamp(8px, 1.2vw, 16px) clamp(16px, 2.4vw, 32px);
  border: 3px solid var(--raro);
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.3);
  color: #fff;
  font-size: clamp(17px, 2.8vw, 36px);
  font-weight: 900;
  letter-spacing: 0.04em;
  text-align: center;
}

.raro__apoio {
  margin: 0;
  max-width: 48ch;
  color: rgba(255, 255, 255, 0.85);
  font-size: clamp(13px, 1.6vw, 20px);
  line-height: 1.5;
  text-align: center;
}

.raro__apoio strong {
  color: var(--raro);
}

/* Tarja de pendência: some só quando a ficha vira captura. */
.tarja-raro {
  margin: 0;
  padding: 8px 18px;
  border: 2px solid var(--raro);
  border-radius: 999px;
  background: rgba(245, 196, 81, 0.12);
  color: var(--raro);
  font-size: clamp(12px, 1.5vw, 18px);
  font-weight: 700;
}

.selo {
  display: grid;
  place-items: center;
  width: clamp(80px, 12vw, 140px);
  height: clamp(80px, 12vw, 140px);
  border-radius: 50%;
  background: var(--tema);
  font-size: clamp(44px, 7vw, 80px);
  font-weight: 900;
  line-height: 1;
}

.veredito {
  margin: 0;
  font-size: clamp(26px, 4.4vw, 54px);
}

.gabarito,
.codigo-questao {
  margin: 0;
  color: rgba(255, 255, 255, 0.45);
  font-size: clamp(12px, 1.3vw, 16px);
  letter-spacing: 1px;
}

.instrucao {
  margin: 0;
  max-width: 60ch;
  font-size: clamp(15px, 2vw, 24px);
  line-height: 1.5;
  color: rgba(255, 255, 255, 0.8);
}

.instrucao strong,
.gabarito strong {
  color: #fff;
}

.botoes {
  display: flex;
  gap: 14px;
  flex-wrap: wrap;
  justify-content: center;
}
</style>
