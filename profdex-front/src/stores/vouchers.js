import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import api from '../services/api'

/**
 * Os vouchers de captura DISPONÍVEIS do aluno.
 *
 * Um voucher vale um QR sem responder pergunta, e nasce de uma errata julgada
 * procedente (ver docs/QUIZ.md). O aluno abre o sino, mostra o card ao
 * operador, o operador dá o check — e o voucher some daqui.
 *
 * Sem polling curto de propósito: são centenas de celulares na mesma rede do
 * evento, e um voucher que demora um refresh para sumir não quebra nada. A
 * revalidação acontece quando a aba volta ao foco, que é exatamente o momento
 * em que o aluno guarda o celular depois do check.
 */
export const useVouchersStore = defineStore('vouchers', () => {
  const vouchers = ref([])
  const loading = ref(false)
  const erro = ref(null)

  // Uma requisição em voo por vez: o `onMounted` da ProfdexView e o
  // `visibilitychange` podem disparar juntos ao voltar para a aba.
  let inflight = null

  function fetch() {
    if (inflight) return inflight
    loading.value = true
    erro.value = null

    inflight = api
      .get('/vouchers/me')
      .then(({ data }) => {
        vouchers.value = data
      })
      .catch(() => {
        // Silencioso na tela: o sino é acessório e não pode virar erro no
        // caminho principal da ProfDex. O estado fica registrado para quem
        // quiser exibir.
        erro.value = 'Não deu para conferir seus vouchers.'
      })
      .finally(() => {
        loading.value = false
        inflight = null
      })

    return inflight
  }

  function ensureLoaded() {
    if (vouchers.value.length) return Promise.resolve(vouchers.value)
    return fetch().then(() => vouchers.value)
  }

  const total = computed(() => vouchers.value.length)
  const temVouchers = computed(() => total.value > 0)

  return { vouchers, loading, erro, fetch, ensureLoaded, total, temVouchers }
})
