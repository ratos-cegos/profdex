/**
 * Portão do cadastro por matrícula/senha.
 *
 * Em produção a única porta de entrada é o login com Google, que é onde o
 * vínculo institucional é comprovado (ver docs/AUTENTICACAO.md). Só que o fluxo
 * OAuth não roda fora de `localhost`: o Google recusa URIs de redirecionamento
 * com IP cru e exige HTTPS fora do loopback, então testar em outro aparelho da
 * rede exigiria um túnel. Para desenvolvimento, `POST /auth/register` volta a
 * existir e cria a conta direto.
 *
 * A comparação é por igualdade com `"development"`, nunca "diferente de
 * production": com `nest start` o `NODE_ENV` vem **indefinido**, e um portão
 * escrito ao contrário abriria o cadastro em qualquer ambiente que esquecesse
 * de declarar a variável. Falha fechado de propósito — se o cadastro não
 * aparecer localmente, é porque falta `NODE_ENV=development` no `.env`.
 */
export const DEV_SIGNUP_ENV = 'development';

export function isDevSignupEnabled(env: NodeJS.ProcessEnv): boolean {
  return env.NODE_ENV === DEV_SIGNUP_ENV;
}
