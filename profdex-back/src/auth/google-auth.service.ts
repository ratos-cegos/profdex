import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from '@node-rs/bcrypt';
import { createHmac } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CompleteGoogleSignupDto } from './dto/google.dto';
import { Role } from './institutional-domains';
import { GoogleIdentity } from './strategies/google.strategy';

/** Prazo para completar o cadastro depois de escolher a conta Google. */
const TICKET_TTL_SECONDS = 15 * 60;

interface TicketPayload {
  email: string;
  googleId: string;
  role: Role;
  displayName: string;
}

export type GoogleOutcome =
  /** Já existe conta: é só abrir a sessão. */
  | {
      kind: 'session';
      userId: string;
      matricula: string;
      name: string;
      role: string;
    }
  /** Conta nova: o app precisa pedir matrícula, nome e senha. */
  | {
      kind: 'onboarding';
      ticket: string;
      email: string;
      suggestedName: string;
    };

/**
 * Login com Google, convivendo com matrícula/senha.
 *
 * Quem já tem conta entra direto. Quem não tem recebe um **ticket** e é levado
 * a uma tela que pede matrícula, nome completo e senha — o app continua tendo a
 * matrícula como identidade principal, e o Google entra como forma verificada
 * de comprovar o vínculo institucional.
 */
@Injectable()
export class GoogleAuthService {
  /**
   * Segredo PRÓPRIO do ticket, derivado do JWT_SECRET.
   *
   * Não reaproveitamos o segredo de sessão de propósito: se o ticket fosse
   * assinado com a mesma chave, alguém poderia tentar apresentá-lo como cookie
   * de sessão. Com chaves distintas isso é estruturalmente impossível — a
   * verificação de um falha para o outro.
   */
  private readonly ticketSecret: string;

  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    config: ConfigService,
  ) {
    this.ticketSecret = createHmac(
      'sha256',
      config.getOrThrow<string>('JWT_SECRET'),
    )
      .update('google-onboarding-v1')
      .digest('hex');
  }

  /** Decide entre entrar direto ou mandar completar o cadastro. */
  async resolve(identity: GoogleIdentity): Promise<GoogleOutcome> {
    const existing = await this.prisma.user.findFirst({
      where: {
        OR: [{ googleId: identity.googleId }, { email: identity.email }],
      },
      select: {
        id: true,
        matricula: true,
        name: true,
        role: true,
        googleId: true,
      },
    });

    if (existing) {
      // Conta criada por matrícula/senha e agora entrando pelo Google com o
      // mesmo e-mail: vincula. Também corrige o papel se o domínio mudou.
      if (!existing.googleId) {
        await this.prisma.user.update({
          where: { id: existing.id },
          data: {
            googleId: identity.googleId,
            email: identity.email,
            emailVerified: true,
            role: identity.role,
          },
        });
      }
      return {
        kind: 'session',
        userId: existing.id,
        matricula: existing.matricula,
        name: existing.name,
        role: existing.googleId ? existing.role : identity.role,
      };
    }

    return {
      kind: 'onboarding',
      ticket: this.signTicket({
        email: identity.email,
        googleId: identity.googleId,
        role: identity.role,
        displayName: identity.displayName,
      }),
      email: identity.email,
      suggestedName: identity.displayName,
    };
  }

  /** Cria a conta a partir do ticket + dados que o aluno preencheu. */
  async completeSignup(dto: CompleteGoogleSignupDto) {
    const payload = this.verifyTicket(dto.ticket);

    const matricula = dto.matricula.trim();
    const [byMatricula, byGoogle] = await Promise.all([
      this.prisma.user.findUnique({
        where: { matricula },
        select: { id: true },
      }),
      this.prisma.user.findFirst({
        where: {
          OR: [{ googleId: payload.googleId }, { email: payload.email }],
        },
        select: { id: true },
      }),
    ]);
    if (byMatricula) throw new ConflictException('Matrícula já cadastrada');
    // Corrida de duas abas, ou ticket reapresentado depois do cadastro pronto.
    if (byGoogle) throw new ConflictException('Esta conta Google já foi usada');

    const user = await this.prisma.user.create({
      data: {
        matricula,
        name: dto.name.trim(),
        password: await bcrypt.hash(dto.password, 10),
        email: payload.email,
        googleId: payload.googleId,
        emailVerified: true,
        // O papel vem do DOMÍNIO validado no servidor, nunca do corpo do
        // request — senão qualquer aluno se declararia administrador.
        role: payload.role,
      },
      select: { id: true, matricula: true, name: true, role: true },
    });
    return user;
  }

  private signTicket(payload: TicketPayload): string {
    return this.jwt.sign(payload, {
      secret: this.ticketSecret,
      expiresIn: TICKET_TTL_SECONDS,
    });
  }

  private verifyTicket(ticket: string): TicketPayload {
    try {
      return this.jwt.verify<TicketPayload>(ticket, {
        secret: this.ticketSecret,
      });
    } catch {
      throw new UnauthorizedException(
        'Sessão de cadastro expirada. Entre com o Google novamente.',
      );
    }
  }
}
