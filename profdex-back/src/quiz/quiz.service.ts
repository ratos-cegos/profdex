import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { typesForProfessor } from '../battle/engine/professor-types';
import { MetricsService } from '../metrics/metrics.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  ANSWER_GRACE_MS,
  ANSWER_WINDOW_MS,
  QUIZ_DIFFICULTY_MIX,
  QUIZ_RNG,
  QUIZ_THEMES,
  REPEAT_OLDEST_FRACTION,
  THEME_COOLDOWN_MS,
  type QuizDifficulty,
  type RandomSource,
} from './quiz.constants';

/** Uma questão em andamento na bancada. Vive só em memória. */
interface QuizSession {
  id: string;
  userId: string;
  questionId: string;
  /** Código de 4 dígitos — é por ele que o aluno contesta a questão. */
  code: string;
  theme: string;
  difficulty: string;
  /** Alternativas na ordem EXIBIDA (embaralhada). */
  options: string[];
  /** Índice da correta já na ordem exibida. */
  correctIndex: number;
  startedAt: number;
  expiresAt: number;
}

const SWEEP_INTERVAL_MS = 60_000;

interface ProfessorRow {
  id: string;
  name: string;
  slug: string;
}

/**
 * Quiz de bancada do evento.
 *
 * O aluno responde no tablet do estande, com um administrador ao lado; se
 * acertar, é mandado escanear o QR do professor daquele tema. Duas decisões
 * moldam o resto:
 *
 * 1. **A resposta certa nunca sai do servidor antes da hora.** A questão vai
 *    para o tablet só com o enunciado e as alternativas — o gabarito fica aqui.
 *    O tablet é um aparelho compartilhado, aberto na frente de uma fila.
 * 2. **O relógio que vale é o do servidor.** O timer da tela é decoração; a
 *    janela de 60s é conferida na hora de responder.
 *
 * A sessão em andamento fica em memória: um restart no meio de uma questão
 * custa refazer a pergunta, e não vale uma tabela a mais. Já a TENTATIVA é
 * persistida — é ela que sustenta o cooldown e o relatório.
 */
@Injectable()
export class QuizService implements OnModuleInit, OnModuleDestroy {
  private readonly sessions = new Map<string, QuizSession>();

  /**
   * Questões EXIBIDAS e abandonadas, por aluno: `userId → (questionId → expira
   * em)`. Sem isso, o aluno que abandona uma questão (desistiu, o tablet travou,
   * o operador recomeçou) a reencontra na tentativa seguinte, porque a tentativa
   * só é gravada em `answer`.
   *
   * A alternativa era gravar uma `QuizAttempt` com `answerIndex: null` já no
   * descarte. Preferimos a memória porque a tentativa é a base do cooldown E do
   * relatório: uma linha por desistência inflaria as estatísticas do painel e
   * puniria o aluno com 10min de espera por uma questão que ele nem leu.
   *
   * O custo é o restart apagar os descartes — aceitável, porque a punição
   * máxima é ver uma questão repetida, e o TTL de `THEME_COOLDOWN_MS` já é o
   * tempo mínimo até a próxima tentativa no tema.
   */
  private readonly descartadas = new Map<string, Map<string, number>>();

  private sweeper: NodeJS.Timeout | null = null;

  constructor(
    private prisma: PrismaService,
    private metrics: MetricsService,
    @Optional()
    @Inject(QUIZ_RNG)
    private readonly rng: RandomSource = Math.random,
  ) {}

  onModuleInit(): void {
    this.sweeper = setInterval(() => this.sweep(), SWEEP_INTERVAL_MS);
    this.sweeper.unref?.();
  }

  onModuleDestroy(): void {
    if (this.sweeper) clearInterval(this.sweeper);
    this.sweeper = null;
  }

  // ── Consulta para montar a bancada ────────────────────────────────────────

