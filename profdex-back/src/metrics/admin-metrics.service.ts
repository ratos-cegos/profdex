import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  QUIZ_THEMES,
  RARE_UNLOCK_CORRECT_ANSWERS,
} from '../quiz/quiz.constants';
import {
  EVENT_TYPES,
  INTERACTION_SOURCE_LABELS,
  INTERACTION_WEIGHTS,
  INTERACTIONS_PER_BATTLE_TURN,
  INTERACTIONS_PER_TIME_BLOCK,
  TIME_BLOCK_MINUTES,
} from './engagement';

/** Teto de horas por consulta de série temporal (uma semana). */
export const MAX_SERIES_HOURS = 24 * 7;

/**
 * A janela do relatório: das 17h à meia-noite do dia escolhido.
 *
 * É o horário em que o estande funciona. Um relatório de 24h diluía a feira em
 * dezessete horas de campus dormindo — a taxa de acerto da bancada e o pico de
 * batalhas só significam alguma coisa dentro do turno em que houve gente.
 */
export const REPORT_HORA_INICIO = 17;
export const REPORT_HORA_FIM = 24;

/**
 * Quantos dias o relatório CONSOLIDADO cobre, contando o dia escolhido.
 *
 * Sete porque é a semana da feira — a pergunta que a coordenação faz no fim do
 * evento é "como foi a semana?", e responder isso somando sete PDFs à mão é
 * onde o número erra.
 */
export const REPORT_DIAS_DA_SEMANA = 7;

/**
 * Fuso do evento, como offset fixo.
 *
 * `-03:00` cravado, e não a zona IANA: o Brasil aboliu o horário de verão em
 * 2019, então São Paulo não tem mais salto — e construir o instante a partir do
 * offset é o que deixa a janela correta mesmo com o servidor de produção em
 * UTC, que é onde o `date_trunc` dos baldes acontece. A FORMATAÇÃO do texto
 * continua usando a zona IANA (ver `metrics-report.ts`), que é o lugar certo
 * para ela.
 */
const OFFSET_DO_EVENTO = '-03:00';

/** `2026-09-29` → das 17h à meia-noite daquele dia, no fuso do evento. */
export function janelaDoRelatorio(dia: string): { de: Date; ate: Date } {
  // Validação na FRONTEIRA do domínio, não só no DTO: esta função monta uma
  // string de data e a entrega ao `Date`. Com lixo, `new Date('lixoT17:00')` é
  // `Invalid Date`, o Prisma recebe `NaN` no `where` e o relatório sai vazio
  // sem ninguém entender por quê — melhor recusar alto.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) {
    throw new BadRequestException(
      'Data inválida: use o formato AAAA-MM-DD (ex.: 2026-09-29).',
    );
  }

  const inicio = `${dia}T${String(REPORT_HORA_INICIO).padStart(2, '0')}:00:00${OFFSET_DO_EVENTO}`;
  const de = new Date(inicio);
  if (Number.isNaN(de.getTime())) {
    throw new BadRequestException(`Data inexistente no calendário: ${dia}.`);
  }

  const ate = new Date(
    de.getTime() + (REPORT_HORA_FIM - REPORT_HORA_INICIO) * 3_600_000,
  );
  return { de, ate };
}

/**
 * As SETE janelas do estande que terminam no dia escolhido — a semana do
 * consolidado.
 *
 * Uma lista de janelas, e não um bloco contínuo de sete dias, e é a decisão
 * central deste relatório: **o consolidado da semana tem de ser a soma dos sete
 * relatórios diários**. Alguém vai somar os PDFs do dia na calculadora e
 * comparar; se o número da semana incluísse as 17 horas de campus dormindo de
 * cada dia, as duas contas divergiriam e as duas perderiam a credibilidade
 * junto. Batalha é a prova viva disso: ela acontece do celular, a qualquer
 * hora, e só a janela do estande a mantém comparável com o papel do dia.
 *
 * O deslocamento é feito em EPOCH (`- 86_400_000` por dia), nunca em calendário:
 * assim virar o mês ou o ano não exige conta nenhuma, e sem horário de verão no
 * Brasil desde 2019 um dia é exatamente 24h (ver `OFFSET_DO_EVENTO`).
 *
 * `dias` sai em ordem cronológica — o mais antigo primeiro —, que é a ordem em
 * que os baldes vão para o gráfico.
 */
