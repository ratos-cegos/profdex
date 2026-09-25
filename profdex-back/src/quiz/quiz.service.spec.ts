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
  /** O raro ATIVO do tema, quando o cenário tem um. */
  raro?: { id: string; name: string; types: string[] } | null;
  /** Acertos que o aluno já tem no tema, ANTES da resposta em teste. */
  acertosNoTema?: number;
  /** Temas que ele já destravou. */
  destravados?: string[];
  /** Ele já capturou o raro? */
  jaCapturou?: boolean;
}

function createSubject(options: SubjectOptions = {}) {
  const raro = options.raro ?? null;
  const destravados = new Set(options.destravados ?? []);
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
      create: jest.fn().mockResolvedValue({ id: 'tentativa-1' }),
      // A contagem do gate do raro inclui a tentativa recém-gravada, porque no
      // serviço ela roda DEPOIS do create.
      count: jest.fn().mockResolvedValue(options.acertosNoTema ?? 0),
      groupBy: jest.fn().mockResolvedValue([]),
    },
    professor: {
      findMany: jest.fn().mockResolvedValue([
        // Os tipos vêm do BANCO desde a tarefa 13 — não há mais tabela por
        // slug no código para o serviço consultar.
        { id: 'p-1', name: 'Marcos', slug: 'marcos', types: ['banco'] },
      ]),
      findFirst: jest.fn().mockResolvedValue(raro),
    },
    rareUnlock: {
      // Grava no `destravados` como o banco gravaria: o `findMany` logo abaixo
      // (a conferência do gate) precisa enxergar o tema que acabou de entrar.
      // `count: 0` é o que o `skipDuplicates` devolve quando a linha já existia.
      createMany: jest
        .fn()
        .mockImplementation(({ data }: { data: { theme: string } }) => {
          if (destravados.has(data.theme)) return Promise.resolve({ count: 0 });
          destravados.add(data.theme);
          return Promise.resolve({ count: 1 });
        }),
      findMany: jest
        .fn()
        .mockImplementation(
          ({ where }: { where: { theme?: { in: string[] } } }) =>
            Promise.resolve(
              (where.theme?.in ?? [...destravados])
                .filter((t) => destravados.has(t))
                .map((theme) => ({ theme })),
            ),
        ),
    },
    capture: {
      findFirst: jest
        .fn()
        .mockResolvedValue(options.jaCapturou ? { id: 'cap-1' } : null),
      findMany: jest
        .fn()
        .mockResolvedValue(
          options.jaCapturou && raro ? [{ professorId: raro.id }] : [],
        ),
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

    // O Marcos é de Banco de Dados na linha dele — é para ele que o aluno vai.
    expect(resultado.professores).toEqual([{ name: 'Marcos', slug: 'marcos' }]);
  });
});

/**
 * Professor raro (tarefa 15).
 *
 * O segredo desta suíte é **em que tema existe raro**. O aluno só pode
 * descobrir isso no instante em que destrava, ganhando — a bancada fica virada
 * para ele, e a fila inteira lê a tela junto.
 */
