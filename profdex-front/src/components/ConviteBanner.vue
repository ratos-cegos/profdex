<script setup>
import { computed, onUnmounted, ref, watch } from 'vue'
import { useBattleStore } from '../stores/battle'

// Convites de batalha, em QUALQUER tela.
//
// Antes este bloco morava dentro da BatalhaView, e o socket só existia lá:
// quem recebia um desafio enquanto olhava a Profdex, o perfil ou o scan não
// via nada, e o convite morria em 60s. Agora o socket abre no login (App.vue) e
// o aviso vive fora do RouterView, para não sumir na troca de rota.
//
// Fica ancorado no TOPO de propósito: a barra de navegação e o botão de ação
// das telas ficam embaixo, e cobri-los trocaria um travamento por outro.
const battle = useBattleStore()

// Relógio de 1s para as contagens regressivas — só roda quando há convite.
const now = ref(Date.now())
let clock = null

// Cada convite vive 60s e qualquer um do lobby pode mandar o seu, então numa
// sala cheia eles chegam vários de uma vez. Empilhados, tomariam a tela: viram
// uma lista rolável de altura fixa, com quem expira primeiro no topo.
const RENDER_CAP = 20

// Durante a seleção ou a batalha o servidor nem entrega convites (o status vira
// `em_batalha`); se algum sobrou em memória, ele não pode aparecer por cima da
// arena.
const invites = computed(() =>
  battle.pvp ? [] : [...battle.incomingInvites].sort((a, b) => a.expiresAt - b.expiresAt),
)

const visiveis = computed(() => invites.value.slice(0, RENDER_CAP))
const ocultos = computed(() => invites.value.length - visiveis.value.length)

function secondsLeft(expiresAt) {
  return Math.max(0, Math.ceil((expiresAt - now.value) / 1000))
}

// Com a caixa cheia, recusar um a um é pior que o problema original.
function declineAll() {
  // Cópia: cada recusa reescreve a lista do store.
  const pendentes = battle.incomingInvites.slice()
  for (const invite of pendentes) battle.declineInvite(invite.inviteId)
}

const total = computed(() => invites.value.length)

// O relógio só existe enquanto há o que contar: este componente fica montado no
// app inteiro, e um setInterval eterno rodaria em todas as telas à toa.
watch(
  total,
  (quantos) => {
    if (quantos && !clock) {
      now.value = Date.now()
      clock = setInterval(() => {
        now.value = Date.now()
      }, 1000)
    } else if (!quantos && clock) {
      clearInterval(clock)
      clock = null
    }
  },
  { immediate: true },
)

onUnmounted(() => clock && clearInterval(clock))
</script>

<template>
  <section v-if="total" class="convites" aria-live="polite">
    <header class="convites__header">
      <span class="pixel convites__title">
        {{ total === 1 ? 'DESAFIO!' : `DESAFIOS (${total})` }}
      </span>
      <button v-if="total > 1" class="convites__decline-all" type="button" @click="declineAll">
        Recusar todos
      </button>
    </header>

    <ul class="convites__list">
      <li v-for="invite in visiveis" :key="invite.inviteId" class="convite">
        <span class="convite__info">
          <span class="convite__name">{{ invite.from.name }}</span>
          <span
            class="pixel convite__timer"
            :class="{ 'convite__timer--urgent': secondsLeft(invite.expiresAt) <= 10 }"
          >
            {{ secondsLeft(invite.expiresAt) }}s
          </span>
        </span>
        <span class="convite__actions">
          <button
            class="convite__btn convite__btn--accept"
            type="button"
            @click="battle.acceptInvite(invite.inviteId)"
          >
            Aceitar
          </button>
          <button
            class="convite__btn"
            type="button"
            :aria-label="`Recusar desafio de ${invite.from.name}`"
            @click="battle.declineInvite(invite.inviteId)"
          >
            ✕
          </button>
        </span>
      </li>
    </ul>

    <p v-if="ocultos > 0" class="convites__more">+{{ ocultos }} aguardando na fila</p>
  </section>
</template>

<style scoped>
.convites {
  position: fixed;
  top: calc(8px + env(safe-area-inset-top));
  left: 50%;
  transform: translateX(-50%);
  /* Acima do conteúdo das telas, abaixo dos modais (z-index 20). */
  z-index: 15;
  width: min(520px, calc(100% - 16px));
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 14px;
  border-radius: var(--radius-lg);
  background: var(--bg-card);
  border: 2px solid var(--yellow);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
}

.convites__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.convites__title {
  font-size: 9px;
  color: var(--yellow);
}

.convites__decline-all {
  flex-shrink: 0;
  min-height: 32px;
  padding: 0 10px;
  border-radius: var(--radius);
  background: transparent;
  color: var(--text-muted);
  border: 1px solid var(--border);
  font-size: 12px;
  cursor: pointer;
}

/* Altura fixa: a lista rola por dentro em vez de crescer sobre a tela. O
   limite equivale a ~3 linhas — o bastante para a próxima aparecer meio
   cortada e sinalizar que há mais. */
.convites__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 6px;
  max-height: 172px;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}

.convite {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 10px;
  border-radius: var(--radius);
  background: var(--bg-surface);
  border: 1px solid var(--border);
}

.convite__info {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.convite__name {
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.convite__timer {
  flex-shrink: 0;
  font-size: 7px;
  color: var(--text-muted);
}

.convite__timer--urgent {
  color: var(--red-light);
}

.convite__actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}

.convite__btn {
  min-height: 34px;
  padding: 0 10px;
  border-radius: var(--radius);
  background: var(--bg-card);
  color: var(--text);
  border: 1px solid var(--border);
  font-size: 12px;
  cursor: pointer;
}

.convite__btn--accept {
  background: var(--red-dark);
  border-color: var(--red-light);
  color: white;
}

.convites__more {
  margin: 0;
  color: var(--text-muted);
  font-size: 12px;
  text-align: center;
}
</style>
