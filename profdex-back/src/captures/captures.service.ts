import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { buildMoveset, getMoveById } from '../battle/engine/moves';
import { MetricsService } from '../metrics/metrics.service';
import { PrismaService } from '../prisma/prisma.service';
import { PUBLIC_PROFESSOR_SELECT } from '../professors/public-professor.select';
import { hashCaptureToken } from './capture-token';
import { CAPTURE_RNG, rollCaptureIvs, starsFromIvs } from './capture-ivs';
import type { RandomSource } from './capture-ivs';

// Tudo que descreve um exemplar: quem é, com que combinação de tipos veio e
// quais golpes saíram no sorteio da captura.
const CAPTURE_SELECT = {
  id: true,
  capturedAt: true,
  moves: true,
  ivHp: true,
  ivRigor: true,
  ivDidatica: true,
  ivRaciocinio: true,
  professor: { select: PUBLIC_PROFESSOR_SELECT },
  variant: { select: { id: true, typeKey: true, types: true } },
} satisfies Prisma.CaptureSelect;

type CaptureRow = Prisma.CaptureGetPayload<{ select: typeof CAPTURE_SELECT }>;

@Injectable()
export class CapturesService {
  constructor(
    private prisma: PrismaService,
    private metrics: MetricsService,
    @Inject(CAPTURE_RNG) private readonly random: RandomSource,
  ) {}

  /**
   * Resgata uma ficha de QR. A ficha vale uma única captura: o `updateMany`
   * condicional em `redeemedAt: null` é o que decide quem chegou primeiro
   * quando dois celulares escaneiam o mesmo papel ao mesmo tempo — o perdedor
   * não encontra linha para atualizar e sai com 409.
   *
   * O moveset é sorteado AQUI, a partir dos tipos da variante, e fica gravado
   * no exemplar: dois Erons de IA/ML capturados em fichas diferentes são
   * professores diferentes na coleção.
   */
  async captureByToken(userId: string, token: string) {
    const tokenHash = hashCaptureToken(token);

    const { capture, novaDescoberta } = await this.prisma.$transaction(
      async (transaction) => {
        const { count } = await transaction.captureToken.updateMany({
          where: { tokenHash, redeemedAt: null },
          data: { redeemedAt: new Date(), redeemedBy: userId },
        });

        if (count === 0) {
          const ficha = await transaction.captureToken.findUnique({
            where: { tokenHash },
            select: { id: true },
          });
          throw ficha
            ? new ConflictException('Este QR já foi utilizado')
            : new NotFoundException('Token inválido');
        }

        const ficha = await transaction.captureToken.findUniqueOrThrow({
          where: { tokenHash },
          select: {
            id: true,
            variant: {
              select: { id: true, types: true, professorId: true },
            },
          },
        });
        const { variant } = ficha;

        // O upsert não diz se criou ou apenas encontrou, e a diferença importa:
        // descobrir o professor pela segunda ficha não pode pontuar de novo.
        const descobertaExistente = await transaction.discovery.findUnique({
          where: {
            userId_professorId: { userId, professorId: variant.professorId },
          },
          select: { id: true },
        });

        await transaction.discovery.upsert({
          where: {
            userId_professorId: { userId, professorId: variant.professorId },
          },
          update: {},
          create: { userId, professorId: variant.professorId },
        });

        const criada = await transaction.capture.create({
          data: {
            userId,
            professorId: variant.professorId,
            variantId: variant.id,
            tokenId: ficha.id,
            moves: buildMoveset(variant.types, 4, this.random).map((move) => move.id),
            ...rollCaptureIvs(this.random),
          },
          select: CAPTURE_SELECT,
        });

        return { capture: criada, novaDescoberta: !descobertaExistente };
      },
    );

    // Registrado no SERVIDOR, não pelo cliente: captura vale muitos pontos e o
    // front não é fonte confiável para isso.
    void this.registrarMetricas(userId, capture.professor.id, {
      novaDescoberta,
    });

    return this.toView(capture);
  }

  /** Nunca deixa a métrica quebrar a captura — o aluno já escaneou o QR. */
  private async registrarMetricas(
    userId: string,
    professorId: string,
    { novaDescoberta }: { novaDescoberta: boolean },
  ): Promise<void> {
    try {
      const occurredAt = new Date();
      const eventos: Parameters<MetricsService['record']>[2] = [];
      if (novaDescoberta) {
        eventos.push({
          type: 'professor_discovered',
          occurredAt,
          metadata: { professorId },
        });
      }

      eventos.push({
        type: 'professor_captured',
        occurredAt,
        metadata: { professorId },
      });

      // Professores DISTINTOS: com vários exemplares do mesmo professor, contar
      // linhas de `captures` completaria a coleção sem ela estar completa.
      const [capturados, total] = await Promise.all([
        this.prisma.capture.findMany({
          where: { userId },
          select: { professorId: true },
          distinct: ['professorId'],
        }),
        this.prisma.professor.count(),
      ]);
      if (total > 0 && capturados.length >= total) {
        eventos.push({ type: 'collection_completed', occurredAt });
      }

      this.metrics.record(userId, null, eventos);
    } catch {
      // silencioso de propósito: métrica não pode derrubar a captura
    }
  }

  async findAll(userId: string) {
    const captures = await this.prisma.capture.findMany({
      where: { userId },
      select: CAPTURE_SELECT,
      orderBy: { capturedAt: 'desc' },
    });

    return captures.map((capture) => this.toView(capture));
  }

  /**
   * Hidrata os ids de golpe gravados na captura. Os golpes são dados estáticos
   * (src/battle/engine/moves.ts), então o front recebe a ficha pronta em vez de
   * manter uma cópia da tabela só para exibir nome e poder.
   */
  private toView(capture: CaptureRow) {
    const ivs = {
      ivHp: capture.ivHp,
      ivRigor: capture.ivRigor,
      ivDidatica: capture.ivDidatica,
      ivRaciocinio: capture.ivRaciocinio,
    };
    return {
      id: capture.id,
      capturedAt: capture.capturedAt,
      professor: capture.professor,
      variant: capture.variant,
      types: capture.variant?.types ?? [],
      ...ivs,
      stars: starsFromIvs(ivs),
      moves: capture.moves
        .map((id) => getMoveById(id))
        .filter((move) => move !== null),
    };
  }
}
