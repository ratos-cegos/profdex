import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  buildSheetEntries,
  labelFor,
  newBatchId,
  renderSheetInline,
  SheetVariant,
} from './capture-sheet';

/** Uma linha do estoque: uma combinação de tipos de um professor. */
export interface InventoryRow {
  variantId: string;
  professor: { name: string; slug: string };
  typeKey: string;
  types: string[];
  label: string;
  /** Contagens só da última tiragem. Zeradas se a variante não entrou nela. */
  lastBatch: { total: number; redeemed: number };
  /** Fichas ainda válidas somando TODAS as tiragens. */
  alive: number;
  /** Fichas já resgatadas somando todas as tiragens. */
  redeemedTotal: number;
}

export interface PlanLine {
  variantId: string;
  label: string;
  professor: string;
  copies: number;
}

/**
 * Fichas de captura pelo painel.
 *
 * Duas coisas moldam este serviço e não são negociáveis:
 *
 * 1. O banco guarda só `sha256(token)`. **Ficha gerada não pode ser
 *    reimpressa** — a folha devolvida pelo `generate` é a única oportunidade
 *    de ver aqueles QRs. O `inventory` só sabe contar.
 * 2. Nada é gravado em disco. O script pode escrever `tokens.txt` porque roda
 *    numa máquina de operador; o servidor está exposto à internet.
 */
@Injectable()
export class AdminCaptureTokensService {
  private readonly logger = new Logger(AdminCaptureTokensService.name);

  constructor(private prisma: PrismaService) {}

  /** Última tiragem em destaque + estoque vivo por variante. */
  async inventory(): Promise<{
    lastBatch: {
      batch: string;
      createdAt: Date;
      createdBy: string | null;
      source: string;
      copies: number;
      total: number;
    } | null;
    variants: InventoryRow[];
  }> {
    const lastBatch = await this.prisma.qrBatch.findFirst({
      orderBy: { createdAt: 'desc' },
      select: {
        batch: true,
        createdAt: true,
        source: true,
        copies: true,
        total: true,
        createdBy: { select: { name: true } },
      },
    });

    const variants = await this.prisma.professorVariant.findMany({
      select: {
        id: true,
        typeKey: true,
        types: true,
        professor: { select: { name: true, slug: true } },
      },
      orderBy: [{ professor: { slug: 'asc' } }, { typeKey: 'asc' }],
    });

    // Contagem no BANCO, não em memória. `capture_tokens` cresce uma linha por
    // ficha impressa durante o evento inteiro (dezenas de milhares), e trazer a
    // tabela para filtrar em JS custaria a tabela toda por abertura de tela.
    // Os quatro agrupamentos são cobertos pelo índice [variantId, redeemedAt].
    const contar = (where: object) =>
      this.prisma.captureToken.groupBy({
        by: ['variantId'],
        where,
        _count: { _all: true },
      });
    // Sem tiragem registrada não há o que contar por tiragem — e não existe
    // valor "impossível" para filtrar: um sentinela como '\0' é rejeitado pelo
    // Postgres (`invalid byte sequence for encoding UTF8`), e é justamente
    // este o estado de uma instalação nova, antes da primeira tiragem.
    const semTiragem = Promise.resolve(
      [] as { variantId: string; _count: { _all: number } }[],
    );
    const [vivas, resgatadas, vivasNoBatch, resgatadasNoBatch] =
      await Promise.all([
        contar({ redeemedAt: null }),
        contar({ redeemedAt: { not: null } }),
        lastBatch ? contar({ batch: lastBatch.batch, redeemedAt: null }) : semTiragem,
        lastBatch
          ? contar({ batch: lastBatch.batch, redeemedAt: { not: null } })
          : semTiragem,
      ]);

    const mapear = (linhas: { variantId: string; _count: { _all: number } }[]) =>
      new Map(linhas.map((l) => [l.variantId, l._count._all]));
    const porVariante = {
      vivas: mapear(vivas),
      resgatadas: mapear(resgatadas),
      vivasNoBatch: mapear(vivasNoBatch),
      resgatadasNoBatch: mapear(resgatadasNoBatch),
    };

    const rows: InventoryRow[] = variants.map((v) => {
      const naTiragemVivas = porVariante.vivasNoBatch.get(v.id) ?? 0;
      const naTiragemResgatadas = porVariante.resgatadasNoBatch.get(v.id) ?? 0;
      return {
        variantId: v.id,
        professor: v.professor,
        typeKey: v.typeKey,
        types: v.types,
        label: labelFor(v.types),
        lastBatch: {
          total: naTiragemVivas + naTiragemResgatadas,
          redeemed: naTiragemResgatadas,
        },
        alive: porVariante.vivas.get(v.id) ?? 0,
        redeemedTotal: porVariante.resgatadas.get(v.id) ?? 0,
      };
    });

    return {
      lastBatch: lastBatch
        ? {
            batch: lastBatch.batch,
            createdAt: lastBatch.createdAt,
            createdBy: lastBatch.createdBy?.name ?? null,
            source: lastBatch.source,
            copies: lastBatch.copies,
            total: lastBatch.total,
          }
        : null,
      variants: rows,
    };
  }

