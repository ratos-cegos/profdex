import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  INTERACTION_WEIGHTS,
  INTERACTIONS_PER_TIME_BLOCK,
  TIME_BLOCK_MINUTES,
} from './engagement';

/** Com que frequência recalculamos os agregados. */
const ROLLUP_INTERVAL_MS = 5 * 60_000;

/**
 * Quantas horas para trás são recalculadas a cada passada. Duas cobrem a hora
 * em curso e a anterior (que pode ter recebido eventos atrasados do buffer).
 * O upsert torna o recálculo idempotente.
 */
const ROLLUP_WINDOW_HOURS = 2;

interface Row {
  bucket: Date;
  metric: string;
  value: number;
}

/**
 * Pré-agrega os eventos brutos em `metrics_hourly`.
 *
 * O painel administrativo lê só daqui. Sem isso, cada abertura do painel
 * varreria `app_events` inteira — e o painel é aberto justamente durante o
 * evento, quando o servidor tem menos folga. Ver docs/METRICAS.md.
 */
@Injectable()
export class RollupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RollupService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(private prisma: PrismaService) {}

  onModuleInit(): void {
    this.timer = setInterval(() => {
      void this.run();
    }, ROLLUP_INTERVAL_MS);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Recalcula a janela recente. Seguro chamar a qualquer momento. */
  async run(): Promise<void> {
    // Uma passada por vez: se o banco estiver lento, empilhar recálculos só
    // pioraria a situação.
    if (this.running) return;
    this.running = true;

    const from = new Date(Date.now() - ROLLUP_WINDOW_HOURS * 3_600_000);
    from.setMinutes(0, 0, 0);

    try {
      const rows = [
        ...(await this.sessionsStarted(from)),
        ...(await this.loggedUsers(from)),
        ...(await this.activeUsers(from)),
        ...(await this.activeMinutes(from)),
        ...(await this.eventCounts(from)),
        ...(await this.interactions(from)),
      ];
      await this.persist(rows);
    } catch (error) {
      this.logger.error(`Falha no rollup: ${String(error)}`);
    } finally {
      this.running = false;
    }
  }

  // ── Consultas ─────────────────────────────────────────────────────────────

  private sessionsStarted(from: Date): Promise<Row[]> {
    return this.prisma.$queryRaw<Row[]>`
      SELECT date_trunc('hour', started_at) AS bucket,
             'sessions_started'::text       AS metric,
             COUNT(*)::int                  AS value
      FROM user_sessions
      WHERE started_at >= ${from}
      GROUP BY 1
    `;
  }

  /**
   * "Usuários logados por hora": quem tinha uma sessão ABERTA em algum momento
   * daquela hora — não quem começou uma. É a métrica que o painel mostra, e
   * exige o cruzamento com a série de horas porque uma sessão longa pertence a
   * várias delas.
   */
  private loggedUsers(from: Date): Promise<Row[]> {
    return this.prisma.$queryRaw<Row[]>`
      SELECT h.bucket                        AS bucket,
             'logged_users'::text            AS metric,
             COUNT(DISTINCT s.user_id)::int  AS value
      FROM generate_series(
             ${from}::timestamp,
             date_trunc('hour', NOW()),
             interval '1 hour'
           ) AS h(bucket)
      LEFT JOIN user_sessions s
             ON s.started_at < h.bucket + interval '1 hour'
            AND COALESCE(s.ended_at, NOW()) >= h.bucket
      GROUP BY h.bucket
    `;
  }

  /** Quem de fato interagiu (gerou evento), não apenas manteve o app aberto. */
  private activeUsers(from: Date): Promise<Row[]> {
    return this.prisma.$queryRaw<Row[]>`
      SELECT date_trunc('hour', occurred_at) AS bucket,
             'active_users'::text            AS metric,
             COUNT(DISTINCT user_id)::int    AS value
      FROM app_events
      WHERE occurred_at >= ${from}
      GROUP BY 1
    `;
  }

  /**
   * Minutos ativos somados. Atribuídos à hora em que a sessão FECHOU — repartir
   * proporcionalmente entre as horas seria mais exato, mas custa bem mais e a
   * diferença some na agregação diária.
   */
  private activeMinutes(from: Date): Promise<Row[]> {
    return this.prisma.$queryRaw<Row[]>`
      SELECT date_trunc('hour', ended_at)     AS bucket,
             'active_minutes'::text           AS metric,
             (SUM(active_ms) / 60000)::int    AS value
      FROM user_sessions
      WHERE ended_at >= ${from}
      GROUP BY 1
    `;
  }

  /** Uma métrica por tipo de evento: `event_professor_captured` etc. */
  private eventCounts(from: Date): Promise<Row[]> {
    return this.prisma.$queryRaw<Row[]>`
      SELECT date_trunc('hour', occurred_at) AS bucket,
             'event_' || type                AS metric,
             COUNT(*)::int                   AS value
      FROM app_events
      WHERE occurred_at >= ${from}
      GROUP BY 1, 2
    `;
  }

  /**
   * Interações por hora — o número de volume do evento.
   *
   * Duas fontes somadas: os eventos, cada um com seu peso (ver
   * INTERACTION_WEIGHTS), e o tempo ativo convertido em blocos. Sai também
   * `interactions_time` sozinha, para o painel conseguir mostrar quanto do
   * total veio de tempo e não de ação — sem isso o número seria uma caixa
   * preta.
   *
   * As duas séries precisam sair da MESMA consulta: gerar duas linhas
   * `(bucket, 'interactions')` no mesmo INSERT faria o Postgres recusar o
   * `ON CONFLICT` ("cannot affect row a second time").
   */
  private interactions(from: Date): Promise<Row[]> {
    const pesos = Prisma.join(
      Object.entries(INTERACTION_WEIGHTS).map(
        ([type, peso]) => Prisma.sql`(${type}::text, ${peso}::int)`,
      ),
    );

    return this.prisma.$queryRaw<Row[]>`
      WITH pesos (type, peso) AS (VALUES ${pesos}),
      eventos AS (
        SELECT date_trunc('hour', e.occurred_at) AS bucket,
               SUM(p.peso)::int                  AS value
        FROM app_events e
        JOIN pesos p ON p.type = e.type
        WHERE e.occurred_at >= ${from}
        GROUP BY 1
      ),
      tempo AS (
        SELECT date_trunc('hour', s.ended_at) AS bucket,
               ROUND(
                 SUM(s.active_ms) / 60000.0
                 / ${TIME_BLOCK_MINUTES}::numeric
                 * ${INTERACTIONS_PER_TIME_BLOCK}::numeric
               )::int AS value
        FROM user_sessions s
        WHERE s.ended_at >= ${from}
        GROUP BY 1
      )
      SELECT bucket, 'interactions_time'::text AS metric, value
      FROM tempo
      UNION ALL
      SELECT bucket, 'interactions'::text AS metric, SUM(value)::int AS value
      FROM (SELECT * FROM eventos UNION ALL SELECT * FROM tempo) AS todas
      GROUP BY bucket
    `;
  }

  // ── Gravação ──────────────────────────────────────────────────────────────

  private async persist(rows: Row[]): Promise<void> {
    const valid = rows.filter((r) => r.bucket && r.value !== null);
    if (!valid.length) return;

    const values = Prisma.join(
      valid.map(
        (r) =>
          Prisma.sql`(gen_random_uuid()::text, ${r.bucket}::timestamp, ${r.metric}::text, ${r.value}::int)`,
      ),
    );
    await this.prisma.$executeRaw`
      INSERT INTO metrics_hourly (id, bucket, metric, value)
      VALUES ${values}
      ON CONFLICT (bucket, metric) DO UPDATE SET value = EXCLUDED.value
    `;
  }
}
