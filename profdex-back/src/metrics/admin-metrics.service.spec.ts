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
    expect(r.porTema.find((t) => t.tema === 'logica')).toMatchObject({
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
