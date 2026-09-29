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
  // Eles CONTAM para completar a Profdex (e para destravar a raid), mas vêm em
  // lista SEPARADA de propósito: o servidor nunca manda um raro não capturado —
  // de um raro que o aluno não tem só atravessa a fronteira o fato de que ele
  // existe. O front desenha `total - owned.length` cards bloqueados a partir
  // daqui e não tem como revelar o que não recebeu.
  const rares = ref({ total: 0, owned: [] })

  // A raid do lendário (tarefa 18). Estado próprio, ao lado do dos raros e
  // pelo mesmo motivo: o servidor NUNCA manda nome nem arte do lendário antes
  // da captura, então o que existe aqui até lá é só `unlocked` — o bastante
  // para desenhar a silhueta `???` e o botão, e nada além disso.
  //
  // Depois de vencer, `legendary` vem preenchido e `captured` vira true: aí o
  // card deixa de ser silhueta e passa a ser a última entrada da coleção.
  const raid = ref({
    unlocked: false,
    captured: false,
    legendary: null,
    dex: { captured: 0, total: 0 },
    cooldownUntil: null,
    attempts: 0,
  })

  // Onde a grade da coleção estava quando o aluno abriu a ficha de um professor.
  //
  // Mora aqui, e não no router: o scroll do app não é o da janela (o body tem
  // `overflow: hidden`), então `scrollBehavior` não alcança o elemento certo —
  // quem sabe qual é o `.profdex__main` é a própria view. ProfdexView grava ao
  // sair para a ficha e CONSOME ao voltar, para que só o retorno imediato
  // restaure a posição.
  const dexScroll = ref(0)

  // Uma única requisição em voo por vez: o guard da rota e o onMounted das
  // telas podem pedir a lista ao mesmo tempo.
  let inflight = null

  async function fetch() {
    loading.value = true
    try {
      const [dex, raros, raidStatus] = await Promise.all([
        api.get('/professors'),
        api.get('/professors/rares'),
        // A raid não pode derrubar a Profdex: ela é um card a mais numa tela
        // que existia antes dela. Backend antigo (rota 404) ou erro de rede
        // deixam o estado como está, e a coleção carrega igual.
        api.get('/raid/status').catch(() => null),
      ])
      professors.value = dex.data
      rares.value = raros.data
      if (raidStatus) raid.value = raidStatus.data
    } finally {
      loading.value = false
    }
  }

  /**
   * Relê só o estado da raid.
   *
   * Existe separado do `fetch` porque a volta da batalha precisa dele e não
   * precisa recarregar a coleção inteira — e porque o cooldown é um relógio:
   * quem perdeu e ficou na tela quer ver o botão reabrir sem dar F5.
   */
  async function fetchRaid() {
    const { data } = await api.get('/raid/status')
    raid.value = data
    return data
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
    // O LENDÁRIO capturado entra na busca junto com os raros: depois da raid
    // ele é um exemplar como outro qualquer, e a ficha e a arena o resolvem
    // por aqui. Enquanto não capturado ele nem existe na memória do app.
    const lendario = raid.value.captured && raid.value.legendary
      ? [raid.value.legendary]
      : []
    return (
      [...professors.value, ...rares.value.owned, ...lendario].find(
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
    raid,
    fetchRaid,
    loading,
    dexScroll,
    fetch,
    ensureLoaded,
    findByKey,
    captureByToken,
  }
})
