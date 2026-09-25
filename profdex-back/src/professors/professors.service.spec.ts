import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PUBLIC_PROFESSOR_SELECT } from './public-professor.select';
import { ProfessorsService } from './professors.service';

describe('ProfessorsService', () => {
  const professor = {
    id: 'prof-1',
    name: 'Professor',
    slug: 'professor',
    types: ['ia'],
    spriteFrontUrl: '/uploads/professor-frente.png?v=1',
    spriteBackUrl: '/uploads/professor-costas.png?v=1',
    modelUrl: '/uploads/professor.glb?v=1',
    pixelArt: false,
    active: true,
  };

  it('returns only public professor fields with user progression', async () => {
    const prisma = {
      professor: {
        findMany: jest.fn().mockResolvedValue([professor]),
      },
      discovery: {
        findMany: jest.fn().mockResolvedValue([{ professorId: professor.id }]),
      },
      capture: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const service = new ProfessorsService(prisma as unknown as PrismaService);

    const result = await service.findAll('user-1');

    expect(prisma.professor.findMany).toHaveBeenCalledWith({
      where: { active: true, rare: false },
      orderBy: { name: 'asc' },
      select: PUBLIC_PROFESSOR_SELECT,
    });
    expect(result).toEqual([
      { ...professor, discovered: true, captured: false, capturedCount: 0 },
    ]);
    expect(JSON.stringify(result)).not.toContain('captureToken');
  });

  /**
   * O "remover" do painel é desativar. A Profdex do aluno é a lista de quem
   * ainda está em circulação — um professor fora de circulação continua no
   * banco (e no bolso de quem o capturou), mas não aparece aqui.
   */
  it('esconde professor inativo da Profdex do aluno', async () => {
    const prisma = {
      professor: { findMany: jest.fn().mockResolvedValue([]) },
      discovery: { findMany: jest.fn().mockResolvedValue([]) },
      capture: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new ProfessorsService(prisma as unknown as PrismaService);

    await service.findAll('user-1');

    expect(prisma.professor.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { active: true, rare: false } }),
    );
  });

  it('counts every exemplar of the same professor', async () => {
    const prisma = {
      professor: { findMany: jest.fn().mockResolvedValue([professor]) },
      discovery: {
        findMany: jest.fn().mockResolvedValue([{ professorId: professor.id }]),
      },
      // Três fichas resgatadas do mesmo professor, em combinações diferentes.
      capture: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { professorId: professor.id },
            { professorId: professor.id },
            { professorId: professor.id },
          ]),
      },
    };
    const service = new ProfessorsService(prisma as unknown as PrismaService);

    const [result] = await service.findAll('user-1');

    expect(result.captured).toBe(true);
    expect(result.capturedCount).toBe(3);
  });

  it('uses the public allowlist when retrieving one professor', async () => {
    const prisma = {
      professor: {
        findUnique: jest.fn().mockResolvedValue({ ...professor, rare: false }),
      },
      capture: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const service = new ProfessorsService(prisma as unknown as PrismaService);

    await expect(service.findOne(professor.id, 'user-1')).resolves.toEqual(
      professor,
    );
    // `rare` é lido para decidir o acesso, mas NÃO atravessa a fronteira.
    expect(prisma.professor.findUnique).toHaveBeenCalledWith({
      where: { id: professor.id },
      select: { ...PUBLIC_PROFESSOR_SELECT, rare: true },
    });
  });

  /**
   * Professor raro (tarefa 15). O segredo é **em que tema existe raro**, e a
   * regra do repositório é que o front só esconde o que nunca recebeu.
   */
  describe('raros', () => {
    const raro = { ...professor, id: 'raro-1', name: 'Eron', rare: true };

    function prismaCom({ owned = [] as (typeof professor)[], total = 1 } = {}) {
      return {
        professor: {
          count: jest.fn().mockResolvedValue(total),
          findUnique: jest.fn().mockResolvedValue(raro),
        },
        capture: {
          findMany: jest
            .fn()
            .mockResolvedValue(owned.map((p) => ({ professor: p }))),
          findFirst: jest
            .fn()
            .mockResolvedValue(owned.length ? { id: 'cap-1' } : null),
        },
      };
    }

    /**
     * A resposta de quem não tem nada é literalmente `{ total, owned: [] }`.
     * Nem nome, nem tipo, nem URL de arte de raro não capturado — esconder no
     * CSS não é esconder: o DevTools do celular está a dois toques.
     */
    it('quem não capturou nada recebe só a contagem', async () => {
      const prisma = prismaCom({ total: 1 });
      const service = new ProfessorsService(prisma as unknown as PrismaService);

      const resultado = await service.findRares('user-1');

      expect(resultado).toEqual({ total: 1, owned: [] });
      expect(JSON.stringify(resultado)).not.toContain('Eron');
      expect(JSON.stringify(resultado)).not.toContain('uploads');
    });

    it('o total conta só os raros ATIVOS', async () => {
      const prisma = prismaCom();
      const service = new ProfessorsService(prisma as unknown as PrismaService);

      await service.findRares('user-1');

      expect(prisma.professor.count).toHaveBeenCalledWith({
        where: { rare: true, active: true },
      });
    });

    it('o raro capturado volta inteiro, para o card abrir', async () => {
      const prisma = prismaCom({ owned: [{ ...professor, name: 'Eron' }] });
      const service = new ProfessorsService(prisma as unknown as PrismaService);

      const resultado = await service.findRares('user-1');

      expect(resultado.total).toBe(1);
      expect(resultado.owned).toHaveLength(1);
      expect(resultado.owned[0].name).toBe('Eron');
    });

    it('GET /professors/:id de raro NÃO possuído é 404, não 403', async () => {
      // 403 confirmaria a existência — e com ela, que aquele id é um raro.
      const prisma = prismaCom({ owned: [] });
      const service = new ProfessorsService(prisma as unknown as PrismaService);

      await expect(service.findOne('raro-1', 'user-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('o dono do raro consegue abrir a ficha dele', async () => {
      const prisma = prismaCom({ owned: [professor] });
      const service = new ProfessorsService(prisma as unknown as PrismaService);

      const resultado = await service.findOne('raro-1', 'user-1');

      expect(resultado.name).toBe('Eron');
      expect(resultado).not.toHaveProperty('rare');
    });
  });
});
