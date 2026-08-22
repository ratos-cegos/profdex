import { onBeforeUnmount, onMounted, ref } from 'vue'

/**
 * Dois observadores pequenos a serviço da barra fixa do topo.
 *
 * Por que IntersectionObserver e não `scroll`: um listener de rolagem roda a
 * cada frame — no celular de quem está andando pelo evento, isso é trabalho de
 * main thread contínuo para responder uma pergunta que muda DUAS vezes na
 * página inteira. O observador só acorda na travessia. Mesmo espírito do
 * useReveal.js, e o mesmo modo de falha: se nada rodar, o estado padrão é o
 * estado seguro, nunca a tela quebrada.
 *
 * Os dois entram pelo ID do alvo, e não por ref de template, porque o ID É o
 * contrato: `#topo` e `#creditos` já são endereços públicos desta página
 * (o logo e os links de Créditos apontam para eles). Um `ref` passado entre
 * componentes seria um segundo acordo dizendo a mesma coisa.
 */

/** Altura real da barra, lida do token — ver --nav-h em styles/tokens.css. */
function navHeight() {
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--nav-h')
  const px = Number.parseInt(raw, 10)
  return Number.isFinite(px) ? px : 60
}

/** Observa um elemento por ID. Devolve o `disconnect`, ou null se não deu. */
function observeById(id, options, onEntry) {
  if (typeof IntersectionObserver === 'undefined') return null

  const target = document.getElementById(id)
  if (!target) return null

  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) onEntry(entry)
  }, options)

  observer.observe(target)
  return () => observer.disconnect()
}

/**
 * `true` enquanto a barra estiver sobre o hero laranja; `false` quando o fundo
 * atrás dela virar o escuro do resto da página.
 *
 * O truque é o `rootMargin` negativo no topo: ele encolhe a área de observação
 * em exatamente a altura da barra, então "o hero cruzou a linha de baixo da
 * barra" e "o hero deixou de intersectar" viram a MESMA coisa. Sem isso a troca
 * aconteceria com o hero ainda aparecendo por baixo da barra.
 *
 * A travessia é única e monotônica: o hero é o primeiro elemento da página,
 * então nunca reentra por baixo. Uma ida e uma volta, dois callbacks.
 *
 * Padrão `true` de propósito: no topo da página é onde o visitante começa, e é
 * o estado correto se o JS não rodar. Se ele não rodar, a barra fica no
 * tratamento claro — que sobre o escuro continua legível (branco em --bg-deep é
 * 17:1); o inverso não seria verdade.
 */
export function useOverHero({ heroId = 'topo' } = {}) {
  const overHero = ref(true)
  let stop = null

  onMounted(() => {
    stop = observeById(
      heroId,
      { rootMargin: `-${navHeight()}px 0px 0px 0px`, threshold: 0 },
      (entry) => {
        overHero.value = entry.isIntersecting
      },
    )
  })

  onBeforeUnmount(() => {
    stop?.()
    stop = null
  })

  return { overHero }
}

/**
 * `true` enquanto a seção de ID `id` estiver em cena — usado só para o
 * `aria-current` do link de Créditos.
 *
 * O limiar não é uma fração da seção (ela é mais alta que a tela em celular, e
 * `threshold: 0.5` nunca dispararia): é a interseção simples, encolhida em cima
 * pela barra e embaixo por 40% da tela, para o link não acender quando a seção
 * mal apareceu no rodapé da viewport.
 */
export function useSectionActive(id) {
  const active = ref(false)
  let stop = null

  onMounted(() => {
    stop = observeById(
      id,
      { rootMargin: `-${navHeight()}px 0px -40% 0px`, threshold: 0 },
      (entry) => {
        active.value = entry.isIntersecting
      },
    )
  })

  onBeforeUnmount(() => {
    stop?.()
    stop = null
  })

  return { active }
}
