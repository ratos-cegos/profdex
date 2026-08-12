import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  EVENT_TYPES,
  INTERACTION_SOURCE_LABELS,
  INTERACTION_WEIGHTS,
  INTERACTIONS_PER_TIME_BLOCK,
  TIME_BLOCK_MINUTES,
} from './engagement';

/** Teto de horas por consulta de série temporal (uma semana). */
export const MAX_SERIES_HOURS = 24 * 7;

const PLAYED = {
  OR: [
    { battleWins: { gt: 0 } },
    { battleLosses: { gt: 0 } },
    { battleDraws: { gt: 0 } },
  ],
};

/**
 * Consultas do painel administrativo. SOMENTE LEITURA — este serviço não tem
 * nenhum método de escrita, por desenho: o painel acompanha métricas e nada
 * mais, e um administrador não pode fazer nada que um aluno não possa.
 *
 * As séries temporais vêm de `metrics_hourly` (pré-agregado); só os totais de
 * funil e o topo de engajamento tocam as tabelas principais, e ambos são
 * consultas de contagem sobre colunas indexadas.
 */
@Injectable()
export class AdminMetricsService {
  constructor(private prisma: PrismaService) {}

  /** Números do topo do painel. */
  async overview() {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const weekAgo = new Date(Date.now() - 7 * 86_400_000);

    const [
      totalUsers,
      sessionsToday,
      dau,
      wau,
      activeMsToday,
      capturesToday,
      battlesToday,
      interacoes,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.userSession.count({
        where: { startedAt: { gte: startOfDay } },
      }),
      this.distinctSessionUsers(startOfDay),
      this.distinctSessionUsers(weekAgo),
      this.prisma.userSession.aggregate({
        where: { startedAt: { gte: startOfDay } },
        _sum: { activeMs: true },
        _avg: { activeMs: true },
      }),
      this.prisma.appEvent.count({
        where: { type: 'professor_captured', occurredAt: { gte: startOfDay } },
      }),
      this.prisma.appEvent.count({
        where: { type: 'battle_finished', occurredAt: { gte: startOfDay } },
      }),
      this.interactionTotals(startOfDay),
    ]);