  /** Temas disponíveis, com quantas questões e quais professores cada um tem. */
  async themes() {
    const [contagens, professores] = await Promise.all([
      this.prisma.quizQuestion.groupBy({
        by: ['theme'],
        where: { active: true },
        _count: { _all: true },
      }),
      this.prisma.professor.findMany({
        select: { id: true, name: true, slug: true },
      }),
    ]);

    const porTema = new Map(contagens.map((c) => [c.theme, c._count._all]));

    return QUIZ_THEMES.map((theme) => ({
      theme,
      questoes: porTema.get(theme) ?? 0,
      professores: this.professoresDoTema(professores, theme),
    }));
  }

  /**
   * Cartão do aluno para o operador conferir antes de começar: nome, cooldowns
   * em curso e o que ele já fez. Erra de propósito para o lado de mostrar
   * pouco — a bancada é pública.
   */
  async aluno(matricula: string) {
    const user = await this.findAluno(matricula);
    const desde = new Date(Date.now() - THEME_COOLDOWN_MS);

    const [recentes, totais] = await Promise.all([
      // Anuladas ficam de fora do cartão do operador pelo mesmo motivo que
      // ficam de fora do cooldown: elas não aconteceram, para efeito de regra.
      this.prisma.quizAttempt.findMany({
        where: { userId: user.id, annulled: false, createdAt: { gte: desde } },
        select: { theme: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.quizAttempt.groupBy({
        by: ['correct'],
        where: { userId: user.id, annulled: false },
        _count: { _all: true },
      }),
    ]);

    // A lista já vem em ordem decrescente: o primeiro de cada tema é o mais
    // recente, então basta ignorar as repetições.
    const cooldowns: { theme: string; segundosRestantes: number }[] = [];
    const vistos = new Set<string>();
    for (const r of recentes) {
      if (vistos.has(r.theme)) continue;
      vistos.add(r.theme);
      const restante = THEME_COOLDOWN_MS - (Date.now() - r.createdAt.getTime());
      if (restante > 0) {
        cooldowns.push({
          theme: r.theme,
          segundosRestantes: Math.ceil(restante / 1000),
        });
      }
    }

    const acertos = totais.find((t) => t.correct)?._count._all ?? 0;
    const erros = totais.find((t) => !t.correct)?._count._all ?? 0;

    return {
      id: user.id,
      name: user.name,
      matricula: user.matricula,
      tentativas: acertos + erros,
      acertos,
      cooldowns,
    };
  }

  // ── Aplicação ─────────────────────────────────────────────────────────────

  /** Sorteia uma questão do tema para o aluno e abre a janela de resposta. */
  async start(matricula: string, theme: string) {
    const user = await this.findAluno(matricula);
    await this.assertForaDoCooldown(user.id, theme);

    // Um aluno por vez: se o operador recomeçou, a questão anterior morre em
    // vez de ficar aberta para ser respondida depois. Ela conta como VISTA — o
    // aluno leu o enunciado, mesmo sem responder.
    for (const [id, s] of this.sessions) {
      if (s.userId !== user.id) continue;
      this.sessions.delete(id);
      this.marcarDescartada(s.userId, s.questionId);
    }

    const question = await this.sortearQuestao(user.id, theme);
    const { options, correctIndex } = embaralhar(
      lerAlternativas(question.options),
      question.answer,
      this.rng,
    );

    const startedAt = Date.now();
    const session: QuizSession = {
      id: randomUUID(),
      userId: user.id,
      questionId: question.id,
      code: question.code,
      theme: question.theme,
      difficulty: question.difficulty,
      options,
      correctIndex,
      startedAt,
      expiresAt: startedAt + ANSWER_WINDOW_MS,
    };
    this.sessions.set(session.id, session);

    return {
      sessionId: session.id,
      aluno: { id: user.id, name: user.name, matricula: user.matricula },
      question: {
        // O código é público de propósito: é o que o aluno dita para contestar
        // a questão. Não revela nada — não deriva do id nem do gabarito.
        code: session.code,
        theme: session.theme,
        difficulty: session.difficulty,
        prompt: question.prompt,
        options,
      },
      durationMs: ANSWER_WINDOW_MS,
      expiresAt: new Date(session.expiresAt).toISOString(),
    };
  }

  /**
   * Fecha a questão: confere, registra a tentativa e diz o que fazer em
   * seguida. A sessão é consumida aqui — não há segunda chance na mesma
   * questão, mesmo que o tablet reenvie.
   */
  async answer(
    operatorId: string,
    sessionId: string,
    answerIndex: number | undefined,
  ) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new NotFoundException(
        'Esta questão não está mais aberta. Comece uma nova.',
      );
    }
    this.sessions.delete(sessionId);

    const agora = Date.now();
    const esgotou = agora > session.expiresAt + ANSWER_GRACE_MS;
    const escolha = esgotou ? null : (answerIndex ?? null);

    if (escolha !== null && escolha >= session.options.length) {
      throw new BadRequestException('Alternativa inexistente.');
    }

    const acertou = escolha !== null && escolha === session.correctIndex;

    await this.prisma.quizAttempt.create({
      data: {
        userId: session.userId,
        questionId: session.questionId,
        theme: session.theme,
        difficulty: session.difficulty,
        correct: acertou,
        answerIndex: escolha,
        // Limitado à janela: um tablet que ficou minutos com a tela aberta não
        // pode registrar um tempo de resposta absurdo no relatório.
        elapsedMs: Math.min(agora - session.startedAt, ANSWER_WINDOW_MS),
        operatorId,
      },
    });

    this.registrarMetricas(session.userId, acertou);

    const professores = await this.prisma.professor.findMany({
      select: { id: true, name: true, slug: true },
    });

    return {
      correct: acertou,
      expired: esgotou,
      // Repetido no resultado para o aluno conseguir contestar depois de ver o
      // gabarito — é aí que ele descobre que discorda.
      code: session.code,
      correctIndex: session.correctIndex,
      correctOption: session.options[session.correctIndex],
      answerIndex: escolha,
      elapsedMs: Math.min(agora - session.startedAt, ANSWER_WINDOW_MS),
      theme: session.theme,
      // Para onde mandar o aluno quando acerta. Vem sempre, para o operador
      // conseguir explicar o próximo passo mesmo depois de um erro.
      professores: this.professoresDoTema(professores, session.theme),
      liberadoAte: new Date(agora + THEME_COOLDOWN_MS).toISOString(),
    };
  }

  // ── Relatório ─────────────────────────────────────────────────────────────

  /** Tentativas registradas, com filtros para o painel. */
  async attempts(filtros: {
    theme?: string;
    matricula?: string;
    correct?: boolean;
    limit?: number;
    offset?: number;
  }) {
    const limit = Math.min(Math.max(filtros.limit ?? 50, 1), 200);
    const offset = Math.max(filtros.offset ?? 0, 0);

    // Anuladas somem do relatório: a errata procedente diz que aquela tentativa
    // não deveria ter contado, e mantê-la aqui distorceria a taxa de acerto.
    const where: Prisma.QuizAttemptWhereInput = { annulled: false };
    if (filtros.theme) where.theme = filtros.theme;
    if (filtros.correct !== undefined) where.correct = filtros.correct;
    if (filtros.matricula) {
      where.user = { matricula: { contains: filtros.matricula.trim() } };
    }

    const [total, itens] = await Promise.all([
      this.prisma.quizAttempt.count({ where }),
      this.prisma.quizAttempt.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
        select: {
          id: true,
          theme: true,
          difficulty: true,
          correct: true,
          elapsedMs: true,
          createdAt: true,
          user: { select: { name: true, matricula: true } },
          operator: { select: { name: true } },
          question: { select: { prompt: true } },
        },
      }),
    ]);

