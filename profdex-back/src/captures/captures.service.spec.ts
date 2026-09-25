import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
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
    candidatas = [variant] as (typeof variant)[],
    /** O que o aluno já tem, para escolher a faixa do sorteio. */
    possuidas = [] as { professorId: string; variantId: string | null }[],
    /** A ficha é de um professor RARO (aponta para a variante única dele). */
    raro = false,
    /** Raro desativado: sai de circulação sem tirar o exemplar de quem tem. */
    raroAtivo = true,
    /** Temas que o aluno já destravou na bancada (`rare_unlocks`). */
    destravados = [] as string[],
    /** Ele já capturou este raro? A trava de "1 por conta". */
    jaTemRaro = false,
  } = {}) {
    const ficha = {
      id: 'token-1',
      tokenHash,
      redeemedAt: redeemed ? new Date() : (null as Date | null),
      type,
      variant: type
        ? null
        : {
            ...variant,
            professor: {
              rare: raro,
              active: raroAtivo,
              name: professor.name,
              types: variant.types,
            },
          },
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
      rareUnlock: {
        findMany: jest.fn(({ where }: any) =>
          Promise.resolve(
            (where.theme?.in ?? [])
              .filter((t: string) => destravados.includes(t))
              .map((theme: string) => ({ theme })),
          ),
        ),
      },
      capture: {
        findMany: jest.fn(() => Promise.resolve(possuidas)),
        findFirst: jest.fn(() =>
          Promise.resolve(jaTemRaro ? { id: 'capture-antiga' } : null),
        ),
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
      $transaction: jest.fn(
        async (callback: (c: typeof transaction) => any) => {
          const antes = ficha.redeemedAt;
          try {
            return await callback(transaction);
          } catch (erro) {
            ficha.redeemedAt = antes;
            throw erro;
          }
        },
      ),
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
    expect(criadas[0].data).toEqual(
      expect.objectContaining({
        ivHp: 8,
        ivRigor: 8,
        ivDidatica: 8,
        ivRaciocinio: 8,
      }),
    );
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
      expect(variantesDeIa.map((v) => v.id)).toContain(
        criadas[0].data.variantId,
      );
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
      // Raro tampouco: ele só sai pela ficha própria (tarefa 15, decisão 10).
      expect(filtros[0]).toEqual({
        types: { has: 'ia' },
        professor: { active: true, rare: false },
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
      const { prisma, ficha, criadas } = fakeDb({
        type: 'humanas',
        candidatas: [],
      });

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

  /**
   * Ficha de professor raro (tarefa 15). O servidor é o porteiro — não a mesa.
   *
   * O invariante que estes testes existem para proteger é um só: **recusa não
   * consome papel**. A checagem roda DENTRO da transação, e o `throw` desfaz a
   * baixa. Fora dela, o pior desfecho possível aconteceria em silêncio — o
   * aluno perde a ficha E não recebe nada, no meio do evento, sem reverter.
   */
  describe('ficha rara', () => {
    it('quem não destravou os temas leva 403 e a ficha CONTINUA valendo', async () => {
      const { prisma, ficha, criadas } = fakeDb({
        raro: true,
        destravados: [], // não destravou nada
      });

      const erro = await build(prisma)
        .captureByToken('user-1', token)
        .catch((e: unknown) => e);

      expect(erro).toBeInstanceOf(ForbiddenException);
      expect((erro as ForbiddenException).getResponse()).toMatchObject({
        code: 'RARO_BLOQUEADO',
      });
      // O invariante: o papel volta para a pilha.
      expect(ficha.redeemedAt).toBeNull();
      expect(criadas).toHaveLength(0);
    });

    it('destravar só UM dos dois temas ainda é 403 — o gate é E, não OU', async () => {
      const { prisma, ficha } = fakeDb({
        raro: true,
        destravados: ['arquitetura'], // falta "ia"
      });

      await expect(
        build(prisma).captureByToken('user-1', token),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(ficha.redeemedAt).toBeNull();
    });

    it('a mensagem do bloqueio não diz qual tema falta', async () => {
      const { prisma } = fakeDb({ raro: true, destravados: ['arquitetura'] });

      const erro = (await build(prisma)
        .captureByToken('user-1', token)
        .catch((e: unknown) => e)) as ForbiddenException;

      // Dizer "falta IA" entregaria o tema do raro para quem pegou a ficha
      // emprestada — a mesma regra que tira o raro da lista da bancada.
      const corpo = JSON.stringify(erro.getResponse());
      expect(corpo).not.toContain('ia');
      expect(corpo).not.toContain('arquitetura');
    });

    it('quem destravou TODOS os temas captura normalmente', async () => {
      const { prisma, ficha, criadas } = fakeDb({
        raro: true,
        destravados: ['arquitetura', 'ia'],
      });

      const resultado = await build(prisma).captureByToken('user-1', token);

      expect(ficha.redeemedAt).toBeInstanceOf(Date);
      expect(criadas).toHaveLength(1);
      // Exemplar igual a qualquer outro: variante, deck e IVs do sorteio normal.
      expect(resultado.moves.length).toBeGreaterThan(0);
      expect(resultado.types).toEqual(['arquitetura', 'ia']);
      expect(resultado).toHaveProperty('stars');
    });

    it('a segunda ficha do mesmo raro dá 409 sem consumir o papel', async () => {
      const { prisma, ficha, criadas } = fakeDb({
        raro: true,
        destravados: ['arquitetura', 'ia'],
        jaTemRaro: true,
      });

      const erro = await build(prisma)
        .captureByToken('user-1', token)
        .catch((e: unknown) => e);

      expect(erro).toBeInstanceOf(ConflictException);
      expect((erro as ConflictException).getResponse()).toMatchObject({
        code: 'RARO_JA_CAPTURADO',
      });
      expect(ficha.redeemedAt).toBeNull();
      expect(criadas).toHaveLength(0);
    });

    /** Decisão residual 2: quem já capturou mantém o exemplar; a ficha, não. */
    it('raro desativado dá 404 sem consumir o papel', async () => {
      const { prisma, ficha } = fakeDb({
        raro: true,
        raroAtivo: false,
        destravados: ['arquitetura', 'ia'],
      });

      const erro = await build(prisma)
        .captureByToken('user-1', token)
        .catch((e: unknown) => e);

      expect(erro).toBeInstanceOf(NotFoundException);
      expect((erro as NotFoundException).getResponse()).toMatchObject({
        code: 'RARO_INDISPONIVEL',
      });
      expect(ficha.redeemedAt).toBeNull();
    });

    /**
     * Decisão 10. Sem o filtro, o raro cairia na Faixa 1 do sorteio (professor
     * inédito), que é a preferencial — ele seria o resultado *mais provável* de
     * uma ficha comum, e a via do quiz deixaria de existir na prática.
     */
    it('ficha COMUM nunca pode entregar raro: o sorteio filtra na consulta', async () => {
      const { prisma, filtros } = fakeDb({ type: 'ia' });

      await build(prisma).captureByToken('user-1', token);

      expect(filtros).toHaveLength(1);
      expect(filtros[0].professor).toEqual({ active: true, rare: false });
    });

    it('a ficha comum não passa pelo porteiro do raro', async () => {
      const { prisma, transaction } = fakeDb({ type: 'ia' });

      await build(prisma).captureByToken('user-1', token);

      expect(transaction.rareUnlock.findMany).not.toHaveBeenCalled();
    });
  });
});
