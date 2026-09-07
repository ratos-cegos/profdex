import { CookieOptions, Request } from 'express';

export const SESSION_COOKIE_NAME = 'profdex_session';

/**
 * Duração da sessão: um dia de evento.
 *
 * Eram 15 minutos, e isso não sobrevive ao uso real: uma batalha 3v3 com dois
 * celulares passa disso com folga, e quem dava F5 no meio perdia o reconnect —
 * a sala continuava viva no servidor, mas o jogador voltava para o login e a
 * partida morria por abandono. O mesmo valia para o aluno que guardava o
 * celular no bolso entre um estande e outro.
 *
 * O custo é declarado: um cookie roubado vale o dia todo em vez de 15 minutos.
 * Aceito para um evento de campus, onde o cookie é HttpOnly, `secure` em
 * produção, e a conta não dá acesso a nada além da própria coleção.
 *
 * Precisa continuar igual ao `expiresIn` do JwtModule (ver auth.module.ts):
 * cookie vivo com JWT expirado é o mesmo logout, só que confuso de diagnosticar.
 */
export const SESSION_MAX_AGE_MS = 8 * 60 * 60 * 1000;
export const SESSION_MAX_AGE = '8h';

export function getSessionCookieOptions(isProduction: boolean): CookieOptions {
  return {
    httpOnly: true,
    maxAge: SESSION_MAX_AGE_MS,
    path: '/api',
    // Front e back estão sob o mesmo domínio (nginx único faz proxy de / e
    // /api para containers internos, ver ../../../nginx/), então SameSite=None
    // não é mais necessário — mas mantido por já funcionar de forma idêntica
    // em same-origin (exige apenas `secure: true`, o que produção já usa).
    // Em dev front e back são same-site (mesmo host via proxy do Vite), então
    // Lax mantém a proteção de CSRF sem precisar de HTTPS local.
    sameSite: isProduction ? 'none' : 'lax',
    secure: isProduction,
  };
}

export function extractSessionToken(request: Request): string | null {
  return extractSessionTokenFromCookieHeader(request.headers.cookie);
}

// Versão que recebe o header cru — usada também no handshake do WebSocket,
// onde não existe um Request do Express (só `handshake.headers`).
export function extractSessionTokenFromCookieHeader(
  cookieHeader: string | undefined,
): string | null {
  if (!cookieHeader) return null;

  for (const cookie of cookieHeader.split(';')) {
    const separator = cookie.indexOf('=');
    if (separator < 0) continue;
    const name = cookie.slice(0, separator).trim();
    if (name !== SESSION_COOKIE_NAME) continue;
    const value = cookie.slice(separator + 1).trim();
    return value ? decodeURIComponent(value) : null;
  }

  return null;
}