export function janelaDaSemana(diaFinal: string): {
  de: Date;
  ate: Date;
  dias: { de: Date; ate: Date }[];
} {
  const ultimo = janelaDoRelatorio(diaFinal);
  const dias = Array.from({ length: REPORT_DIAS_DA_SEMANA }, (_, i) => {
    const desloc = (REPORT_DIAS_DA_SEMANA - 1 - i) * 86_400_000;
    return {
      de: new Date(ultimo.de.getTime() - desloc),
      ate: new Date(ultimo.ate.getTime() - desloc),
    };
  });
  return { de: dias[0].de, ate: ultimo.ate, dias };
}

/**
 * A escala do eixo X do relatório: uma barra por hora (um dia) ou uma barra por
 * dia (a semana consolidada).
 */
export type EscalaDoRelatorio = 'hora' | 'dia';

/**
 * Os baldes do gráfico e como cair neles.
 *
 * `indiceDe` devolve **-1** para o que está fora das janelas, e é isso que
 * sustenta o consolidado: a leitura da semana pode trazer linhas das horas
 * mortas entre dois turnos sem que elas contaminem soma nenhuma.
 */
function baldesDoRelatorio(
  janelas: { de: Date; ate: Date }[],
  escala: EscalaDoRelatorio,
): { baldes: number[]; indiceDe: (t: number) => number } {
  if (escala === 'dia') {
    // Um balde por janela, rotulado pelo início dela (17h daquele dia).
    const inicios = janelas.map((j) => j.de.getTime());
    const fins = janelas.map((j) => j.ate.getTime());
    return {
      baldes: inicios,
      indiceDe: (t) => inicios.findIndex((de, i) => t >= de && t < fins[i]),
    };
  }

  // Todas as horas da janela explícitas, inclusive as vazias: um gráfico que
  // pula a hora sem registro mente sobre o ritmo do evento.
  const [janela] = janelas;
  const baldes: number[] = [];
  for (let t = janela.de.getTime(); t < janela.ate.getTime(); t += 3_600_000) {
    baldes.push(t);
  }
  return {
    baldes,
    indiceDe: (t) => {
      const i = Math.floor((t - janela.de.getTime()) / 3_600_000);
      return i >= 0 && i < baldes.length ? i : -1;
    },
  };
}

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
      // A tabela `battles`, e NÃO `appEvent.count('battle_finished')`: o evento
      // é gravado uma vez POR JOGADOR (ver battle-room.service.ts), então
      // contá-lo mostrava o dobro das batalhas que aconteceram. O peso de
      // interação continua contando os dois lados de propósito — aqui a
      // pergunta é "quantas batalhas houve?", e ela tem uma resposta só.
      this.prisma.battle.count({
        where: { status: 'finished', finishedAt: { gte: startOfDay } },
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
      // Os turnos entram na quebra pelo mesmo motivo que o tempo: o total vem
      // pré-somado do rollup, e uma fonte de fora da lista faria a quebra não
      // fechar com ele — a tabela do painel viraria uma conta que não bate.
      .concat({
        fonte: 'Turnos de batalha (PvP e raid)',
        ocorrencias: 0,
        peso: INTERACTIONS_PER_BATTLE_TURN,
        interacoes: por.get('interactions_turns') ?? 0,
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

  /**
   * O relatório de UM dia do evento — o turno do estande, com uma barra por
   * hora. É o papel que o organizador tira no fim da feira.
   *
   * A janela é das 17h à meia-noite daquele dia: ver `janelaDoRelatorio`.
   */
  async reportDoDia(dia: string) {
    const { de, ate } = janelaDoRelatorio(dia);
    return this.relatorio([{ de, ate }], 'hora');
  }

  /**
   * O consolidado da SEMANA que termina no dia escolhido — sete turnos de
   * estande num papel só, com uma barra por dia.
   *
   * O que ele soma é exatamente o que os sete relatórios diários somam: só a
   * janela das 17h à meia-noite de cada dia (ver `janelaDaSemana`). Quem
   * conferir somando os PDFs do dia na calculadora acha o mesmo número.
   *
   * **Uma exceção, e ela é intencional:** "alunos no evento" conta alunos
   * DISTINTOS na semana, então é menor que a soma dos sete dias — quem veio
   * quarta e quinta é um aluno, não dois. Somar daria uma plateia que nunca
   * existiu, que é o erro mais fácil de cometer num consolidado. O relatório
   * diz isso no rodapé, porque um número menor que a soma das partes sem
   * explicação parece defeito.
   */
  async reportDaSemana(diaFinal: string) {
    const { dias } = janelaDaSemana(diaFinal);
    return this.relatorio(dias, 'dia');
  }

  /**
   * Os números do relatório — o que o PDF imprime —, para UMA ou VÁRIAS janelas
   * do estande.
   *
   * Um caminho só para o dia e para a semana, de propósito: com dois, bastava
   * uma correção aplicada num deles para o consolidado deixar de bater com a
   * soma dos diários, que é a única propriedade que este relatório promete.
   *
   * As séries vêm de `metrics_hourly` (pré-agregado). Os totais de batalha e de
   * usuários vêm das TABELAS, porque são perguntas com resposta única e exata, e
   * é delas que a coordenação vai cobrar: `battles` conta uma linha por batalha
   * (o evento conta uma por jogador) e o total de usuários precisa do `UNION`
   * com `app_events` para não perder a bancada.
   */
  private async relatorio(
    janelas: { de: Date; ate: Date }[],
    escala: EscalaDoRelatorio,
  ) {
    // `OR` mesmo com uma janela só: é o `lt` de cada faixa que recorta os DOIS
    // extremos. Só com `gte`, um relatório de terça somaria o evento inteiro
    // dali para a frente, e o número impresso cresceria a cada dia sem ninguém
    // notar.
    const dentro = janelas.map((j) => ({ gte: j.de, lt: j.ate }));
    const de = janelas[0].de;
    const ate = janelas[janelas.length - 1].ate;

    const [linhas, batalhas, usuarios, raids, quebra] = await Promise.all([
      this.prisma.metricHourly.findMany({
        where: { OR: dentro.map((bucket) => ({ bucket })) },
        orderBy: { bucket: 'asc' },
        select: { bucket: true, metric: true, value: true },
      }),
      this.prisma.battle.count({
        where: {
          status: 'finished',
          OR: dentro.map((finishedAt) => ({ finishedAt })),
        },
      }),
      this.distinctUsersEmJanelas(janelas),
      this.prisma.raidAttempt.count({
        where: { OR: dentro.map((endedAt) => ({ endedAt })) },
      }),
      this.interactions(),
    ]);

    const { baldes, indiceDe } = baldesDoRelatorio(janelas, escala);

    // Uma passada só sobre as linhas: por métrica (total) e por balde (série).
    // A linha que cai fora das janelas é descartada nos DOIS — é o que mantém a
    // hora morta entre dois turnos fora do consolidado da semana.
    const total = new Map<string, number>();
    const series = new Map<string, number[]>();
    for (const linha of linhas) {
      const i = indiceDe(linha.bucket.getTime());
      if (i < 0) continue;
      total.set(linha.metric, (total.get(linha.metric) ?? 0) + linha.value);
      const serie =
        series.get(linha.metric) ?? new Array<number>(baldes.length).fill(0);
      serie[i] += linha.value;
      series.set(linha.metric, serie);
    }

    // Baldes vazios continuam no array: um dia (ou uma hora) sem registro é
    // informação sobre o ritmo do evento, e omiti-lo faria o gráfico mentir.
    const serie = (metric: string) =>
      series.get(metric) ?? new Array<number>(baldes.length).fill(0);

    const respondidas = total.get('event_quiz_answered') ?? 0;
    const acertadas = total.get('event_quiz_correct') ?? 0;

    return {
      geradoEm: new Date(),
      de,
      ate,
      escala,
      baldes,
      interacoes: {
        total: total.get('interactions') ?? 0,
        deTempo: total.get('interactions_time') ?? 0,
        deTurnos: total.get('interactions_turns') ?? 0,
        porBalde: serie('interactions'),
      },
      quiz: {
        respondidas,
        acertadas,
        // Taxa de acerto da BANCADA. Sem `respondidas` não há taxa nenhuma —
        // `0/0` viraria `NaN` no meio do PDF.
        taxa: respondidas
          ? Math.round((acertadas / respondidas) * 1000) / 10
          : 0,
        porBalde: serie('event_quiz_answered'),
        acertosPorBalde: serie('event_quiz_correct'),
      },
      capturas: {
        total: total.get('event_professor_captured') ?? 0,
        raros: total.get('event_rare_captured') ?? 0,
        porBalde: serie('event_professor_captured'),
      },
      batalhas: {
        total: batalhas,
        raids,
        turnos:
          (total.get('interactions_turns') ?? 0) / INTERACTIONS_PER_BATTLE_TURN,
        // `/ 2` porque a série vem do EVENTO, que é gravado uma vez por
        // jogador. O total ao lado vem da tabela `battles` e não precisa disso —
        // e é por isso que os dois podem divergir em 1 num balde de virada.
        porBalde: serie('event_battle_finished').map((v) => Math.round(v / 2)),
      },
      usuarios: {
        total: usuarios,
        porBalde: serie('active_users'),
      },
      fontes: quebra.fontes.map((f) => ({
        fonte: f.fonte,
        interacoes: f.interacoes,
        pct: f.pct,
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
  /**
   * Quiz Treino — painel próprio, separado do quiz de bancada.
   *
   * Lê SÓ de `metrics_hourly`, onde o rollup já deixou o recorte por tema
   * pronto. Nenhuma varredura de `app_events`, nenhum JOIN com `quiz_attempts`:
   * o treino é livre, não pontua e não entra em nada oficial, então o painel
   * dele também não pode encostar nas tabelas da competição.
   *
   * É uma leitura por prefixo numa tabela que tem, no máximo, algumas dezenas
   * de linhas por hora — barata mesmo com milhões de eventos brutos acumulados.
   */
  async practiceQuiz(days = 7) {
    const from = new Date(
      Date.now() - Math.min(Math.max(days, 1), 30) * 86_400_000,
    );
    from.setMinutes(0, 0, 0);

    const rows = await this.prisma.metricHourly.findMany({
      where: {
        bucket: { gte: from },
        OR: [
          { metric: { startsWith: 'practice_answered_' } },
          { metric: { startsWith: 'practice_correct_' } },
        ],
      },
      select: { metric: true, value: true },
    });

    const respostas = new Map<string, number>();
    const acertos = new Map<string, number>();
    for (const r of rows) {
      const [mapa, prefixo] = r.metric.startsWith('practice_answered_')
        ? [respostas, 'practice_answered_']
        : [acertos, 'practice_correct_'];
      const tema = r.metric.slice(prefixo.length);
      mapa.set(tema, (mapa.get(tema) ?? 0) + r.value);
    }

    // A grade sai com os 9 temas sempre, mesmo os sem nenhuma resposta: um tema
    // ausente da lista é indistinguível de um tema com zero treino, e é
    // justamente o zero que o administrador precisa enxergar.
    const porTema = QUIZ_THEMES.map((tema) => {
      const total = respostas.get(tema) ?? 0;
      const certos = acertos.get(tema) ?? 0;
      return {
        tema,
        respostas: total,
        acertos: certos,
        taxa: total ? Math.round((certos / total) * 100) : null,
      };
    });

    const total = porTema.reduce((n, t) => n + t.respostas, 0);
    const certos = porTema.reduce((n, t) => n + t.acertos, 0);

    return {
      dias: Math.min(Math.max(days, 1), 30),
      total,
      acertos: certos,
      taxa: total ? Math.round((certos / total) * 100) : null,
      porTema,
    };
  }

  /**
   * Professores raros: quem pegou, e quanto cada raro andou.
   *
   * Vive DENTRO de `/admin/metrics` e não numa aba própria: o volume é pequeno
   * por natureza (1 raro por tema, 1 captura por conta), e uma aba seria tela
   * vazia a maior parte do evento.
   *
   * O painel é o único lugar onde progresso de raro aparece — e pode, porque
   * ele mora no `AdminLayout`, que nunca fica virado para aluno. É esta tela
   * que compensa a bancada não ter aviso prévio (decisão 16).
   */
  async rares() {
    const raros = await this.prisma.professor.findMany({
      where: { rare: true, active: true },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        types: true,
        variants: { select: { id: true } },
      },
    });

    if (!raros.length) {
      // Estado vazio explícito: a seção abre sem raro cadastrado, sem erro.
      return { capturas: [], porRaro: [], aUmAcerto: [] };
    }

    const temasComRaro = [...new Set(raros.flatMap((r) => r.types))];
    const variantIds = raros.flatMap((r) => r.variants.map((v) => v.id));

    const [capturasRaras, unlocks, acertosPorTema, estoque] = await Promise.all(
      [
        this.prisma.capture.findMany({
          where: { professor: { rare: true } },
          orderBy: { capturedAt: 'desc' },
          select: {
            capturedAt: true,
            professorId: true,
            user: { select: { name: true, matricula: true } },
            professor: { select: { name: true } },
          },
        }),
        this.prisma.rareUnlock.findMany({
          where: { theme: { in: temasComRaro } },
          select: { userId: true, theme: true },
        }),
        // `groupBy` por (aluno, tema), restrito aos temas que TÊM raro, e o
        // filtro de "exatamente 4" em memória: é a mesma ordem de grandeza que o
        // `dexLeaderboard` já paga hoje, e o Prisma não expressa HAVING = 4.
        this.prisma.quizAttempt.groupBy({
          by: ['userId', 'theme'],
          where: {
            theme: { in: temasComRaro },
            correct: true,
            annulled: false,
          },
          _count: { _all: true },
        }),
        this.prisma.captureToken.groupBy({
          by: ['variantId'],
          where: { variantId: { in: variantIds }, redeemedAt: null },
          _count: { _all: true },
        }),
      ],
    );

    const destravadosPorAluno = new Map<string, Set<string>>();
    for (const u of unlocks) {
      const set = destravadosPorAluno.get(u.userId) ?? new Set<string>();
      set.add(u.theme);
      destravadosPorAluno.set(u.userId, set);
    }

    const capturadoresPorRaro = new Map<string, Set<string>>();
    for (const c of capturasRaras) {
      const set = capturadoresPorRaro.get(c.professorId) ?? new Set<string>();
      set.add(`${c.user.matricula}`);
      capturadoresPorRaro.set(c.professorId, set);
    }

    const vivasPorVariante = new Map(
      estoque
        .filter((e) => e.variantId !== null)
        .map((e) => [e.variantId as string, e._count._all]),
    );

    const porRaro = raros.map((raro) => ({
      professorId: raro.id,
      name: raro.name,
      themes: raro.types,
      // O gate REAL: alunos que destravaram TODOS os temas dele, não os
      // parciais. É o número que se compara com `capturaram`.
      destravaram: [...destravadosPorAluno.values()].filter((temas) =>
        raro.types.every((t) => temas.has(t)),
      ).length,
      capturaram: capturadoresPorRaro.get(raro.id)?.size ?? 0,
      estoqueVivo: raro.variants.reduce(
        (total, v) => total + (vivasPorVariante.get(v.id) ?? 0),
        0,
      ),
    }));

    // "A um acerto": exatamente 4 acertos num tema que tem raro. É a mitigação
    // da decisão 15 — o aluno nunca vê progresso, então é por aqui que o
    // administrador avisa a mesa que alguém está perto.
    const aUmAcerto = acertosPorTema
      .filter((linha) => linha._count._all === RARE_UNLOCK_CORRECT_ANSWERS - 1)
      .map((linha) => ({ userId: linha.userId, theme: linha.theme }));

    const alunos = aUmAcerto.length
      ? await this.prisma.user.findMany({
          where: { id: { in: aUmAcerto.map((a) => a.userId) } },
          select: { id: true, name: true, matricula: true },
        })
      : [];
    const porId = new Map(alunos.map((a) => [a.id, a]));

    return {
      capturas: capturasRaras.map((c) => ({
        matricula: c.user.matricula,
        name: c.user.name,
        professor: c.professor.name,
        capturedAt: c.capturedAt,
      })),
      porRaro,
      aUmAcerto: aUmAcerto
        .map((a) => ({
          name: porId.get(a.userId)?.name ?? '—',
          matricula: porId.get(a.userId)?.matricula ?? '—',
          theme: a.theme,
        }))
        .sort((a, b) => a.theme.localeCompare(b.theme)),
    };
  }

  /**
   * A raid do lendário: quem venceu, em que ordem, e como está o funil.
   *
   * `clears` é a razão de esta seção existir. O prêmio do evento vai para quem
   * capturou PRIMEIRO, e essa ordem precisa ser uma consulta, não uma
   * arqueologia de logs feita com a fila esperando — por isso `raid_clears`
   * tem linha por aluno, `clearedAt` do relógio do SERVIDOR e a matrícula
   * viaja junto: sem ela você tem um nome e mil alunos.
   *
   * Fica no painel e não no app (decisão 20): anunciar ao vivo que o primeiro
   * lugar já saiu tira o motivo de os outros tentarem.
   */
  async raid() {
    const lendario = await this.prisma.professor.findFirst({
      where: { legendary: true, active: true },
      orderBy: { id: 'asc' },
      select: { id: true, name: true, types: true },
    });

    // Estado vazio explícito: a seção abre sem lendário cadastrado, sem erro.
    if (!lendario) {
      return { lendario: null, clears: [], funil: null, desbloqueios: 0 };
    }

    const [clears, tentativas, vencedores, desbloqueios] = await Promise.all([
      this.prisma.raidClear.findMany({
        // Ordem de chegada, do primeiro para o último: é literalmente a fila
        // do prêmio, e o `take` existe porque premiar o 51º não é um plano.
        orderBy: { clearedAt: 'asc' },
        take: 50,
        select: {
          clearedAt: true,
          attempts: true,
          user: { select: { name: true, matricula: true } },
        },
      }),
      this.prisma.raidAttempt.count({
        // `anulada` fora da conta: restart e desistência na preparação não são
        // tentativas do aluno, e contá-las faria o funil culpar o jogador por
        // um deploy nosso.
        where: { result: { not: 'anulada' } },
      }),
      this.prisma.raidAttempt.count({ where: { result: 'vitoria' } }),
      this.prisma.raidUnlock.count(),
    ]);

    return {
      lendario: { name: lendario.name, types: lendario.types },
      clears: clears.map((c, i) => ({
        posicao: i + 1,
        name: c.user.name,
        matricula: c.user.matricula,
        clearedAt: c.clearedAt,
        attempts: c.attempts,
      })),
      // A taxa é o número que decide se o 4× ficou justo — e é o que você
      // olha na primeira hora, enquanto `raid.hp_multiplier` ainda dá para
      // mexer sem deploy.
      funil: {
        desbloqueios,
        tentativas,
        vitorias: vencedores,
        taxa: tentativas ? Math.round((vencedores / tentativas) * 100) : null,
      },
      desbloqueios,
    };
  }

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

  /**
   * Alunos distintos que USARAM o app na janela — sessão aberta **ou** evento
   * gerado.
   *
   * O `UNION` não é preciosismo: o aluno da bancada responde no tablet do
   * OPERADOR, e o `quiz_answered` dele nasce com `sessionId: null`. Se o app no
   * bolso dele não estava em primeiro plano — e a varredura encerra a sessão
   * após 3 min, que é menos que a fila —, ele não tinha nenhuma linha em
   * `user_sessions` e sumia do DAU. Era a bancada inteira faltando no número
   * que a coordenação lê.
   */
  private async distinctSessionUsers(since: Date): Promise<number> {
    const rows = await this.prisma.$queryRaw<{ total: number }[]>`
      SELECT COUNT(*)::int AS total
      FROM (
        SELECT user_id FROM user_sessions WHERE started_at >= ${since}
        UNION
        SELECT user_id FROM app_events WHERE occurred_at >= ${since}
      ) AS usuarios
    `;
    return rows[0]?.total ?? 0;
  }

  /**
   * Os mesmos alunos distintos, mas dentro das janelas FECHADAS do relatório.
   *
   * Separado de `distinctSessionUsers` porque a pergunta é outra: ali é "desde
   * quando" (o `overview` conta até agora e não tem teto), aqui é "nestes
   * turnos" — uma lista de faixas, cada uma recortada nos dois extremos.
   *
   * `UNION` (não `UNION ALL`) é o que faz o DISTINTO: no consolidado da semana
   * quem veio quarta e quinta aparece nas duas janelas e precisa contar UMA vez.
   * É também por isso que este número é menor que a soma dos sete relatórios
   * diários — a única coisa no consolidado que não fecha por soma, e o rodapé do
   * PDF avisa.
   *
   * SQL montado com `Prisma.sql`/`Prisma.join` porque o número de faixas varia
   * (uma no dia, sete na semana); os instantes continuam indo como PARÂMETROS,
   * nunca interpolados no texto.
   */
  private async distinctUsersEmJanelas(
    janelas: { de: Date; ate: Date }[],
  ): Promise<number> {
    const dentro = (coluna: Prisma.Sql) =>
      Prisma.join(
        janelas.map(
          (j) => Prisma.sql`(${coluna} >= ${j.de} AND ${coluna} < ${j.ate})`,
        ),
        ' OR ',
      );

    const rows = await this.prisma.$queryRaw<{ total: number }[]>(Prisma.sql`
      SELECT COUNT(*)::int AS total
      FROM (
        SELECT user_id FROM user_sessions
         WHERE ${dentro(Prisma.raw('started_at'))}
        UNION
        SELECT user_id FROM app_events
         WHERE ${dentro(Prisma.raw('occurred_at'))}
      ) AS usuarios
    `);
    return rows[0]?.total ?? 0;
  }
}
