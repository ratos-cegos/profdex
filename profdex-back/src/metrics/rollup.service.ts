import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { QUIZ_THEMES } from '../quiz/quiz.constants';
import {
  INTERACTION_WEIGHTS,
  INTERACTIONS_PER_BATTLE_TURN,
  INTERACTIONS_PER_TIME_BLOCK,
  TIME_BLOCK_MINUTES,
} from './engagement';

/** Com que frequência recalculamos os agregados. */
const ROLLUP_INTERVAL_MS = 5 * 60_000;

/**
 * Quantas horas para trás são recalculadas a cada passada.
 *
 * 24, e não as 2 que cobriam só a hora em curso e a anterior: o relatório do
 * painel é uma janela móvel de 24h, e ela precisa fechar com a régua ATUAL.
 * Com 2 horas, mudar um peso (ou corrigir uma conta) deixava o resto do dia
 * congelado no cálculo velho, e o gráfico ganhava um degrau que não
 * correspondia a evento nenhum — foi o que aconteceu ao recalibrar o quiz.
 *
 * Custa uma varredura de 24h de `app_events` a cada 5 minutos. É barato na
 * escala do evento (dezenas de milhares de linhas, todas sob o índice de
 * `occurred_at`) e o upsert mantém tudo idempotente. O que for mais antigo que
 * a janela se conserta com `npm run metrics:rollup-full`.
 */
