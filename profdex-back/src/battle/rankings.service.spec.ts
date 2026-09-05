import { PrismaService } from '../prisma/prisma.service';
import { RankingsService } from './rankings.service';

/** Uma linha do `groupBy` de capturas por aluno. */
function grupo(userId: string, total: number, ultima: string) {
  return {
    userId,
    _count: { _all: total },
    _max: { capturedAt: new Date(ultima) },
  };
}

/** Uma linha do `groupBy` por (aluno, professor), usada pelo ladder de dex. */
function par(userId: string, professorId: string, quando: string) {
  return { userId, professorId, _max: { capturedAt: new Date(quando) } };
}

function createSubject() {
  const prisma = {
    capture: { groupBy: jest.fn().mockResolvedValue([]) },
    professor: { count: jest.fn().mockResolvedValue(10) },
    user: {
      findMany: jest
        .fn()
        .mockImplementation(({ where }: { where: { id: { in: string[] } } }) =>
          Promise.resolve(
            where.id.in.map((id) => ({ id, name: `Aluno ${id}` })),
          ),
        ),
      findUnique: jest.fn().mockResolvedValue(null),
      count: jest.fn().mockResolvedValue(0),
    },
  };
  const service = new RankingsService(prisma as unknown as PrismaService);
  return { prisma, service };
}

describe('RankingsService — ladders de coleção', () => {
  it('ordena por total e desempata por quem chegou lá primeiro', async () => {
    const { prisma, service } = createSubject();
    prisma.capture.groupBy.mockResolvedValue([
      // Mesmo total: bia fechou a 5ª captura antes de ana, então vem na frente.
      grupo('ana', 5, '2026-09-04T15:00:00Z'),
      grupo('bia', 5, '2026-09-04T11:00:00Z'),
      grupo('caio', 9, '2026-09-04T18:00:00Z'),
    ]);

    const ladder = await service.capturesLeaderboard('ana', 1);

    expect(ladder.entries.map((e) => e.id)).toEqual(['caio', 'bia', 'ana']);
    expect(ladder.entries.map((e) => e.position)).toEqual([1, 2, 3]);
    expect(ladder.total).toBe(3);
  });

  it('devolve a posição do próprio aluno mesmo fora da página', async () => {
    const { prisma, service } = createSubject();
    // 30 alunos: com PAGE_SIZE 25, o último não aparece na primeira página.
    prisma.capture.groupBy.mockResolvedValue(
      Array.from({ length: 30 }, (_, i) =>
        grupo(`aluno-${i}`, 30 - i, '2026-09-04T12:00:00Z'),
      ),
    );

    const ladder = await service.capturesLeaderboard('aluno-29', 1);

    expect(ladder.entries).toHaveLength(25);
    expect(ladder.me).toMatchObject({
      id: 'aluno-29',
      position: 30,
      ranked: true,
    });
  });

  it('não inventa posição para quem nunca capturou', async () => {
    // Mesmo espírito do PLAYED do ladder de batalha: cadastro não é ranking.
    const { prisma, service } = createSubject();
    prisma.capture.groupBy.mockResolvedValue([
      grupo('bia', 3, '2026-09-04T10:00:00Z'),
    ]);

    const ladder = await service.capturesLeaderboard('ana', 1);

    expect(ladder.me).toMatchObject({ ranked: false, position: 0, total: 0 });
    expect(ladder.entries.map((e) => e.id)).toEqual(['bia']);
  });

  it('conta professores distintos e o percentual da dex', async () => {
    const { prisma, service } = createSubject();
    prisma.capture.groupBy.mockResolvedValue([
      // ana tem 3 exemplares, mas só 2 professores distintos.
      par('ana', 'prof-1', '2026-09-04T10:00:00Z'),
      par('ana', 'prof-2', '2026-09-04T12:00:00Z'),
      par('bia', 'prof-1', '2026-09-04T09:00:00Z'),
    ]);
    prisma.professor.count.mockResolvedValue(8);

    const ladder = await service.dexLeaderboard('ana', 1);

    expect(ladder.entries[0]).toMatchObject({
      id: 'ana',
      total: 2,
      percent: 25,
    });
    expect(ladder.entries[1]).toMatchObject({
      id: 'bia',
      total: 1,
      percent: 12.5,
    });
    expect(ladder.dexTotal).toBe(8);
  });

  it('não expõe percentual no ladder de capturas — ele não tem teto', async () => {
    const { prisma, service } = createSubject();
    prisma.capture.groupBy.mockResolvedValue([
      grupo('ana', 4, '2026-09-04T10:00:00Z'),
    ]);

    const ladder = await service.capturesLeaderboard('ana', 1);

    expect(ladder.entries[0].percent).toBeNull();
    expect(ladder.dexTotal).toBeNull();
  });
});
