import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { QuizPracticeService } from './quiz-practice.service';

const QUESTOES = Array.from({ length: 10 }, (_, i) => ({
  id: `t-${i}`,
  theme: 'banco',
  difficulty: 'facil',
  prompt: `Pergunta de treino ${i}?`,
  options: ['A', 'B', 'C', 'D'],
  answer: i % 4,
  explanation: `Porque sim ${i}.`,
}));

/**
 * O mock de `quizQuestion` devolve questões OFICIAIS reconhecíveis de
 * propósito: se algum dia o serviço de treino tocar nessa tabela, os testes
 * abaixo mostram exatamente o que vazou, em vez de passar em silêncio.
 */
const OFICIAIS = Array.from({ length: 10 }, (_, i) => ({
  id: `oficial-${i}`,
  theme: 'banco',
  difficulty: 'facil',
  prompt: `QUESTÃO OFICIAL DA BANCADA ${i}?`,
  options: ['A', 'B', 'C', 'D'],
  answer: i % 4,
}));

function createSubject(questoes = QUESTOES) {
  const prisma = {
    trainingQuestion: {
      findMany: jest.fn().mockResolvedValue(questoes),
      groupBy: jest
        .fn()
        .mockResolvedValue([{ theme: 'banco', _count: { _all: 10 } }]),
    },
    quizQuestion: {
      findMany: jest.fn().mockResolvedValue(OFICIAIS),
      findFirst: jest.fn().mockResolvedValue(OFICIAIS[0]),
      groupBy: jest
        .fn()
        .mockResolvedValue([{ theme: 'banco', _count: { _all: 10 } }]),
    },
    quizAttempt: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
  };
  const service = new QuizPracticeService(prisma as unknown as PrismaService);
  return { prisma, service };
}

describe('QuizPracticeService — isolamento do banco oficial', () => {
  // Este bloco é o motivo de a tabela `training_questions` existir. Se ele
  // ficar vermelho, o gabarito da bancada está saindo por uma rota de aluno e
  // o quiz do evento acabou: quem sabe a resposta ganha QR e captura sem
  // saber o conteúdo. Não "conserte" relaxando a asserção.

  it('nunca consulta a tabela do quiz oficial', async () => {
    const { prisma, service } = createSubject();

    await service.questoes('banco', 20);
    await service.temas();

    expect(prisma.quizQuestion.findMany).not.toHaveBeenCalled();
    expect(prisma.quizQuestion.findFirst).not.toHaveBeenCalled();
    expect(prisma.quizQuestion.groupBy).not.toHaveBeenCalled();
  });

  it('nunca devolve uma questão oficial, mesmo pedindo o lote inteiro', async () => {
    const { service } = createSubject();

    const { questoes } = await service.questoes('banco', 20);

    const oficiais = new Set(OFICIAIS.map((q) => q.id));
    for (const q of questoes) {
      expect(oficiais.has(q.id)).toBe(false);
      expect(q.prompt).not.toMatch(/OFICIAL/);
    }
  });

  it('devolve vazio para um tema sem questões de treino, em vez de cair no oficial', async () => {
    // O modo de falha perigoso não é o erro, é o fallback silencioso: um tema
    // ainda não semeado no treino tem de dar 404, nunca "pega as da bancada".
    const { service } = createSubject([]);

    await expect(service.questoes('banco')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('QuizPracticeService', () => {
  it('never records an attempt — the booth cooldown must stay untouched', async () => {
    const { prisma, service } = createSubject();

    await service.questoes('banco');

    expect(prisma.quizAttempt.create).not.toHaveBeenCalled();
    expect(prisma.quizAttempt.findFirst).not.toHaveBeenCalled();
    expect(prisma.quizAttempt.findMany).not.toHaveBeenCalled();
  });

  it('does not repeat a question within the same round', async () => {
    const { service } = createSubject();

    const { questoes } = await service.questoes('banco', 10);

    expect(questoes).toHaveLength(10);
    expect(new Set(questoes.map((q) => q.id)).size).toBe(10);
  });

  it('ships the answer key, and it points at the shuffled option', async () => {
    const { service } = createSubject([QUESTOES[1]]);

    const { questoes } = await service.questoes('banco', 1);
    const q = questoes[0];

    // No treino o gabarito vai junto de propósito: sem ponto nem captura, não
    // há o que burlar, e é isso que permite corrigir sem ida ao servidor.
    expect(q.correctIndex).toBeGreaterThanOrEqual(0);
    expect(q.options[q.correctIndex]).toBe(
      QUESTOES[1].options[QUESTOES[1].answer],
    );
  });

  it('caps the round at how many questions the theme actually has', async () => {
    const { service } = createSubject(QUESTOES.slice(0, 3));

    const { questoes } = await service.questoes('banco', 20);

    expect(questoes).toHaveLength(3);
  });

  it('refuses a theme with no seeded questions', async () => {
    const { service } = createSubject([]);

    await expect(service.questoes('banco')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('lists all nine themes even when only one has questions', async () => {
    const { service } = createSubject();

    const temas = await service.temas();

    expect(temas).toHaveLength(9);
    expect(temas.find((t) => t.theme === 'banco')?.questoes).toBe(10);
    expect(temas.find((t) => t.theme === 'redes')?.questoes).toBe(0);
  });
});
