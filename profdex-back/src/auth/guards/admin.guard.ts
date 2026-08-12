import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Libera apenas contas com `role = 'admin'`.
 *
 * A checagem vai ao banco em vez de ler um claim do JWT: promover ou revogar um
 * administrador passa a valer na hora, sem esperar a sessão de 15min expirar.
 * O custo é irrelevante — são poucas rotas e pouquíssimo tráfego.
 *
 * Usado sempre DEPOIS do JwtAuthGuard, que é quem popula `request.user`.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<{ user?: { id?: string } }>();

    const userId = request.user?.id;
    if (!userId) throw new ForbiddenException('Não autenticado.');

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    if (user?.role !== 'admin') {
      throw new ForbiddenException('Acesso restrito a administradores.');
    }
    return true;
  }
}
