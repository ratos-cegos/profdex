import {
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from '@node-rs/bcrypt';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  const user = {
    id: 'user-1',
    matricula: '123',
    name: 'Player',
    password: '',
  };

  function createSubject() {
    const users = {
      findByMatricula: jest.fn(),
      createForDevelopment: jest.fn(),
    };
    const jwt = {
      sign: jest.fn().mockReturnValue('signed.jwt'),
    };
    return {
      jwt,
      service: new AuthService(
        users as unknown as UsersService,
        jwt as unknown as JwtService,
      ),
      users,
    };
  }

  // Fora de desenvolvimento toda conta nasce do login com Google; este serviço
  // só autentica.
  describe('registerForDevelopment', () => {
    const nodeEnv = process.env.NODE_ENV;

    afterEach(() => {
      process.env.NODE_ENV = nodeEnv;
    });

    it.each([undefined, 'production', 'test'])(
      'refuses to register with NODE_ENV=%s',
      async (env) => {
        const { service, users } = createSubject();
        if (env === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = env;

        await expect(
          service.registerForDevelopment({
            matricula: '123',
            name: 'Player',
            password: 'valid password',
          }),
        ).rejects.toThrow(ForbiddenException);
        // Nem chega a consultar: o portão vem antes de qualquer I/O.
        expect(users.findByMatricula).not.toHaveBeenCalled();
        expect(users.createForDevelopment).not.toHaveBeenCalled();
      },
    );

    it('signs a session for a unique matricula in development', async () => {
      const { jwt, service, users } = createSubject();
      process.env.NODE_ENV = 'development';
      users.findByMatricula.mockResolvedValue(null);
      users.createForDevelopment.mockResolvedValue({ ...user, role: 'aluno' });

      await expect(
        service.registerForDevelopment({
          matricula: user.matricula,
          name: user.name,
          password: 'valid password',
        }),
      ).resolves.toEqual({
        accessToken: 'signed.jwt',
        user: {
          id: user.id,
          matricula: user.matricula,
          name: user.name,
          role: 'aluno',
        },
      });
      expect(jwt.sign).toHaveBeenCalled();
    });

    it('rejects a duplicate matricula without creating anything', async () => {
      const { service, users } = createSubject();
      process.env.NODE_ENV = 'development';
      users.findByMatricula.mockResolvedValue(user);

      await expect(
        service.registerForDevelopment({
          matricula: user.matricula,
          name: user.name,
          password: 'valid password',
        }),
      ).rejects.toThrow(ConflictException);
      expect(users.createForDevelopment).not.toHaveBeenCalled();
    });
  });

  it('returns the same generic error for missing and invalid credentials', async () => {
    const { service, users } = createSubject();
    users.findByMatricula.mockResolvedValue(null);

    await expect(
      service.login({ matricula: 'missing', password: 'invalid password' }),
    ).rejects.toThrow('Credenciais inválidas');

    const passwordHash = await bcrypt.hash('valid password', 4);
    users.findByMatricula.mockResolvedValue({
      ...user,
      password: passwordHash,
    });
    await expect(
      service.login({ matricula: user.matricula, password: 'wrong password' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('signs a session for valid credentials', async () => {
    const { service, users } = createSubject();
    const passwordHash = await bcrypt.hash('valid password', 4);
    users.findByMatricula.mockResolvedValue({
      ...user,
      password: passwordHash,
    });

    await expect(
      service.login({
        matricula: user.matricula,
        password: 'valid password',
      }),
    ).resolves.toEqual({
      accessToken: 'signed.jwt',
      user: {
        id: user.id,
        matricula: user.matricula,
        name: user.name,
      },
    });
  });
});
