import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from '@nestjs/passport';
import type { Request, Response } from 'express';
import { AuthRateLimitService } from './auth-rate-limit.service';
import { getSessionCookieOptions, SESSION_COOKIE_NAME } from './auth-session';
import { AuthService } from './auth.service';
import { isDevSignupEnabled } from './dev-signup';
import {
  CompleteGoogleSignupDto,
  ForgotPasswordDto,
  ResetPasswordDto,
} from './dto/google.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { GoogleAuthService } from './google-auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { PasswordResetService } from './password-reset.service';
import { GoogleIdentity } from './strategies/google.strategy';
import { chaveDeLimite } from '../users/matricula';

/** O que o `JwtStrategy.validate` põe em `request.user`. */
interface SessionPrincipal {
  id: string;
  matricula: string;
  name: string;
  role: string;
}

@Controller('auth')
export class AuthController {
  private readonly appUrl: string;

  constructor(
    private auth: AuthService,
    private rateLimit: AuthRateLimitService,
    private google: GoogleAuthService,
    private passwordReset: PasswordResetService,
    config: ConfigService,
  ) {
    this.appUrl = (
      config.get<string>('APP_URL') ?? 'http://localhost:5173'
    ).replace(/\/$/, '');
  }

  /**
   * Cadastro por matrícula/nome/senha — **só com `NODE_ENV=development`**.
   *
   * Fora de desenvolvimento responde 404, e não 403: a rota não deve nem
   * admitir que existe. O portão é repetido no serviço e no `UsersService`, que
   * são as camadas que de fato criam a conta sem e-mail institucional
   * verificado. Ver `dev-signup.ts` e docs/AUTENTICACAO.md.
   */
  @Post('register')
  register(
    @Body() dto: RegisterDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    if (!isDevSignupEnabled(process.env)) throw new NotFoundException();
    return this.authenticate(request, response, dto.matricula, () =>
      this.auth.registerForDevelopment(dto),
    );
  }

  /**
   * Entrada por matrícula/senha. **Não cria conta**: em produção toda conta
   * nasce do login com Google (`/auth/google`), que é o que comprova o vínculo
   * institucional. A senha definida ali serve justamente para poder entrar por
   * aqui depois, sem depender do Google.
   */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(
    @Body() dto: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.authenticate(request, response, dto.matricula, () =>
      this.auth.login(dto),
    );
  }

  /**
   * Rate limit por IP+matrícula em volta de qualquer caminho que devolva
   * sessão: sem isso o cadastro seria uma porta lateral para adivinhar senha
   * sem contar tentativa.
   */
  private async authenticate(
    request: Request,
    response: Response,
    matricula: string,
    action: () => Promise<{
      accessToken: string;
      user: { id: string; matricula: string; name: string };
    }>,
  ) {
    // Normalizada: `2023.12345` e `202312345` levam à mesma conta
    // (`acharPorMatricula`), então precisam gastar o mesmo contador.
    const key = chaveDeLimite(request.ip, matricula);
    this.rateLimit.assertAllowed(key);

    try {
      const session = await action();
      this.rateLimit.reset(key);
      response.cookie(
        SESSION_COOKIE_NAME,
        session.accessToken,
        getSessionCookieOptions(process.env.NODE_ENV === 'production'),
      );
      return { user: session.user };
    } catch (error) {
      this.rateLimit.recordFailure(key);
      throw error;
    }
  }

