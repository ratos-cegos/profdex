/**
 * Regra de senha exibida ao aluno.
 *
 * Espelha `MIN_PASSWORD_LENGTH` de
 * `profdex-back/src/auth/password.constants.ts`. Quem recusa de verdade é o
 * servidor — isto aqui só antecipa a mensagem para o aluno não descobrir o
 * limite depois de enviar o formulário. Se os dois divergirem, o sintoma é uma
 * senha que a tela aceita e a API rejeita com um erro genérico.
 *
 * As três telas que pedem senha (cadastro, redefinição e conclusão do cadastro
 * por Google) leem daqui em vez de repetir o número e o texto.
 */
export const MIN_PASSWORD_LENGTH = 8

/** Mensagem de erro e placeholder, para as três telas dizerem a mesma coisa. */
export const SENHA_CURTA_MSG = `A senha precisa ter ao menos ${MIN_PASSWORD_LENGTH} caracteres.`
export const SENHA_PLACEHOLDER = `MÍNIMO ${MIN_PASSWORD_LENGTH} CARACTERES`

/** `true` quando a senha atende ao tamanho mínimo. */
export function senhaTemTamanhoMinimo(senha) {
  return typeof senha === 'string' && senha.length >= MIN_PASSWORD_LENGTH
}
