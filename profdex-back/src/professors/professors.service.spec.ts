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
      where: { active: true },
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
      expect.objectContaining({ where: { active: true } }),
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
        findUniqueOrThrow: jest.fn().mockResolvedValue(professor),
      },
    };
    const service = new ProfessorsService(prisma as unknown as PrismaService);

    await expect(service.findOne(professor.id)).resolves.toEqual(professor);
    expect(prisma.professor.findUniqueOrThrow).toHaveBeenCalledWith({
      where: { id: professor.id },
      select: PUBLIC_PROFESSOR_SELECT,
    });
  });
});
