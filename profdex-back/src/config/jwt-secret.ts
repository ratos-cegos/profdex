/**
 * O segredo que assina a sessão — validado no boot, antes de o app subir.
 *
 * `JWT_SECRET` já era obrigatório (`getOrThrow` em auth.module.ts, jwt.strategy.ts
 * e google-auth.service.ts), então o app nunca sobe SEM ele. O que faltava era o
 * caso pior: subir COM o valor de exemplo, que está no `.env.example` e portanto
 * é público no repositório.
 *
 * ## Por que isso é grave neste app
 *
 * Quem conhece o segredo não "descobre" sessões — ele as FABRICA:
 *
 * 1. `jwt.sign({ sub, matricula, name, role }, JWT_SECRET)` vira um cookie
 *    `profdex_session` válido para qualquer aluno, inclusive no handshake do
 *    WebSocket de batalha.
 * 2. Pior: o ticket de cadastro do Google é assinado com
 *    `HMAC-SHA256(JWT_SECRET, 'google-onboarding-v1')` — derivação que também
 *    está no repositório. Com ela dá para forjar um ticket com um e-mail
 *    `@unifil.br` e `role: 'admin'` e entregá-lo em `POST /auth/google/complete`,
 *    que é uma rota SEM guard (ela se autentica pelo próprio ticket) e existe
 *    mesmo sem o Google configurado. O resultado é uma conta `admin` DE VERDADE
 *    gravada no banco — e aí o `AdminGuard`, que confere o papel no banco
 *    justamente para não confiar no claim, passa a liberar o painel inteiro:
 *    errata, tiragem de fichas (criar direito de captura) e as matrículas de
 *    todo mundo em /admin/metrics.
 *
 * Ou seja: segredo conhecido não é "sessão mais fraca", é administrador remoto
 * sem autenticação. Por isso a validação derruba o boot em produção em vez de
 * avisar — um app fora do ar é um incidente que alguém conserta em minutos; um
 * app no ar com este segredo é um incidente que ninguém percebe.
 */

/**
 * Valores que não podem assinar nada.
 *
 * O primeiro é o literal do `.env.example`; os outros são o que costuma entrar
 * quando alguém preenche o `.env` com pressa. A comparação é em minúsculas e
 * sem espaços nas pontas — `Change-Me ` é o mesmo descuido que `change-me`.
 */
const PLACEHOLDERS = new Set([
  'troque-por-uma-chave-secreta-longa-e-aleatoria',
  'troque-por-uma-chave-secreta',
  'change-me',
  'changeme',
  'chave-secreta',
  'secret',
  'segredo',
  'jwt-secret',
  'test',
  'dev',
]);

/**
 * 32 caracteres.
 *
 * O `openssl rand -base64 32` que o deploy.md manda gerar dá 44, então o piso
 * não incomoda quem seguiu a instrução — ele só pega quem digitou uma frase
 * curta na mão.
 */
const MIN_LENGTH = 32;

/** Mensagem única, com a receita junto: quem lê o erro já sabe o que fazer. */
function recado(problema: string): string {
  return (
    `JWT_SECRET ${problema}. ` +
    'Gere um novo com `openssl rand -base64 32`, grave no .env e reinicie o app. ' +
    'Trocar o segredo desloga todas as sessões abertas — o que é justamente o ' +
    'que invalida qualquer sessão forjada com o valor antigo.'
  );
}

/**
 * Derruba o boot quando o segredo não serve. Em desenvolvimento só avisa: um
 * `.env` local com o valor de exemplo é comum e não expõe ninguém, e travar o
 * boot ali só ensinaria a contornar a checagem.
 */
export function assertUsableJwtSecret(env: NodeJS.ProcessEnv): void {
  const secret = (env.JWT_SECRET ?? '').trim();
  const producao = env.NODE_ENV === 'production';

  let problema: string | null = null;
  if (!secret) {
    problema = 'não está configurado';
  } else if (PLACEHOLDERS.has(secret.toLowerCase())) {
    problema = 'ainda é o valor de exemplo, que é público no repositório';
  } else if (secret.length < MIN_LENGTH) {
    problema = `tem ${secret.length} caracteres — o mínimo é ${MIN_LENGTH}`;
  }

  if (!problema) return;

  if (producao) throw new Error(recado(problema));

  // Alto de propósito, como o aviso do dev-signup em main.ts.
  console.warn(`[dev] ⚠️  ${recado(problema)}`);
}
