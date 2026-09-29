import {
  ConflictException,
  ForbiddenException,
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

/**
 * Recusas da ficha RARA (tarefa 15). Nas três a ficha **continua valendo**: o
 * `throw` acontece dentro da transação e desfaz a baixa do papel.
 *
 * O servidor é o porteiro, e não a mesa: com gate humano, uma ficha rara
 * fotografada e mandada no grupo do WhatsApp entregaria o raro para quem nunca
 * respondeu nada (decisão 9).
 */
export const RARO_INDISPONIVEL = 'RARO_INDISPONIVEL';
export const RARO_BLOQUEADO = 'RARO_BLOQUEADO';
export const RARO_JA_CAPTURADO = 'RARO_JA_CAPTURADO';

/**
 * Ficha de TELA escaneada por outra conta (tarefa 17.6).
 *
 * O QR gerado na bancada fica exposto numa tela virada para a fila: sem o
 * vínculo, quem fotografasse levaria o professor de quem acertou. A ficha
 * continua valendo para o dono — a recusa acontece ANTES da baixa.
 *
 * A mensagem não diz de quem é a ficha, pela mesma regra de vazamento das três
 * recusas do raro.
 */
export const FICHA_DE_OUTRO_ALUNO = 'FICHA_DE_OUTRO_ALUNO';

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

    const { capture, novaDescoberta, raro } = await this.prisma.$transaction(
      async (transaction) => {
        // ANTES do `updateMany`, e essa ordem não é estilo: o update
        // condicional em `redeemedAt: null` é o que decide quem chegou
        // primeiro, então checar o dono DEPOIS dele queimaria a ficha de quem
        // tinha direito. Custa uma leitura por captura, e é o preço de o QR
        // poder ficar exposto numa tela virada para a fila.
        const dono = await transaction.captureToken.findUnique({
          where: { tokenHash },
          select: { assignedToId: true },
        });
        if (dono?.assignedToId != null && dono.assignedToId !== userId) {
          throw new ForbiddenException({
            code: FICHA_DE_OUTRO_ALUNO,
            message:
              'Este QR foi gerado para outro aluno. Responda uma questão na ' +
              'bancada para receber o seu.',
          });
        }

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
              select: {
                id: true,
                types: true,
                professorId: true,
                // A raridade é DERIVADA do professor, não uma flag na ficha:
                // denormalizada aqui, ela poderia divergir do cadastro.
                professor: {
                  select: { rare: true, active: true, name: true, types: true },
                },
              },
            },
          },
        });

        const variant = ficha.variant
          ? ficha.variant
          : await this.sortearPorTipo(transaction, userId, ficha.type);

        // Porteiro da ficha rara. Depois da baixa e ANTES de criar a captura:
        // qualquer `throw` aqui desfaz o `updateMany` e o papel volta a valer.
        if (ficha.variant?.professor.rare) {
          await this.assertPodeLevarRaro(transaction, userId, {
            professorId: ficha.variant.professorId,
            ...ficha.variant.professor,
          });
        }

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
            moves: buildMoveset(variant.types, 4, this.random).map(
              (move) => move.id,
            ),
            // O raro nasce no teto (tarefa 16, decisão 1). A flag sai da mesma
            // fonte que alimenta a métrica `rare_captured` logo abaixo — o
            // sorteio por tipo filtra `rare: false`, então uma variante sorteada
            // nunca chega aqui como rara.
            ...rollCaptureIvs(this.random, {
              rare: ficha.variant?.professor.rare ?? false,
            }),
          },
          select: CAPTURE_SELECT,
        });

        return {
          capture: criada,
          novaDescoberta: !descobertaExistente,
          raro: ficha.variant?.professor.rare ?? false,
        };
      },
    );

    // Registrado no SERVIDOR, não pelo cliente: captura vale muitos pontos e o
    // front não é fonte confiável para isso.
    void this.registrarMetricas(userId, capture.professor.id, {
      novaDescoberta,
      raro,
    });

    return this.toView(capture);
  }

  /**
   * As três recusas da ficha rara, em ordem, **dentro da transação da captura**.
   *
   * Fora dela, o pior desfecho possível acontece em silêncio: o aluno perde o
   * papel E não recebe nada, no meio do evento, sem jeito de reverter.
   *
   * O gate é lido de `rare_unlocks`, NUNCA recalculado de `quiz_attempts`: uma
   * errata que anule uma tentativa depois não pode tirar o raro de quem já
   * destravou (decisão 5).
   */
  private async assertPodeLevarRaro(
    transaction: Prisma.TransactionClient,
    userId: string,
    raro: {
      professorId: string;
      active: boolean;
      name: string;
      types: string[];
    },
  ): Promise<void> {
    if (!raro.active) {
      throw new NotFoundException({
        code: RARO_INDISPONIVEL,
        message: 'Este professor raro saiu de circulação — procure a bancada',
      });
    }

    const [unlocks, jaTem] = await Promise.all([
      transaction.rareUnlock.findMany({
        where: { userId, theme: { in: raro.types } },
        select: { theme: true },
      }),
      transaction.capture.findFirst({
        where: { userId, professorId: raro.professorId },
        select: { id: true },
      }),
    ]);

    const destravados = new Set(unlocks.map((u) => u.theme));
    if (!raro.types.every((t) => destravados.has(t))) {
      // A mensagem NÃO diz qual tema falta: é a mesma regra de vazamento que
      // tira o raro da lista de professores da bancada. Quem pegou uma ficha
      // emprestada não pode descobrir por aqui onde estudar.
      throw new ForbiddenException({
        code: RARO_BLOQUEADO,
        message:
          'Esta ficha é de um professor raro e ainda não está liberada para ' +
          'você — procure a bancada',
      });
    }

    if (jaTem) {
      throw new ConflictException({
        code: RARO_JA_CAPTURADO,
        message: `Você já tem ${raro.name}. Cada raro vale uma captura por conta`,
      });
    }
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
        // `rare: false` é o que sustenta a decisão 10. Sem ele o raro cairia na
        // Faixa 1 do sorteio (professor inédito), que é a PREFERENCIAL — o raro
        // seria o resultado mais provável de uma ficha comum, e a via do quiz
        // deixaria de existir na prática.
        // `legendary: false` pelo mesmo motivo, e com um agravante: o lendário
        // CONTA para completar a dex, então sair numa ficha comum não só
        // atropelaria a raid — entregaria de graça a última entrada da Profdex
        // para quem escaneou um papel qualquer.
        where: {
          types: { has: type },
          professor: { active: true, rare: false, legendary: false },
        },
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
    { novaDescoberta, raro }: { novaDescoberta: boolean; raro: boolean },
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

      // Somado aos dois de cima: 20 + 50 + 140 = 210, exatamente 3× uma captura
      // comum inédita. O raro custou ~50 min de bancada por tema.
      if (raro) {
        eventos.push({
          type: 'rare_captured',
          occurredAt,
          metadata: { professorId },
        });
      }

      // Professores DISTINTOS: com vários exemplares do mesmo professor, contar
      // linhas de `captures` completaria a coleção sem ela estar completa.
      //
      // Os RAROS entram nos dois lados da conta: fechar a Profdex exige comuns
      // e raros, então quem completa a coleção passou pela bancada também.
      //
      // O LENDÁRIO fica fora, e por uma razão dura: é esta contagem que
      // destrava a raid dele. Incluí-lo tornaria o gate circular — só
      // destravaria a raid quem já tivesse vencido a raid.
      //
      // E `active: true` nos DOIS lados: sem ele, desativar um professor no
      // painel deixava a dex impossível de fechar (o total continuava contando
      // quem saiu da Profdex). Era o bug anotado em docs/tasks/INDEX.md.
      //
      // **Este filtro é gêmeo do de `RaidService.dexProgress`**, que é o gate da
      // raid. Se os dois divergirem, a métrica passa a dizer "completou" para
      // quem o servidor não deixa desafiar o lendário.
      const naDex = { legendary: false, active: true };
      const [capturados, total] = await Promise.all([
        this.prisma.capture.findMany({
          where: { userId, professor: naDex },
          select: { professorId: true },
          distinct: ['professorId'],
        }),
        this.prisma.professor.count({ where: naDex }),
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
