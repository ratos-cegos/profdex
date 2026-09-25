/**
 * Regra de equilíbrio entre as alternativas de uma questão.
 *
 * Os dois bancos nasceram com o vício clássico de prova de múltipla escolha:
 * a alternativa certa era a mais bem escrita e, por isso, a mais longa. Em
 * 51% das questões oficiais a correta era a única mais longa (o acaso é 25%),
 * e em 41% delas passava de TODAS as erradas por 6 caracteres ou mais. O aluno
 * na bancada gabaritava o tema batendo o olho no tamanho, sem ler o enunciado
 * — o oposto do que o quiz precisa medir antes de liberar um QR de captura.
 *
 * O conserto não é encurtar a resposta certa: é escrever distrator do mesmo
 * peso, que represente um erro plausível. Por isso a regra vale POR QUESTÃO —
 * a média do banco esconde a questão isolada que entrega a resposta.
 */

/**
 * Quanto a correta pode passar da errada mais longa, em caracteres.
 *
 * Não é zero de propósito: exigir empate exato transformaria a redação das
 * alternativas num quebra-cabeça e tentaria o autor a mutilar a resposta certa.
 * Oito caracteres é menos de uma palavra curta — não dá para medir no olho,
 * lendo quatro alternativas em 60 segundos.
 */
export const MARGEM_RESPOSTA_MAIS_LONGA = 8;

/** Diferença a partir da qual uma alternativa salta aos olhos na tela. */
export const DIFERENCA_VISIVEL = 6;

/** Teto da fatia do banco em que a correta é visivelmente a mais longa. */
export const TETO_VISIVELMENTE_LONGA = 0.15;

/**
 * Teto da razão entre o tamanho médio da correta e o dos distratores.
 *
 * Pega o que a regra por questão deixa passar: um banco inteiro escrito com a
 * resposta sistematicamente mais detalhada, cada questão dentro da margem, mas
 * o conjunto ainda entregando o padrão.
 */
export const TETO_RAZAO_MEDIA = 1.15;

export interface QuestaoComAlternativas {
  options: string[];
  answer: number;
}

/**
 * Caracteres que a correta tem além da errada mais longa.
 *
 * Negativo quer dizer que existe distrator maior que a resposta — o que é
 * ótimo, e acontece na maior parte do banco.
 */
export function excessoDaResposta(q: QuestaoComAlternativas): number {
  const erradas = q.options
    .filter((_, i) => i !== q.answer)
    .map((o) => o.length);
  return q.options[q.answer].length - Math.max(...erradas);
}

/** Fatia do banco em que a correta é visivelmente a mais longa. */
export function fatiaVisivelmenteLonga(
  banco: readonly QuestaoComAlternativas[],
): number {
  const marcadas = banco.filter(
    (q) => excessoDaResposta(q) >= DIFERENCA_VISIVEL,
  ).length;
  return banco.length === 0 ? 0 : marcadas / banco.length;
}

/** Razão entre o tamanho médio da correta e o tamanho médio dos distratores. */
export function razaoMediaDeTamanho(
  banco: readonly QuestaoComAlternativas[],
): number {
  let somaCorretas = 0;
  let somaErradas = 0;
  let quantasErradas = 0;

  for (const q of banco) {
    somaCorretas += q.options[q.answer].length;
    q.options.forEach((o, i) => {
      if (i === q.answer) return;
      somaErradas += o.length;
      quantasErradas++;
    });
  }

  if (banco.length === 0 || quantasErradas === 0) return 1;
  return somaCorretas / banco.length / (somaErradas / quantasErradas);
}
