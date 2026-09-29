import { onBeforeUnmount, ref, toValue, watch } from 'vue'

// Número que "conta" até o valor, em quadros — como o placar de um jogo de
// portátil, que sobe em saltos e não desliza.
//
// Quem pediu menos movimento vê o valor final direto. Sem `matchMedia` (testes,
// SSR) também: o número certo na tela vale mais que a animação.
export function useContagem(alvo, { duracao = 400, quadros = 10 } = {}) {
  const valor = ref(0)
  let timer = null

  const parar = () => {
    if (timer) clearInterval(timer)
    timer = null
  }

  const semMovimento = () =>
    typeof window === 'undefined' ||
    !window.matchMedia ||
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

  watch(
    () => toValue(alvo),
    (final) => {
      parar()
      const destino = Number(final) || 0
      if (semMovimento() || destino === valor.value) {
        valor.value = destino
        return
      }
      const inicio = valor.value
      let quadro = 0
      timer = setInterval(() => {
        quadro++
        valor.value =
          quadro >= quadros ? destino : Math.round(inicio + ((destino - inicio) * quadro) / quadros)
        if (quadro >= quadros) parar()
      }, duracao / quadros)
    },
    { immediate: true },
  )

  onBeforeUnmount(parar)
  return valor
}
