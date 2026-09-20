/**
 * O slug de um professor — derivado do NOME, sempre pelo servidor.
 *
 * Não é só estética de URL: o slug nomeia os arquivos de arte gravados no
 * volume de uploads (`<slug>-frente.png`). Se ele viesse do cliente, um nome
 * com `../` escreveria fora do volume. A normalização abaixo é a barreira: o
 * resultado só contém `[a-z0-9-]`, então não existe separador de caminho para
 * escapar (ver .codex/SECURITY_CHECKLIST.md, A05).
 *
 * Imutável depois de criado: editar o nome NÃO mexe no slug. Renomear em
 * cascata significaria mover arquivos, reescrever URLs gravadas em `professors`
 * e invalidar o cache do PWA de todo mundo — risco sem retorno.
 */
export function slugFromName(text: string | null | undefined): string {
  return (text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // tira os acentos separados pelo NFD
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
