import { BadRequestException, NotFoundException } from '@nestjs/common';
import { TYPE_CYCLE } from '../battle/engine/types';
import { PrismaService } from '../prisma/prisma.service';
import { AdminCaptureTokensService } from './admin-capture-tokens.service';
import { buildSheetEntries } from './capture-sheet';
import { hashCaptureToken } from './capture-token';

describe('AdminCaptureTokensService', () => {
  /**
   * Eron é de dois tipos e rende três variantes; Mário é de um. Serve para
   * separar "quantos professores deste tipo" de "quantas variantes": contar
   * variantes diria 2 professores de arquitetura onde há 1.
   */
  const variantes = [
    { professorId: 'eron', types: ['arquitetura'] },
    { professorId: 'eron', types: ['ia'] },
    { professorId: 'eron', types: ['arquitetura', 'ia'] },
    { professorId: 'mario', types: ['algoritmos'] },
  ];

  /**
   * Banco de mentira que registra o que foi escrito. O ponto dos testes de
   * geração é justamente esse: `preview` não pode escrever nada e `batch`
   * precisa escrever tudo de uma vez.
   */
  function fakeDb(
    {
      tokens = [] as any[],
      batches = [] as any[],
      professorVariants = variantes,
      /** Professores RAROS ativos, com as variantes de cada um. */
      raros = [] as any[],
    } = {},
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

    const filtrosDeVariante: any[] = [];

    return {
      tokens,
      batches,
      filtrosDeVariante,
      db: {
        professorVariant: {
          findMany: jest.fn(({ where }: any) => {
            filtrosDeVariante.push(where);
            return Promise.resolve(professorVariants);
          }),
        },
        professor: {
          findMany: jest.fn(() => Promise.resolve(raros)),
          findFirst: jest.fn(({ where }: any) =>
            Promise.resolve(raros.find((r) => r.id === where.id) ?? null),
          ),
        },
        captureToken: {
          // Espelha o `groupBy` do Prisma sobre os tokens de mentira: a
          // contagem é feita no banco justamente para não trazer a tabela
          // inteira, então o mock precisa contar do mesmo jeito.
          groupBy: jest.fn(({ by, where }: any) => {
            // O estoque de raros agrupa por variante, não por tipo — a ficha
            // rara tem `type: null` e nunca apareceria no agrupamento por tipo.
            if (by?.[0] === 'variantId') {
              return Promise.resolve(
                Object.entries(
                  tokens
                    .filter((t) => {
                      if (!t.variantId) return false;
                      if (where.redeemedAt === null) return !t.redeemedAt;
                      if (where.redeemedAt?.not === null)
                        return Boolean(t.redeemedAt);
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
              );
            }
            return Promise.resolve(
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
                    acc[t.type] = (acc[t.type] ?? 0) + 1;
                    return acc;
                  }, {}),
              ).map(([type, n]) => ({ type, _count: { _all: n } })),
            );
          }),
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

      // Sem seleção, a roda inteira: 9 tipos × 3.
      expect(plano.lines).toHaveLength(TYPE_CYCLE.length);
      expect(plano.total).toBe(TYPE_CYCLE.length * 3);
      expect(escritas).toEqual([]);
      expect(tokens).toHaveLength(0);
      expect(batches).toHaveLength(0);
    });

    it('conta só os tipos selecionados', async () => {
      const { db } = fakeDb();
      const service = new AdminCaptureTokensService(db);

      await expect(service.preview(2, ['ia'])).resolves.toMatchObject({
        total: 2,
      });
    });

    it('mostra quantos professores cada tipo tem, zero incluído', async () => {
      const { db } = fakeDb();
      const service = new AdminCaptureTokensService(db);

      const { lines } = await service.preview(1, [
        'ia',
        'arquitetura',
        'redes',
      ]);

      // Eron é de arquitetura E de ia: um professor, não um por variante.
      expect(lines.find((l) => l.type === 'ia')!.professors).toBe(1);
      expect(lines.find((l) => l.type === 'arquitetura')!.professors).toBe(1);
      // É a última tela antes de imprimir — o zero precisa aparecer aqui.
      expect(lines.find((l) => l.type === 'redes')!.professors).toBe(0);
    });
  });

  describe('generate', () => {
    const comTodosOsTipos = () =>
      TYPE_CYCLE.map((type) => ({
        professorId: `prof-${type}`,
        types: [type],
      }));

    it('grava uma ficha por cópia e uma linha de tiragem', async () => {
      const { db, tokens, batches } = fakeDb({
        professorVariants: comTodosOsTipos(),
      });
      const service = new AdminCaptureTokensService(db);

      const { total, batch } = await service.generate('admin-1', 3);

      expect(total).toBe(TYPE_CYCLE.length * 3);
      expect(tokens).toHaveLength(TYPE_CYCLE.length * 3);
      expect(batches).toHaveLength(1);
      expect(batches[0]).toMatchObject({
        batch,
        createdById: 'admin-1',
        source: 'panel',
        copies: 3,
        total: TYPE_CYCLE.length * 3,
      });
      // A auditoria guarda os TIPOS da tiragem, não mais variantes.
      expect(batches[0].types).toEqual([...TYPE_CYCLE]);
    });

    it('grava apenas o hash — nunca o token em texto puro', async () => {
      const { db, tokens } = fakeDb({ professorVariants: comTodosOsTipos() });
      const service = new AdminCaptureTokensService(db);

      const { html } = await service.generate('admin-1', 1);

      for (const t of tokens) {
        expect(Object.keys(t)).toEqual(['type', 'tokenHash', 'batch']);
        expect(t.tokenHash).toMatch(/^[0-9a-f]{64}$/);
        // O hash gravado precisa ser o de um token que existe de verdade: se
        // fosse de outra coisa, a ficha impressa não capturaria nada.
        expect(t.tokenHash).not.toBe(hashCaptureToken(''));
      }
      // A folha carrega os QRs embutidos, não caminhos de arquivo em disco.
      expect(html).toContain('src="data:image/svg+xml;base64,');
      expect(html).not.toContain('.png"');
    });

    it('a ficha impressa anuncia o TIPO, não um professor', async () => {
      const { db } = fakeDb({ professorVariants: comTodosOsTipos() });
      const service = new AdminCaptureTokensService(db);

      const { html } = await service.generate('admin-1', 1, ['ia']);

      expect(html).toContain('IA');
      expect(html).toContain('Vale uma captura de um professor deste tipo');
      // Quem sai é sorteado no scan: nome de professor na folha seria mentira.
      expect(html).not.toContain('Prof. ');
    });

    // O elo que fecha a feature: o que vai impresso no papel tem de ser aceito
    // pela rota que o aluno usa ao escanear. Se o formato do token divergir das
    // regras do CaptureByTokenDto, a ficha vira papel morto — e só se descobre
    // com o aluno na frente do QR.
    it('o payload do QR passa nas regras do CaptureByTokenDto', () => {
      const entries = buildSheetEntries(['humanas'], 3);

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
      // O arquivo da tiragem em disco é nomeado pelo tipo.
      expect(entries[0].file).toBe('humanas--1');
    });

    it('recusa tipo fora da roda em vez de gerar só o resto', async () => {
      const { db, tokens } = fakeDb();
      const service = new AdminCaptureTokensService(db);

      await expect(
        service.generate('admin-1', 1, ['ia', 'sumiu']),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(tokens).toHaveLength(0);
    });

    it('barra tiragem de tipo sem professor ativo', async () => {
      const { db, tokens, batches } = fakeDb();
      const service = new AdminCaptureTokensService(db);

      // `redes` não tem ninguém: a ficha sairia e o scan só devolveria erro.
      await expect(
        service.generate('admin-1', 2, ['ia', 'redes']),
      ).rejects.toBeInstanceOf(BadRequestException);
      // Nada parcial: a tiragem inteira é recusada, não só a linha vazia.
      expect(tokens).toHaveLength(0);
      expect(batches).toHaveLength(0);
    });

    it('deixa passar tipo vazio com confirmação explícita', async () => {
      const { db, tokens } = fakeDb();
      const service = new AdminCaptureTokensService(db);

      const { total } = await service.generate('admin-1', 2, ['redes'], {
        allowEmpty: true,
      });

      expect(total).toBe(2);
      expect(tokens).toHaveLength(2);
    });

    it('só conta professor ATIVO ao decidir se o tipo está vazio', async () => {
      const { db, filtrosDeVariante } = fakeDb({
        professorVariants: comTodosOsTipos(),
      });
      const service = new AdminCaptureTokensService(db);

      await service.generate('admin-1', 1, ['ia']);

      expect(filtrosDeVariante[0]).toEqual({ professor: { active: true } });
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

      const { lastBatch, types: rows } = await service.inventory();

      expect(lastBatch).toBeNull();
      // A roda inteira, sempre — inclusive os tipos que nunca tiveram ficha.
      expect(rows).toHaveLength(TYPE_CYCLE.length);
      expect(rows.map((r) => r.type)).toEqual([...TYPE_CYCLE]);
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

    it('agrupa o estoque por tipo e separa a última tiragem do total vivo', async () => {
      const { db } = fakeDb({
        tokens: [
          { type: 'ia', batch: 'antiga', redeemedAt: null },
          { type: 'ia', batch: 'antiga', redeemedAt: new Date() },
          { type: 'ia', batch: 'nova', redeemedAt: null },
          { type: 'algoritmos', batch: 'nova', redeemedAt: null },
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

      const { lastBatch, types: rows } = await service.inventory();

      expect(lastBatch).toMatchObject({ batch: 'nova', createdBy: 'Admin' });
      const ia = rows.find((r) => r.type === 'ia')!;
      // Uma ficha na tiragem nova, mas duas vivas somando as anteriores — é
      // essa diferença que impede o operador de reimprimir sem precisar.
      expect(ia.lastBatch).toEqual({ total: 1, redeemed: 0 });
      expect(ia.alive).toBe(2);
      expect(ia.redeemedTotal).toBe(1);
    });

    it('conta professores ativos por tipo e marca os tipos vazios', async () => {
      const { db } = fakeDb();
      const service = new AdminCaptureTokensService(db);

      const { types: rows } = await service.inventory();

      // Eron responde por arquitetura e ia; Mário por algoritmos.
      expect(rows.find((r) => r.type === 'ia')!.professors).toBe(1);
      expect(rows.find((r) => r.type === 'arquitetura')!.professors).toBe(1);
      expect(rows.find((r) => r.type === 'algoritmos')!.professors).toBe(1);
      // Gerar tiragem destes é imprimir papel que não captura nada.
      const vazios = rows.filter((r) => r.professors === 0).map((r) => r.type);
      expect(vazios).toContain('redes');
      expect(vazios).toContain('humanas');
    });
  });

  /**
   * Fichas de professor raro (tarefa 15). Pilha própria por raro, nunca no
   * mesmo papel da tiragem por tipo: misturar as duas acaba com o raro nos
   * primeiros 10 minutos de evento.
   */
  describe('tiragem rara', () => {
    const ERON = {
      id: 'raro-1',
      name: 'Eron',
      types: ['matematica', 'ia'],
      variants: [{ id: 'var-rara', typeKey: 'ia+matematica' }],
    };

    it('grava tokens com variantId, type nulo e a tiragem com rareProfessorId', async () => {
      const { db, tokens, batches } = fakeDb({ raros: [ERON] });
      const service = new AdminCaptureTokensService(db);

      const folha = await service.generateRare('admin-1', 'raro-1', 5);

      expect(tokens).toHaveLength(5);
      expect(tokens.every((t) => t.variantId === 'var-rara')).toBe(true);
      // `type` não é enviado: a ficha rara é do caminho da variante.
      expect(tokens.every((t) => t.type === undefined)).toBe(true);
      expect(batches).toHaveLength(1);
      expect(batches[0]).toMatchObject({
        rareProfessorId: 'raro-1',
        types: [],
        copies: 5,
        total: 5,
      });
      expect(folha.total).toBe(5);
    });

    it('a folha identifica o raro pelo nome e lista os temas exigidos', async () => {
      const { db } = fakeDb({ raros: [ERON] });
      const service = new AdminCaptureTokensService(db);

      const { html } = await service.generateRare('admin-1', 'raro-1', 1);

      expect(html).toContain('✦ RARO — ERON');
      // Com gate de dois temas, "✦ RARO — MATEMÁTICA" seria ambíguo: a folha
      // precisa do nome E da lista de temas.
      expect(html).toContain('Matemática + IA');
    });

    it('recusa professor que não é raro ou está inativo', async () => {
      const { db, tokens } = fakeDb({ raros: [] });
      const service = new AdminCaptureTokensService(db);

      await expect(
        service.generateRare('admin-1', 'nao-existe', 3),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(tokens).toHaveLength(0);
    });

    it('o estoque por raro conta vivas e resgatadas pela variante', async () => {
      const { db } = fakeDb({
        raros: [ERON],
        tokens: [
          { variantId: 'var-rara', redeemedAt: null },
          { variantId: 'var-rara', redeemedAt: null },
          { variantId: 'var-rara', redeemedAt: new Date() },
        ],
      });
      const service = new AdminCaptureTokensService(db);

      const { rares } = await service.inventory();

      expect(rares).toHaveLength(1);
      expect(rares[0]).toMatchObject({
        professorId: 'raro-1',
        name: 'Eron',
        themes: ['matematica', 'ia'],
        alive: 2,
        redeemedTotal: 1,
      });
    });

    /**
     * O estoque por TIPO não pode mudar ao cadastrar um raro daquele tipo: o
     * número ali responde "quantos professores podem sair numa ficha comum
     * deste tipo", e o raro nunca sai numa.
     */
    it('o estoque por tipo ignora o raro na contagem de professores', async () => {
      const { db, filtrosDeVariante } = fakeDb({ raros: [ERON] });
      const service = new AdminCaptureTokensService(db);

      await service.inventory();

      expect(filtrosDeVariante[0]).toEqual({
        professor: { active: true, rare: false },
      });
    });

    it('sem raro cadastrado, o estoque de raros é uma lista vazia', async () => {
      const { db } = fakeDb({ raros: [] });
      const service = new AdminCaptureTokensService(db);

      await expect(service.inventory()).resolves.toMatchObject({ rares: [] });
    });
  });
});
