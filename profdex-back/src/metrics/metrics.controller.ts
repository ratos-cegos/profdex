import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { EndSessionDto, HeartbeatDto, TrackEventsDto } from './dto/metrics.dto';
import { isClientReportable, isEventType } from './engagement';
import { MetricsService } from './metrics.service';

interface AuthedRequest extends Request {
  user: { id: string; matricula: string; name: string };
}

/**
 * Ingestão de métricas do próprio usuário. Tudo autenticado e sempre atribuído
 * ao dono da sessão — o corpo do request nunca escolhe de quem é o evento.
 */
@UseGuards(JwtAuthGuard)
@Controller('metrics')
export class MetricsController {
  constructor(private metrics: MetricsService) {}

  /** Abre uma sessão de uso e devolve o id que os demais endpoints usam. */
  @Post('session')
  async startSession(
    @Req() request: AuthedRequest,
    @Headers('user-agent') userAgent?: string,
  ) {
    const sessionId = await this.metrics.startSession(
      request.user.id,
      userAgent,
    );
    return { sessionId };
  }

  /**
   * Sinal de vida com o tempo ativo desde o último envio.
   * `ok: false` significa "sessão desconhecida, abra outra" — acontece depois
   * de um restart do servidor.
   */
  @Post('session/heartbeat')
  @HttpCode(HttpStatus.OK)
  heartbeat(@Req() request: AuthedRequest, @Body() dto: HeartbeatDto) {
    const ok = this.metrics.heartbeat(
      request.user.id,
      dto.sessionId,
      dto.activeMs,
    );
    return { ok };
  }

  @Post('session/end')
  @HttpCode(HttpStatus.NO_CONTENT)
  async endSession(
    @Req() request: AuthedRequest,
    @Body() dto: EndSessionDto,
  ): Promise<void> {
    await this.metrics.endSession(request.user.id, dto.sessionId);
  }

  /**
   * Lote de interações. Tipos desconhecidos são ignorados em silêncio em vez de
   * derrubar o lote inteiro: um cliente numa versão mais nova que o servidor
   * não pode fazer o aluno perder o resto das métricas.
   *
   * Eventos de alto valor (captura, batalha, quiz) também são ignorados aqui —
   * quem os registra é o servidor, no momento em que o fato acontece. Aceitá-los
   * do cliente seria entregar o ranking de engajamento a quem sabe abrir o
   * DevTools.
   */
  @Post('events')
  @HttpCode(HttpStatus.ACCEPTED)
  track(@Req() request: AuthedRequest, @Body() dto: TrackEventsDto) {
    const valid: Parameters<MetricsService['record']>[2] = [];
    for (const event of dto.events) {
      if (!isEventType(event.type)) continue;
      if (!isClientReportable(event.type)) continue;
      valid.push({
        type: event.type,
        occurredAt: new Date(event.occurredAt),
        durationMs: event.durationMs,
        metadata: event.metadata as Prisma.InputJsonValue | undefined,
      });
    }

    const accepted = this.metrics.record(
      request.user.id,
      dto.sessionId ?? null,
      valid,
    );
    return { accepted, ignored: dto.events.length - accepted };
  }
}