    return {
      totalUsers,
      sessionsToday,
      dau,
      wau,
      activeMinutesToday: Math.round(
        (activeMsToday._sum.activeMs ?? 0) / 60_000,
      ),
      avgSessionMinutes:
        Math.round(((activeMsToday._avg.activeMs ?? 0) / 60_000) * 10) / 10,
      capturesToday,
      battlesToday,
      interactionsTotal: interacoes.total,
      interactionsToday: interacoes.hoje,
    };
  }

  /**
   * Total de interações e de onde elas vieram.
   *
   * O total é o número de volume do evento — "o app gerou N interações". Vem
   * pré-somado do rollup; a quebra é reconstruída aqui a partir das contagens
   * por tipo de evento (`event_<tipo>`) multiplicadas pelo mesmo peso que o
   * rollup usou, então total e quebra fecham por construção.
   */
  async interactions() {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const [totais, agregados] = await Promise.all([
      this.interactionTotals(startOfDay),
      this.prisma.$queryRaw<{ metric: string; total: number }[]>`
        SELECT metric, COALESCE(SUM(value), 0)::int AS total
        FROM metrics_hourly
        WHERE metric LIKE 'event_%' OR metric = 'interactions_time'
        GROUP BY metric
      `,
    ]);

    const por = new Map(agregados.map((r) => [r.metric, r.total]));

    const fontes = EVENT_TYPES.filter((t) => INTERACTION_WEIGHTS[t] > 0)
      .map((tipo) => {
        const ocorrencias = por.get(`event_${tipo}`) ?? 0;
        return {
          fonte: INTERACTION_SOURCE_LABELS[tipo],
          ocorrencias,
          peso: INTERACTION_WEIGHTS[tipo],
          interacoes: ocorrencias * INTERACTION_WEIGHTS[tipo],
        };
      })
      .concat({
        fonte: `Tempo no app (${TIME_BLOCK_MINUTES}min = ${INTERACTIONS_PER_TIME_BLOCK})`,
        ocorrencias: 0,
        peso: INTERACTIONS_PER_TIME_BLOCK,
        interacoes: por.get('interactions_time') ?? 0,
      })
      .filter((f) => f.interacoes > 0)
      .sort((a, b) => b.interacoes - a.interacoes);

    return {
      total: totais.total,
      hoje: totais.hoje,
      fontes: fontes.map((f) => ({
        ...f,
        pct: totais.total
          ? Math.round((f.interacoes / totais.total) * 1000) / 10
          : 0,
      })),
    };
  }

  /** Série horária de uma métrica já agregada. */
  async series(metric: string, hours: number) {
    const capped = Math.min(Math.max(hours, 1), MAX_SERIES_HOURS);
    const from = new Date(Date.now() - capped * 3_600_000);
    from.setMinutes(0, 0, 0);

    const rows = await this.prisma.metricHourly.findMany({
      where: { metric, bucket: { gte: from } },
      orderBy: { bucket: 'asc' },
      select: { bucket: true, value: true },
    });
    return { metric, hours: capped, points: rows };
  }

  /**
   * Funil de adoção. Responde "onde o aluno para?" — tipicamente entre instalar
   * e capturar o primeiro professor, que é o passo que exige sair do lugar.
   */
  async funnel() {
    const [cadastrados, descobriram, capturaram, batalharam] =
      await Promise.all([
        this.prisma.user.count(),
        this.prisma.user.count({ where: { discoveries: { some: {} } } }),
        this.prisma.user.count({ where: { captures: { some: {} } } }),
        this.prisma.user.count({ where: PLAYED }),
      ]);

    return [
      { etapa: 'Cadastrados', total: cadastrados },
      { etapa: 'Descobriram 1+ professor', total: descobriram },
      { etapa: 'Capturaram 1+ professor', total: capturaram },
      { etapa: 'Batalharam 1+ vez', total: batalharam },
    ];
  }

  /** Ranking de engajamento (usa o índice em engagement_score). */
  async engagement(limit = 25) {
    const rows = await this.prisma.user.findMany({
      where: { engagementScore: { gt: 0 } },
      orderBy: [{ engagementScore: 'desc' }, { createdAt: 'asc' }],
      take: Math.min(Math.max(limit, 1), 100),
      select: {
        id: true,
        name: true,
        engagementScore: true,
        battleWins: true,
        battleLosses: true,
        _count: { select: { captures: true } },
      },
    });

    return rows.map((u, i) => ({
      position: i + 1,
      id: u.id,
      name: u.name,
      score: u.engagementScore,
      captures: u._count.captures,
      wins: u.battleWins,
      losses: u.battleLosses,
    }));
  }

  /**
   * Retenção D1: dos que apareceram ontem pela primeira vez, quantos voltaram
   * hoje. É o indicador mais honesto de que o app prendeu, e não só chamou
   * atenção no primeiro contato.
   */
  async retentionD1() {
    const startToday = new Date();
    startToday.setHours(0, 0, 0, 0);
    const startYesterday = new Date(startToday.getTime() - 86_400_000);

    const rows = await this.prisma.$queryRaw<
      { novos: number; voltaram: number }[]
    >`
      WITH primeiros AS (
        SELECT user_id, MIN(started_at) AS first_at
        FROM user_sessions
        GROUP BY user_id
      ),
      ontem AS (
        SELECT user_id FROM primeiros
        WHERE first_at >= ${startYesterday} AND first_at < ${startToday}
      )
      SELECT (SELECT COUNT(*) FROM ontem)::int AS novos,
             (SELECT COUNT(DISTINCT s.user_id)
                FROM user_sessions s
                JOIN ontem o ON o.user_id = s.user_id
               WHERE s.started_at >= ${startToday})::int AS voltaram
    `;

    const { novos = 0, voltaram = 0 } = rows[0] ?? {};
    return {
      novosOntem: novos,
      voltaramHoje: voltaram,
      taxa: novos > 0 ? Math.round((voltaram / novos) * 1000) / 10 : null,
    };
  }

  /**
   * Usuários distintos com sessão iniciada desde `since`.
   *
   * Em SQL cru porque o `distinct` do Prisma é aplicado depois de trazer as
   * linhas: contar o DAU carregaria uma linha por sessão do dia para descartar
   * quase todas em memória.
   */
  /** Interações acumuladas (tudo) e desde `startOfDay`, numa consulta só. */
  private async interactionTotals(
    startOfDay: Date,
  ): Promise<{ total: number; hoje: number }> {
    const rows = await this.prisma.$queryRaw<{ total: number; hoje: number }[]>`
      SELECT COALESCE(SUM(value), 0)::int AS total,
             COALESCE(SUM(value) FILTER (WHERE bucket >= ${startOfDay}), 0)::int AS hoje
      FROM metrics_hourly
      WHERE metric = 'interactions'
    `;
    return rows[0] ?? { total: 0, hoje: 0 };
  }

  private async distinctSessionUsers(since: Date): Promise<number> {
    const rows = await this.prisma.$queryRaw<{ total: number }[]>`
      SELECT COUNT(DISTINCT user_id)::int AS total
      FROM user_sessions
      WHERE started_at >= ${since}
    `;
    return rows[0]?.total ?? 0;
  }
}
