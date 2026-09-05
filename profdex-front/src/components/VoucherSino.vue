<script setup>
import { onMounted, onUnmounted, ref } from 'vue'
import BottomSheet from './BottomSheet.vue'
import { useVouchersStore } from '../stores/vouchers'
import { getType } from '../data/types'

// Sino de vouchers do cabeçalho da ProfDex.
//
// Um voucher vale um QR sem responder pergunta e nasce de uma errata julgada
// procedente. O fluxo termina na mesa: o aluno mostra este card, o operador dá
// o check no painel, e o voucher some daqui.

const vouchers = useVouchersStore()
const aberto = ref(false)

// Revalida quando a aba volta ao foco — é exatamente quando o aluno guarda o
// celular depois do check. Polling curto está fora de questão: são centenas de
// aparelhos na mesma rede do evento.
function aoVoltarAoFoco() {
  if (document.visibilityState === 'visible') void vouchers.fetch()
}

onMounted(() => {
  void vouchers.fetch()
  document.addEventListener('visibilitychange', aoVoltarAoFoco)
})

onUnmounted(() => {
  document.removeEventListener('visibilitychange', aoVoltarAoFoco)
})

const rotuloTema = (id) => getType(id)?.label ?? id
</script>

<template>
  <!-- Sem vouchers, sem sino: um ícone morto no cabeçalho só ocupa toque. -->
  <button
    v-if="vouchers.temVouchers"
    class="sino"
    type="button"
    :aria-label="`Abrir vouchers (${vouchers.total})`"
    @click="aberto = true"
  >
    <span class="sino__icone" aria-hidden="true">🔔</span>
    <span class="pixel sino__badge" aria-hidden="true">{{ vouchers.total }}</span>
  </button>

  <BottomSheet v-if="aberto" title="SEUS VOUCHERS" @close="aberto = false">
    <p class="explicacao">
      Cada voucher vale um QR de captura sem responder outra pergunta. Mostre esta tela a um
      operador do estande.
    </p>

    <ul class="cards">
      <li v-for="v in vouchers.vouchers" :key="v.id" class="card">
        <span class="pixel card__codigo">#{{ v.questaoCode ?? '----' }}</span>
        <span class="card__motivo">
          <template v-if="v.questaoCode"> Errata da questão #{{ v.questaoCode }} </template>
          <template v-else>Voucher de captura</template>
        </span>
        <span v-if="v.theme" class="card__tema">{{ rotuloTema(v.theme) }}</span>
        <span class="card__instrucao">Mostre esta tela a um operador do estande</span>
      </li>
    </ul>
  </BottomSheet>
</template>

<style scoped>
.sino {
  position: relative;
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.25);
  cursor: pointer;
}

.sino__icone {
  font-size: 18px;
  line-height: 1;
}

.sino__badge {
  position: absolute;
  top: 0;
  right: 0;
  min-width: 18px;
  height: 18px;
  display: grid;
  place-items: center;
  padding: 0 4px;
  border-radius: 999px;
  background: var(--yellow);
  color: #1a1a1a;
  font-size: 8px;
}

.sino:focus-visible {
  outline: 2px solid var(--unifil-gold);
  outline-offset: 2px;
}

.explicacao {
  margin: 0 0 14px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-muted);
}

.cards {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* O código grande é o que o operador lê de longe, com o celular na mão do
   aluno e a fila andando. */
.card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 18px 14px;
  border: 2px solid var(--unifil-gold);
  border-radius: var(--radius-lg);
  background: var(--bg-card);
  text-align: center;
}

.card__codigo {
  font-size: 26px;
  color: var(--yellow);
  letter-spacing: 0.06em;
}

.card__motivo {
  font-size: 14px;
  font-weight: 700;
}

.card__tema {
  font-size: 12px;
  color: var(--text-muted);
}

.card__instrucao {
  margin-top: 4px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-muted);
}
</style>
