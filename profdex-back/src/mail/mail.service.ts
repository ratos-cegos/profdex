import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Envio de e-mail transacional.
 *
 * Usa a API REST do Resend direto via `fetch` — o SDK não acrescenta nada aqui
 * e seria mais uma dependência para manter. O plano gratuito (3.000/mês,
 * 100/dia) cobre com folga a redefinição de senha de um evento; para trocar por
 * Brevo ou outro, só este arquivo muda.
 *
 * SEM `RESEND_API_KEY` configurada, nada é enviado: o e-mail é registrado no
 * log. É o comportamento desejado em desenvolvimento — o link de redefinição
 * aparece no terminal e o fluxo pode ser testado inteiro sem conta em serviço
 * nenhum.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly apiKey: string | undefined;
  private readonly from: string;

  constructor(config: ConfigService) {
    this.apiKey = config.get<string>('RESEND_API_KEY');
    this.from =
      config.get<string>('MAIL_FROM') ?? 'ProfDex <onboarding@resend.dev>';
  }

  get isConfigured(): boolean {
    return !!this.apiKey;
  }

  /** Devolve false se não conseguiu enviar — o chamador decide se isso importa. */
  async send(to: string, subject: string, html: string): Promise<boolean> {
    if (!this.apiKey) {
      this.logger.warn(
        `RESEND_API_KEY ausente — e-mail NÃO enviado.\n` +
          `  para: ${to}\n  assunto: ${subject}\n${stripHtml(html)}`,
      );
      return false;
    }

    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ from: this.from, to: [to], subject, html }),
      });

      if (!response.ok) {
        // Nunca logamos o corpo do e-mail aqui: ele contém o link com o token.
        this.logger.error(
          `Falha ao enviar e-mail (HTTP ${response.status}) para ${maskEmail(to)}`,
        );
        return false;
      }
      return true;
    } catch (error) {
      this.logger.error(
        `Erro de rede ao enviar e-mail para ${maskEmail(to)}: ${String(error)}`,
      );
      return false;
    }
  }
}

/**
 * Log legível em dev. Os `href` são preservados de propósito: sem eles o log
 * do e-mail de redefinição não teria o link, que é a única coisa que
 * realmente importa para testar o fluxo sem serviço de e-mail configurado.
 */
function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, '$2 -> $1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** `aluno@edu.unifil.br` → `al***@edu.unifil.br` */
function maskEmail(email: string): string {
  const at = email.indexOf('@');
  if (at <= 0) return '***';
  return `${email.slice(0, Math.min(2, at))}***${email.slice(at)}`;
}
