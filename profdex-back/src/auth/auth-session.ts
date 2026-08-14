import { CookieOptions, Request } from 'express';

export const SESSION_COOKIE_NAME = 'profdex_session';
export const SESSION_MAX_AGE_MS = 15 * 60 * 1000;

export function getSessionCookieOptions(isProduction: boolean): CookieOptions {
  return {
    httpOnly: true,
    maxAge: SESSION_MAX_AGE_MS,
    path: '/api',
    // Produção é cross-site (front na Vercel, back na AWS): sem SameSite=None
    // o navegador não manda o cookie no handshake do WebSocket (nem em outras
    // requisições cross-site), e o gateway derruba a conexão como não
    // autenticada. Em dev front e back são same-site (mesmo host via proxy do
    // Vite), então Lax mantém a proteção de CSRF sem precisar de HTTPS local.
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
