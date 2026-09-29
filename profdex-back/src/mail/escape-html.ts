/**
 * Escapa texto para interpolação segura em HTML de e-mail.
 *
 * Mora no módulo de e-mail, e não dentro de um dos serviços que o usam, porque
 * são DOIS os corpos de e-mail que interpolam dado do usuário (o nome, na
 * redefinição de senha e no aviso do primeiro vencedor da raid) e a diferença
 * entre um lugar e dois é a diferença entre corrigir aqui e descobrir, meses
 * depois, que só metade foi corrigida.
 *
 * O nome do aluno vem do Google ou do cadastro de desenvolvimento e é texto que
 * ele controla. Nenhum cliente de e-mail executa script, mas um `<` solto já
 * basta para o corpo chegar quebrado — e quebrado é exatamente o e-mail que
 * ninguém consegue ler no meio do evento.
 *
 * Escapa a apóstrofe também: os corpos atuais só interpolam em nó de texto, mas
 * um valor de atributo entre aspas simples é a mudança de uma linha, e a função
 * não pode depender de quem a chama lembrar disso.
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
