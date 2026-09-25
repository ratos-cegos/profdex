import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AdminProfessorsService } from './admin-professors.service';
import type { UploadedAssets } from './admin-professors.service';
import { writeAsset } from './asset-storage';
import { UploadedAsset } from './professor-assets';

// O disco fica de fora: o que este teste verifica é a regra, e uma suíte que
// escreve arquivo de verdade passa a depender de permissão de pasta.
jest.mock('./asset-storage', () => ({
  writeAsset: jest.fn().mockResolvedValue(undefined),
  uploadsDir: () => '/tmp/uploads',
}));

const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(8),
]);
const GLB = Buffer.concat([Buffer.from('glTF'), Buffer.alloc(8)]);

const arquivo = (
  name: string,
  mime: string,
  buffer: Buffer,
): UploadedAsset => ({
  originalname: name,
  mimetype: mime,
  size: buffer.length,
  buffer,
});

const arteCompleta = (): UploadedAssets => ({
  spriteFront: [arquivo('f.png', 'image/png', PNG)],
  spriteBack: [arquivo('c.png', 'image/png', PNG)],
  model: [arquivo('m.glb', 'model/gltf-binary', GLB)],
});

function criarPrisma(over: Record<string, unknown> = {}) {
  const professor = {
    create: jest.fn(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: 'prof-novo', ...data }),
    ),
    update: jest.fn(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({
        id: 'prof-1',
        slug: 'eron',
        name: 'Eron',
        types: ['ia'],
        active: true,
        rare: false,
        ...data,
      }),
    ),
    findUnique: jest.fn().mockResolvedValue({ id: 'prof-1', slug: 'eron' }),
    findMany: jest.fn().mockResolvedValue([]),
    delete: jest.fn().mockResolvedValue({}),
  };
  const professorVariant = {
    createMany: jest.fn().mockResolvedValue({ count: 1 }),
  };
  const capture = { groupBy: jest.fn().mockResolvedValue([]) };

  const prisma = {
    professor,
    professorVariant,
    capture,
    $transaction: jest.fn((fn: (tx: unknown) => unknown) =>
      fn({ professor, professorVariant, capture }),
    ),
    ...over,
  };
  return prisma;
}

function criarService(prisma = criarPrisma()) {
  return {
    prisma,
    service: new AdminProfessorsService(prisma as unknown as PrismaService),
  };
}

/**
 * Banco de mentira em que o INSERT fica visível para as leituras seguintes,
 * como num banco de verdade dentro da mesma transação.
 *
 * O `criarPrisma` acima devolve `findMany: []` fixo, e foi essa mentira que
 * deixou passar o bug de 24/09/2026: a checagem de "um raro por tema" rodava
 * depois do `create`, encontrava o próprio professor recém-inserido e recusava
 * o cadastro com o nome dele na mensagem. Nenhum raro conseguia nascer.
 */
function criarPrismaComEstado(existentes: Record<string, unknown>[] = []) {
  const linhas = [...existentes];
  const professor = {
    create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
      const criado = { id: `prof-${linhas.length + 1}`, active: true, ...data };
      linhas.push(criado);
      return Promise.resolve(criado);
    }),
    findMany: jest.fn(({ where }: { where: Record<string, any> }) =>
      Promise.resolve(
        linhas.filter(
          (p: any) =>
            p.rare === where.rare &&
            p.active === where.active &&
            (where.types?.hasSome as string[]).some((t) =>
              (p.types as string[]).includes(t),
            ),
        ),
      ),
    ),
    findUnique: jest.fn().mockResolvedValue({ id: 'prof-1', slug: 'eron' }),
    update: jest.fn(),
    delete: jest.fn().mockResolvedValue({}),
  };
  const professorVariant = {
    createMany: jest.fn().mockResolvedValue({ count: 1 }),
  };
  const capture = { groupBy: jest.fn().mockResolvedValue([]) };

  return {
    linhas,
    professor,
    professorVariant,
    capture,
    $transaction: jest.fn((fn: (tx: unknown) => unknown) =>
      fn({ professor, professorVariant, capture }),
    ),
  };
}

beforeEach(() => jest.clearAllMocks());

