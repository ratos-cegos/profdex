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
  //
  // As travas de HORÁRIO da raid, globais e independentes do aluno: antes delas
  // o card mostra a contagem no lugar do botão. São duas (ver `raid-janela.ts`
  // no back) e o servidor resolve as duas:
  //
  // - `opensAt`/`opensAtLabel` — a abertura do EVENTO, que não se move;
  // - `abreEm`/`abreEmLabel` — a próxima vez que a porta abre: `opensAt` antes da
  //   estreia, a próxima 18h quando é só a janela diária que fechou, `null`
  //   quando já está aberta;
  // - `fechaEm` — quando a janela de hoje fecha. `null` = janela desligada.
  //
  // O padrão é `open: true` porque o card só existe com `unlocked`, e `unlocked`
  // só vem do servidor — nada é liberado por este valor inicial.
  const raid = ref({
    unlocked: false,
    captured: false,
    legendary: null,
    dex: { captured: 0, total: 0 },
    opensAt: null,
    opensAtLabel: '',
    abreEm: null,
    abreEmLabel: '',
    fechaEm: null,
    open: true,
    cooldownUntil: null,
    attempts: 0,
  })

  // ── O relógio do SERVIDOR ──────────────────────────────────────────────────
  // Os prazos da raid (abertura e cooldown) chegam como timestamps do relógio
  // do SERVIDOR, e é por ele que a tela conta — nunca pelo `Date.now()` do
  // aparelho.
  //
  // O público do evento é aluno de computação com o DevTools aberto: adiantar a
  // hora do celular para ver se o lendário abre mais cedo é a primeira coisa
  // que alguém tenta. Quem decide sempre foi o servidor (`canStart` compara com
  // o relógio dele), então o relógio mexido não captura nada — mas sem isto o
  // card mostraria "CAPTURAR" às 18h e o clique voltaria uma recusa, que é a
  // pior combinação possível: parece bug, não regra. Vale igual para o relógio
  // honestamente errado, que num celular de campus é mais comum que o sabotado.
  //
  // A âncora vem do `now` de `/raid/status`; o tempo passa por
  // `performance.now()`, que é MONOTÔNICO — mexer na hora do aparelho no meio
  // da contagem não a move um segundo.
  let ancora = null

  function ancorarRelogio(data) {
    if (typeof data?.now === 'number') {
      ancora = { servidor: data.now, desde: performance.now() }
    }
  }

  /** Agora, no relógio do servidor. Sem resposta ainda, o do aparelho. */
  function agoraDoServidor() {
    if (!ancora) return Date.now()
    return ancora.servidor + (performance.now() - ancora.desde)
  }

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

  async function fetch({ silent = false } = {}) {
    if (!silent) loading.value = true
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
      if (raidStatus) {
        raid.value = raidStatus.data
        ancorarRelogio(raidStatus.data)
      }
    } finally {
      if (!silent) loading.value = false
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
    ancorarRelogio(data)
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
    agoraDoServidor,
    loading,
    dexScroll,
    fetch,
    ensureLoaded,
    findByKey,
    captureByToken,
  }
})
