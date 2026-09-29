import { HttpStatus, NotFoundException } from '@nestjs/common';
import { typeKeyOf } from '../battle/engine/types';
import { MetricsService } from '../metrics/metrics.service';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
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

/** Quem a bancada encontra por matrícula. Ana é a de sempre; Bruno é a fila. */
const ALUNOS: Record<
  string,
  { id: string; name: string; matricula: string } | undefined
> = {
  '202312345': { id: 'aluno-1', name: 'Ana', matricula: '202312345' },
  '202399999': { id: 'aluno-2', name: 'Bruno', matricula: '202399999' },
};

interface SubjectOptions {
  questions?: ReturnType<typeof questao>[];
  /** RNG fixo: sem ele o sorteio não é observável em teste. */
  rng?: () => number;
  /** Cooldown de tema configurado, quando o teste quiser outro valor. */
  cooldownMs?: number;
  /** Janela sem repetir na fila (K). 0 desliga e reproduz o comportamento antigo. */
  janelaGlobal?: number;
  /** O raro ATIVO do tema, quando o cenário tem um. */
  raro?: { id: string; name: string; types: string[] } | null;
  /** Acertos que o aluno já tem no tema, ANTES da resposta em teste. */
  acertosNoTema?: number;
  /** Temas que ele já destravou. */
  destravados?: string[];
  /** Ele já capturou o raro? */
  jaCapturou?: boolean;
  /** Entrega do QR: papel da pilha (padrão) ou QR gerado na tela. */
  modoQr?: 'ficha' | 'tela';
}