  /** O plano da tiragem, sem gravar nada. É o primeiro dos dois passos. */
  async preview(
    copies: number,
    variantIds?: string[],
  ): Promise<{ lines: PlanLine[]; total: number }> {
    const variants = await this.resolveVariants(variantIds);
    return {
      lines: variants.map((v) => ({
        variantId: v.id,
        label: labelFor(v.types),
        professor: v.professor.name,
        copies,
      })),
      total: variants.length * copies,
    };
  }

  /**
   * Gera a tiragem e devolve a folha pronta para impressão.
   *
   * A transação é obrigatória: ou a tiragem inteira entra no banco, ou nenhuma
   * ficha dela vale. A folha é montada só DEPOIS do commit — imprimir papel que
   * o app não reconhece é pior do que falhar.
   */
  async generate(
    userId: string,
    copies: number,
    variantIds?: string[],
  ): Promise<{ html: string; batch: string; total: number }> {
    const variants = await this.resolveVariants(variantIds);
    const batch = newBatchId();
    const entries = buildSheetEntries(variants, copies);

    await this.prisma.$transaction(async (tx) => {
      await tx.captureToken.createMany({
        data: entries.map((e) => ({
          variantId: e.variantId,
          tokenHash: e.tokenHash,
          batch,
        })),
      });
      await tx.qrBatch.create({
        data: {
          batch,
          createdById: userId,
          source: 'panel',
          copies,
          total: entries.length,
          variantIds: variants.map((v) => v.id),
        },
      });
    });

    // Auditoria: a tabela guarda o fato; o log dá o rastro na linha do tempo do
    // servidor. NUNCA logar token — é ficha em texto puro (ver CODE_STYLE).
    this.logger.log(
      JSON.stringify({
        audit: 'qr_batch',
        batch,
        by: userId,
        copies,
        variants: variants.length,
        total: entries.length,
      }),
    );

    return {
      html: await renderSheetInline(entries, batch, copies),
      batch,
      total: entries.length,
    };
  }

  /** Variantes da tiragem: as marcadas, ou todas quando nada vier. */
  private async resolveVariants(ids?: string[]): Promise<SheetVariant[]> {
    const variants = await this.prisma.professorVariant.findMany({
      where: ids?.length ? { id: { in: ids } } : {},
      select: {
        id: true,
        typeKey: true,
        types: true,
        professor: { select: { name: true, slug: true } },
      },
      orderBy: [{ professor: { slug: 'asc' } }, { typeKey: 'asc' }],
    });

    if (variants.length === 0) {
      throw new BadRequestException(
        ids?.length
          ? 'Nenhuma das variantes selecionadas existe.'
          : 'Nenhuma variante no banco — rode o seed primeiro.',
      );
    }
    // Id inexistente no meio da lista significa tela desatualizada: gerar só o
    // que sobrou imprimiria uma tiragem diferente da que o admin confirmou.
    if (ids?.length && variants.length !== ids.length) {
      throw new BadRequestException(
        'Alguma variante selecionada não existe mais. Recarregue a tela.',
      );
    }
    return variants;
  }
}