  /**
   * Quem está logado, lido do BANCO — não do token.
   *
   * O JWT carrega matrícula, nome e papel de quando foi assinado. Devolver o
   * payload fazia o Perfil mostrar matrícula velha por até 8h depois de uma
   * troca em outro aparelho ou do `db:normalizar-matriculas` — e o Perfil é
   * justamente onde a bancada manda o aluno conferir a matrícula. Pior: depois
   * do `db:limpar-evento`, a conta apagada continuava "logada".
   *
   * - Conta que não existe mais → 401 e o cookie é limpo (o app volta ao login).
   * - Token com dado velho → devolve o do banco e reemite o cookie, para o
   *   resto do app (rate limit, socket da batalha) enxergar o mesmo valor.
   */
  @UseGuards(JwtAuthGuard)
  @Get('me')
  async me(
    @Req() request: Request & { user: SessionPrincipal },
    @Res({ passthrough: true }) response: Response,
  ) {
    const production = process.env.NODE_ENV === 'production';
    const user = await this.auth.currentUser(request.user.id);
    if (!user) {
      response.clearCookie(
        SESSION_COOKIE_NAME,
        getSessionCookieOptions(production),
      );
      throw new UnauthorizedException('Sessão inválida');
    }

    const desatualizado =
      user.matricula !== request.user.matricula ||
      user.name !== request.user.name ||
      user.role !== request.user.role;
    if (desatualizado) {
      response.cookie(
        SESSION_COOKIE_NAME,
        this.auth.signSession(user.id, user.matricula, user.name, user.role),
        getSessionCookieOptions(production),
      );
    }
    return { user };
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  logout(@Res({ passthrough: true }) response: Response): void {
    response.clearCookie(
      SESSION_COOKIE_NAME,
      getSessionCookieOptions(process.env.NODE_ENV === 'production'),
    );
  }

  // ── Login com Google ──────────────────────────────────────────────────────

  /** Início do fluxo: o passport redireciona para a tela de contas do Google. */
  @UseGuards(AuthGuard('google'))
  @Get('google')
  googleStart(): void {
    // O guard cuida do redirect; nada a fazer aqui.
  }

  /**
   * Retorno do Google. Responde com REDIRECT, não JSON: quem chega aqui é o
   * navegador saindo do domínio do Google, não uma chamada da aplicação.
   */
  @UseGuards(AuthGuard('google'))
  @Get('google/callback')
  async googleCallback(
    @Req() request: Request & { user: GoogleIdentity },
    @Res() response: Response,
  ): Promise<void> {
    const outcome = await this.google.resolve(request.user);

    if (outcome.kind === 'session') {
      const token = this.auth.signSession(
        outcome.userId,
        outcome.matricula,
        outcome.name,
        outcome.role,
      );
      response.cookie(
        SESSION_COOKIE_NAME,
        token,
        getSessionCookieOptions(process.env.NODE_ENV === 'production'),
      );
      response.redirect(`${this.appUrl}/profdex`);
      return;
    }

    // Conta nova: o ticket vai na URL porque o destino é uma tela do app, não
    // um endpoint. Ele vale 15min, serve só para completar o cadastro e é
    // assinado com uma chave distinta da de sessão.
    const params = new URLSearchParams({
      ticket: outcome.ticket,
      email: outcome.email,
      nome: outcome.suggestedName,
    });
    response.redirect(`${this.appUrl}/completar-cadastro?${params.toString()}`);
  }

  /** Conclui o cadastro iniciado pelo Google e já abre a sessão. */
  @Post('google/complete')
  @HttpCode(HttpStatus.CREATED)
  async googleComplete(
    @Body() dto: CompleteGoogleSignupDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const user = await this.google.completeSignup(dto);
    const token = this.auth.signSession(
      user.id,
      user.matricula,
      user.name,
      user.role,
    );
    response.cookie(
      SESSION_COOKIE_NAME,
      token,
      getSessionCookieOptions(process.env.NODE_ENV === 'production'),
    );
    return { user };
  }

  // ── Redefinição de senha ──────────────────────────────────────────────────

  /**
   * Sempre 204, exista a conta ou não. Responder diferente transformaria o
   * endpoint num verificador de matrículas cadastradas.
   */
  @Post('forgot-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  async forgotPassword(@Body() dto: ForgotPasswordDto): Promise<void> {
    await this.passwordReset.request(dto.identifier);
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  async resetPassword(@Body() dto: ResetPasswordDto): Promise<void> {
    await this.passwordReset.reset(dto.token, dto.password);
  }
}
