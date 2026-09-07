import { Request } from 'express';
import {
  extractSessionToken,
  getSessionCookieOptions,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE,
  SESSION_MAX_AGE_MS,
} from './auth-session';

describe('auth session', () => {
  // As duas metades da sessão têm de expirar juntas. Se o cookie durar mais
  // que o JWT, o app parece logado e toda chamada volta 401; se durar menos, o
  // usuário é deslogado com um token ainda válido. Os dois casos aparecem como
  // "me deslogou do nada" e custam caro para diagnosticar.
  it('o cookie e o JWT expiram no mesmo instante', () => {
    const emMs = { h: 60 * 60 * 1000, m: 60 * 1000 };
    const casado = SESSION_MAX_AGE.match(/^(\d+)([hm])$/);
    expect(casado).not.toBeNull();
    const [, valor, unidade] = casado!;
    expect(Number(valor) * emMs[unidade as 'h' | 'm']).toBe(SESSION_MAX_AGE_MS);
  });

  // Uma batalha 3v3 entre dois celulares passa de 15 min com folga, e quem
  // dava F5 no meio voltava para o login com a sala ainda viva no servidor.
  it('a sessão dura o suficiente para uma partida longa', () => {
    expect(SESSION_MAX_AGE_MS).toBeGreaterThanOrEqual(60 * 60 * 1000);
    expect(getSessionCookieOptions(true).maxAge).toBe(SESSION_MAX_AGE_MS);
  });

  it('uses an HttpOnly, SameSite cookie and requires HTTPS in production', () => {
    // `sameSite` difere por ambiente de propósito (ver o comentário em
    // auth-session.ts): produção usa 'none', que exige `secure: true`; dev usa
    // 'lax' porque não há HTTPS local garantido.
    expect(getSessionCookieOptions(true)).toEqual(
      expect.objectContaining({
        httpOnly: true,
        sameSite: 'none',
        secure: true,
        path: '/api',
      }),
    );
    expect(getSessionCookieOptions(false)).toEqual(
      expect.objectContaining({
        httpOnly: true,
        sameSite: 'lax',
        secure: false,
        path: '/api',
      }),
    );
  });

  it('extracts only the named session cookie', () => {
    const request = {
      headers: {
        cookie: `other=value; ${SESSION_COOKIE_NAME}=signed.jwt.value`,
      },
    } as Request;

    expect(extractSessionToken(request)).toBe('signed.jwt.value');
  });

  it.each([undefined, 'other=value', `${SESSION_COOKIE_NAME}=`, 'malformed'])(
    'returns null when the session cookie is absent: %p',
    (cookie) => {
      expect(
        extractSessionToken({ headers: { cookie } } as Request),
      ).toBeNull();
    },
  );
});
