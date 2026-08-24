import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  backfillCaptureVariants,
  ensureProfessorVariants,
} from '../professors/professor-variants';

const PROFESSORS = [
  {
    id: 'prof-mario',
    name: 'Mario',
    slug: 'mario',
    marker1Index: 0,
    marker2Index: 1,
  },
  {
    id: 'prof-eron',
    name: 'Eron',
    slug: 'eron',
    marker1Index: 2,
    marker2Index: 3,
  },
  {
    id: 'prof-gustavo',
    name: 'Gustavo',
    slug: 'gustavo',
    marker1Index: 4,
    marker2Index: 5,
  },
  {
    id: 'prof-joao',
    name: 'João',
    slug: 'joao',
    marker1Index: 6,
    marker2Index: 7,
  },
  {
    id: 'prof-simone',
    name: 'Simone',
    slug: 'simone',
    marker1Index: 8,
    marker2Index: 9,
  },
  {
    id: 'prof-t-camis',
    name: 'Tânia',
    slug: 't-camis',
    marker1Index: 10,
    marker2Index: 11,
  },
];

@Injectable()
export class SeedService implements OnModuleInit {
  private readonly logger = new Logger(SeedService.name);

  constructor(private prisma: PrismaService) {}

  async onModuleInit() {
    try {
      for (const prof of PROFESSORS) {
        await this.prisma.professor.upsert({
          where: { slug: prof.slug },
          update: {},
          create: prof,
        });
      }
      this.logger.log(`Professores no seed: ${PROFESSORS.length}`);

      // Fora do `if`: professor cadastrado antes deste modelo também precisa
      // das variantes, senão não há o que imprimir em QR nem o que capturar.
      const variantes = await ensureProfessorVariants(this.prisma);
      if (variantes > 0) {
        this.logger.log(`${variantes} variantes de professor criadas`);
      }

      const corrigidas = await backfillCaptureVariants(this.prisma);
      if (corrigidas > 0) {
        this.logger.log(`${corrigidas} capturas antigas receberam moveset`);
      }
    } catch {
      // Tabelas ainda não existem — aguarda npx prisma db push
      this.logger.warn('Tabelas não encontradas. Rode: npx prisma db push');
    }
  }
}