    return {
      total,
      limit,
      offset,
      itens: itens.map((a) => ({
        id: a.id,
        theme: a.theme,
        difficulty: a.difficulty,
        correct: a.correct,
        segundos: Math.round(a.elapsedMs / 100) / 10,
        quando: a.createdAt,
        aluno: a.user.name,
        matricula: a.user.matricula,
        operador: a.operator.name,
        pergunta: a.question.prompt,
      })),
    };
  }

  /** Resumo por tema e por dificuldade para o topo da tela de tentativas. */
  async stats() {
    const [porTema, porDificuldade] = await Promise.all([
      this.prisma.quizAttempt.groupBy({
        by: ['theme', 'correct'],
        where: { annulled: false },
        _count: { _all: true },
      }),
      this.prisma.quizAttempt.groupBy({
        by: ['difficulty', 'correct'],
        where: { annulled: false },
        _count: { _all: true },
      }),
    ]);

    const tentativas = porTema.reduce((s, r) => s + r._count._all, 0);
    const acertos = porTema
      .filter((r) => r.correct)
      .reduce((s, r) => s + r._count._all, 0);

    return {
      geral: {
        tentativas,
        acertos,
        taxa: tentativas
          ? Math.round((acertos / tentativas) * 1000) / 10
          : null,
      },
      porTema: resumir(porTema, (r) => r.theme),
      porDificuldade: resumir(porDificuldade, (r) => r.difficulty),
    };
  }

  // ── Interno ───────────────────────────────────────────────────────────────

  private async findAluno(matricula: string) {
    const user = await this.prisma.user.findUnique({
      where: { matricula: matricula.trim() },
      select: { id: true, name: true, matricula: true },
    });
    if (!user) {
      throw new NotFoundException(
        'Matrícula não encontrada. O aluno precisa ter entrado no app pelo menos uma vez.',
      );
    }
    return user;
  }

  /**
   * Cooldown de 10min por aluno e tema, lido do banco e não de memória: ele
   * precisa sobreviver a um restart no meio do evento, senão a fila descobre
   * que basta esperar o servidor reiniciar.
   */
  private async assertForaDoCooldown(userId: string, theme: string) {
    const ultima = await this.prisma.quizAttempt.findFirst({
      // Tentativa anulada por errata procedente não segura o aluno: a pergunta
      // estava errada, então a espera de 10min seria punição pelo erro do banco.
      where: { userId, theme, annulled: false },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    if (!ultima) return;

    const restante =
      THEME_COOLDOWN_MS - (Date.now() - ultima.createdAt.getTime());
    if (restante <= 0) return;

    const segundos = Math.ceil(restante / 1000);
    throw new HttpException(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        message: `Este aluno já tentou este tema há pouco. Faltam ${formatarEspera(segundos)}.`,
        theme,
        retryAfterSeconds: segundos,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  /**
   * Sorteia a questão que o aluno ainda não viu naquele tema.
   *
   * Enquanto houver inédita, ele NUNCA recebe uma repetida — o filtro é sobre
   * tudo que ele já respondeu no tema, não sobre uma janela das últimas N.
   * Esgotado o banco, repetir é melhor que recusar a tentativa, e aí a ordem é
   * a da memória: primeiro o que ele viu há mais tempo.
   */
  private async sortearQuestao(userId: string, theme: string) {
    const [respondidas, questoes] = await Promise.all([
      // `groupBy` em vez de listar as tentativas: o que interessa é o conjunto
      // de questões vistas e QUANDO cada uma foi vista pela última vez, não o
      // histórico inteiro do aluno naquele tema.
      this.prisma.quizAttempt.groupBy({
        by: ['questionId'],
        where: { userId, theme },
        _max: { createdAt: true },
      }),
      this.prisma.quizQuestion.findMany({
        where: { theme, active: true },
        select: {
          id: true,
          code: true,
          theme: true,
          difficulty: true,
          prompt: true,
          options: true,
          answer: true,
        },
      }),
    ]);

    if (!questoes.length) {
      throw new NotFoundException(
        `Nenhuma questão cadastrada para o tema "${theme}". Rode o seed do quiz.`,
      );
    }

    const vistaEm = this.montarVistas(userId, respondidas);
    const ineditas = questoes.filter((q) => !vistaEm.has(q.id));
    return this.sortearPorDificuldade(
      ineditas.length ? ineditas : maisAntigas(questoes, vistaEm),
    );
  }

  /**
   * Quando o aluno viu a questão pela última vez, juntando o que ele respondeu
   * (banco) com o que ele abriu e abandonou (memória). Vale o mais recente dos
   * dois: uma questão respondida ontem e reaberta hoje é recente.
   */
  private montarVistas(
    userId: string,
    respondidas: { questionId: string; _max: { createdAt: Date | null } }[],
  ): Map<string, number> {
    const vistas = new Map<string, number>();
    for (const r of respondidas) {
      vistas.set(r.questionId, r._max.createdAt?.getTime() ?? 0);
    }

    const agora = Date.now();
    for (const [questionId, expiraEm] of this.descartadas.get(userId) ?? []) {
      if (expiraEm <= agora) continue;
      const quando = expiraEm - THEME_COOLDOWN_MS;
      vistas.set(questionId, Math.max(vistas.get(questionId) ?? 0, quando));
    }
    return vistas;
  }

  /**
   * Sorteia a DIFICULDADE pelos pesos do seed e só depois a questão dentro
   * dela. Ver `QUIZ_DIFFICULTY_MIX`: sortear direto no pool faria o quiz
   * endurecer sozinho conforme o aluno zera as fáceis.
   */
  private sortearPorDificuldade<T extends { difficulty: string }>(
    pool: T[],
  ): T {
    const porDificuldade = new Map<string, T[]>();
    for (const q of pool) {
      const atual = porDificuldade.get(q.difficulty);
      if (atual) atual.push(q);
      else porDificuldade.set(q.difficulty, [q]);
    }

    const disponiveis = [...porDificuldade].map(([difficulty, questoes]) => ({
      questoes,
      // Dificuldade fora da tabela (banco editado à mão) entra com peso 1 em
      // vez de sumir do sorteio.
      peso: QUIZ_DIFFICULTY_MIX[difficulty as QuizDifficulty] ?? 1,
    }));

    const total = disponiveis.reduce((soma, d) => soma + d.peso, 0);
    let sorteio = this.rng() * total;
    for (const { questoes, peso } of disponiveis) {
      sorteio -= peso;
      if (sorteio < 0) return this.escolher(questoes);
    }
    // Só chega aqui por erro de arredondamento no último passo.
    return this.escolher(disponiveis[disponiveis.length - 1].questoes);
  }

  private escolher<T>(itens: T[]): T {
    return itens[Math.floor(this.rng() * itens.length)];
  }

  /** Registra uma questão exibida e abandonada. Ver `descartadas`. */
  private marcarDescartada(userId: string, questionId: string): void {
    const doAluno = this.descartadas.get(userId) ?? new Map<string, number>();
    doAluno.set(questionId, Date.now() + THEME_COOLDOWN_MS);
    this.descartadas.set(userId, doAluno);
  }

  private professoresDoTema(professores: ProfessorRow[], theme: string) {
    return professores
      .filter((p) => typesForProfessor(p).includes(theme))
      .map(({ name, slug }) => ({ name, slug }));
  }

  /** Métrica de engajamento. Nunca derruba a resposta do quiz. */
  private registrarMetricas(userId: string, acertou: boolean): void {
    try {
      const occurredAt = new Date();
      const eventos: Parameters<MetricsService['record']>[2] = [
        { type: 'quiz_answered', occurredAt },
      ];
      if (acertou) eventos.push({ type: 'quiz_correct', occurredAt });
      this.metrics.record(userId, null, eventos);
    } catch {
      // silencioso de propósito
    }
  }

  private sweep(): void {
    const limite = Date.now() - ANSWER_WINDOW_MS * 2;
    for (const [id, s] of this.sessions) {
      if (s.startedAt < limite) this.sessions.delete(id);
    }

    // Os descartes expiram junto com o cooldown do tema. Sem esta varredura o
    // mapa cresceria o evento inteiro, uma entrada por questão abandonada.
    const agora = Date.now();
    for (const [userId, doAluno] of this.descartadas) {
      for (const [questionId, expiraEm] of doAluno) {
        if (expiraEm <= agora) doAluno.delete(questionId);
      }
      if (!doAluno.size) this.descartadas.delete(userId);
    }
  }
}

// ── Auxiliares ──────────────────────────────────────────────────────────────

/**
 * `options` é Json no Prisma — o tipo não garante nada sobre o conteúdo.
 *
 * Exigimos uma lista de STRINGS em vez de converter o que vier: um objeto
 * viraria "[object Object]" como alternativa na tela da bancada, e o operador
 * descobriria isso na frente do aluno.
 */
export function lerAlternativas(value: Prisma.JsonValue): string[] {
  if (
    !Array.isArray(value) ||
    value.length < 2 ||
    !value.every((v): v is string => typeof v === 'string')
  ) {
    throw new BadRequestException('Questão com alternativas inválidas.');
  }
  return value;
}

/**
 * Candidatas à repetição quando o aluno já viu todas as questões do tema: o
 * terço visto há mais tempo, sem a última que ele respondeu.
 *
 * Devolver sempre a mais antiga tornaria a ordem previsível para quem passa o
 * dia no estande; devolver qualquer uma traria de volta a questão que ele
 * acabou de responder.
 */
export function maisAntigas<T extends { id: string }>(
  questoes: T[],
  vistaEm: Map<string, number>,
): T[] {
  const quando = (q: T) => vistaEm.get(q.id) ?? 0;
  const ordenadas = [...questoes].sort((a, b) => quando(a) - quando(b));

  // A última respondida é a que tem o maior timestamp — é o fim da lista.
  const candidatas = ordenadas.slice(0, -1);
  if (!candidatas.length) return ordenadas;

  const terco = Math.max(
    1,
    Math.ceil(candidatas.length / REPEAT_OLDEST_FRACTION),
  );
  return candidatas.slice(0, terco);
}

/**
 * Embaralha as alternativas (Fisher-Yates) e devolve onde a correta parou.
 *
 * A fila da bancada vê a mesma questão várias vezes ao longo do dia; sem
 * embaralhar, decorar "é a segunda" resolveria o quiz sem saber o conteúdo.
 */
export function embaralhar(
  options: string[],
  answer: number,
  rng: RandomSource = Math.random,
): { options: string[]; correctIndex: number } {
  const indices = options.map((_, i) => i);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  return {
    options: indices.map((i) => options[i]),
    correctIndex: indices.indexOf(answer),
  };
}

function resumir<T extends { correct: boolean; _count: { _all: number } }>(
  linhas: T[],
  chaveDe: (linha: T) => string,
) {
  const mapa = new Map<string, { tentativas: number; acertos: number }>();
  for (const linha of linhas) {
    const chave = chaveDe(linha);
    const atual = mapa.get(chave) ?? { tentativas: 0, acertos: 0 };
    atual.tentativas += linha._count._all;
    if (linha.correct) atual.acertos += linha._count._all;
    mapa.set(chave, atual);
  }
  return [...mapa].map(([chave, v]) => ({
    chave,
    ...v,
    taxa: v.tentativas
      ? Math.round((v.acertos / v.tentativas) * 1000) / 10
      : null,
  }));
}

function formatarEspera(segundos: number): string {
  if (segundos < 60) return `${segundos}s`;
  const min = Math.floor(segundos / 60);
  const resto = segundos % 60;
  return resto ? `${min}min ${resto}s` : `${min}min`;
}
