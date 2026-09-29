import { PrismaService } from '../prisma/prisma.service';
import { AdminMetricsService } from './admin-metrics.service';

function createSubject(rows: { metric: string; value: number }[]) {
  const prisma = {
    metricHourly: { findMany: jest.fn().mockResolvedValue(rows) },
    quizAttempt: { count: jest.fn(), findMany: jest.fn(), groupBy: jest.fn() },
    capture: { count: jest.fn(), findMany: jest.fn() },
    appEvent: { count: jest.fn(), findMany: jest.fn(), groupBy: jest.fn() },
  };
  const service = new AdminMetricsService(prisma as unknown as PrismaService);
  return { prisma, service };
}

/**
 * O relatório de 24h — o que vira PDF. As asserções aqui são sobre a FONTE de
 * cada número, não sobre o layout: é a fonte errada que produziu os dois bugs
 * que este relatório existe para não repetir.
 */
describe('AdminMetricsService.report24h', () => {
  function criar(linhas: { metric: string; value: number }[] = []) {
    const bucket = new Date();
    bucket.setMinutes(0, 0, 0);
    const prisma = {
      metricHourly: {
        findMany: jest
          .fn()
          .mockResolvedValue(linhas.map((l) => ({ ...l, bucket }))),
      },
      battle: { count: jest.fn().mockResolvedValue(88) },
      raidAttempt: { count: jest.fn().mockResolvedValue(9) },
      $queryRaw: jest.fn().mockResolvedValue([]),
    };
    const service = new AdminMetricsService(prisma as unknown as PrismaService);
    return { prisma, service };
  }

  /**
   * `battle_finished` é gravado uma vez POR JOGADOR. Contar o evento mostrava o
   * dobro das batalhas — e esse número ia impresso para a coordenação.
   */
  it('conta batalhas na tabela `battles`, não no evento (que vem dobrado)', async () => {
    const { prisma, service } = criar([
      { metric: 'event_battle_finished', value: 176 },
    ]);

    const relatorio = await service.report24h();

    expect(relatorio.batalhas.total).toBe(88);
    expect(prisma.battle.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'finished' }),
      }),
    );
    // A série horária vem do evento e por isso é dividida por 2.
    expect(relatorio.batalhas.porHora).toContain(88);
  });

  it('separa respondidas de acertadas e calcula a taxa da bancada', async () => {
    const { service } = criar([
      { metric: 'event_quiz_answered', value: 200 },
      { metric: 'event_quiz_answered', value: 120 },
      { metric: 'event_quiz_correct', value: 210 },
    ]);

    const { quiz } = await service.report24h();

    expect(quiz.respondidas).toBe(320);
    expect(quiz.acertadas).toBe(210);
    expect(quiz.taxa).toBe(65.6);
  });

  /** Sem bancada nenhuma, `0/0` viraria `NaN` no meio do PDF. */
  it('não inventa taxa de acerto quando ninguém respondeu', async () => {
    const { service } = criar();

    await expect(service.report24h()).resolves.toMatchObject({
      quiz: { respondidas: 0, acertadas: 0, taxa: 0 },
    });
  });

  it('devolve as 24 horas da janela, inclusive as vazias', async () => {
    const { service } = criar();

    const relatorio = await service.report24h();

    expect(relatorio.horas).toHaveLength(24);
    expect(relatorio.interacoes.porHora).toHaveLength(24);
    expect(relatorio.usuarios.porHora).toHaveLength(24);
  });

  /** O turno é derivado das interações pelo mesmo peso que o rollup usou. */
  it('reconstrói a contagem de turnos a partir das interações de turno', async () => {
    const { service } = criar([{ metric: 'interactions_turns', value: 3100 }]);

    const relatorio = await service.report24h();

    expect(relatorio.batalhas.turnos).toBe(3100);
    expect(relatorio.interacoes.deTurnos).toBe(3100);
  });
});

describe('AdminMetricsService.practiceQuiz', () => {
  it('reads only the pre-aggregated table — never the raw audit trail', async () => {
    const { prisma, service } = createSubject([]);

    await service.practiceQuiz();

    expect(prisma.metricHourly.findMany).toHaveBeenCalledTimes(1);
    // O painel não pode varrer app_events (regra documentada no schema)...
    expect(prisma.appEvent.findMany).not.toHaveBeenCalled();
    expect(prisma.appEvent.groupBy).not.toHaveBeenCalled();
    // ...nem encostar nas tabelas da competição oficial.
    expect(prisma.quizAttempt.count).not.toHaveBeenCalled();
    expect(prisma.quizAttempt.findMany).not.toHaveBeenCalled();
    expect(prisma.quizAttempt.groupBy).not.toHaveBeenCalled();
    expect(prisma.capture.count).not.toHaveBeenCalled();
  });

  it('sums the hourly buckets of a theme into one total', async () => {
    const { service } = createSubject([
      { metric: 'practice_answered_banco', value: 4 },
      { metric: 'practice_answered_banco', value: 6 },
      { metric: 'practice_correct_banco', value: 3 },
      { metric: 'practice_correct_banco', value: 2 },
    ]);

    const r = await service.practiceQuiz();
    const banco = r.porTema.find((t) => t.tema === 'banco');

    expect(banco).toMatchObject({ respostas: 10, acertos: 5, taxa: 50 });
    expect(r.total).toBe(10);
    expect(r.taxa).toBe(50);
  });

  it('always returns all nine themes, so a zero is visible as a zero', async () => {
    const { service } = createSubject([
      { metric: 'practice_answered_redes', value: 1 },
    ]);

    const r = await service.practiceQuiz();

    expect(r.porTema).toHaveLength(9);
    // Sem resposta nenhuma a taxa é null, não 0% — que significaria "erraram
    // todas" e é uma leitura completamente diferente.
    expect(r.porTema.find((t) => t.tema === 'humanas')).toMatchObject({
      respostas: 0,
      taxa: null,
    });
  });

  it('reports no accuracy at all when nothing was practised', async () => {
    const { service } = createSubject([]);

    const r = await service.practiceQuiz();

    expect(r.total).toBe(0);
    expect(r.taxa).toBeNull();
  });

  it('clamps the window so a huge `days` cannot widen the scan', async () => {
    const { service } = createSubject([]);

    expect((await service.practiceQuiz(9999)).dias).toBe(30);
    expect((await service.practiceQuiz(0)).dias).toBe(1);
  });
});