const ROLLUP_WINDOW_HOURS = 24;

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

  /**
   * Recalcula a janela recente. Seguro chamar a qualquer momento.
   *
   * `desde` existe para o recálculo histórico (`scripts/rollup-full.ts`), que
   * precisa passar por cima da janela de 24h quando um peso muda — sem ele, os
   * baldes antigos ficariam para sempre na régua velha. Fora disso ninguém
   * passa o argumento.
   */
  async run(desde?: Date): Promise<void> {
    // Uma passada por vez: se o banco estiver lento, empilhar recálculos só
    // pioraria a situação.
    if (this.running) return;
    this.running = true;

    const from = desde
      ? new Date(desde)
      : new Date(Date.now() - ROLLUP_WINDOW_HOURS * 3_600_000);
    from.setMinutes(0, 0, 0);

    try {
      const rows = [
        ...(await this.sessionsStarted(from)),
        ...(await this.loggedUsers(from)),
        ...(await this.activeUsers(from)),
        ...(await this.activeMinutes(from)),
        ...(await this.eventCounts(from)),
        ...(await this.interactions(from)),
        ...(await this.practiceQuiz(from)),
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
   * TRÊS fontes somadas: os eventos, cada um com seu peso (ver
   * INTERACTION_WEIGHTS); o tempo ativo convertido em blocos; e os TURNOS de
   * batalha. Saem também `interactions_time` e `interactions_turns` sozinhas,
   * para o painel mostrar quanto do total veio de cada coisa — sem isso o
   * número seria uma caixa preta.
   *
   * O turno vem de duas origens, e nenhuma delas exigiu evento novo:
   *
   * - **PvP**: `metadata->>'turns'` do `battle_finished`. Há um evento por
   *   jogador, então a mesma batalha entra duas vezes — de propósito, é a
   *   simetria do "25 para cada lado" que o peso do evento já usa.
   * - **Raid**: `raid_attempts.turns`, atribuído à hora do FIM da tentativa —
   *   uma raid longa cruza a virada da hora, e `ended_at` é o instante em que o
   *   número passa a existir. Tentativas `anulada` entram: os turnos foram
   *   jogados de verdade, e quem perdeu a raid para um restart nosso não deve
   *   perder o esforço no relatório.
   *
   * O `CASE` com `~ '^[0-9]{1,6}$'` no metadata não é paranoia: o campo é JSON
   * livre, e `::int` sobre lixo lançaria exceção no meio da passada, derrubando
   * TODAS as métricas da janela — o mesmo cuidado que o `practiceQuiz` já
   * documenta. O teto de 6 dígitos evita estourar `int` numa linha corrompida.
   * `battle_finished` é server-only, então o lixo só chegaria por um bug nosso;
   * a rede continua valendo a pena.
   *
   * As séries precisam sair da MESMA consulta: gerar duas linhas
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
      ),
      turnos AS (
        SELECT bucket, (SUM(qtd) * ${INTERACTIONS_PER_BATTLE_TURN}::int)::int AS value
        FROM (
          SELECT date_trunc('hour', e.occurred_at) AS bucket,
                 -- CASE, e não FILTER: FILTER só existe em agregação, e aqui
                 -- isto é uma expressão escalar por linha.
                 CASE
                   WHEN e.metadata->>'turns' ~ '^[0-9]{1,6}$'
                     THEN (e.metadata->>'turns')::int
                   ELSE 0
                 END AS qtd
          FROM app_events e
          WHERE e.type = 'battle_finished'
            AND e.occurred_at >= ${from}
          UNION ALL
          SELECT date_trunc('hour', a.ended_at) AS bucket,
                 a.turns                        AS qtd
          FROM raid_attempts a
          WHERE a.ended_at >= ${from}
        ) AS todos
        GROUP BY bucket
      )
      SELECT bucket, 'interactions_time'::text AS metric, value
      FROM tempo
      UNION ALL
      SELECT bucket, 'interactions_turns'::text AS metric, value
      FROM turnos
      UNION ALL
      SELECT bucket, 'interactions'::text AS metric, SUM(value)::int AS value
      FROM (
        SELECT * FROM eventos
        UNION ALL SELECT * FROM tempo
        UNION ALL SELECT * FROM turnos
      ) AS todas
      GROUP BY bucket
    `;
  }

  /**
   * Quiz Treino, quebrado por tema e por acerto.
   *
   * `eventCounts` já produz `event_quiz_practice_answered` (o total), mas o
   * tema e o acerto vivem no `metadata` de cada evento, e o painel não pode ler
   * `app_events` — é a regra da casa (ver o comentário do modelo no schema): o
   * painel é aberto justamente durante o evento, quando o servidor tem menos
   * folga, e varrer a trilha de auditoria inteira a cada abertura não escala.
   *
   * Então o recorte é pré-agregado aqui, na mesma passada de 2 horas das
   * outras métricas, e vira duas chaves por tema:
   *
   *   practice_answered_<tema>  — respostas
   *   practice_correct_<tema>   — acertos
   *
   * O par permite calcular a taxa de acerto sem guardar uma terceira chave que
   * poderia divergir das outras duas.
   *
   * O filtro por `type` usa o índice `(type, occurred_at)` que já existe, e a
   * janela de 2h mantém a varredura pequena — nenhum índice novo é necessário.
   *
   * `metadata->>'theme'` é comparado contra a lista canônica de temas: um
   * evento forjado com tema inventado (o cliente pode declarar este evento)
   * criaria uma chave nova em `metrics_hourly` e sujaria o painel para sempre.
   */
  private practiceQuiz(from: Date): Promise<Row[]> {
    const temas = Prisma.join(QUIZ_THEMES.map((t) => Prisma.sql`(${t}::text)`));

    return this.prisma.$queryRaw<Row[]>`
      WITH temas (tema) AS (VALUES ${temas}),
      respostas AS (
        SELECT date_trunc('hour', e.occurred_at)      AS bucket,
               e.metadata->>'theme'                   AS tema,
               -- Comparação de string, NÃO ::boolean. metadata é livre --
               -- este é o único evento de quiz que o cliente pode declarar
               -- (não está em SERVER_ONLY_EVENTS) e o DTO só valida
               -- IsObject, sem checar o formato de dentro. Um
               -- correct: "qualquer coisa" faria ::boolean lancar excecao
               -- no meio da passada, e como esta fora do persist(),
               -- travaria TODAS as metricas daquela janela, nao so esta, ate
               -- a linha sair das 2h. Comparacao nunca lanca: qualquer coisa
               -- que nao seja exatamente 'true' vira falso -- pior caso e uma
               -- linha subcontada, nunca o rollup inteiro parado.
               (e.metadata->>'correct') = 'true'      AS acertou
        FROM app_events e
        JOIN temas t ON t.tema = e.metadata->>'theme'
        WHERE e.type = 'quiz_practice_answered'
          AND e.occurred_at >= ${from}
      )
      SELECT bucket,
             'practice_answered_' || tema AS metric,
             COUNT(*)::int                AS value
      FROM respostas
      GROUP BY bucket, tema
      UNION ALL
      SELECT bucket,
             'practice_correct_' || tema  AS metric,
             COUNT(*) FILTER (WHERE acertou)::int AS value
      FROM respostas
      GROUP BY bucket, tema
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
