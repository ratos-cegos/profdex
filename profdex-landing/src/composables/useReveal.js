import { onBeforeUnmount, onMounted, ref } from 'vue'

/**
 * Revela um elemento quando ele entra no viewport.
 *
 * Por que não uma biblioteca: são 30 linhas de IntersectionObserver, e a
 * alternativa mais leve do mercado ainda custa mais que isto em bytes na rede
 * móvel do evento.
 *
 * Contrato importante: o estado inicial invisível é aplicado pelo próprio JS
 * (`data-reveal="pending"`), nunca pelo CSS sozinho. Se este código falhar ou
 * nem rodar, o atributo não aparece, o seletor não casa e o conteúdo fica
 * visível — o modo de falha certo para uma landing.
 *
 * @param {{ threshold?: number, rootMargin?: string, once?: boolean }} options
 * @returns {{ el: import('vue').Ref<HTMLElement|null> }}
 */
export function useReveal({ threshold = 0.15, rootMargin = '0px 0px -10% 0px', once = true } = {}) {
  const el = ref(null)
  let observer = null

  onMounted(() => {
    const node = el.value
    if (!node) return

    // Sem IntersectionObserver (navegador antigo), mostra tudo e vai embora.
    if (typeof IntersectionObserver === 'undefined') {
      node.dataset.reveal = 'shown'
      return
    }

    node.dataset.reveal = 'pending'

    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          entry.target.dataset.reveal = 'shown'
          if (once) observer?.unobserve(entry.target)
        }
      },
      { threshold, rootMargin },
    )

    observer.observe(node)
  })

  onBeforeUnmount(() => {
    observer?.disconnect()
    observer = null
  })

  return { el }
}
