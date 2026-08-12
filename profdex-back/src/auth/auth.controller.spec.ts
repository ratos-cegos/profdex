import { ConfigService } from '@nestjs/config';
import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthRateLimitService } from './auth-rate-limit.service';
import { SESSION_COOKIE_NAME } from './auth-session';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { GoogleAuthService } from './google-auth.service';
import { PasswordResetService } from './password-reset.service';

// Colaboradores que estes testes não exercitam — só precisam existir para o
// construtor. Os fluxos do Google e de redefinição têm cobertura própria.
const googleStub = () =>
  ({
    resolve: jest.fn(),
    completeSignup: jest.fn(),
  }) as unknown as GoogleAuthService;
const passwordResetStub = () =>
  ({ request: jest.fn(), reset: jest.fn() }) as unknown as PasswordResetService;
const configStub = () =>
  ({
    get: jest.fn().mockReturnValue('http://localhost:5173'),
  }) as unknown as ConfigService;

describe('AuthController', () => {
  const user = { id: 'user-1', matricula: '123', name: 'Player' };

  function createSubject() {
    const auth = {
      login: jest.fn(),
      registerForDevelopment: jest.fn(),
    };
    const rateLimit = {
      assertAllowed: jest.fn(),
      recordFailure: jest.fn(),
      reset: jest.fn(),
    };
    const controller = new AuthController(
      auth as unknown as AuthService,
      rateLimit as unknown as AuthRateLimitService,
      googleStub(),
      passwordResetStub(),
      configStub(),
    );
    const response = {
      cookie: jest.fn(),
      clearCookie: jest.fn(),
    };
    const request = { ip: '127.0.0.1', user } as unknown as Request & {
      user: typeof user;
    };
    return { auth, controller, rateLimit, request, response };
  }

  it('sets an HttpOnly cookie and never returns the JWT in the body', async () => {
    const { auth, controller, rateLimit, request, response } = createSubject();
    auth.login.mockResolvedValue({ accessToken: 'signed.jwt', user });

    const result = await controller.login(
      { matricula: '123', password: 'valid password' },
      request,
      response as unknown as Response,
    );

    expect(response.cookie).toHaveBeenCalledWith(
      SESSION_COOKIE_NAME,
      'signed.jwt',
      expect.objectContaining({ httpOnly: true, sameSite: 'lax' }),
    );
    expect(rateLimit.reset).toHaveBeenCalledWith('127.0.0.1:123');
    expect(result).toEqual({ user });
    expect(JSON.stringify(result)).not.toContain('signed.jwt');
  });

  it('counts authentication failures and preserves the original error', async () => {
    const { auth, controller, rateLimit, request, response } = createSubject();
    auth.login.mockRejectedValue(new UnauthorizedException('invalid'));

    await expect(
      controller.login(
        { matricula: ' 123 ', password: 'invalid password' },
        request,
        response as unknown as Response,
      ),
    ).rejects.toThrow(UnauthorizedException);
    expect(rateLimit.recordFailure).toHaveBeenCalledWith('127.0.0.1:123');
  });

  it('checks the rate limit before touching the credentials', async () => {
    const { auth, controller, rateLimit, request, response } = createSubject();
    auth.login.mockResolvedValue({ accessToken: 'signed.jwt', user });

    await controller.login(
      { matricula: '123', password: 'valid password' },
      request,
      response as unknown as Response,
    );

    expect(rateLimit.assertAllowed).toHaveBeenCalledWith('127.0.0.1:123');
  });

  // Fora de desenvolvimento o cadastro é exclusivamente pelo Google: a rota de
  // registro criaria conta sem e-mail institucional verificado.
  describe('POST /auth/register', () => {
    const nodeEnv = process.env.NODE_ENV;

    afterEach(() => {
      process.env.NODE_ENV = nodeEnv;
    });

    // 404 e não 403: a rota não deve nem admitir que existe. E NODE_ENV
    // indefinido — o padrão de `nest start` — precisa cair aqui também.
    it.each([undefined, 'production', 'test'])(
      'responds 404 with NODE_ENV=%s',
      (env) => {
        const { auth, controller, rateLimit, request, response } =
          createSubject();
        if (env === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = env;

        expect(() =>
          controller.register(
            { matricula: '123', name: 'Player', password: 'valid password' },
            request,
            response as unknown as Response,
          ),
        ).toThrow(NotFoundException);
        expect(auth.registerForDevelopment).not.toHaveBeenCalled();
        expect(rateLimit.assertAllowed).not.toHaveBeenCalled();
      },
    );

    it('applies the same rate limit as login in development', async () => {
      const { auth, controller, rateLimit, request, response } =
        createSubject();
      process.env.NODE_ENV = 'development';
      auth.registerForDevelopment.mockResolvedValue({
        accessToken: 'signed.jwt',
        user,
      });

      const result = await controller.register(
        { matricula: '123', name: 'Player', password: 'valid password' },
        request,
        response as unknown as Response,
      );

      expect(rateLimit.assertAllowed).toHaveBeenCalledWith('127.0.0.1:123');
      expect(response.cookie).toHaveBeenCalled();
      expect(JSON.stringify(result)).not.toContain('signed.jwt');
    });
  });

  it('returns the authenticated principal and clears logout cookies', () => {
    const { controller, request, response } = createSubject();

    expect(controller.me(request)).toEqual({ user });
    controller.logout(response as unknown as Response);

    expect(response.clearCookie).toHaveBeenCalledWith(
      SESSION_COOKIE_NAME,
      expect.objectContaining({ path: '/api' }),
    );
  });
});
