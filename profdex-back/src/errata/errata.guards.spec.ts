import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { AdminGuard } from '../auth/guards/admin.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import {
  ErrataController,
  QuizQuestionsAdminController,
} from './errata.controller';
import { VouchersController } from './vouchers.controller';

/** Os guards que o Nest aplicaria a uma classe. */
function guardsDaClasse(alvo: object): unknown[] {
  return (Reflect.getMetadata('__guards__', alvo) as unknown[]) ?? [];
}

/**
 * Os guards de UM handler. Lido pelo nome porque é assim que o Nest guarda o
 * metadado — pegar `Controller.prototype.metodo` direto acusaria `this` solto.
 */
function guardsDaRota(alvo: object, metodo: string): unknown[] {
  const prototipo = alvo as Record<string, object>;
  return (
    (Reflect.getMetadata('__guards__', prototipo[metodo]) as unknown[]) ?? []
  );
}

function contexto(userId?: string): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user: { id: userId } }) }),
  } as unknown as ExecutionContext;
}

describe('errata — controle de acesso', () => {
  describe('AdminGuard', () => {
    it('recusa quem não é admin, conferindo o papel NO BANCO', async () => {
      // Ler do banco e não de um claim do token é o que faz revogar um
      // administrador valer na hora, sem esperar a sessão expirar.
      const prisma = {
        user: { findUnique: jest.fn().mockResolvedValue({ role: 'aluno' }) },
      };
      const guard = new AdminGuard(prisma as unknown as PrismaService);

      await expect(guard.canActivate(contexto('aluno-1'))).rejects.toThrow(
        ForbiddenException,
      );
      expect(prisma.user.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'aluno-1' },
          select: { role: true },
        }),
      );
    });

    it('libera quem é admin', async () => {
      const prisma = {
        user: { findUnique: jest.fn().mockResolvedValue({ role: 'admin' }) },
      };
      const guard = new AdminGuard(prisma as unknown as PrismaService);

      await expect(guard.canActivate(contexto('admin-1'))).resolves.toBe(true);
    });
  });

  describe('rotas', () => {
    it('exige admin em TODA a errata — abrir, listar e julgar', () => {
      // A tela de errata é a única que devolve gabarito. Um aluno com sessão
      // válida chamando `POST /admin/errata` baixaria a resposta certa.
      expect(guardsDaClasse(ErrataController)).toEqual([
        JwtAuthGuard,
        AdminGuard,
      ]);
      expect(guardsDaClasse(QuizQuestionsAdminController)).toEqual([
        JwtAuthGuard,
        AdminGuard,
      ]);
    });

    it('deixa só a rota do próprio aluno sem AdminGuard', () => {
      // `/vouchers/me` é de aluno e resolve o dono pela sessão; as outras duas
      // recebem matrícula ou id vindos do cliente e precisam do guard.
      const prototipo = VouchersController.prototype;
      expect(guardsDaClasse(VouchersController)).toEqual([JwtAuthGuard]);
      expect(guardsDaRota(prototipo, 'meus')).toEqual([]);
      expect(guardsDaRota(prototipo, 'buscar')).toEqual([AdminGuard]);
      expect(guardsDaRota(prototipo, 'resgatar')).toEqual([AdminGuard]);
    });
  });
});
