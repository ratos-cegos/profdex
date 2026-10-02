// Quantas etiquetas de efeito cabem na faixa de UMA linha do painel de HP.
//
// A faixa tem largura fixa (a do painel, que no rival é no máximo 62% da tela)
// e altura fixa — é isso que segura o painel nos 62px que o palco reserva
// (`--palco-barra-altura`). Quando os efeitos passam do espaço, as que sobram
// viram um selo "+N" no fim da faixa; a lista inteira continua no LOG.
//
// Antes as etiquetas quebravam linha: com 3 efeitos num celular de 360px o
// painel ia a ~127px e cobria a cabeça do sprite do rival.
//
// Função pura, sem DOM: quem mede as larguras é o componente.

/**
 * @param {number[]} larguras Largura de cada etiqueta, na ordem de exibição.
 * @param {number} disponivel Largura da faixa.
 * @param {object} [opcoes]
 * @param {number} [opcoes.gap] Espaço entre etiquetas.
 * @param {number} [opcoes.larguraDoMais] Largura do selo "+N".
 * @returns {number} Quantas etiquetas mostrar (as demais vão para o "+N").
 */
export function quantasCabem(larguras, disponivel, { gap = 3, larguraDoMais = 0 } = {}) {
  const n = larguras.length
  if (!n || !(disponivel > 0)) return 0

  const ocupado = (k) => larguras.slice(0, k).reduce((soma, l) => soma + l, 0) + gap * Math.max(0, k - 1)

  // Todas cabem: nada de "+N".
  if (ocupado(n) <= disponivel) return n

  // Senão, o "+N" também precisa caber — ele é parte da linha.
  for (let k = n - 1; k >= 1; k--) {
    if (ocupado(k) + gap + larguraDoMais <= disponivel) return k
  }
  return 0
}
