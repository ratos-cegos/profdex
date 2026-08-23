import { onBeforeUnmount, ref } from 'vue'

const QUERY = '(prefers-reduced-motion: reduce)'

/**
 * Diz se o usuário pediu menos movimento — e continua dizendo se ele mudar a
 * preferência com a página aberta (dá para trocar isso no sistema sem recarregar).
 *
 * Usado para decidir se o GSAP chega a ser baixado: com movimento reduzido, as
 * seções animadas mostram o estado final estático e o `import()` nunca acontece.
 */
export function useMotionPreference() {
  const prefersReducedMotion = ref(false)

  if (typeof window === 'undefined' || !window.matchMedia) {
    return { prefersReducedMotion }
  }

  const mql = window.matchMedia(QUERY)
  prefersReducedMotion.value = mql.matches

  const onChange = (event) => {
    prefersReducedMotion.value = event.matches
  }
  mql.addEventListener('change', onChange)
  onBeforeUnmount(() => mql.removeEventListener('change', onChange))

  return { prefersReducedMotion }
}

/** Versão sem ciclo de vida do Vue, para usar fora de componentes. */
export function prefersReducedMotionNow() {
  return typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia(QUERY).matches
    : false
}
