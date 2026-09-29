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

  function candidatas(prisma: ReturnType<typeof createSubject>['prisma']) {
    const { where } = prisma.user.findFirst.mock.calls[0][0] as {
      where: { OR: Record<string, string>[] };
    };
    return where.OR;
  }

  it('procura também a forma normalizada, como o login', async () => {
    const { prisma, service } = createSubject();

    await service.request(' 2023.123-45 ');

    expect(candidatas(prisma)).toEqual([
      { matricula: '2023.123-45' },
      { matricula: '202312345' },
      { email: '2023.123-45' },
    ]);
  });

  // Tirar os pontos de um e-mail não produz matrícula de ninguém.
  it('não inventa matrícula a partir de um e-mail', async () => {
    const { prisma, service } = createSubject();

    await service.request('Ana.Souza@edu.unifil.br');

    expect(candidatas(prisma)).toEqual([
      { matricula: 'ana.souza@edu.unifil.br' },
      { email: 'ana.souza@edu.unifil.br' },
    ]);
  });
});
