import { HttpStatus, NotFoundException } from '@nestjs/common';
import { MetricsService } from '../metrics/metrics.service';
import { PrismaService } from '../prisma/prisma.service';
import { ANSWER_WINDOW_MS, THEME_COOLDOWN_MS } from './quiz.constants';
import { QuizService } from './quiz.service';

const QUESTION = {
  id: 'q-1',
  code: '4821',
  theme: 'banco',
  difficulty: 'facil',
  prompt: 'Qual comando SQL consulta dados?',
  options: ['INSERT', 'SELECT', 'UPDATE', 'CREATE'],
  answer: 1,
};

/** Questão de banco só com o que o sorteio olha. */
function questao(id: string, difficulty = 'facil') {
  return {
    id,
    code: id.replace(/\D/g, '').padStart(4, '1'),
    theme: 'banco',
    difficulty,
    prompt: `Enunciado ${id}`,
    options: ['a', 'b', 'c', 'd'],
    answer: 0,
  };
}

/** Linha do `groupBy` de tentativas: questão vista, e quando pela última vez. */
function vista(questionId: string, quando: Date) {
  return { questionId, _max: { createdAt: quando } };
}

interface SubjectOptions {
  questions?: ReturnType<typeof questao>[];
  /** RNG fixo: sem ele o sorteio não é observável em teste. */
  rng?: () => number;
}

function createSubject(options: SubjectOptions = {}) {
  const prisma = {
    user: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'aluno-1',
        name: 'Ana',
        matricula: '202312345',
      }),
    },
    quizQuestion: {
      findMany: jest.fn().mockResolvedValue(options.questions ?? [QUESTION]),
      groupBy: jest.fn().mockResolvedValue([]),
    },
    // Espelho do mock do treino: se a bancada algum dia ler daqui, o aluno que
    // treinou reconhece a pergunta e o efeito é o mesmo de vazar o gabarito.
    trainingQuestion: {
      findMany: jest.fn().mockResolvedValue([]),
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
    options.rng ?? Math.random,
  );
  return { metrics, prisma, service };
}

/** Enunciado da questão sorteada — é o que a bancada devolve, e o id não sai. */
const sorteada = (aberta: { question: { prompt: string } }) =>
  aberta.question.prompt;

describe('QuizService', () => {
  it('nunca sorteia questão do banco de treino', async () => {
    // O treino é livre e sem supervisão: se a bancada puder cair numa questão
    // de treino, o aluno que praticou já viu a pergunta e a resposta.
    const { prisma, service } = createSubject();

    await service.start('202312345', 'banco');

    expect(prisma.trainingQuestion.findMany).not.toHaveBeenCalled();
    expect(prisma.quizQuestion.findMany).toHaveBeenCalled();
  });

  it('never sends the answer key with the question', async () => {
    const { service } = createSubject();

    const aberta = await service.start('202312345', 'banco');

    expect(aberta.question.options).toHaveLength(4);
    expect(JSON.stringify(aberta.question)).not.toContain('answer');
    expect(aberta.question).not.toHaveProperty('correctIndex');
  });

  it('mostra o código de 4 dígitos na questão e no resultado', async () => {
    // É por ele que o aluno contesta a questão — e ele descobre que discorda
    // depois de ver o gabarito, então precisa aparecer nos dois momentos.
    const { service } = createSubject();

    const aberta = await service.start('202312345', 'banco');
    const resultado = await service.answer('admin-1', aberta.sessionId, 0);

    expect(aberta.question.code).toBe('4821');
    expect(resultado.code).toBe('4821');
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

  it('nunca repete questão já respondida enquanto houver inédita', async () => {
    // O aluno passa o dia no estande: com 20 questões por tema e cooldown de
    // 10min, ver de novo uma que ele já respondeu é falha visível na fila.
    const questoes = [questao('q-1'), questao('q-2'), questao('q-3')];
    const respondidas = [
      vista('q-1', new Date('2026-09-04T10:00:00Z')),
      vista('q-2', new Date('2026-09-04T10:30:00Z')),
    ];

    // Os dois extremos do RNG: nenhum sorteio pode alcançar as respondidas.
    for (const rng of [() => 0, () => 0.999999]) {
      const { prisma, service } = createSubject({ questions: questoes, rng });
      prisma.quizAttempt.groupBy.mockResolvedValue(respondidas);

      const aberta = await service.start('202312345', 'banco');

      expect(sorteada(aberta)).toBe('Enunciado q-3');
    }
  });

  it('esgotado o banco, repete a mais antiga e nunca a recém-respondida', async () => {
    const questoes = [questao('q-1'), questao('q-2'), questao('q-3')];
    const { prisma, service } = createSubject({
      questions: questoes,
      rng: () => 0.5,
    });
    // Todas vistas: q-3 é a que ele acabou de responder, q-1 a mais antiga.
    prisma.quizAttempt.groupBy.mockResolvedValue([
      vista('q-1', new Date('2026-09-04T09:00:00Z')),
      vista('q-2', new Date('2026-09-04T09:40:00Z')),
      vista('q-3', new Date('2026-09-04T10:20:00Z')),
    ]);

    const aberta = await service.start('202312345', 'banco');

    expect(sorteada(aberta)).toBe('Enunciado q-1');
  });

  it('não devolve de novo a questão que o aluno abriu e abandonou', async () => {
    // A tentativa só é gravada em `answer`: sem contabilizar o descarte, o
    // aluno que desistiu (ou o tablet que travou) reencontra a mesma questão.
    const { service } = createSubject({
      questions: [questao('q-1'), questao('q-2')],
      rng: () => 0,
    });

    const primeira = await service.start('202312345', 'banco');
    const segunda = await service.start('202312345', 'banco');

    expect(sorteada(primeira)).toBe('Enunciado q-1');
    expect(sorteada(segunda)).toBe('Enunciado q-2');
  });

  it('sorteia a dificuldade pela proporção do seed, não pelo tamanho do pool', async () => {
    // Pool desbalanceado (1 fácil, 5 difíceis) — o que acontece com quem já
    // respondeu as fáceis do tema. Com 0.5 uniforme no pool sairia uma difícil;
    // pelos pesos 4/3, metade do intervalo ainda cai na fácil.
    const { service } = createSubject({
      questions: [
        questao('q-facil', 'facil'),
        questao('q-d1', 'dificil'),
        questao('q-d2', 'dificil'),
        questao('q-d3', 'dificil'),
        questao('q-d4', 'dificil'),
        questao('q-d5', 'dificil'),
      ],
      rng: () => 0.5,
    });

    const aberta = await service.start('202312345', 'banco');

    expect(sorteada(aberta)).toBe('Enunciado q-facil');
  });

  it('points the student to the professors of the theme', async () => {
    const { service } = createSubject();
    const aberta = await service.start('202312345', 'banco');

    const resultado = await service.answer('admin-1', aberta.sessionId, 0);

    // "marcos" é de banco na tabela de tipos — é para ele que o aluno vai.
    expect(resultado.professores).toEqual([{ name: 'Marcos', slug: 'marcos' }]);
  });
});