describe('AdminProfessorsService', () => {
  describe('cadastro', () => {
    it('deriva o slug do nome, pelo servidor', async () => {
      const { prisma, service } = criarService();

      await service.create(
        { name: 'Ricardo Petri', types: ['ia'] },
        arteCompleta(),
      );

      expect(prisma.professor.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ slug: 'ricardo-petri' }),
        }),
      );
    });

    it('acentos e maiúsculas não vazam para o slug nem para o nome do arquivo', async () => {
      const { prisma, service } = criarService();

      await service.create(
        { name: 'Mário', types: ['algoritmos'] },
        arteCompleta(),
      );

      const { data } = prisma.professor.create.mock.calls[0][0];
      expect(data.slug).toBe('mario');
      expect(data.spriteFrontUrl).toMatch(
        /^\/uploads\/mario-frente\.png\?v=\d+$/,
      );
      expect(writeAsset).toHaveBeenCalledWith('mario-frente.png', PNG);
      expect(writeAsset).toHaveBeenCalledWith('mario-costas.png', PNG);
      expect(writeAsset).toHaveBeenCalledWith('mario.glb', GLB);
    });

    it('recusa nome que não vira slug nenhum', async () => {
      const { service } = criarService();

      await expect(
        service.create({ name: '###', types: ['ia'] }, arteCompleta()),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('exige os três arquivos de arte', async () => {
      const { service } = criarService();
      const semModelo = arteCompleta();
      delete semModelo.model;

      await expect(
        service.create({ name: 'Renata', types: ['ia'] }, semModelo),
      ).rejects.toThrow(/três arquivos/);
    });

    it('recusa arte falsa antes de gravar qualquer byte', async () => {
      const { prisma, service } = criarService();
      const arte = arteCompleta();
      arte.spriteFront = [arquivo('f.png', 'image/png', Buffer.from('MZ\x90'))];

      await expect(
        service.create({ name: 'Renata', types: ['ia'] }, arte),
      ).rejects.toThrow(/não é um .png de verdade/);

      expect(writeAsset).not.toHaveBeenCalled();
      expect(prisma.professor.create).not.toHaveBeenCalled();
    });

    it('cria o professor e as variantes na MESMA transação', async () => {
      const { prisma, service } = criarService();

      await service.create(
        { name: 'Igor', types: ['robotica', 'redes'] },
        arteCompleta(),
      );

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      // Dois tipos → três variantes, todas dentro da transação.
      expect(prisma.professorVariant.createMany).toHaveBeenCalledTimes(3);
    });

    it('colisão de slug vira 409, não 500', async () => {
      const prisma = criarPrisma();
      prisma.professor.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('unique', {
          code: 'P2002',
          clientVersion: '6',
        }),
      );
      const { service } = criarService(prisma);

      await expect(
        service.create({ name: 'Eron', types: ['ia'] }, arteCompleta()),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    /**
     * O professor acabou de nascer e nada aponta para ele. Deixá-lo cadastrado
     * com três URLs para arquivos que não existem seria pior do que desfazer.
     */
    it('desfaz o cadastro se a arte não puder ser gravada', async () => {
      const { prisma, service } = criarService();
      (writeAsset as jest.Mock).mockRejectedValueOnce(new Error('disco cheio'));

      await expect(
        service.create({ name: 'Renata', types: ['ia'] }, arteCompleta()),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(prisma.professor.delete).toHaveBeenCalledWith({
        where: { id: 'prof-novo' },
      });
    });
  });

  describe('edição', () => {
    it('o slug é imutável: renomear não mexe nele nem nos arquivos', async () => {
      const { prisma, service } = criarService();

      await service.update('prof-1', { name: 'Eron Marques' }, {});

      const { data } = prisma.professor.update.mock.calls[0][0];
      expect(data).not.toHaveProperty('slug');
      expect(writeAsset).not.toHaveBeenCalled();
    });

    it('editar só o nome não zera os tipos', async () => {
      const { prisma, service } = criarService();

      await service.update('prof-1', { name: 'Eron Marques' }, {});

      expect(prisma.professor.update.mock.calls[0][0].data).not.toHaveProperty(
        'types',
      );
    });

    it('trocar a arte gera URL com versão nova, para furar o cache', async () => {
      const { prisma, service } = criarService();
      const antes = Date.now();

      await service.update(
        'prof-1',
        {},
        {
          spriteFront: [arquivo('nova.png', 'image/png', PNG)],
        },
      );

      const { data } = prisma.professor.update.mock.calls[0][0];
      const versao = Number(String(data.spriteFrontUrl).split('?v=')[1]);
      expect(data.spriteFrontUrl).toMatch(/^\/uploads\/eron-frente\.png\?v=/);
      expect(versao).toBeGreaterThanOrEqual(antes);
      // Só o campo enviado muda: a arte que não veio fica como estava.
      expect(data).not.toHaveProperty('spriteBackUrl');
      expect(data).not.toHaveProperty('modelUrl');
    });

    it('editar tipos acrescenta as variantes que faltam', async () => {
      const prisma = criarPrisma();
      prisma.professor.update.mockResolvedValue({
        id: 'prof-1',
        slug: 'eron',
        name: 'Eron',
        active: true,
        rare: false,
        types: ['arquitetura', 'ia'],
      });
      const { service } = criarService(prisma);

      await service.update('prof-1', { types: ['arquitetura', 'ia'] }, {});

      expect(prisma.professorVariant.createMany).toHaveBeenCalledTimes(3);
    });
  });

  /**
   * Professor raro (tarefa 15). O gate do quiz são os `types` dele, e a
   * raridade é decidida no cadastro e nunca mais.
   */
  describe('professor raro', () => {
    it('grava rare e cria UMA variante, não três', async () => {
      const { prisma, service } = criarService();

      await service.create(
        { name: 'Eron', types: ['matematica', 'ia'], rare: true },
        arteCompleta(),
      );

      expect(prisma.professor.create.mock.calls[0][0].data.rare).toBe(true);
      expect(prisma.professorVariant.createMany).toHaveBeenCalledTimes(1);
      expect(
        prisma.professorVariant.createMany.mock.calls[0][0].data.typeKey,
      ).toBe('ia+matematica');
    });

    it('professor comum continua nascendo com rare: false', async () => {
      const { prisma, service } = criarService();

      await service.create({ name: 'Renata', types: ['ia'] }, arteCompleta());

      expect(prisma.professor.create.mock.calls[0][0].data.rare).toBe(false);
    });

    /**
     * Um raro por tema (decisão 8). O 409 vem ANTES de qualquer escrita: nem
     * linha no banco, nem byte de arte no volume de uploads.
     */
    it('recusa com TEMA_JA_TEM_RARO quando o tema já tem raro ativo', async () => {
      const prisma = criarPrisma();
      prisma.professor.findMany.mockResolvedValue([
        { name: 'Eron', types: ['matematica', 'ia'] },
      ]);
      const { service } = criarService(prisma);

      const erro = await service
        .create(
          { name: 'Outro', types: ['matematica'], rare: true },
          arteCompleta(),
        )
        .catch((e: unknown) => e);

      expect(erro).toBeInstanceOf(ConflictException);
      expect((erro as ConflictException).getResponse()).toMatchObject({
        code: 'TEMA_JA_TEM_RARO',
        temas: ['matematica'],
      });
      expect(prisma.professor.create).not.toHaveBeenCalled();
      expect(writeAsset).not.toHaveBeenCalled();
    });

    it('a busca por tema ocupado olha só raros ATIVOS', async () => {
      const prisma = criarPrisma();
      const { service } = criarService(prisma);

      await service.create(
        { name: 'Eron', types: ['matematica'], rare: true },
        arteCompleta(),
      );

      expect(prisma.professor.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ rare: true, active: true }),
        }),
      );
    });

    /**
     * Regressão do bug que foi para produção em 24/09/2026 e impedia QUALQUER
     * raro de existir: a checagem de "um raro por tema" rodava depois do
     * `create`, dentro da mesma transação, e enxergava a linha recém-inserida.
     * O professor era recusado por conflito consigo mesmo — a mensagem de erro
     * trazia o nome que o admin tinha acabado de digitar — e o rollback deixava
     * o banco sem raro nenhum, o que fazia a próxima tentativa falhar igual.
     */
    it('o primeiro raro de um tema livre é cadastrado', async () => {
      const prisma = criarPrismaComEstado();
      const { service } = criarService(prisma);

      const criado = await service.create(
        { name: 'Tânia Palmeiras', types: ['matematica'], rare: true },
        arteCompleta(),
      );

      expect(criado.name).toBe('Tânia Palmeiras');
      expect(prisma.linhas).toHaveLength(1);
    });

    it('o raro não entra em conflito consigo mesmo dentro da transação', async () => {
      const prisma = criarPrismaComEstado();
      const { service } = criarService(prisma);

      // Dois tipos é o caso mais sensível: o `hasSome` casa pelos dois temas.
      await expect(
        service.create(
          { name: 'Eron', types: ['matematica', 'ia'], rare: true },
          arteCompleta(),
        ),
      ).resolves.toMatchObject({ rare: true });
    });

    it('mas um SEGUNDO raro no mesmo tema continua sendo recusado', async () => {
      const prisma = criarPrismaComEstado([
        {
          id: 'raro-1',
          name: 'Tânia Palmeiras',
          types: ['matematica'],
          rare: true,
          active: true,
        },
      ]);
      const { service } = criarService(prisma);

      await expect(
        service.create(
          { name: 'Outro', types: ['matematica'], rare: true },
          arteCompleta(),
        ),
      ).rejects.toBeInstanceOf(ConflictException);
      // Nada gravado: continua só o raro que já existia.
      expect(prisma.linhas).toHaveLength(1);
    });

    it('professor COMUM não consulta o limite de um raro por tema', async () => {
      const prisma = criarPrisma();
      const { service } = criarService(prisma);

      await service.create(
        { name: 'Renata', types: ['matematica'] },
        arteCompleta(),
      );

      expect(prisma.professor.findMany).not.toHaveBeenCalled();
    });

    /**
     * `rare` é imutável: virar raro alguém que já tem exemplares em circulação
     * o tiraria da contagem da dex de todo mundo e deixaria as variantes dele
     * órfãs. O DTO de update nem tem o campo — este teste fixa que um corpo
     * forjado também não passa.
     */
    it('o PATCH não altera rare, mesmo com o campo no corpo', async () => {
      const { prisma, service } = criarService();

      await service.update('prof-1', { name: 'Eron', rare: true } as never, {});

      expect(prisma.professor.update.mock.calls[0][0].data).not.toHaveProperty(
        'rare',
      );
    });

    /**
     * Ao editar um raro, o `rare` usado nas variantes vem do BANCO. Se viesse
     * do corpo, trocar os tipos de um raro materializaria as três combinações.
     */
    it('editar os tipos de um raro continua criando uma variante só', async () => {
      const prisma = criarPrisma();
      prisma.professor.update.mockResolvedValue({
        id: 'raro-1',
        slug: 'eron',
        name: 'Eron',
        active: true,
        rare: true,
        types: ['matematica', 'ia'],
      });
      const { service } = criarService(prisma);

      await service.update('raro-1', { types: ['matematica', 'ia'] }, {});

      expect(prisma.professorVariant.createMany).toHaveBeenCalledTimes(1);
    });
  });

  describe('desativar', () => {
    /**
     * É o "remover" do painel. Nunca um DELETE: as FKs de captures,
     * discoveries, battle_slots e capture_tokens fariam o apagamento cascatear
     * na coleção dos alunos e no histórico de ranking.
     */
    it('desativa sem apagar o professor nem as capturas', async () => {
      const { prisma, service } = criarService();

      await service.setActive('prof-1', false);

      expect(prisma.professor.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'prof-1' },
          data: { active: false },
        }),
      );
      expect(prisma.professor.delete).not.toHaveBeenCalled();
    });

    it('404 quando o professor não existe', async () => {
      const prisma = criarPrisma();
      prisma.professor.findUnique.mockResolvedValue(null);
      const { service } = criarService(prisma);

      await expect(service.setActive('sumiu', false)).rejects.toThrow(
        /não encontrado/,
      );
    });
  });

  describe('listagem', () => {
    it('traz inativos e a contagem de exemplares capturados', async () => {
      const prisma = criarPrisma();
      prisma.professor.findMany.mockResolvedValue([
        { id: 'prof-1', name: 'Eron', active: true },
        { id: 'prof-2', name: 'Fora', active: false },
      ]);
      prisma.capture.groupBy.mockResolvedValue([
        { professorId: 'prof-2', _count: { _all: 7 } },
      ]);
      const { service } = criarService(prisma);

      const lista = await service.list();

      // Sem `where` no findMany: a lista do painel mostra o elenco inteiro.
      expect(prisma.professor.findMany.mock.calls[0][0]).not.toHaveProperty(
        'where',
      );
      expect(lista.map((p) => p.capturedCount)).toEqual([0, 7]);
    });
  });
});
