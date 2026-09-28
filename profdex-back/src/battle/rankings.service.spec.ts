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

  /**
   * Professor raro (tarefa 15). Ele fica fora dos DOIS lados da fração: só no
   * numerador, o ladder passaria de 100% para quem pegou um; só no
   * denominador, os 100% ficariam inalcançáveis sem 100 min de bancada.
   */
  it('o ladder de dex ignora os raros dos dois lados da conta', async () => {
    const { prisma, service } = createSubject();
    prisma.capture.groupBy.mockResolvedValue([
      par('ana', 'prof-1', '2026-09-04T10:00:00Z'),
      par('ana', 'prof-2', '2026-09-04T12:00:00Z'),
    ]);
    // 14 comuns + 1 raro no banco; o count já vem filtrado.
    prisma.professor.count.mockResolvedValue(14);

    const ladder = await service.dexLeaderboard('ana', 1);

    expect(prisma.capture.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          professor: { rare: false, legendary: false },
        }),
      }),
    );
    expect(prisma.professor.count).toHaveBeenCalledWith({
      where: { rare: false, legendary: false },
    });
    expect(ladder.dexTotal).toBe(14);
  });

  /** O invariante que a decisão 14 protege: a dex nunca passa de 100%. */
  it('a dex não passa de 100% com raro no banco', async () => {
    const { prisma, service } = createSubject();
    // Cenário do bug: o aluno tem os 2 comuns E o raro, mas o groupBy filtrado
    // devolve só os comuns — então o numerador não pode estourar o total.
    prisma.capture.groupBy.mockResolvedValue([
      par('ana', 'prof-1', '2026-09-04T10:00:00Z'),
      par('ana', 'prof-2', '2026-09-04T12:00:00Z'),
    ]);
    prisma.professor.count.mockResolvedValue(2);

    const ladder = await service.dexLeaderboard('ana', 1);

    expect(ladder.entries[0].percent).toBe(100);
    expect(ladder.entries[0].percent).toBeLessThanOrEqual(100);
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

/**
 * O organizador fora dos ladders.
 *
 * A conta `@unifil.br` recebe a Profdex inteira para testar o app (ver
 * `scripts/dar-capturas.ts`). Sem estes filtros, a mesa lideraria o ranking de
 * coleção no dia da feira com uma dex que ninguém pode alcançar.
 */
describe('RankingsService — administrador fora do ranking', () => {
  const SO_ALUNOS = { role: { not: 'admin' } };

  it('pede ao banco só as capturas de quem não é admin', async () => {
    const { prisma, service } = createSubject();

    await service.capturesLeaderboard('ana', 1);

    expect(prisma.capture.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ where: { user: SO_ALUNOS } }),
    );
  });

  it('aplica o mesmo filtro no ladder de dex, junto do filtro de raros', async () => {
    const { prisma, service } = createSubject();

    await service.dexLeaderboard('ana', 1);

    expect(prisma.capture.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          professor: { rare: false, legendary: false },
          user: SO_ALUNOS,
        },
      }),
    );
  });

  it('exclui o admin do ladder de batalha', async () => {
    const { prisma, service } = createSubject();
    prisma.user.findMany.mockResolvedValue([]);

    await service.battleLeaderboard('gustavo', 1);

    const where = prisma.user.findMany.mock.calls[0][0].where;
    expect(where.AND[0]).toEqual(SO_ALUNOS);
  });

  /**
   * O rodapé do ranking. Mesmo tendo batalhado, o organizador não está na
   * lista acima — e um "você é o 3º" apontaria para uma linha que não existe.
   */
  it('não dá posição de batalha ao admin, mesmo com vitórias', async () => {
    const { prisma, service } = createSubject();
    prisma.user.findMany.mockResolvedValue([]);
    prisma.user.findUnique.mockResolvedValue({
      id: 'gustavo',
      name: 'Gustavo',
      role: 'admin',
      battleRating: 1400,
      battleWins: 9,
      battleLosses: 1,
      battleDraws: 0,
    });

    const ladder = await service.battleLeaderboard('gustavo', 1);

    expect(ladder.me).toMatchObject({ played: false, position: 0 });
  });

  it('o aluno com vitórias continua tendo posição', async () => {
    const { prisma, service } = createSubject();
    prisma.user.findMany.mockResolvedValue([]);
    prisma.user.findUnique.mockResolvedValue({
      id: 'ana',
      name: 'Ana',
      role: 'aluno',
      battleRating: 1200,
      battleWins: 3,
      battleLosses: 2,
      battleDraws: 0,
    });
    prisma.user.count.mockResolvedValue(4);

    const ladder = await service.battleLeaderboard('ana', 1);

    expect(ladder.me).toMatchObject({ played: true, position: 5 });
  });
});
