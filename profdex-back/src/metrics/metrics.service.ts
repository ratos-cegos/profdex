import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  DAILY_SESSION_POINTS,
  EventType,
  POINTS_PER_ACTIVE_MINUTE,
  TIME_POINTS_DAILY_CAP,
  pointsFor,
} from './engagement';

/** Com que frequência o buffer vai para o banco. */
const FLUSH_INTERVAL_MS = 10_000;

/** Sessão sem heartbeat por mais que isso é considerada abandonada. */
export const SESSION_STALE_MS = 3 * 60_000;

/** Com que frequência procuramos sessões abandonadas. */
const SWEEP_INTERVAL_MS = 60_000;

/**
 * Teto do buffer. Se o banco ficar indisponível, é melhor descartar métrica
 * antiga do que deixar a memória crescer sem limite e derrubar o app — métrica
 * é importante, mas não mais que o evento continuar de pé.
 */
const MAX_BUFFERED_EVENTS = 50_000;

interface BufferedEvent {
  userId: string;
  sessionId: string | null;
  type: EventType;
  occurredAt: Date;
  durationMs: number | null;
  metadata: Prisma.InputJsonValue | undefined;
}

interface SessionState {
  userId: string;
  lastSeenAt: Date;
  activeMs: number;
  dirty: boolean;
}

/**
 * Coleta de métricas de uso.
 *
 * O ponto central do desenho é NÃO escrever uma linha por interação no momento
 * em que ela acontece: com centenas de alunos ativos isso somaria carga de
 * escrita justamente nos picos em que o PvP já está sofrendo (ver
 * docs/CARGA-PVP.md). Tudo passa por um buffer em memória que é descarregado em
 * lote, e heartbeat não gera linha nenhuma — só atualiza estado em memória.
 */
