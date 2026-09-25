import { ref } from 'vue'
import { defineStore } from 'pinia'
import api from '../services/api'
import { normalizeKey } from '../data/types'
import { useCapturesStore } from './captures'

export const useProfessorsStore = defineStore('professors', () => {
  const professors = ref([])
  const loading = ref(false)

  // Professores raros: quantos existem e quais este aluno já capturou.
  //
  // Lista SEPARADA de propósito. O raro não entra em `professors` porque não
  // conta para completar a Profdex, e o servidor nunca manda os não
  // capturados — de um raro que o aluno não tem só atravessa a fronteira o
  // fato de que ele existe. O front desenha `total - owned.length` cards
  // bloqueados a partir daqui e não tem como revelar o que não recebeu.
  const rares = ref({ total: 0, owned: [] })

  // Uma única requisição em voo por vez: o guard da rota e o onMounted das
  // telas podem pedir a lista ao mesmo tempo.
  let inflight = null

  async function fetch() {
    loading.value = true
    try {
      const [dex, raros] = await Promise.all([
        api.get('/professors'),
        api.get('/professors/rares'),
      ])
      professors.value = dex.data
      rares.value = raros.data
    } finally {
      loading.value = false
    }
  }

  // Garante a lista carregada antes de quem depende dela (ex.: /arena/:id
  // resolve o professor já no setup). Reaproveita a requisição em andamento.
  function ensureLoaded() {
    if (professors.value.length) return Promise.resolve(professors.value)
    if (!inflight) {
      inflight = fetch().finally(() => {
        inflight = null
      })
    }
    return inflight.then(() => professors.value)
  }

  // Resolve um professor pelo parâmetro da rota. O `id` do banco é um UUID,
  // então links legíveis usam o slug (/arena/eron) — e aceitamos também o
  // prefixo "prof-" (/arena/prof-eron) e o nome com acento (/arena/mário).
  function findByKey(key) {
    if (key == null || key === '') return null
    const raw = String(key)
    const wanted = normalizeKey(raw.replace(/^prof(essor)?-/, ''))
    // Os raros POSSUÍDOS entram na busca: fora da contagem da dex eles são
    // exemplares como qualquer outro, e a arena e a ficha os resolvem por aqui.
    // Os não possuídos nem estão na memória do app — não há o que achar.
    return (
      [...professors.value, ...rares.value.owned].find(
        (p) =>
          String(p.id) === raw ||
          normalizeKey(p.slug) === wanted ||
          normalizeKey(p.name) === wanted,
      ) ?? null
    )
  }

  async function captureByToken(token) {
    const { data } = await api.post('/captures/by-token', { token })
    // A dex (flags e contagem) e a lista de exemplares mudam juntas: recarregar
    // só uma deixaria o exemplar novo invisível na ficha do professor.
    await Promise.all([fetch(), useCapturesStore().fetch()])
    return data // { professor, variant, types, moves: [...] }
  }

  return {
    professors,
    rares,
    loading,
    fetch,
    ensureLoaded,
    findByKey,
    captureByToken,
  }
})
