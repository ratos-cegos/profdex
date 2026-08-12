import { HttpStatus, NotFoundException } from '@nestjs/common';
import { MetricsService } from '../metrics/metrics.service';
import { PrismaService } from '../prisma/prisma.service';
import { ANSWER_WINDOW_MS, THEME_COOLDOWN_MS } from './quiz.constants';
import { QuizService } from './quiz.service';

const QUESTION = {
  id: 'q-1',
  theme: 'banco',
  difficulty: 'facil',
  prompt: 'Qual comando SQL consulta dados?',
  options: ['INSERT', 'SELECT', 'UPDATE', 'CREATE'],
  answer: 1,
};

function createSubject() {
  const prisma = {
    user: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'aluno-1',
        name: 'Ana',
        matricula: '202312345',
      }),
    },
    quizQuestion: {
      findMany: jest.fn().mockResolvedValue([QUESTION]),
      groupBy: jest.fn().mockResolvedValue([]),
    },
    quizAttempt: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({}),
      count: jest.fn().mockResolvedValue(0),
      groupBy: jest.fn().mockResolvedValue([]),
    },
    professor: {
      findMany: jest
        .fn()
        .mockResolvedValue([{ id: 'p-1', name: 'Marcos', slug: 'marcos' }]),
    },
  };
  const metrics = { record: jest.fn() };
  const service = new QuizService(
    prisma as unknown as PrismaService,
    metrics as unknown as MetricsService,
  );
  return { metrics, prisma, service };
}

describe('QuizService', () => {
  it('never sends the answer key with the question', async () => {
    const { service } = createSubject();

    const aberta = await service.start('202312345', 'banco');

    expect(aberta.question.options).toHaveLength(4);
    expect(JSON.stringify(aberta.question)).not.toContain('answer');
    expect(aberta.question).not.toHaveProperty('correctIndex');
  });

  it('accepts the shuffled index of the right option', async () => {
    const { metrics, prisma, service } = createSubject();

    const aberta = await service.start('202312345', 'banco');
    const correta = aberta.question.options.indexOf('SELECT');

    const resultado = await service.answer(
      'admin-1',
      aberta.sessionId,
      correta,
    );

    expect(resultado.correct).toBe(true);
    expect(resultado.correctOption).toBe('SELECT');
    expect(prisma.quizAttempt.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'aluno-1',
          operatorId: 'admin-1',
          correct: true,
          theme: 'banco',
        }),
      }),
    );
    expect(metrics.record).toHaveBeenCalledWith('aluno-1', null, [
      expect.objectContaining({ type: 'quiz_answered' }),
      expect.objectContaining({ type: 'quiz_correct' }),
    ]);
  });

  it('rejects a second answer for the same question', async () => {
    const { service } = createSubject();
    const aberta = await service.start('202312345', 'banco');
    await service.answer('admin-1', aberta.sessionId, 0);

    await expect(
      service.answer('admin-1', aberta.sessionId, 1),
    ).rejects.toThrow(NotFoundException);
  });

  it('records a timed-out attempt as wrong, with no chosen option', async () => {
    const { prisma, service } = createSubject();
    const aberta = await service.start('202312345', 'banco');
    const correta = aberta.question.options.indexOf('SELECT');

    // O relógio que vale é o do servidor: adiantá-lo simula o tempo esgotado
    // mesmo com o tablet insistindo que respondeu a tempo.
    const depois = Date.now() + ANSWER_WINDOW_MS + 10_000;
    jest.spyOn(Date, 'now').mockReturnValue(depois);
    try {
      const resultado = await service.answer(
        'admin-1',
        aberta.sessionId,
        correta,
      );
      expect(resultado.expired).toBe(true);
      expect(resultado.correct).toBe(false);
    } finally {
      jest.spyOn(Date, 'now').mockRestore();
    }

    expect(prisma.quizAttempt.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ correct: false, answerIndex: null }),
      }),
    );
    // O tempo gravado não pode passar da janela, senão o relatório vira ficção.
    const { data } = prisma.quizAttempt.create.mock.calls[0][0] as {
      data: { elapsedMs: number };
    };
    expect(data.elapsedMs).toBeLessThanOrEqual(ANSWER_WINDOW_MS);
  });

  it('blocks a new attempt on the same theme during the cooldown', async () => {
    const { prisma, service } = createSubject();
    prisma.quizAttempt.findFirst.mockResolvedValue({
      createdAt: new Date(Date.now() - 60_000),
    });

    await expect(service.start('202312345', 'banco')).rejects.toMatchObject({
      status: HttpStatus.TOO_MANY_REQUESTS,
    });
    expect(prisma.quizQuestion.findMany).not.toHaveBeenCalled();
  });

  it('allows a new attempt once the cooldown has passed', async () => {
    const { prisma, service } = createSubject();
    prisma.quizAttempt.findFirst.mockResolvedValue({
      createdAt: new Date(Date.now() - THEME_COOLDOWN_MS - 1_000),
    });

    await expect(service.start('202312345', 'banco')).resolves.toMatchObject({
      question: { theme: 'banco' },
    });
  });

  it('refuses an unknown matricula instead of creating anything', async () => {
    const { prisma, service } = createSubject();
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(service.start('000', 'banco')).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.quizAttempt.create).not.toHaveBeenCalled();
  });

  it('points the student to the professors of the theme', async () => {
    const { service } = createSubject();
    const aberta = await service.start('202312345', 'banco');

    const resultado = await service.answer('admin-1', aberta.sessionId, 0);

    // "marcos" é de banco na tabela de tipos — é para ele que o aluno vai.
    expect(resultado.professores).toEqual([{ name: 'Marcos', slug: 'marcos' }]);
  });
});
