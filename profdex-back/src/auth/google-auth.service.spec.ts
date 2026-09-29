import { BadRequestException, ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { GoogleAuthService } from './google-auth.service';

/**
 * Conclusão do cadastro pelo Google — o único caminho de conta nova em
 * produção, e por onde entravam as matrículas que a bancada não encontra.
 *
 * O ticket é assinado de verdade (por `resolve`), para a prova passar pelo
 * mesmo caminho do aluno: escolher a conta Google, cair na tela de cadastro e
 * mandar matrícula, nome e senha.
 */
describe('GoogleAuthService.completeSignup', () => {
  const identidade = {
    googleId: 'google-1',
    email: 'ana.souza@edu.unifil.br',
    domain: 'edu.unifil.br',
    displayName: 'Ana Souza',
    role: 'aluno' as const,
  };

  async function createSubject(
    naoNumericas: { id: string; matricula: string }[] = [],
  ) {
    const prisma = {
      // As contas com caractere fora de 0-9 — a colisão que o índice único não
      // enxerga. Vazia por padrão: o banco já normalizado.
      $queryRawUnsafe: jest.fn().mockResolvedValue(naoNumericas),
      user: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn(({ data }: { data: { matricula: string } }) =>
          Promise.resolve({
            id: 'user-1',
            matricula: data.matricula,
            name: 'Ana Souza',
            role: 'aluno',
          }),
        ),
      },
    };
    const config = {
      getOrThrow: jest.fn().mockReturnValue('segredo-de-teste'),
    } as unknown as ConfigService;
    const service = new GoogleAuthService(
      prisma as unknown as PrismaService,
      new JwtService({}),
      config,
    );

    const outcome = await service.resolve(identidade);
    if (outcome.kind !== 'onboarding') throw new Error('esperava onboarding');

    return { prisma, service, ticket: outcome.ticket };
  }

  it('grava a matrícula normalizada, que é a que a bancada digita', async () => {
    const { prisma, service, ticket } = await createSubject();

    const user = await service.completeSignup({
      ticket,
      matricula: '2023.123-45​',
      name: ' Ana Souza ',
      password: 'senha forte',
    });

    expect(user.matricula).toBe('202312345');
    expect(prisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { matricula: '202312345' } }),
    );
  });

  /**
   * A conta antiga `2023.12345` É o `202312345` que está entrando — o índice
   * único não vê isso. Sem a checagem, as duas coexistem, a bancada acha só a
   * nova, e o aluno antigo vira o "conflito" que o `db:normalizar-matriculas`
   * se recusa a consertar.
   */
  it('recusa matrícula que só colide depois de normalizada', async () => {
    const { prisma, service, ticket } = await createSubject([
      { id: 'aluno-antigo', matricula: '2023.12345' },
    ]);

    await expect(
      service.completeSignup({
        ticket,
        matricula: '202312345',
        name: 'Ana Souza',
        password: 'senha forte',
      }),
    ).rejects.toThrow(ConflictException);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  // Letras e `@` não são apagados pela normalização, então um e-mail gravado
  // numa conta antiga não bloqueia matrícula numérica de ninguém.
  it('conta antiga com e-mail na matrícula não bloqueia o cadastro', async () => {
    const { prisma, service, ticket } = await createSubject([
      { id: 'outro', matricula: 'joao@edu.unifil.br' },
    ]);

    const user = await service.completeSignup({
      ticket,
      matricula: '202312345',
      name: 'Ana Souza',
      password: 'senha forte',
    });

    expect(user.matricula).toBe('202312345');
    expect(prisma.user.create).toHaveBeenCalled();
  });

  // O ValidationPipe barra isto antes; a prova é que o serviço também barra,
  // para quem chamar o método por outro caminho.
  it('recusa o e-mail que o autofill põe no campo, sem criar conta', async () => {
    const { prisma, service, ticket } = await createSubject();

    await expect(
      service.completeSignup({
        ticket,
        matricula: identidade.email,
        name: 'Ana Souza',
        password: 'senha forte',
      }),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });
});
