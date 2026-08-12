/**
 * Quem pode entrar pelo Google, e com que papel.
 *
 * ⚠️ Esta é a fronteira de segurança do login social. O parâmetro `hd` que se
 * manda ao Google é APENAS uma dica de interface — ele pré-filtra a tela de
 * escolha de conta e nada mais; um cliente pode omiti-lo. A decisão real é
 * tomada aqui, no servidor, sobre o e-mail que o Google devolveu.
 *
 * Por isso a checagem exige DUAS coisas:
 *   1. o Google ter confirmado o e-mail (`email_verified`);
 *   2. o domínio ser exatamente um dos institucionais.
 *
 * A comparação é por sufixo com ponto (`@edu.unifil.br`), nunca por `includes`:
 * `unifil.br.invasor.com` contém "unifil.br" e precisa ser recusado.
 */

export type Role = 'aluno' | 'admin';

/** Alunos. */
export const STUDENT_DOMAIN = 'edu.unifil.br';

/** Servidores/organizadores — viram administradores do painel de métricas. */
export const ADMIN_DOMAIN = 'unifil.br';

export interface InstitutionalIdentity {
  email: string;
  domain: string;
  role: Role;
}

/**
 * Valida e classifica um e-mail vindo do Google.
 * Retorna null se não for institucional — o chamador recusa o login.
 */
export function classifyInstitutionalEmail(
  rawEmail: string | undefined | null,
  emailVerified: boolean,
): InstitutionalIdentity | null {
  if (!emailVerified) return null;

  const email = (rawEmail ?? '').trim().toLowerCase();
  // Um e-mail válido tem exatamente uma arroba; `lastIndexOf` com checagem de
  // unicidade evita aceitar coisas como "a@b@edu.unifil.br".
  const at = email.indexOf('@');
  if (at <= 0 || at !== email.lastIndexOf('@')) return null;

  const domain = email.slice(at + 1);
  if (!domain) return null;

  // Ordem importa: `edu.unifil.br` também termina em `unifil.br`, então o mais
  // específico é testado primeiro — senão todo aluno viraria administrador.
  if (domain === STUDENT_DOMAIN) {
    return { email, domain, role: 'aluno' };
  }
  if (domain === ADMIN_DOMAIN) {
    return { email, domain, role: 'admin' };
  }
  return null;
}

/** Mensagem única para qualquer recusa — não revela qual regra falhou. */
export const NOT_INSTITUTIONAL_MESSAGE = `Use seu e-mail institucional (@${STUDENT_DOMAIN} ou @${ADMIN_DOMAIN}).`;
