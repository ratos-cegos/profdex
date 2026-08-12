import { ForbiddenException } from '@nestjs/common';
import * as bcrypt from '@node-rs/bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from './users.service';

describe('UsersService', () => {
  it('finds a user only by the unique matricula', async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
    };
    const service = new UsersService(prisma as unknown as PrismaService);

    await service.findByMatricula('123');

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { matricula: '123' },
    });
  });

  // Fora de desenvolvimento, contas nascem só pelo Google
  // (GoogleAuthService.completeSignup). O criador direto existe para testar
  // localmente e precisa ficar fechado em qualquer outro ambiente.
  describe('createForDevelopment', () => {
    const nodeEnv = process.env.NODE_ENV;

    function createSubject() {
      const prisma = {
        user: { create: jest.fn().mockResolvedValue({ id: 'user-1' }) },
      };
      return {
        prisma,
        service: new UsersService(prisma as unknown as PrismaService),
      };
    }

    afterEach(() => {
      process.env.NODE_ENV = nodeEnv;
    });

    // O caso que importa: NODE_ENV indefinido é o padrão de `nest start`, e um
    // portão escrito como "diferente de production" abriria o cadastro aqui.
    it.each([undefined, 'production', 'test', 'staging'])(
      'refuses to create with NODE_ENV=%s',
      async (env) => {
        const { prisma, service } = createSubject();
        if (env === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = env;

        await expect(
          service.createForDevelopment('123', 'Player', 'valid password'),
        ).rejects.toThrow(ForbiddenException);
        expect(prisma.user.create).not.toHaveBeenCalled();
      },
    );

    it('hashes the password before storing in development', async () => {
      const { prisma, service } = createSubject();
      process.env.NODE_ENV = 'development';

      await service.createForDevelopment('123', 'Player', 'valid password');

      const { data } = prisma.user.create.mock.calls[0][0] as {
        data: { matricula: string; name: string; password: string };
      };
      expect(data.matricula).toBe('123');
      expect(data.password).not.toBe('valid password');
      await expect(
        bcrypt.verify('valid password', data.password),
      ).resolves.toBe(true);
    });
  });
});
