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
import { sortearVariante } from './capture-lottery';
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

/**
 * Erro de domínio estável: a ficha é válida, mas não há professor para entregar.
 *
 * O front precisa separar este 404 do "token inválido", que tem o mesmo status
 * e é ignorado em silêncio — só que aqui a ficha CONTINUA VALENDO e o aluno
 * precisa saber disso. Um código, e não o texto da mensagem, porque texto muda
 * (ver .codex/CODE_STYLE.md).
 */
export const TIPO_SEM_PROFESSOR = 'TIPO_SEM_PROFESSOR';

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
   * A ficha vale por TIPO: a bancada só sabe o tema da questão que o aluno
   * acertou, e QUAL professor daquele tipo ele leva sai no sorteio do servidor
   * (capture-lottery.ts). Fichas impressas antes disso apontam para uma variante
   * e seguem entregando exatamente aquele professor, sem sorteio.
   *
   * O moveset é sorteado AQUI, a partir dos tipos da variante, e fica gravado
   * no exemplar: dois Erons de IA capturados em fichas diferentes são
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
            type: true,
            variant: {
              select: { id: true, types: true, professorId: true },
            },
          },
        });

        const variant = ficha.variant
          ? ficha.variant
          : await this.sortearPorTipo(transaction, userId, ficha.type);

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

  /**
   * Qual professor daquele tipo o aluno leva.
   *
   * Roda DENTRO da transação da captura, e isso não é detalhe de organização:
   * quando o tipo não tem nenhum professor ativo, o `throw` daqui desfaz o
   * `updateMany` que acabou de dar baixa na ficha — o papel continua valendo e
   * o aluno pode escanear de novo depois que a bancada resolver. Tirar esta
   * chamada de dentro da transação (ou capturar o erro aqui) devolve em
   * silêncio o pior desfecho possível: o aluno perde a ficha E não recebe
   * professor, no meio do evento, sem jeito de reverter.
   */
  private async sortearPorTipo(
    transaction: Prisma.TransactionClient,
    userId: string,
    type: string | null,
  ): Promise<{ id: string; types: string[]; professorId: string }> {
    if (!type) {
      // Ficha sem tipo e sem variante não deveria existir: exatamente um dos
      // dois é preenchido na criação. Se chegou aqui, o dado está corrompido —
      // melhor devolver a ficha ao aluno do que inventar um professor.
      throw new NotFoundException({
        code: TIPO_SEM_PROFESSOR,
        message: 'Esta ficha está incompleta — procure a bancada',
      });
    }

    // As duas leituras usam índice: `professor_variants` pelo professor e
    // `captures` por [userId, professorId]. São 2 consultas por captura, e é o
    // que o pico da bancada vai pagar.
    const [candidatas, jaTem] = await Promise.all([
      transaction.professorVariant.findMany({
        where: { types: { has: type }, professor: { active: true } },
        select: { id: true, professorId: true, types: true },
      }),
      transaction.capture.findMany({
        where: { userId },
        select: { professorId: true, variantId: true },
      }),
    ]);

    const escolhida = sortearVariante(
      candidatas,
      jaTem.filter(
        (c): c is { professorId: string; variantId: string } =>
          c.variantId !== null,
      ),
      this.random,
    );

    if (!escolhida) {
      throw new NotFoundException({
        code: TIPO_SEM_PROFESSOR,
        message: 'Nenhum professor deste tipo disponível — procure a bancada',
      });
    }

    const variant = candidatas.find((c) => c.id === escolhida.id)!;
    return {
      id: variant.id,
      types: variant.types,
      professorId: variant.professorId,
    };
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