describe('QuizService — professor raro', () => {
  const ERON = { id: 'raro-1', name: 'Eron', types: ['banco'] };
  const ERON_DUPLO = { id: 'raro-2', name: 'Eron', types: ['banco', 'ia'] };

  /** Abre uma questão e acerta. `acertosNoTema` já conta esta resposta. */
  async function acertar(service: QuizService) {
    const aberta = await service.start('202312345', 'banco');
    const correta = aberta.question.options.indexOf('SELECT');
    return service.answer('admin-1', aberta.sessionId, correta);
  }

  async function errar(service: QuizService) {
    const aberta = await service.start('202312345', 'banco');
    const errada = aberta.question.options.indexOf('INSERT');
    return service.answer('admin-1', aberta.sessionId, errada);
  }

  it('4 acertos não destravam nada e a resposta não menciona raro', async () => {
    const { prisma, service } = createSubject({ raro: ERON, acertosNoTema: 4 });

    const resultado = await acertar(service);

    expect(prisma.rareUnlock.createMany).not.toHaveBeenCalled();
    expect(resultado.raro).toBeNull();
    expect(JSON.stringify(resultado)).not.toContain('Eron');
  });

  it('o 5º acerto destrava o tema e libera o raro mono-tema', async () => {
    const { metrics, prisma, service } = createSubject({
      raro: ERON,
      acertosNoTema: 5,
    });

    const resultado = await acertar(service);

    expect(prisma.rareUnlock.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: 'aluno-1', theme: 'banco' }),
        skipDuplicates: true,
      }),
    );
    expect(resultado.raro).toEqual({
      liberado: { name: 'Eron', temas: ['banco'] },
    });
    expect(metrics.record).toHaveBeenCalledWith(
      'aluno-1',
      null,
      expect.arrayContaining([
        expect.objectContaining({ type: 'rare_unlocked' }),
      ]),
    );
  });

  /**
   * O destravamento é do TEMA, não do raro: um tema sem raro cadastrado grava a
   * linha do mesmo jeito. É o que permite trocar o raro de um tema durante o
   * evento sem invalidar quem já fez os 5 acertos.
   */
  it('tema sem raro cadastrado grava o unlock e não devolve nada', async () => {
    const { prisma, service } = createSubject({ raro: null, acertosNoTema: 5 });

    const resultado = await acertar(service);

    expect(prisma.rareUnlock.createMany).toHaveBeenCalled();
    expect(resultado.raro).toBeNull();
  });

  /**
   * Decisão 15, o teste mais importante desta suíte: com raro de dois temas, o
   * 5º acerto do PRIMEIRO tema não pode dizer absolutamente nada. Se dissesse,
   * a fila descobriria que Banco tem raro — e quem está atrás não precisou
   * acertar nada para saber disso.
   */
  it('raro de 2 temas: fechar o primeiro tema não menciona raro nenhum', async () => {
    const { prisma, service } = createSubject({
      raro: ERON_DUPLO,
      acertosNoTema: 5,
      destravados: [],
    });

    const resultado = await acertar(service);

    // O unlock de "banco" é gravado…
    expect(prisma.rareUnlock.createMany).toHaveBeenCalled();
    // …mas a tela não sabe de nada: falta "ia".
    expect(resultado.raro).toBeNull();
    expect(JSON.stringify(resultado)).not.toContain('Eron');
  });

  it('raro de 2 temas: só o 5º acerto do SEGUNDO tema libera', async () => {
    const { service } = createSubject({
      raro: ERON_DUPLO,
      acertosNoTema: 5,
      destravados: ['ia'],
    });

    const resultado = await acertar(service);

    expect(resultado.raro).toEqual({
      liberado: { name: 'Eron', temas: ['banco', 'ia'] },
    });
  });

  /**
   * Do 6º acerto em diante a ficha continua devendo, e a tarja é o que impede
   * que quem destravou às 10h e voltou às 15h dependa da memória do operador.
   */
  it('do 6º acerto em diante vira pendência, não cena nova', async () => {
    const { service } = createSubject({
      raro: ERON,
      acertosNoTema: 6,
      destravados: ['banco'],
    });

    const resultado = await acertar(service);

    expect(resultado.raro).toEqual({
      pendente: { name: 'Eron', temas: ['banco'] },
    });
  });

  it('depois de capturar, a bancada não menciona mais o raro', async () => {
    const { service } = createSubject({
      raro: ERON,
      acertosNoTema: 9,
      destravados: ['banco'],
      jaCapturou: true,
    });

    expect((await acertar(service)).raro).toBeNull();
  });

  /** Errar não destrava — mas a ficha que já é devida continua sendo devida. */
  it('errar não conta para o gate e mantém a pendência visível', async () => {
    const { prisma, service } = createSubject({
      raro: ERON,
      acertosNoTema: 5,
      destravados: ['banco'],
    });

    const resultado = await errar(service);

    expect(prisma.quizAttempt.count).not.toHaveBeenCalled();
    expect(prisma.rareUnlock.createMany).not.toHaveBeenCalled();
    expect(resultado.raro).toEqual({
      pendente: { name: 'Eron', temas: ['banco'] },
    });
  });

  /**
   * Antivazamento. `PROFESSOR_DO_TEMA_SELECT` alimenta as DUAS telas viradas
   * para o aluno; sem o filtro, o nome do raro sairia na lista "vá capturar X"
   * e na escolha de tema, entregando o tema do raro de graça.
   */
  it('themes() e answer() nunca listam professor raro', async () => {
    const { prisma, service } = createSubject({ raro: ERON });

    await service.themes();
    await errar(service);

    expect(prisma.professor.findMany).toHaveBeenCalled();
    for (const [arg] of prisma.professor.findMany.mock.calls) {
      expect(arg.where).toMatchObject({ active: true, rare: false });
    }
  });

  /**
   * O treino não grava `quiz_attempts`, então não pode aproximar ninguém do
   * raro. É a primeira coisa que alguém vai tentar.
   */
  it('o quiz de TREINO não conta para o gate', async () => {
    const { prisma, service } = createSubject({ raro: ERON, acertosNoTema: 5 });

    await acertar(service);

    // A contagem do gate lê quiz_attempts, e só ela.
    expect(prisma.quizAttempt.count).toHaveBeenCalledWith({
      where: {
        userId: 'aluno-1',
        theme: 'banco',
        correct: true,
        annulled: false,
      },
    });
    expect(prisma.trainingQuestion.findMany).not.toHaveBeenCalled();
  });

  it('o cartão do aluno mostra a ficha rara pendente antes da rodada', async () => {
    const { prisma, service } = createSubject({
      raro: ERON,
      destravados: ['banco'],
    });
    prisma.professor.findMany.mockResolvedValue([ERON]);

    const cartao = await service.aluno('202312345');

    expect(cartao.raroPendentes).toEqual([{ name: 'Eron', temas: ['banco'] }]);
  });

  it('sem o gate fechado, o cartão do aluno não cita raro', async () => {
    const { prisma, service } = createSubject({
      raro: ERON_DUPLO,
      destravados: ['banco'], // falta "ia"
    });
    prisma.professor.findMany.mockResolvedValue([ERON_DUPLO]);

    const cartao = await service.aluno('202312345');

    expect(cartao.raroPendentes).toEqual([]);
  });
});
