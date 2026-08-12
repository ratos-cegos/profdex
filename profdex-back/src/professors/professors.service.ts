import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PUBLIC_PROFESSOR_SELECT } from './public-professor.select';

@Injectable()
export class ProfessorsService {
  constructor(private prisma: PrismaService) {}

  async findAll(userId: string) {
    const [professors, discoveries, captures] = await Promise.all([
      this.prisma.professor.findMany({
        orderBy: { name: 'asc' },
        select: PUBLIC_PROFESSOR_SELECT,
      }),
      this.prisma.discovery.findMany({
        where: { userId },
        select: { professorId: true },
      }),
      this.prisma.capture.findMany({
        where: { userId },
        select: { professorId: true },
      }),
    ]);

    const discoveredIds = new Set(discoveries.map((d) => d.professorId));

    // Quantos exemplares o aluno tem de cada um — o mesmo professor pode ter
    // sido capturado em várias fichas, com combinações de tipos diferentes.
    const capturedCounts = new Map<string, number>();
    for (const { professorId } of captures) {
      capturedCounts.set(
        professorId,
        (capturedCounts.get(professorId) ?? 0) + 1,
      );
    }

    return professors.map((p) => ({
      ...p,
      discovered: discoveredIds.has(p.id),
      captured: capturedCounts.has(p.id),
      capturedCount: capturedCounts.get(p.id) ?? 0,
    }));
  }

  findOne(id: string) {
    return this.prisma.professor.findUniqueOrThrow({
      where: { id },
      select: PUBLIC_PROFESSOR_SELECT,
    });
  }
}
