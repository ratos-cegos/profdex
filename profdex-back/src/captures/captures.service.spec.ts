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
    typeKey: 'arquitetura+ia',
    types: ['arquitetura', 'ia'],
    professorId: professor.id,
  };

  /**
   * Banco de mentira com UMA ficha. `updateMany` só encontra linha enquanto
   * `redeemedAt` for null — é exatamente essa condição que dá o uso único no
   * Postgres, então o teste precisa dela para valer alguma coisa.
   */
  function fakeDb({
    redeemed = false,
    /** Ficha NOVA, que vale por tipo. Sem isto a ficha é a legada, com variante. */
    type = null as string | null,
    /** As variantes que o sorteio enxerga — já filtradas por tipo e por ativo. */
    candidatas = [variant] as typeof variant[],
    /** O que o aluno já tem, para escolher a faixa do sorteio. */
    possuidas = [] as { professorId: string; variantId: string | null }[],
  } = {}) {
    const ficha = {
      id: 'token-1',
      tokenHash,
      redeemedAt: redeemed ? new Date() : (null as Date | null),
      type,
      variant: type ? null : variant,
    };
    const criadas: any[] = [];
    const filtros: any[] = [];

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
      professorVariant: {
        findMany: jest.fn(({ where }: any) => {
          filtros.push(where);
          return Promise.resolve(
            candidatas.map((v) => ({
              id: v.id,
              professorId: v.professorId,
              types: v.types,
            })),
          );
        }),
      },
      discovery: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({ id: 'discovery-1' }),
      },
      capture: {
        findMany: jest.fn(() => Promise.resolve(possuidas)),
        create: jest.fn(({ data }: any) => {
          const sorteada =
            candidatas.find((v) => v.id === data.variantId) ?? variant;
          const criada = {
            id: `capture-${criadas.length + 1}`,
            capturedAt: new Date(),
            moves: data.moves,
            ivHp: data.ivHp,
            ivRigor: data.ivRigor,
            ivDidatica: data.ivDidatica,
            ivRaciocinio: data.ivRaciocinio,
            professor: { ...professor, id: data.professorId },
            variant: {
              id: sorteada.id,
              typeKey: sorteada.typeKey,
              types: sorteada.types,
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
      // Transação de mentira que também DESFAZ: sem o rollback, o teste de
      // "tipo vazio não consome a ficha" passaria mesmo com o throw fora da
      // transação — que é exatamente o bug que ele existe para impedir.
      $transaction: jest.fn(async (callback: (c: typeof transaction) => any) => {
        const antes = ficha.redeemedAt;
        try {
          return await callback(transaction);
        } catch (erro) {
          ficha.redeemedAt = antes;
          throw erro;
        }
      }),
    };

    return { prisma, transaction, ficha, criadas, filtros };
  }

  const build = (prisma: unknown) =>
    new CapturesService(prisma as PrismaService, metricsStub(), () => 0.5);

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
    expect(criadas[0].data).toEqual(expect.objectContaining({
      ivHp: 8, ivRigor: 8, ivDidatica: 8, ivRaciocinio: 8,
    }));
    expect(result.stars).toBe(2.5);

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

  describe('ficha de tipo', () => {
    const profB = { ...professor, id: 'prof-2' };
    const variantesDeIa = [
      { id: 'a-ia', typeKey: 'ia', types: ['ia'], professorId: professor.id },
      { id: 'b-ia', typeKey: 'ia', types: ['ia'], professorId: profB.id },
    ];

    it('sorteia um professor do tipo e grava o exemplar', async () => {
      const { prisma, criadas, ficha } = fakeDb({
        type: 'ia',
        candidatas: variantesDeIa,
      });

      const result = await build(prisma).captureByToken('user-1', token);

      expect(ficha.redeemedAt).toBeInstanceOf(Date);
      expect(variantesDeIa.map((v) => v.id)).toContain(criadas[0].data.variantId);
      expect(variantesDeIa.map((v) => v.professorId)).toContain(
        criadas[0].data.professorId,
      );
      // O deck sai dos tipos da variante SORTEADA, não dos da ficha.
      expect(result.moves).toHaveLength(4);
      for (const move of result.moves) expect(move.type).toBe('ia');
    });

    it('só considera professor ativo no sorteio', async () => {
      const { prisma, filtros } = fakeDb({
        type: 'ia',
        candidatas: variantesDeIa,
      });

      await build(prisma).captureByToken('user-1', token);

      // Professor desativado não pode sair numa ficha que já está impressa.
      expect(filtros[0]).toEqual({
        types: { has: 'ia' },
        professor: { active: true },
      });
    });

    it('não repete professor enquanto houver inédito no tema', async () => {
      // Já tem o primeiro: o sorteio é obrigado a entregar o segundo.
      const { prisma, criadas } = fakeDb({
        type: 'ia',
        candidatas: variantesDeIa,
        possuidas: [{ professorId: professor.id, variantId: 'a-ia' }],
      });

      await build(prisma).captureByToken('user-1', token);

      expect(criadas[0].data.professorId).toBe(profB.id);
      expect(criadas[0].data.variantId).toBe('b-ia');
    });

    it('NÃO consome a ficha quando o tipo não tem professor', async () => {
      const { prisma, ficha, criadas } = fakeDb({ type: 'humanas', candidatas: [] });

      await expect(
        build(prisma).captureByToken('user-1', token),
      ).rejects.toThrow(NotFoundException);

      // O coração da regra: o `throw` acontece DENTRO da transação, então a
      // baixa da ficha é desfeita. O aluno perderia papel e direito de uma vez.
      expect(ficha.redeemedAt).toBeNull();
      expect(criadas).toHaveLength(0);
    });

    it('volta a funcionar depois que um professor do tipo é cadastrado', async () => {
      const vazio = fakeDb({ type: 'humanas', candidatas: [] });
      await expect(
        build(vazio.prisma).captureByToken('user-1', token),
      ).rejects.toThrow(NotFoundException);
      expect(vazio.ficha.redeemedAt).toBeNull();

      // Mesma ficha, agora com professor no tema.
      const comProfessor = fakeDb({
        type: 'humanas',
        candidatas: [
          {
            id: 'h-1',
            typeKey: 'humanas',
            types: ['humanas'],
            professorId: professor.id,
          },
        ],
      });
      const result = await build(comProfessor.prisma).captureByToken(
        'user-1',
        token,
      );

      expect(result.types).toEqual(['humanas']);
      expect(comProfessor.ficha.redeemedAt).toBeInstanceOf(Date);
    });
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
            ivHp: 15,
            ivRigor: 15,
            ivDidatica: 15,
            ivRaciocinio: 15,
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
    expect(capture.stars).toBe(5);
    // Id órfão (golpe removido do jogo) não vira `null` na lista do aluno.
    expect(capture.moves.map((m) => m.id)).toEqual(
      moves.filter((id) => getMoveById(id)),
    );
  });

  it('only ever selects public professor fields', () => {
    expect(Object.keys(PUBLIC_PROFESSOR_SELECT)).not.toContain('captureToken');
  });
});
