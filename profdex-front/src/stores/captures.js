import { ref } from 'vue'
import { defineStore } from 'pinia'
import api from '../services/api'

/**
 * Os EXEMPLARES do aluno, não os professores.
 *
 * O mesmo professor pode aparecer várias vezes na coleção — uma por ficha de QR
 * resgatada — e cada exemplar tem a sua combinação de tipos e o seu deck, que o
 * servidor sorteou no momento da captura. A lista de professores (store
 * `professors`) continua sendo a dex; aqui ficam as cópias.
 */
export const useCapturesStore = defineStore('captures', () => {
  const captures = ref([])
  const loading = ref(false)

  // Uma única requisição em voo por vez: a ficha do professor e a tela de
  // escolha da batalha podem pedir a lista ao mesmo tempo.
  let inflight = null

  async function fetch() {
    loading.value = true
    try {
      const { data } = await api.get('/captures')
      captures.value = data
    } finally {
      loading.value = false
    }
  }

  function ensureLoaded() {
    if (captures.value.length) return Promise.resolve(captures.value)
    if (!inflight) {
      inflight = fetch().finally(() => {
        inflight = null
      })
    }
    return inflight.then(() => captures.value)
  }

  function byProfessorId(professorId) {
    return captures.value.filter((c) => c.professor?.id === professorId)
  }

  function countByProfessorId(professorId) {
    return byProfessorId(professorId).length
  }

  /**
   * Os exemplares de um professor agrupados por combinação de tipos — é assim
   * que a ficha os exibe: "Eron de IA/ML" com os seus, "Eron de
   * Arquitetura+IA/ML" com os dele.
   */
  function groupedByVariant(professorId) {
    const grupos = new Map()

    for (const capture of byProfessorId(professorId)) {
      const key = capture.variant?.typeKey ?? capture.types.join('+')
      if (!grupos.has(key)) {
        grupos.set(key, { typeKey: key, types: capture.types ?? [], items: [] })
      }
      grupos.get(key).items.push(capture)
    }

    // Combinações mais simples primeiro, como na tiragem dos QRs.
    for (const group of grupos.values()) {
      group.items.sort((a, b) => (b.stars ?? 0) - (a.stars ?? 0))
    }
    return [...grupos.values()].sort(
      (a, b) => a.types.length - b.types.length || a.typeKey.localeCompare(b.typeKey),
    )
  }

  return {
    captures,
    loading,
    fetch,
    ensureLoaded,
    byProfessorId,
    countByProfessorId,
    groupedByVariant,
  }
})
