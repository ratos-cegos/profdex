import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AdminCaptureTokensService } from './admin-capture-tokens.service';
import { buildSheetEntries } from './capture-sheet';
import { hashCaptureToken } from './capture-token';

describe('AdminCaptureTokensService', () => {
  const variants = [
    {
      id: 'var-1',
      typeKey: 'arquitetura',
      types: ['arquitetura'],
      professor: { name: 'Eron', slug: 'eron' },
    },
    {
      id: 'var-2',
      typeKey: 'ia-ml',
      types: ['ia-ml'],
      professor: { name: 'Eron', slug: 'eron' },
    },
  ];

  /**
   * Banco de mentira que registra o que foi escrito. O ponto dos testes de
   * geração é justamente esse: `preview` não pode escrever nada e `batch`
   * precisa escrever tudo de uma vez.
   */
  function fakeDb(
    { tokens = [] as any[], batches = [] as any[] } = {},
    onWrite?: (kind: string, payload: any) => void,
  ) {
    const tx = {
      captureToken: {
        createMany: jest.fn(({ data }: any) => {
          onWrite?.('tokens', data);
          tokens.push(...data);
          return { count: data.length };
        }),
      },
      qrBatch: {
        create: jest.fn(({ data }: any) => {
          onWrite?.('batch', data);
          batches.push(data);
          return data;
        }),
      },
    };

    return {
      tokens,
      batches,
      db: {
        professorVariant: {
          findMany: jest.fn(({ where }: any) =>
            Promise.resolve(
              where?.id?.in
                ? variants.filter((v) => where.id.in.includes(v.id))
                : variants,
            ),
          ),
        },
        captureToken: {
          // Espelha o `groupBy` do Prisma sobre os tokens de mentira: a
          // contagem é feita no banco justamente para não trazer a tabela
          // inteira, então o mock precisa contar do mesmo jeito.
          groupBy: jest.fn(({ where }: any) =>
            Promise.resolve(
              Object.entries(
                tokens
                  .filter((t) => {
                    if (where.batch !== undefined && t.batch !== where.batch)
                      return false;
                    if (where.redeemedAt === null) return t.redeemedAt === null;
                    if (where.redeemedAt?.not === null)
                      return t.redeemedAt !== null;
                    return true;
                  })
                  .reduce<Record<string, number>>((acc, t) => {
                    acc[t.variantId] = (acc[t.variantId] ?? 0) + 1;
                    return acc;
                  }, {}),
              ).map(([variantId, n]) => ({
                variantId,
                _count: { _all: n },
              })),
            ),
          ),
        },
        qrBatch: {
          findFirst: jest.fn(() => Promise.resolve(batches.at(-1) ?? null)),
        },
        $transaction: jest.fn((fn: any) => fn(tx)),
      } as unknown as PrismaService,
    };
  }

  describe('preview', () => {
    it('devolve o plano sem gravar nada', async () => {
      const escritas: string[] = [];
      const { db, tokens, batches } = fakeDb({}, (kind) => escritas.push(kind));
      const service = new AdminCaptureTokensService(db);

      const plano = await service.preview(3);

      expect(plano.total).toBe(6); // 2 variantes × 3
      expect(plano.lines).toHaveLength(2);
      expect(escritas).toEqual([]);
      expect(tokens).toHaveLength(0);
      expect(batches).toHaveLength(0);
    });

    it('conta só as variantes selecionadas', async () => {
      const { db } = fakeDb();
      const service = new AdminCaptureTokensService(db);

      await expect(service.preview(2, ['var-1'])).resolves.toMatchObject({
        total: 2,
      });
    });
  });

  describe('generate', () => {
    it('grava uma ficha por cópia e uma linha de tiragem', async () => {
      const { db, tokens, batches } = fakeDb();
      const service = new AdminCaptureTokensService(db);

      const { total, batch } = await service.generate('admin-1', 3);

      expect(total).toBe(6);
      expect(tokens).toHaveLength(6);
      expect(batches).toHaveLength(1);
      expect(batches[0]).toMatchObject({
        batch,
        createdById: 'admin-1',
        source: 'panel',
        copies: 3,
        total: 6,
      });
    });

    it('grava apenas o hash — nunca o token em texto puro', async () => {
      const { db, tokens } = fakeDb();
      const service = new AdminCaptureTokensService(db);

      const { html } = await service.generate('admin-1', 1);

      for (const t of tokens) {
        expect(Object.keys(t)).toEqual(['variantId', 'tokenHash', 'batch']);
        expect(t.tokenHash).toMatch(/^[0-9a-f]{64}$/);
        // O hash gravado precisa ser o de um token que existe de verdade: se
        // fosse de outra coisa, a ficha impressa não capturaria nada.
        expect(t.tokenHash).not.toBe(hashCaptureToken(''));
      }
      // A folha carrega os QRs embutidos, não caminhos de arquivo em disco.
      expect(html).toContain('src="data:image/svg+xml;base64,');
      expect(html).not.toContain('.png"');
    });

    // O elo que fecha a feature: o que vai impresso no papel tem de ser aceito
    // pela rota que o aluno usa ao escanear. Se o formato do token divergir das
    // regras do CaptureByTokenDto, a ficha vira papel morto — e só se descobre
    // com o aluno na frente do QR.
    it('o payload do QR passa nas regras do CaptureByTokenDto', () => {
      const entries = buildSheetEntries(
        [
          {
            id: 'v1',
            typeKey: 'logica',
            types: ['logica'],
            professor: { name: 'Eron', slug: 'eron' },
          },
        ],
        3,
      );

      for (const e of entries) {
        expect(e.payload).toBe(`capture:${e.token}`);
        // Mesmas regras do DTO: 32..256 caracteres, só [A-Za-z0-9_-].
        expect(e.token).toMatch(/^[A-Za-z0-9_-]+$/);
        expect(e.token.length).toBeGreaterThanOrEqual(32);
        expect(e.token.length).toBeLessThanOrEqual(256);
        // E o que vai ao banco é o hash desse token, não outro.
        expect(e.tokenHash).toBe(hashCaptureToken(e.token));
      }
      // Cada ficha é única: duas cópias não podem valer a mesma captura.
      expect(new Set(entries.map((e) => e.token)).size).toBe(3);
    });

    it('recusa variante que não existe mais em vez de gerar só o resto', async () => {
      const { db, tokens } = fakeDb();
      const service = new AdminCaptureTokensService(db);

      await expect(
        service.generate('admin-1', 1, ['var-1', 'sumiu']),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(tokens).toHaveLength(0);
    });
  });

  describe('inventory', () => {
    // O estado de toda instalação nova, antes da primeira tiragem. Uma versão
    // desta função filtrava a "última tiragem" por um sentinela '\0' quando não
    // havia nenhuma, e o Postgres recusa byte nulo em texto — ou seja, a tela
    // dava 500 no primeiro acesso, justamente quando o admin vai gerar a
    // primeira ficha.
    it('responde com o estoque zerado quando nunca houve tiragem', async () => {
      const { db } = fakeDb({ tokens: [], batches: [] });
      const service = new AdminCaptureTokensService(db);

      const { lastBatch, variants: rows } = await service.inventory();

      expect(lastBatch).toBeNull();
      expect(rows).toHaveLength(2);
      expect(rows[0]).toMatchObject({
        alive: 0,
        redeemedTotal: 0,
        lastBatch: { total: 0, redeemed: 0 },
      });
      // Sem tiragem não há filtro por batch para montar: as únicas contagens
      // que vão ao banco são as dos totais.
      const filtros = (db.captureToken.groupBy as jest.Mock).mock.calls.map(
        (c) => c[0].where,
      );
      expect(filtros).toHaveLength(2);
      expect(filtros.every((w) => w.batch === undefined)).toBe(true);
    });

    it('separa as fichas da última tiragem do total vivo', async () => {
      const { db } = fakeDb({
        tokens: [
          { variantId: 'var-1', batch: 'antiga', redeemedAt: null },
          { variantId: 'var-1', batch: 'antiga', redeemedAt: new Date() },
          { variantId: 'var-1', batch: 'nova', redeemedAt: null },
          { variantId: 'var-2', batch: 'nova', redeemedAt: null },
        ],
        batches: [
          {
            batch: 'nova',
            createdAt: new Date(),
            source: 'panel',
            copies: 1,
            total: 2,
            createdBy: { name: 'Admin' },
          },
        ],
      });
      const service = new AdminCaptureTokensService(db);

      const { lastBatch, variants: rows } = await service.inventory();

      expect(lastBatch).toMatchObject({ batch: 'nova', createdBy: 'Admin' });
      const eron = rows.find((r) => r.variantId === 'var-1')!;
      // Uma ficha na tiragem nova, mas duas vivas somando as anteriores — é
      // essa diferença que impede o operador de reimprimir sem precisar.
      expect(eron.lastBatch).toEqual({ total: 1, redeemed: 0 });
      expect(eron.alive).toBe(2);
      expect(eron.redeemedTotal).toBe(1);
    });
  });
});