@Injectable()
export class MetricsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MetricsService.name);

  private buffer: BufferedEvent[] = [];
  private readonly sessions = new Map<string, SessionState>();
  private readonly pendingPoints = new Map<string, number>();
  /** Pontos por tempo já concedidos hoje, por usuário (para o teto diário). */
  private timePoints = { day: today(), byUser: new Map<string, number>() };

  private flushTimer: NodeJS.Timeout | null = null;
  private sweepTimer: NodeJS.Timeout | null = null;
  private dropped = 0;

  constructor(private prisma: PrismaService) {}

  onModuleInit(): void {
    this.flushTimer = setInterval(() => {
      void this.flush();
    }, FLUSH_INTERVAL_MS);
    this.sweepTimer = setInterval(() => {
      void this.sweepStaleSessions();
    }, SWEEP_INTERVAL_MS);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.flushTimer) clearInterval(this.flushTimer);
    if (this.sweepTimer) clearInterval(this.sweepTimer);
    this.flushTimer = null;
    this.sweepTimer = null;
    await this.flush(); // não perder o que estava em memória num deploy
  }

  // ── Sessões ───────────────────────────────────────────────────────────────

  async startSession(userId: string, userAgent?: string): Promise<string> {
    const session = await this.prisma.userSession.create({
      data: { userId, userAgent: userAgent?.slice(0, 255) },
      select: { id: true },
    });

    this.sessions.set(session.id, {
      userId,
      lastSeenAt: new Date(),
      activeMs: 0,
      dirty: false,
    });

    if (await this.isFirstSessionToday(userId)) {
      this.addPoints(userId, DAILY_SESSION_POINTS);
    }
    return session.id;
  }

  /**
   * Heartbeat: só mexe em memória. `activeMsDelta` vem do cliente (que é quem
   * sabe se a aba está visível), mas é limitado pelo tempo real decorrido —
   * senão bastaria mandar um número grande para liderar o ranking.
   */
  heartbeat(userId: string, sessionId: string, activeMsDelta: number): boolean {
    const state = this.sessions.get(sessionId);
    // Sessão desconhecida (reinício do servidor, id inventado): o cliente
    // recebe false e abre uma nova.
    if (!state || state.userId !== userId) return false;

    const now = new Date();
    const elapsed = now.getTime() - state.lastSeenAt.getTime();
    // 1.5x de folga cobre atraso de rede e timer impreciso do navegador.
    const accepted = Math.max(0, Math.min(activeMsDelta, elapsed * 1.5));

    state.activeMs += accepted;
    state.lastSeenAt = now;
    state.dirty = true;

    this.awardTimePoints(userId, accepted);
    return true;
  }

  async endSession(userId: string, sessionId: string): Promise<void> {
    const state = this.sessions.get(sessionId);
    if (!state || state.userId !== userId) return;
    this.sessions.delete(sessionId);

    await this.prisma.userSession
      .update({
        where: { id: sessionId },
        data: {
          endedAt: new Date(),
          lastSeenAt: state.lastSeenAt,
          activeMs: state.activeMs,
        },
      })
      .catch((error: unknown) =>
        this.logger.warn(
          `Falha ao encerrar sessão ${sessionId}: ${String(error)}`,
        ),
      );
  }

  // ── Eventos ───────────────────────────────────────────────────────────────

  /** Enfileira eventos. Retorna quantos foram aceitos. */
  record(
    userId: string,
    sessionId: string | null,
    events: {
      type: EventType;
      occurredAt: Date;
      durationMs?: number;
      metadata?: Prisma.InputJsonValue;
    }[],
  ): number {
    let accepted = 0;
    for (const event of events) {
      if (this.buffer.length >= MAX_BUFFERED_EVENTS) {
        this.dropped += 1;
        continue;
      }
      this.buffer.push({
        userId,
        sessionId,
        type: event.type,
        occurredAt: event.occurredAt,
        durationMs: event.durationMs ?? null,
        metadata: event.metadata,
      });
      this.addPoints(userId, pointsFor(event.type));
      accepted += 1;
    }
    return accepted;
  }

  // ── Descarga ──────────────────────────────────────────────────────────────

  /** Grava buffer, sessões sujas e pontos acumulados. Erros não propagam. */
  async flush(): Promise<void> {
    const events = this.buffer;
    this.buffer = [];

    if (this.dropped > 0) {
      this.logger.warn(
        `${this.dropped} evento(s) descartados por buffer cheio`,
      );
      this.dropped = 0;
    }

    try {
      if (events.length) {
        await this.prisma.appEvent.createMany({
          data: events.map((e) => ({
            userId: e.userId,
            sessionId: e.sessionId,
            type: e.type,
            occurredAt: e.occurredAt,
            durationMs: e.durationMs,
            metadata: e.metadata,
          })),
        });
      }
      await this.flushSessions();
      await this.flushPoints();
    } catch (error) {
      // Métrica nunca deve derrubar o app nem travar o timer.
      this.logger.error(`Falha ao descarregar métricas: ${String(error)}`);
    }
  }

  /** Uma query só para todas as sessões alteradas desde a última descarga. */
  private async flushSessions(): Promise<void> {
    const rows: { id: string; state: SessionState }[] = [];
    for (const [id, state] of this.sessions) {
      if (state.dirty) rows.push({ id, state });
    }
    if (!rows.length) return;

    const values = Prisma.join(
      rows.map(
        ({ id, state }) =>
          Prisma.sql`(${id}::text, ${state.lastSeenAt}::timestamp, ${state.activeMs}::int)`,
      ),
    );
    await this.prisma.$executeRaw`
      UPDATE user_sessions AS s
      SET last_seen_at = v.last_seen_at, active_ms = v.active_ms
      FROM (VALUES ${values}) AS v(id, last_seen_at, active_ms)
      WHERE s.id = v.id
    `;
    for (const { state } of rows) state.dirty = false;
  }

  /** Idem para o placar de engajamento. */
  private async flushPoints(): Promise<void> {
    const entries = [...this.pendingPoints.entries()].filter(([, p]) => p > 0);
    if (!entries.length) return;
    this.pendingPoints.clear();

    const values = Prisma.join(
      entries.map(([id, points]) => Prisma.sql`(${id}::text, ${points}::int)`),
    );
    await this.prisma.$executeRaw`
      UPDATE users AS u
      SET engagement_score = u.engagement_score + v.points
      FROM (VALUES ${values}) AS v(id, points)
      WHERE u.id = v.id
    `;
  }

  /**
   * Fecha sessões cujo heartbeat parou — aba fechada sem aviso, celular que
   * dormiu, rede que caiu. Sem isso elas ficariam "abertas" para sempre e o
   * total de usuários ativos só cresceria.
   */
  private async sweepStaleSessions(): Promise<void> {
    const limit = new Date(Date.now() - SESSION_STALE_MS);

    for (const [id, state] of this.sessions) {
      if (state.lastSeenAt > limit) continue;
      this.sessions.delete(id);
      await this.prisma.userSession
        .update({
          where: { id },
          data: {
            endedAt: state.lastSeenAt,
            lastSeenAt: state.lastSeenAt,
            activeMs: state.activeMs,
          },
        })
        .catch(() => {});
    }

    // Sessões órfãs de um restart do servidor: não estão mais em memória, mas
    // continuam abertas no banco. O índice [ended_at, last_seen_at] cobre isto.
    await this.prisma.userSession
      .updateMany({
        where: { endedAt: null, lastSeenAt: { lt: limit } },
        data: { endedAt: limit },
      })
      .catch((error: unknown) =>
        this.logger.warn(`Falha varrendo sessões órfãs: ${String(error)}`),
      );
  }

  // ── Pontuação ─────────────────────────────────────────────────────────────

  private addPoints(userId: string, points: number): void {
    if (points <= 0) return;
    this.pendingPoints.set(
      userId,
      (this.pendingPoints.get(userId) ?? 0) + points,
    );
  }

  /**
   * Converte tempo ativo em pontos, respeitando o teto diário.
   *
   * O acumulado do dia vive em memória: um restart do servidor zera o contador
   * e o usuário poderia reganhar o teto. É aceitável para um evento — a
   * alternativa seria uma leitura no banco a cada heartbeat.
   */
  private awardTimePoints(userId: string, activeMs: number): void {
    const day = today();
    if (day !== this.timePoints.day) {
      this.timePoints = { day, byUser: new Map() };
    }

    const already = this.timePoints.byUser.get(userId) ?? 0;
    if (already >= TIME_POINTS_DAILY_CAP) return;

    const minutes = Math.floor(activeMs / 60_000);
    if (minutes <= 0) return;

    const award = Math.min(
      minutes * POINTS_PER_ACTIVE_MINUTE,
      TIME_POINTS_DAILY_CAP - already,
    );
    this.timePoints.byUser.set(userId, already + award);
    this.addPoints(userId, award);
  }

  private async isFirstSessionToday(userId: string): Promise<boolean> {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const count = await this.prisma.userSession.count({
      where: { userId, startedAt: { gte: start } },
    });
    // A própria sessão recém-criada já conta, então "primeira" é count === 1.
    return count <= 1;
  }
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}
