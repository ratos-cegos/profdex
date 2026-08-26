import { Request } from 'express';
import {
  extractSessionToken,
  getSessionCookieOptions,
  SESSION_COOKIE_NAME,
} from './auth-session';

describe('auth session', () => {
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
