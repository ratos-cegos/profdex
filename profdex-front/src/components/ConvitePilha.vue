<script setup>
import { computed, onUnmounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import PixelIcon from './PixelIcon.vue'
import { useBattleStore } from '../stores/battle'
import { abreviarNome } from '../services/abreviar-nome'
import { convitesVisiveis, RENDER_CAP, segundosRestantes } from '../services/convite-pilha'

// Desafios recebidos, em QUALQUER tela, como uma pilha de cartas.
//
// Substitui o ConviteBanner (lista rolável). Três decisões:
//
// - Uma carta por vez, a que expira primeiro. As outras aparecem como cartas
//   deslocadas atrás, com "+N": o aluno vê que há fila sem ler uma lista.
// - Nunca prende a tela. Não há fundo escuro nem foco preso; só a carta recebe
//   toque. Minimizar (▴, deslizar para cima ou Esc) vira uma pílula no canto,
//   e um desafio novo faz a pílula piscar em vez de reabrir a pilha na cara de
//   quem está no meio de outra coisa.
// - Nada no `/admin` (bancada do quiz no tablet do estande) nem durante a
//   batalha. Os convites seguem no store e reaparecem ao sair, se valerem.
//
// Fica no TOPO: a barra de navegação e o botão de ação das telas ficam embaixo.
const battle = useBattleStore()
const route = useRoute()

const convites = computed(() =>
  convitesVisiveis(battle.incomingInvites, { pvp: battle.pvp, path: route.path }),
)
const total = computed(() => convites.value.length)
const topo = computed(() => convites.value[0] ?? null)
// No máximo duas cartas de fundo: mais que isso é só ruído atrás da primeira.
const cartasAtras = computed(() => Math.min(total.value - 1, 2))
const lista = computed(() => convites.value.slice(0, RENDER_CAP))
const ocultos = computed(() => total.value - lista.value.length)

const minimizada = ref(false)
const expandida = ref(false)
const chegouNovo = ref(false)
// Como a carta do topo sai: aceita "acende e sobe", recusada vai para o lado,
// expirada só apaga. Definido ANTES da ação, para a transição saber o caminho.
const saida = ref('expira')
const aceitando = ref(null)

// ── Relógio: 1s, só enquanto há convite ────────────────────────────────────
const agora = ref(Date.now())
let relogio = null

watch(
  total,
  (quantos, antes = 0) => {
    if (quantos && !relogio) {
      agora.value = Date.now()
      relogio = setInterval(() => (agora.value = Date.now()), 1000)
    } else if (!quantos && relogio) {
      clearInterval(relogio)
      relogio = null
    }
    if (!quantos) {
      // Pilha vazia volta ao estado inicial: o próximo desafio chega aberto.
      minimizada.value = false
      expandida.value = false
    }
    if (quantos <= 1) expandida.value = false
    if (quantos > antes && antes > 0) avisarChegada()
  },
  { immediate: true },
)

let timerChegada = null
function avisarChegada() {
  chegouNovo.value = false
  clearTimeout(timerChegada)
  // Um quadro sem a classe para a animação poder recomeçar.
  requestAnimationFrame(() => {
    chegouNovo.value = true
    timerChegada = setTimeout(() => (chegouNovo.value = false), 1200)
  })
}

onUnmounted(() => {
  if (relogio) clearInterval(relogio)
  clearTimeout(timerChegada)
})

const segundos = (convite) => segundosRestantes(convite.expiresAt, agora.value)
// O convite vive 60s no servidor; a barra mede o que sobra disso.
const TTL_S = 60
const fracao = (convite) => Math.min(1, segundos(convite) / TTL_S)

// ── Ações ──────────────────────────────────────────────────────────────────
async function aceitar(convite) {
  if (aceitando.value) return
  saida.value = 'aceita'
  aceitando.value = convite.inviteId
  try {
    // Sucesso: o `battle:start` limpa a pilha e leva à seleção de time.
    // Falha: o store tira o convite e mostra o motivo no aviso pixel.
    await battle.acceptInvite(convite.inviteId)
  } finally {
    aceitando.value = null
  }
}

function recusar(convite) {
  saida.value = 'recusa'
  battle.declineInvite(convite.inviteId)
}

function recusarTodos() {
  saida.value = 'recusa'
  // Cópia: cada recusa reescreve a lista do store.
  for (const convite of battle.incomingInvites.slice()) battle.declineInvite(convite.inviteId)
}

// Expirar é o caminho padrão: depois de cada saída voltamos a ele.
function saidaTerminou() {
  saida.value = 'expira'
}

function minimizar() {
  expandida.value = false
  minimizada.value = true
}

// Deslizar a carta para cima também minimiza — o gesto que o celular já usa
// para "tirar da frente" uma notificação.
let toqueY = null
function inicioToque(evento) {
  toqueY = evento.touches[0]?.clientY ?? null
}
function fimToque(evento) {
  if (toqueY === null || expandida.value) return
  const dy = (evento.changedTouches[0]?.clientY ?? toqueY) - toqueY
  toqueY = null
  if (dy < -40) minimizar()
}
</script>

<template>
  <Transition name="pilha">
    <section
      v-if="total && !minimizada"
      class="pilha"
      :class="{ 'pilha--chegou': chegouNovo }"
      aria-label="Desafios recebidos"
      @keydown.esc="minimizar"
      @touchstart.passive="inicioToque"
      @touchend.passive="fimToque"
    >
      <!-- Cartas de fundo: só forma, a fila à vista. -->
      <span
        v-for="n in expandida ? 0 : cartasAtras"
        :key="n"
        class="pilha__fundo"
        :style="{ '--n': n }"
        aria-hidden="true"
      />

      <div class="gba-frame carta">
        <header class="carta__topo">
          <img class="carta__espadas" src="/icons/batalha.png" alt="" aria-hidden="true" />
          <span class="pixel carta__titulo" aria-live="polite">
            {{ total === 1 ? 'DESAFIO!' : `DESAFIOS (${total})` }}
          </span>
          <button
            v-if="total > 1"
            class="pixel carta__mais"
            type="button"
            :aria-expanded="expandida"
            :aria-label="expandida ? 'Mostrar um desafio por vez' : `Ver todos os ${total} desafios`"
            @click="expandida = !expandida"
          >
            <template v-if="!expandida">+{{ total - 1 }}</template>
            <PixelIcon :nome="expandida ? 'seta-cima' : 'seta-baixo'" :escala="1" />
          </button>
          <button class="carta__icone-btn" type="button" aria-label="Minimizar desafios" @click="minimizar">
            <PixelIcon nome="minimizar" :escala="2" />
          </button>
        </header>

        <!-- Um por vez -->
        <Transition v-if="!expandida" :name="`carta-${saida}`" mode="out-in" @after-leave="saidaTerminou">
          <div v-if="topo" :key="topo.inviteId" class="carta__corpo">
            <p class="carta__quem">
              <strong :title="topo.from.name">{{ abreviarNome(topo.from.name) }}</strong>
              <span>quer batalhar com você</span>
            </p>

            <div class="tempo" :class="{ 'tempo--urgente': segundos(topo) <= 10 }">
              <span class="tempo__trilho" aria-hidden="true">
                <span class="tempo__barra" :style="{ transform: `scaleX(${fracao(topo)})` }" />
              </span>
              <span class="pixel tempo__seg">{{ segundos(topo) }}s</span>
            </div>

            <div class="carta__acoes">
              <button
                class="btn-pixel carta__aceitar"
                type="button"
                :disabled="aceitando === topo.inviteId"
                @click="aceitar(topo)"
              >
                {{ aceitando === topo.inviteId ? 'ENTRANDO…' : 'ACEITAR' }}
              </button>
              <button
                class="btn-pixel btn-pixel--ghost"
                type="button"
                :aria-label="`Recusar desafio de ${topo.from.name}`"
                @click="recusar(topo)"
              >
                RECUSAR
              </button>
            </div>
          </div>
        </Transition>

        <!-- Todos, compactos -->
        <div v-else class="carta__lista">
          <TransitionGroup tag="ul" name="linha" class="fila">
            <li v-for="convite in lista" :key="convite.inviteId" class="fila__item">
              <span class="fila__nome" :title="convite.from.name">{{ abreviarNome(convite.from.name) }}</span>
              <span class="pixel fila__seg" :class="{ 'fila__seg--urgente': segundos(convite) <= 10 }">
                {{ segundos(convite) }}s
              </span>
              <button
                class="fila__btn fila__btn--sim"
                type="button"
                :disabled="aceitando === convite.inviteId"
                :aria-label="`Aceitar desafio de ${convite.from.name}`"
                @click="aceitar(convite)"
              >
                <PixelIcon nome="check" :escala="2" />
              </button>
              <button
                class="fila__btn"
                type="button"
                :aria-label="`Recusar desafio de ${convite.from.name}`"
                @click="recusar(convite)"
              >
                <PixelIcon nome="fechar" :escala="2" />
              </button>
            </li>
          </TransitionGroup>
          <p v-if="ocultos > 0" class="fila__mais">+{{ ocultos }} aguardando na fila</p>
          <button class="btn-pixel btn-pixel--ghost fila__todos" type="button" @click="recusarTodos">
            RECUSAR TODOS
          </button>
        </div>
      </div>
    </section>
  </Transition>

  <!-- Minimizada: a pílula fica no canto até o aluno querer olhar. -->
  <Transition name="pilula">
    <button
      v-if="total && minimizada"
      class="pilula"
      :class="{ 'pilula--chegou': chegouNovo }"
      type="button"
      :aria-label="`${total} ${total === 1 ? 'desafio pendente' : 'desafios pendentes'}. Abrir`"
      @click="minimizada = false"
    >
      <img class="pilula__icone" src="/icons/batalha.png" alt="" aria-hidden="true" />
      <span class="pixel">{{ total }}</span>
    </button>
  </Transition>
</template>

<style scoped>
.pilha {
  position: relative;
  width: 100%;
  pointer-events: auto;
}

/* As cartas de trás: mesma moldura, mais escuras, deslocadas para baixo e um
   pouco menores — a leitura de "baralho" sem precisar de texto. */
.pilha__fundo {
  position: absolute;
  inset: 0;
  z-index: 0;
  border: 4px solid var(--unifil-orange);
  border-radius: var(--radius);
  background: var(--surface);
  box-shadow: 0 6px 12px rgb(0 0 0 / 40%);
  transform: translateY(calc(var(--n) * 9px)) scaleX(calc(1 - var(--n) * 0.05));
  filter: brightness(calc(1 - var(--n) * 0.25));
}

.carta {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 14px 14px;
  box-shadow:
    inset 0 0 0 2px var(--unifil-gold),
    inset 0 0 0 4px var(--surface),
    0 10px 24px rgb(0 0 0 / 50%);
}

.carta__topo {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 32px;
}

/* O ícone de batalha do próprio app (o mesmo da barra inferior). */
.carta__espadas,
.pilula__icone {
  height: 28px;
  width: auto;
  image-rendering: pixelated;
  flex-shrink: 0;
}

.carta__titulo {
  flex: 1;
  color: var(--unifil-gold);
  font-size: 9px;
}

.carta__mais {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 32px;
  padding: 0 10px;
  border: 2px solid var(--surface-border);
  border-radius: 4px;
  background: var(--bg-deep);
  color: var(--unifil-gold);
  font-size: 8px;
}

.carta__icone-btn {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border-radius: 4px;
  background: transparent;
  color: var(--text-muted);
}

.carta__mais:focus-visible,
.carta__icone-btn:focus-visible,
.fila__btn:focus-visible,
.pilula:focus-visible {
  outline: 3px solid var(--unifil-gold);
  outline-offset: 2px;
}

@media (hover: hover) {
  .carta__icone-btn:hover {
    color: var(--text-primary);
  }
}

.carta__corpo {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.carta__quem {
  display: flex;
  flex-direction: column;
  gap: 2px;
  color: var(--text-muted);
  font-size: 13px;
}

.carta__quem strong {
  color: var(--text-primary);
  font-size: 16px;
  font-weight: 800;
  line-height: 1.25;
  overflow-wrap: anywhere;
}

/* Barra de tempo: esvazia em saltos de 1s (o próprio relógio), como a barra
   de HP. Vermelha nos últimos 10s. */
.tempo {
  display: flex;
  align-items: center;
  gap: 10px;
}

.tempo__trilho {
  flex: 1;
  height: 8px;
  border: 2px solid var(--bg-deep);
  background: var(--surface-border);
  overflow: hidden;
}

.tempo__barra {
  display: block;
  height: 100%;
  background: var(--unifil-gold);
  transform-origin: left;
  transition: transform 1s steps(4, end);
}

.tempo__seg {
  min-width: 4ch;
  color: var(--text-muted);
  font-size: 8px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.tempo--urgente .tempo__barra {
  background: var(--error);
}

.tempo--urgente .tempo__seg {
  color: var(--error);
}

.carta__acoes {
  display: grid;
  grid-template-columns: 1.4fr 1fr;
  gap: 8px;
}

/* ── Lista expandida ────────────────────────────────────────────────────── */
.carta__lista {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.fila {
  display: grid;
  gap: 6px;
  max-height: min(40vh, 236px);
  margin: 0;
  padding: 0;
  list-style: none;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.fila__item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto auto;
  align-items: center;
  gap: 8px;
  padding: 6px 6px 6px 10px;
  border: 2px solid var(--surface-border);
  border-radius: 4px;
  background: var(--bg-deep);
}

.fila__nome {
  font-size: 14px;
  font-weight: 700;
  overflow-wrap: anywhere;
}

.fila__seg {
  color: var(--text-muted);
  font-size: 8px;
  font-variant-numeric: tabular-nums;
}

.fila__seg--urgente {
  color: var(--error);
}

.fila__btn {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border: 2px solid var(--surface-border);
  border-radius: 0;
  background: var(--surface);
  color: var(--text-muted);
  box-shadow: inset -2px -2px 0 var(--bg-deep);
}

.fila__btn--sim {
  background: var(--unifil-orange);
  color: var(--text-primary);
  box-shadow:
    inset -2px -2px 0 var(--surface-border),
    inset 2px 2px 0 var(--unifil-gold);
}

.fila__btn:disabled {
  opacity: 0.55;
}

.fila__mais {
  margin: 0;
  color: var(--text-muted);
  font-size: 12px;
  text-align: center;
}

/* ── Pílula minimizada ──────────────────────────────────────────────────── */
.pilula {
  align-self: flex-end;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  padding: 0 14px 0 10px;
  pointer-events: auto;
  border: 3px solid var(--unifil-orange);
  border-radius: 0;
  background: var(--surface);
  box-shadow:
    inset 2px 2px 0 var(--unifil-gold),
    0 6px 16px rgb(0 0 0 / 45%);
  color: var(--unifil-gold);
  font-size: 10px;
}

/* ── Movimento ──────────────────────────────────────────────────────────── */
/* O estado final é o padrão; só quem aceita movimento vê as transições. */
@media (prefers-reduced-motion: no-preference) {
  /* A pilha desce do topo em quadros, como a caixa de diálogo de um portátil. */
  .pilha-enter-active,
  .pilha-leave-active {
    transition:
      transform var(--dur-base) var(--ease-pixel),
      opacity var(--dur-base) steps(3, end);
  }

  .pilha-enter-from,
  .pilha-leave-to {
    transform: translateY(-120%);
    opacity: 0;
  }

  .pilula-enter-active,
  .pilula-leave-active {
    transition:
      transform var(--dur-fast) steps(3, end),
      opacity var(--dur-fast) steps(3, end);
  }

  .pilula-enter-from,
  .pilula-leave-to {
    transform: translateY(-12px);
    opacity: 0;
  }

  /* Desafio novo com a pilha aberta: a moldura dá um tranco curto. Com ela
     minimizada, só a pílula pisca — ninguém é interrompido. */
  .pilha--chegou .carta {
    animation: tranco 360ms steps(6, end);
  }

  .pilula--chegou {
    animation: pisca 400ms steps(2, end) 3;
  }

  /* Saídas da carta do topo e a entrada da próxima, que "sobe" da pilha. */
  .carta-aceita-leave-active,
  .carta-recusa-leave-active,
  .carta-expira-leave-active {
    transition:
      transform var(--dur-base) var(--ease-pixel),
      opacity var(--dur-base) steps(3, end),
      filter var(--dur-base) steps(3, end);
  }

  .carta-aceita-leave-to {
    transform: translateY(-10px) scale(1.04);
    filter: brightness(1.6);
    opacity: 0;
  }

  .carta-recusa-leave-to {
    transform: translateX(60%);
    opacity: 0;
  }

  .carta-expira-leave-to {
    opacity: 0;
  }

  .carta-aceita-enter-active,
  .carta-recusa-enter-active,
  .carta-expira-enter-active {
    transition:
      transform var(--dur-base) var(--ease-pixel),
      opacity var(--dur-fast) steps(2, end);
  }

  .carta-aceita-enter-from,
  .carta-recusa-enter-from,
  .carta-expira-enter-from {
    transform: translateY(10px) scale(0.97);
    opacity: 0;
  }

  .linha-leave-active {
    transition:
      transform var(--dur-fast) steps(3, end),
      opacity var(--dur-fast) steps(3, end);
  }

  .linha-leave-to {
    transform: translateX(40%);
    opacity: 0;
  }

  .linha-move {
    transition: transform var(--dur-base) var(--ease-pixel);
  }

  .tempo__barra {
    transition: transform 1s steps(4, end);
  }
}

@media (prefers-reduced-motion: reduce) {
  .tempo__barra {
    transition: none;
  }
}

@keyframes tranco {
  25% {
    transform: translateX(-4px);
  }
  50% {
    transform: translateX(4px);
  }
  75% {
    transform: translateX(-2px);
  }
}

@keyframes pisca {
  50% {
    background: var(--unifil-orange);
    color: var(--text-primary);
  }
}
</style>
