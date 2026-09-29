/**
 * Regra de matrícula exibida ao aluno.
 *
 * Espelha `profdex-back/src/users/matricula.ts`. Quem recusa de verdade é o
 * servidor — isto aqui só antecipa a mensagem e mostra ao aluno, antes de
 * enviar, o valor que vai ficar gravado.
 *
 * A regra existe por causa da bancada do quiz: ela digita a matrícula num
 * numpad de 0 a 9 e procura por igualdade exata. Um cadastro com e-mail (o
 * autofill do celular oferece o do Google neste campo), ponto, traço ou espaço
 * invisível virava uma conta que o quiosque nunca encontra.
 */

/** O mesmo teto do numpad da bancada — ela importa daqui. */
export const MATRICULA_MAX_DIGITOS = 20

export const MATRICULA_VAZIA_MSG = 'Informe a matrícula.'
export const MATRICULA_SO_DIGITOS_MSG =
  'Digite só os números da matrícula, sem e-mail, letras ou espaços.'
export const MATRICULA_LONGA_MSG = `A matrícula tem no máximo ${MATRICULA_MAX_DIGITOS} dígitos.`

/**
 * Tira espaço (inclusive o invisível), ponto, traço, vírgula e barra, e
 * converte dígito de largura total. Letras e `@` ficam: é `validarMatricula`
 * quem diz que um e-mail não serve.
 */
export function normalizarMatricula(valor) {
  if (typeof valor !== 'string') return ''
  return valor.normalize('NFKC').replace(/[\s\p{Cf}\p{Pd}−.,/]/gu, '')
}

/**
 * Mensagem de erro para o valor JÁ normalizado, ou `''` quando ele serve.
 * A ordem é a de quem conserta: primeiro o vazio, depois o que não é número,
 * por último o tamanho.
 */
export function validarMatricula(normalizada) {
  if (!normalizada) return MATRICULA_VAZIA_MSG
  if (!/^[0-9]+$/.test(normalizada)) return MATRICULA_SO_DIGITOS_MSG
  if (normalizada.length > MATRICULA_MAX_DIGITOS) return MATRICULA_LONGA_MSG
  return ''
}

/**
 * A mensagem de um erro do axios, pronta para a tela. O ValidationPipe do Nest
 * devolve `message` como LISTA quando o DTO recusa — sem isto, a tela mostrava
 * `["Digite só os números…"]`, com colchete e aspas.
 */
export function mensagemDaApi(erro, padrao) {
  const message = erro?.response?.data?.message
  if (Array.isArray(message)) return message[0] ?? padrao
  return typeof message === 'string' && message ? message : padrao
}
