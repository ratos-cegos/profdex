import { ConflictException, NotFoundException } from '@nestjs/common';
import { getMoveById } from '../battle/engine/moves';
import { MetricsService } from '../metrics/metrics.service';
import { PrismaService } from '../prisma/prisma.service';
import { PUBLIC_PROFESSOR_SELECT } from '../professors/public-professor.select';
import { hashCaptureToken } from './capture-token';
import { CapturesService } from './captures.service';

/** Métrica é efeito colateral: aqui só precisa não explodir. */
const metricsStub = () =>
  ({ record: jest.fn().mockReturnValue(0) }) as unknown as MetricsService;

describe('CapturesService', () => {
  const token = 'secure_capture_token_1234567890ab';
  const tokenHash = hashCaptureToken(token);

  const professor = {
    id: 'prof-1',
    name: 'Professor',
    slug: 'professor',
    modelUrl: null,
    marker1Index: 0,
    marker2Index: 1,
  };
  const variant = {
    id: 'variant-1',
    typeKey: 'arquitetura+ia-ml',
    types: ['arquitetura', 'ia-ml'],
    professorId: professor.id,
  };

  /**
   * Banco de mentira com UMA ficha. `updateMany` só encontra linha enquanto
   * `redeemedAt` for null — é exatamente essa condição que dá o uso único no
   * Postgres, então o teste precisa dela para valer alguma coisa.
   */
  function fakeDb({ redeemed = false }: { redeemed?: boolean } = {}) {
    const ficha = {
      id: 'token-1',
      tokenHash,
      redeemedAt: redeemed ? new Date() : (null as Date | null),
      variant,
    };
    const criadas: any[] = [];

    const transaction = {
      captureToken: {
        updateMany: jest.fn(({ where, data }: any) => {
          const bate =
            where.tokenHash === ficha.tokenHash &&
            where.redeemedAt === null &&
            ficha.redeemedAt === null;
          if (!bate) return Promise.resolve({ count: 0 });
          ficha.redeemedAt = data.redeemedAt;
          return Promise.resolve({ count: 1 });
        }),
        findUnique: jest.fn(({ where }: any) =>
          Promise.resolve(where.tokenHash === ficha.tokenHash ? ficha : null),
        ),
        findUniqueOrThrow: jest.fn(() => Promise.resolve(ficha)),
      },
      discovery: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({ id: 'discovery-1' }),
      },
      capture: {
        create: jest.fn(({ data }: any) => {
          const criada = {
            id: `capture-${criadas.length + 1}`,
            capturedAt: new Date(),
            moves: data.moves,
            professor,
            variant: {
              id: variant.id,
              typeKey: variant.typeKey,
              types: variant.types,
            },
          };
          criadas.push({ ...criada, data });
          return Promise.resolve(criada);
        }),
      },
    };

    const prisma = {
      professor: { count: jest.fn().mockResolvedValue(10) },
      capture: {
        findMany: jest.fn().mockResolvedValue([{ professorId: professor.id }]),
      },
      $transaction: jest.fn((callback: (client: typeof transaction) => any) =>
        Promise.resolve(callback(transaction)),
      ),
    };

    return { prisma, transaction, ficha, criadas };
  }

  const build = (prisma: unknown) =>
    new CapturesService(prisma as PrismaService, metricsStub());

  it('rejects a token that has no matching ficha', async () => {
    const { prisma } = fakeDb();
    prisma.$transaction = jest.fn((callback: any) =>
      Promise.resolve(
        callback({
          captureToken: {
            updateMany: jest.fn().mockResolvedValue({ count: 0 }),
            findUnique: jest.fn().mockResolvedValue(null),
          },
        }),
      ),
    ) as any;

    await expect(build(prisma).captureByToken('user-1', token)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('rejects a ficha that was already redeemed', async () => {
    const { prisma } = fakeDb({ redeemed: true });

    await expect(build(prisma).captureByToken('user-1', token)).rejects.toThrow(
      ConflictException,
    );
  });

  it('burns the ficha, rolls a moveset and returns no secret fields', async () => {
    const { prisma, transaction, ficha, criadas } = fakeDb();

    const result = await build(prisma).captureByToken('user-1', token);

    // A ficha foi marcada como usada dentro da mesma transação da captura.
    expect(ficha.redeemedAt).toBeInstanceOf(Date);
    expect(transaction.captureToken.updateMany).toHaveBeenCalledWith({
      where: { tokenHash, redeemedAt: null },
      data: { redeemedAt: expect.any(Date), redeemedBy: 'user-1' },
    });

    // O exemplar nasce amarrado à variante e à ficha, com deck gravado.
    expect(criadas[0].data).toEqual(
      expect.objectContaining({
        userId: 'user-1',
        professorId: professor.id,
        variantId: variant.id,
        tokenId: ficha.id,
      }),
    );
    expect(criadas[0].data.moves).toHaveLength(4);

    // Golpes hidratados e pertencentes aos tipos da variante.
    expect(result.moves).toHaveLength(4);
    for (const move of result.moves) {
      expect(getMoveById(move.id)).not.toBeNull();
      expect(variant.types).toContain(move.type);
    }
    expect(result.types).toEqual(variant.types);
    expect(result.variant?.typeKey).toBe(variant.typeKey);
    expect(JSON.stringify(result)).not.toContain('tokenHash');
    expect(JSON.stringify(result)).not.toContain('redeemed');
  });

  it('gives the ficha to whoever scans first, never to both', async () => {
    const { prisma, criadas } = fakeDb();
    const service = build(prisma);

    const results = await Promise.allSettled([
      service.captureByToken('user-1', token),
      service.captureByToken('user-2', token),
    ]);

    const ok = results.filter((r) => r.status === 'fulfilled');
    const falhou = results.filter((r) => r.status === 'rejected');
    expect(ok).toHaveLength(1);
    expect(falhou).toHaveLength(1);
    expect(falhou[0].reason).toBeInstanceOf(ConflictException);
    expect(criadas).toHaveLength(1); // uma ficha, um exemplar
  });

  it('hydrates moves and exposes only public professor fields when listing', async () => {
    const moves = ['transbordou-o-balde', 'linha-de-montagem'];
    const prisma = {
      capture: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'capture-1',
            capturedAt: new Date(),
            moves: [...moves, 'golpe-que-nao-existe-mais'],
            professor,
            variant: {
              id: variant.id,
              typeKey: variant.typeKey,
              types: variant.types,
            },
          },
        ]),
      },
    };

    const [capture] = await build(prisma).findAll('user-1');

    expect(prisma.capture.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-1' },
        orderBy: { capturedAt: 'desc' },
      }),
    );
    expect(capture.professor).toEqual(professor);
    expect(capture.types).toEqual(variant.types);
    // Id órfão (golpe removido do jogo) não vira `null` na lista do aluno.
    expect(capture.moves.map((m) => m.id)).toEqual(
      moves.filter((id) => getMoveById(id)),
    );
  });

  it('only ever selects public professor fields', () => {
    expect(Object.keys(PUBLIC_PROFESSOR_SELECT)).not.toContain('captureToken');
  });
});
