/**
 * A janela do PWA pode ser maior que a área visível entre as barras do celular.
 * Usa a menor altura informada pelo navegador, sem redimensionar o layout
 * durante o zoom por gesto (que deve continuar livre para ampliar o conteúdo).
 */
export function acompanharAlturaVisivel() {
  const viewport = window.visualViewport
  let frame = 0

  function medir() {
    frame = 0
    if (viewport && Math.abs(viewport.scale - 1) > 0.01) return

    const altura = Math.min(window.innerHeight, viewport?.height ?? window.innerHeight)
    if (altura > 0) {
      document.documentElement.style.setProperty('--app-viewport-height', `${altura}px`)
    }
  }

  function agendar() {
    if (!frame) frame = window.requestAnimationFrame(medir)
  }

  medir()
  window.addEventListener('resize', agendar)
  window.addEventListener('pageshow', agendar)
  viewport?.addEventListener('resize', agendar)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') agendar()
  })
}
