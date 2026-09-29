import { ConfigService } from '@nestjs/config';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { PasswordResetService } from './password-reset.service';

/**
 * Só a identificação da conta: o resto do fluxo (token, prazo, uso único) não
 * mudou com a regra de matrícula.
 */
describe('PasswordResetService.request', () => {
  function createSubject() {
    const prisma = {
      user: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const service = new PasswordResetService(
      prisma as unknown as PrismaService,
      { send: jest.fn() } as unknown as MailService,
      { get: jest.fn() } as unknown as ConfigService,
    );
    return { prisma, service };
  }

  /** Os `where` de cada consulta, na ordem em que o serviço as fez. */
  function consultas(prisma: ReturnType<typeof createSubject>['prisma']) {
    return prisma.user.findFirst.mock.calls.map(
      (call) => (call[0] as { where: unknown }).where,
    );
  }

  it('procura também a forma normalizada, como o login', async () => {
    const { prisma, service } = createSubject();

    await service.request(' 2023.123-45 ');

    // Duas consultas, nesta ordem — e não um `OR` só, onde o banco escolheria.
    expect(consultas(prisma)).toEqual([
      { OR: [{ matricula: '2023.123-45' }, { email: '2023.123-45' }] },
      { matricula: '202312345' },
    ]);
  });

  /**
   * O defeito que isto fecha: com `2023.12345` e `202312345` os dois gravados
   * (o "conflito" que o `db:normalizar-matriculas` não conserta), um `findFirst`
   * com as duas no mesmo `OR` e sem ordem deixa o banco decidir — e o link de
   * redefinição sai para o e-mail da conta errada.
   */
  it('a conta exata ganha da parecida, sem depender do banco', async () => {
    const { prisma, service } = createSubject();
    prisma.user.findFirst.mockResolvedValueOnce({
      id: 'legado',
      name: 'Ana',
      email: null,
    });

    await service.request('2023.12345');

    // Achou no exato: a forma normalizada nem chega a ser consultada.
    expect(prisma.user.findFirst).toHaveBeenCalledTimes(1);
  });

  // Tirar os pontos de um e-mail não produz matrícula de ninguém.
  it('não inventa matrícula a partir de um e-mail', async () => {
    const { prisma, service } = createSubject();

    await service.request('Ana.Souza@edu.unifil.br');

    expect(consultas(prisma)).toEqual([
      {
        OR: [
          { matricula: 'ana.souza@edu.unifil.br' },
          { email: 'ana.souza@edu.unifil.br' },
        ],
      },
    ]);
  });
});
