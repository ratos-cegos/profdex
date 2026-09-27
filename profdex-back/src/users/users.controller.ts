import {
  Body,
  Controller,
  Inject,
  Patch,
  Req,
  Res,
  UseGuards,
  forwardRef,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthRateLimitService } from '../auth/auth-rate-limit.service';
import {
  getSessionCookieOptions,
  SESSION_COOKIE_NAME,
} from '../auth/auth-session';
import { AuthService } from '../auth/auth.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UpdateMatriculaDto } from './dto/update-matricula.dto';
import { UsersService } from './users.service';

interface AuthedRequest extends Request {
  user: { id: string; matricula: string; name: string; role: string };
}

/**
 * A própria conta do aluno.
 *
 * Existe por causa de um problema só: a matrícula é digitada uma vez, sem
 * validação de formato, e um dígito trocado é aceito em silêncio. Sem esta
 * rota não havia nenhuma forma de corrigir — o projeto não tinha controller de
 * usuários, e o Perfil apenas EXIBIA o valor.
 *
 * É autoatendimento, e não uma tela do painel (decisão 5): o erro é do
 * cadastro, quem sabe o valor certo é o dono, e a unicidade impede tomar
 * matrícula já cadastrada.
 */
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(
    private users: UsersService,
    // `forwardRef` porque AuthModule já importa UsersModule: é o preço de
    // reemitir a sessão daqui em vez de duplicar o registro do JwtModule, que
    // é o que auth.module.ts existe para evitar.
    @Inject(forwardRef(() => AuthService)) private auth: AuthService,
    private rateLimit: AuthRateLimitService,
  ) {}

  /**
   * Troca a matrícula e **reassina a sessão**.
   *
   * O JWT carrega `matricula` no payload: sem reemitir o cookie, o perfil
   * continuaria mostrando o valor velho até a sessão expirar (8h), e o aluno
   * teria de relogar — justamente com a credencial que acabou de mudar.
   *
   * Passa pelo MESMO rate limit do login, chaveado por `ip:matricula`. Um campo
   * de senha atual num endpoint autenticado é um oráculo de senha se ficar sem
   * contagem de tentativa; e contar também o 409 impede usar a rota para
   * descobrir quais matrículas já existem.
   */
  @Patch('me/matricula')
  async changeMatricula(
    @Req() request: AuthedRequest,
    @Res({ passthrough: true }) response: Response,
    @Body() dto: UpdateMatriculaDto,
  ) {
    const chave = `${request.ip}:${request.user.matricula.trim().toLowerCase()}`;
    this.rateLimit.assertAllowed(chave);

    const user = await this.users
      .changeMatricula(request.user.id, dto.matricula, dto.currentPassword)
      .catch((erro: unknown) => {
        this.rateLimit.recordFailure(chave);
        throw erro;
      });
    this.rateLimit.reset(chave);

    response.cookie(
      SESSION_COOKIE_NAME,
      this.auth.signSession(user.id, user.matricula, user.name, user.role),
      getSessionCookieOptions(process.env.NODE_ENV === 'production'),
    );

    return {
      user: {
        id: user.id,
        matricula: user.matricula,
        name: user.name,
        role: user.role,
      },
    };
  }
}