function createSubject(options: SubjectOptions = {}) {
  // `resolverRaro` lê também a arte (para a revelação 3D) e as variantes (para
  // a ficha rara de tela). Os testes descrevem só id/nome/tipos, e o resto vem
  // do padrão — um raro tem exatamente uma variante, a completa.
  const raro = options.raro
    ? {
        modelUrl: null,
        spriteFrontUrl: null,
        pixelArt: false,
        variants: [
          {
            id: `variante-${options.raro.id}`,
            typeKey: typeKeyOf(options.raro.types),
          },
        ],
        ...options.raro,
      }
    : null;
  const destravados = new Set(options.destravados ?? []);
  const prisma: Record<string, any> = {
    user: {
      // Resolve pela matrícula digitada, e não um aluno fixo: a janela sem
      // repetir na fila só é observável com DOIS alunos na bancada.
      findUnique: jest.fn(({ where }: { where: { matricula: string } }) =>
        Promise.resolve(ALUNOS[where.matricula] ?? null),
      ),
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
    // Ficha de tela (tarefa 17.6). No modo `ficha`, que é o padrão, nada aqui
    // é tocado — é exatamente essa a garantia que os testes cobram.
    captureToken: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      create: jest.fn().mockResolvedValue({ id: 'ficha-1' }),
      findUnique: jest.fn().mockResolvedValue(null),
    },
    qrBatch: { upsert: jest.fn().mockResolvedValue({}) },
  };
  // Transação interativa: o callback recebe o próprio mock, então `tx.x` e
  // `prisma.x` são o mesmo espião e as asserções continuam valendo.
  prisma.$transaction = jest.fn((fn: (tx: unknown) => unknown) => fn(prisma));
  const metrics = { record: jest.fn() };
  // O cooldown de tema é configurável no painel. Os testes usam o padrão de
  // 10min, que é o que `THEME_COOLDOWN_MS` valia quando era constante.
  const settings = {
    themeCooldownMs: jest
      .fn()
      .mockResolvedValue(options.cooldownMs ?? THEME_COOLDOWN_MS),
    // A janela sem repetir na fila também sai do painel. O padrão do catálogo
    // é 10; os testes do sorteio pessoal ficam com 0 quando precisam do
    // comportamento anterior isolado.
    get: jest.fn((name: string) =>
      Promise.resolve(
        name === 'quizGlobalRepeatWindow' ? (options.janelaGlobal ?? 10) : 0,
      ),
    ),
    // `ficha` é o padrão do catálogo e o comportamento histórico: no modo
    // `ficha` nenhuma tela e nenhuma rota mudam.
    captureQrMode: jest.fn().mockResolvedValue(options.modoQr ?? 'ficha'),
  };
  const service = new QuizService(
    prisma as unknown as PrismaService,
    metrics as unknown as MetricsService,
    settings as unknown as SettingsService,
    options.rng ?? Math.random,
  );
  return { metrics, prisma, settings, service };
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

  // O "não encontrada" é o sintoma que o operador vê quando o cadastro gravou
  // outra coisa. A mensagem precisa mandá-lo para onde está a resposta.
  it('manda o operador conferir a matrícula no Perfil do aluno', async () => {
    const { prisma, service } = createSubject();
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(service.aluno('202300000')).rejects.toThrow(/Perfil/);
  });

  it('acha a conta canônica mesmo digitada com pontuação', async () => {
    const { service } = createSubject();

    await expect(
      service.start(' 2023.123-45 ', 'banco'),
    ).resolves.toMatchObject({
      aluno: { id: 'aluno-1', matricula: '202312345' },
    });
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

  /**
   * A bancada não promete NOME nenhum. Quem o aluno leva é sorteado no scan,
   * a partir do que ele já tem (capture-lottery.ts) — anunciar um nome aqui
   * seria promessa que a captura não tem como cumprir. De quebra, some a
   * superfície que obrigava a filtrar professor raro em duas telas viradas
   * para o aluno.
   */
  it('não devolve professor nenhum, nem no acerto', async () => {
    const { prisma, service } = createSubject();
    const aberta = await service.start('202312345', 'banco');

    const resultado = await service.answer('admin-1', aberta.sessionId, 0);
    const temas = await service.themes();

    expect(resultado).not.toHaveProperty('professores');
    expect(temas.every((t) => !('professores' in t))).toBe(true);
    // Nenhuma das duas rotas sequer consulta a tabela de professores.
    expect(prisma.professor.findMany).not.toHaveBeenCalled();
    expect(JSON.stringify({ resultado, temas })).not.toContain('Marcos');
  });
});

/**
 * A questão não repete na fila (tarefa 17.1).
 *
 * A bancada é UMA e a fila assiste: quem está atrás lê o enunciado e as
 * alternativas de quem está respondendo. O filtro por aluno não alcança isso.
 *
 * O que estas provas guardam é a hierarquia entre os dois filtros: **o pessoal
 * é regra e o global é preferência**. Inverter é invisível em teste feliz e só
 * aparece com o banco quase esgotado, no fim do dia de evento.
 */
describe('QuizService — janela sem repetir na fila', () => {
  /** As últimas K aplicações do tema, sem filtro de aluno. */
  const naFila = (
    prisma: ReturnType<typeof createSubject>['prisma'],
    ids: string[],
  ) =>
    prisma.quizAttempt.findMany.mockResolvedValue(
      ids.map((questionId) => ({ questionId })),
    );

  it('o próximo da fila não recebe a questão que acabou de ser lida', async () => {
    const { prisma, service } = createSubject({
      questions: [questao('q-1'), questao('q-2')],
      rng: () => 0,
    });
    naFila(prisma, ['q-1']);

    // Bruno nunca respondeu nada: para ELE as duas são inéditas, e sem a
    // janela global o RNG em 0 devolveria a q-1 que a fila acabou de ver.
    const aberta = await service.start('202399999', 'banco');

    expect(sorteada(aberta)).toBe('Enunciado q-2');
  });

  it('o filtro pessoal vence o global quando os dois brigam', async () => {
    const { prisma, service } = createSubject({
      questions: [questao('q-1'), questao('q-2')],
      rng: () => 0,
    });
    // Ana já respondeu a q-2; a única inédita para ela é justamente a que a
    // fila acabou de ver. Eliminar pelo global zeraria o pool e devolveria a
    // q-2 — o inverso do que a regra pede.
    prisma.quizAttempt.groupBy.mockResolvedValue([
      vista('q-2', new Date('2026-09-26T10:00:00Z')),
    ]);
    naFila(prisma, ['q-1']);

    const aberta = await service.start('202312345', 'banco');

    expect(sorteada(aberta)).toBe('Enunciado q-1');
  });

  it('tema com menos questões que a janela não trava a bancada', async () => {
    const { prisma, service } = createSubject({
      questions: [questao('q-1'), questao('q-2')],
      rng: () => 0,
      janelaGlobal: 10,
    });
    // Com TODAS as questões ativas dentro da janela, o sorteio cai no passo 2
    // e a tentativa acontece do mesmo jeito.
    naFila(prisma, ['q-1', 'q-2']);

    await expect(service.start('202399999', 'banco')).resolves.toMatchObject({
      question: { prompt: 'Enunciado q-1' },
    });
  });

  it('K = 0 reproduz exatamente o comportamento anterior', async () => {
    const { prisma, service } = createSubject({
      questions: [questao('q-1'), questao('q-2')],
      rng: () => 0,
      janelaGlobal: 0,
    });
    naFila(prisma, ['q-1']);

    const aberta = await service.start('202399999', 'banco');

    // Sem janela a q-1 volta a ser sorteável — e o servidor nem vai ao banco
    // buscar as últimas aplicações, que é o interruptor de emergência.
    expect(sorteada(aberta)).toBe('Enunciado q-1');
    expect(prisma.quizAttempt.findMany).not.toHaveBeenCalled();
  });

  it('questão aberta e abandonada não sai para o próximo da fila (fila)', async () => {
    // A tentativa só é gravada em `answer`: uma questão lida em voz alta e
    // abandonada não deixa rastro em `quiz_attempts`, mas a fila já a viu.
    const { service } = createSubject({
      questions: [questao('q-1'), questao('q-2')],
      rng: () => 0,
    });

    const daAna = await service.start('202312345', 'banco');
    await service.start('202312345', 'banco'); // recomeçou: a q-1 é abandonada
    const doBruno = await service.start('202399999', 'banco');

    expect(sorteada(daAna)).toBe('Enunciado q-1');
    expect(sorteada(doBruno)).not.toBe('Enunciado q-1');
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
      liberado: expect.objectContaining({ name: 'Eron', temas: ['banco'] }),
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
      liberado: expect.objectContaining({
        name: 'Eron',
        temas: ['banco', 'ia'],
      }),
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
  /**
   * Antes isto era garantido por um filtro `rare: false` em duas consultas.
   * Agora a garantia é estrutural e mais forte: as telas viradas para o aluno
   * não listam professor NENHUM, então não há por onde o nome de um raro
   * escapar — nem por um filtro que alguém esqueça de repetir numa consulta
   * nova.
   */
  it('themes() e answer() não expõem professor nenhum, raro ou comum', async () => {
    const { prisma, service } = createSubject({ raro: ERON });

    const temas = await service.themes();
    const resultado = await errar(service);

    expect(prisma.professor.findMany).not.toHaveBeenCalled();
    expect(JSON.stringify({ temas, resultado })).not.toContain('Eron');
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

/**
 * O QR na tela (tarefa 17.6).
 *
 * No modo `tela` o acerto gera na hora uma ficha VINCULADA ao aluno. O que
 * estas provas guardam:
 *
 * - no modo `ficha` nada muda — nenhuma tela, nenhuma rota, nenhuma escrita;
 * - a ficha nasce na MESMA transação da tentativa;
 * - emitir uma nova mata a anterior do mesmo aluno;
 * - o token em texto puro nunca aparece num campo da resposta.
 */
describe('QuizService — QR na tela', () => {
  const ERON = { id: 'raro-1', name: 'Eron', types: ['banco'] };

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

  it('modo ficha: o acerto não emite nada e a resposta não tem QR', async () => {
    const { prisma, service } = createSubject({ modoQr: 'ficha' });

    const resultado = await acertar(service);

    expect(resultado.qr).toBeNull();
    expect(prisma.captureToken.create).not.toHaveBeenCalled();
    expect(prisma.qrBatch.upsert).not.toHaveBeenCalled();
  });

  it('modo tela: o acerto emite a ficha do tema vinculada ao aluno', async () => {
    const { prisma, service } = createSubject({ modoQr: 'tela' });

    const resultado = await acertar(service);

    expect(prisma.captureToken.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'banco',
          assignedToId: 'aluno-1',
        }),
      }),
    );
    expect(resultado.qr).toMatchObject({ id: 'ficha-1', raro: false });
  });

  /**
   * O erro não produz ficha, e o cooldown é a única consequência. Emitir aqui
   * seria captura de graça por responder qualquer coisa.
   */
  it('modo tela: errar não emite ficha nenhuma', async () => {
    const { prisma, service } = createSubject({ modoQr: 'tela' });

    const resultado = await errar(service);

    expect(resultado.qr).toBeNull();
    expect(prisma.captureToken.create).not.toHaveBeenCalled();
  });

  /**
   * "Um QR vivo por aluno" (decisão 19) — a mesma regra que `start` já aplica à
   * sessão da questão. Sem ela, o tablet que recarregou deixaria dois QRs
   * válidos na mão de quem acertou uma vez.
   */
  it('modo tela: emitir um QR mata o anterior não resgatado do aluno', async () => {
    const { prisma, service } = createSubject({ modoQr: 'tela' });

    await acertar(service);

    expect(prisma.captureToken.deleteMany).toHaveBeenCalledWith({
      where: { assignedToId: 'aluno-1', redeemedAt: null },
    });
    // A morte vem ANTES da emissão: invertido, o delete levaria junto o QR que
    // acabou de nascer.
    const ordemDelete =
      prisma.captureToken.deleteMany.mock.invocationCallOrder[0];
    const ordemCreate = prisma.captureToken.create.mock.invocationCallOrder[0];
    expect(ordemDelete).toBeLessThan(ordemCreate);
  });

  /**
   * Falha ao gravar a ficha não pode deixar tentativa registrada sem QR (o
   * aluno acertou e sai sem nada, com o cooldown correndo) nem QR sem
   * tentativa (ficha de graça, sem prova de acerto).
   */
  it('modo tela: a ficha nasce na mesma transação da tentativa', async () => {
    const { prisma, service } = createSubject({ modoQr: 'tela' });

    await acertar(service);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    const dentroDaTransacao = prisma.$transaction.mock.invocationCallOrder[0];
    expect(
      prisma.quizAttempt.create.mock.invocationCallOrder[0],
    ).toBeGreaterThan(dentroDaTransacao);
    expect(
      prisma.captureToken.create.mock.invocationCallOrder[0],
    ).toBeGreaterThan(dentroDaTransacao);
  });

  /**
   * A ficha rara aponta a VARIANTE e não passa pelo sorteio — por isso ela pode
   * sair no mesmo acerto que fecha o gate, sem abrir reroll.
   */
  it('gate do raro fechado: a ficha é a rara, e não a do tema', async () => {
    const { prisma, service } = createSubject({
      modoQr: 'tela',
      raro: ERON,
      acertosNoTema: 5,
    });

    const resultado = await acertar(service);

    const { data } = prisma.captureToken.create.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(data).toMatchObject({
      variantId: 'variante-raro-1',
      assignedToId: 'aluno-1',
    });
    expect(data.type).toBeUndefined();
    expect(resultado.qr?.raro).toBe(true);
  });

  /** A tiragem sintética do dia, para o estoque de /admin/fichas não mudar sozinho. */
  it('modo tela: a emissão cria/atualiza a tiragem do dia da bancada', async () => {
    const { prisma, service } = createSubject({ modoQr: 'tela' });

    await acertar(service);

    const chamada = prisma.qrBatch.upsert.mock.calls[0][0] as {
      where: { batch: string };
      create: { source: string };
      update: unknown;
    };
    expect(chamada.where.batch).toMatch(/^bancada-\d{4}-\d{2}-\d{2}$/);
    expect(chamada.create.source).toBe('bancada');
    expect(chamada.update).toEqual({ total: { increment: 1 } });
  });

  /**
   * O token é ficha em texto puro. Ele só existe dentro da imagem do QR — nunca
   * num campo próprio da resposta, e nunca no log.
   */
  it('o token em texto puro não atravessa a resposta', async () => {
    const { prisma, service } = createSubject({ modoQr: 'tela' });

    const resultado = await acertar(service);

    const { data } = prisma.captureToken.create.mock.calls[0][0] as {
      data: { tokenHash: string };
    };
    expect(Object.keys(resultado.qr ?? {}).sort()).toEqual([
      'dataUrl',
      'id',
      'raro',
    ]);
    // O que vai ao banco é só o hash — o mesmo contrato das fichas de papel.
    expect(data.tokenHash).toHaveLength(64);
  });
});
