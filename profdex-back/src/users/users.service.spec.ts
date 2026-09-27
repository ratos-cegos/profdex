import {
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
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

  /**
   * Correção da matrícula pelo próprio aluno (tarefa 17.2).
   *
   * É troca de CREDENCIAL DE LOGIN, e o que estas provas guardam é isso: sem a
   * senha atual nada muda, e a matrícula de outra conta não é tomável. O
   * `userId` nunca se move — é por ele que capturas, tentativas de quiz,
   * destravamentos e vouchers estão amarrados.
   */
  describe('changeMatricula', () => {
    const SENHA = 'senha do dono';

    async function createSubject(
      overrides: { outraContaComANova?: boolean } = {},
    ) {
      const dono = {
        id: 'aluno-1',
        matricula: '202312345',
        name: 'Ana',
        role: 'aluno',
        password: await bcrypt.hash(SENHA, 10),
      };
      const prisma = {
        user: {
          findUnique: jest.fn(
            ({ where }: { where: { id?: string; matricula?: string } }) => {
              if (where.id) return Promise.resolve(dono);
              return Promise.resolve(
                overrides.outraContaComANova ? { id: 'aluno-2' } : null,
              );
            },
          ),
          update: jest.fn(({ data }: { data: { matricula: string } }) =>
            Promise.resolve({ ...dono, matricula: data.matricula }),
          ),
        },
      };
      return {
        dono,
        prisma,
        service: new UsersService(prisma as unknown as PrismaService),
      };
    }

    it('troca com a senha certa e mantém o mesmo userId', async () => {
      const { prisma, service } = await createSubject();

      const user = await service.changeMatricula(
        'aluno-1',
        '  202399999  ',
        SENHA,
      );

      // `trim`: o tablet da bancada não vai encontrar " 202399999".
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'aluno-1' },
        data: { matricula: '202399999' },
      });
      expect(user.id).toBe('aluno-1');
      expect(user.matricula).toBe('202399999');
    });

    it('senha errada não muda nada', async () => {
      const { prisma, service } = await createSubject();

      await expect(
        service.changeMatricula('aluno-1', '202399999', 'chute'),
      ).rejects.toThrow(UnauthorizedException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('matrícula de outra conta é recusada sem tocar na do aluno', async () => {
      const { prisma, service } = await createSubject({
        outraContaComANova: true,
      });

      await expect(
        service.changeMatricula('aluno-1', '202399999', SENHA),
      ).rejects.toThrow(ConflictException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    /**
     * Entre a checagem de unicidade e o update cabe outra requisição. Quem
     * decide de verdade é o índice único — e a resposta tem de ser o mesmo 409,
     * não um 500.
     */
    it('corrida perdida no índice único vira o mesmo 409', async () => {
      const { prisma, service } = await createSubject();
      prisma.user.update.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('unique', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );

      await expect(
        service.changeMatricula('aluno-1', '202399999', SENHA),
      ).rejects.toThrow(ConflictException);
    });

    it('reenviar a mesma matrícula não é erro nem escrita', async () => {
      const { prisma, service } = await createSubject();

      await expect(
        service.changeMatricula('aluno-1', '202312345', SENHA),
      ).resolves.toMatchObject({ matricula: '202312345' });
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    /**
     * O papel vem do DOMÍNIO DO E-MAIL validado no ticket do Google, nunca da
     * matrícula. Se algum dia um campo `role` escapar para o DTO, esta prova é
     * a que cai.
     */
    it('não toca no papel da conta', async () => {
      const { prisma, service } = await createSubject();

      await service.changeMatricula('aluno-1', '202399999', SENHA);

      const { data } = prisma.user.update.mock.calls[0][0] as {
        data: Record<string, unknown>;
      };
      expect(Object.keys(data)).toEqual(['matricula']);
    });
  });
});
