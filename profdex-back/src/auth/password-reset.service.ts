import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from '@node-rs/bcrypt';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';

/** Prazo do link. Curto de propósito: é uma chave de acesso à conta. */
export const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;

/** Máximo de pedidos por usuário dentro do TTL — barra flood de e-mail. */
const MAX_REQUESTS_PER_TTL = 3;

/**
 * Redefinição de senha por e-mail.
 *
 * Três decisões de segurança que valem explicação:
 *
 * 1. **Nunca revelamos se a conta existe.** `request()` sempre termina igual,
 *    tenha achado usuário ou não. Caso contrário o endpoint viraria um
 *    verificador de matrículas cadastradas.
 * 2. **Só o hash do token vai ao banco.** Um vazamento da tabela não permite
 *    forjar links; o token em claro existe apenas dentro do e-mail.
 * 3. **Uso único e prazo curto.** `usedAt` impede que o mesmo link seja
 *    reaproveitado por quem tiver acesso à caixa de entrada depois.
 */
@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);
  private readonly appUrl: string;

  constructor(
    private prisma: PrismaService,
    private mail: MailService,
    config: ConfigService,
  ) {
    this.appUrl = (
      config.get<string>('APP_URL') ?? 'http://localhost:5173'
    ).replace(/\/$/, '');
  }

  /**
   * Dispara o e-mail se houver conta com e-mail cadastrado.
   * Não devolve nada: o chamador responde igual em qualquer caso.
   */
  async request(identifier: string): Promise<void> {
    const value = identifier.trim().toLowerCase();
    const user = await this.prisma.user.findFirst({
      where: { OR: [{ matricula: value }, { email: value }] },
      select: { id: true, name: true, email: true },
    });

    // Sem conta, ou conta sem e-mail (cadastro antigo por matrícula): não há
    // para onde mandar. Silêncio — do lado de fora é indistinguível de sucesso.
    if (!user?.email) return;

    const recent = await this.prisma.passwordResetToken.count({
      where: {
        userId: user.id,
        createdAt: { gt: new Date(Date.now() - RESET_TOKEN_TTL_MS) },
      },
    });
    if (recent >= MAX_REQUESTS_PER_TTL) {
      this.logger.warn(`Excesso de pedidos de redefinição para ${user.id}`);
      return;
    }

    const token = randomBytes(32).toString('base64url');
    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
      },
    });

    const link = `${this.appUrl}/redefinir-senha?token=${encodeURIComponent(token)}`;
    await this.mail.send(
      user.email,
      'ProfDex — redefinir senha',
      buildEmail(user.name, link),
    );
  }

  /** Consome o token e troca a senha. Lança se inválido/expirado/já usado. */
  async reset(token: string, newPassword: string): Promise<void> {
    const record = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: hashToken(token) },
      select: { id: true, userId: true, expiresAt: true, usedAt: true },
    });

    // Mensagem única para os três casos: quem tem um token inválido não
    // precisa saber se ele nunca existiu, expirou ou já foi usado.
    const invalid = new BadRequestException(
      'Link inválido ou expirado. Peça um novo.',
    );
    if (!record || record.usedAt || record.expiresAt <= new Date())
      throw invalid;

    const hashed = await bcrypt.hash(newPassword, 10);
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: record.userId },
        data: { password: hashed },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
      // Os demais links pendentes da conta morrem junto: se alguém pediu a
      // redefinição indevidamente, o pedido dele deixa de valer.
      this.prisma.passwordResetToken.updateMany({
        where: { userId: record.userId, usedAt: null },
        data: { usedAt: new Date() },
      }),
    ]);
  }
}

/**
 * SHA-256 basta: o token tem 256 bits de entropia vinda de `randomBytes`, então
 * não há o que um ataque de dicionário faça (diferente de senha de usuário,
 * onde bcrypt é obrigatório).
 */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Mantido para comparações futuras de token em tempo constante. */
export function safeEqual(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}

function buildEmail(name: string, link: string): string {
  return `
    <div style="font-family:system-ui,sans-serif;max-width:520px;margin:auto">
      <h2>Redefinir senha</h2>
      <p>Olá, ${escapeHtml(name)}!</p>
      <p>Recebemos um pedido para redefinir a senha da sua conta no ProfDex.</p>
      <p style="margin:24px 0">
        <a href="${link}"
           style="background:#c62828;color:#fff;padding:12px 20px;
                  border-radius:8px;text-decoration:none;display:inline-block">
          Criar nova senha
        </a>
      </p>
      <p style="color:#666;font-size:13px">
        O link vale por 30 minutos e só pode ser usado uma vez.
        Se não foi você quem pediu, ignore este e-mail — nada muda.
      </p>
    </div>
  `;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
