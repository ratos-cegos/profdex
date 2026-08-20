import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { QuizPracticeService } from './quiz-practice.service';

const QUESTOES = Array.from({ length: 10 }, (_, i) => ({
  id: `q-${i}`,
  theme: 'banco',
  difficulty: 'facil',
  prompt: `Pergunta ${i}?`,
  options: ['A', 'B', 'C', 'D'],
  answer: i % 4,
}));

function createSubject(questoes = QUESTOES) {
  const prisma = {
    quizQuestion: {
      findMany: jest.fn().mockResolvedValue(questoes),
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
