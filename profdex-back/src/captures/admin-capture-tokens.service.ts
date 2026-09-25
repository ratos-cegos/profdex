import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { TYPE_CYCLE, typeKeyOf } from '../battle/engine/types';
import { PrismaService } from '../prisma/prisma.service';
import {
  buildRareSheetEntries,
  buildSheetEntries,
  labelFor,
  newBatchId,
  renderSheetInline,
} from './capture-sheet';

/** Uma linha do estoque: um tipo da roda. São sempre 9, mesmo zeradas. */
export interface InventoryRow {
  type: string;
  label: string;
  /**
   * Professores ATIVOS que podem sair numa ficha deste tipo. Zero significa
   * papel que não captura nada — a tela precisa gritar isso antes da tiragem.
   */
  professors: number;
  /** Contagens só da última tiragem. Zeradas se o tipo não entrou nela. */
  lastBatch: { total: number; redeemed: number };
  /** Fichas ainda válidas somando TODAS as tiragens. */
  alive: number;
  /** Fichas já resgatadas somando todas as tiragens. */
  redeemedTotal: number;
}

export interface PlanLine {
  type: string;
  label: string;
  professors: number;
  copies: number;
}

/** Uma linha do estoque de fichas RARAS: uma por professor raro ativo. */
export interface RareInventoryRow {
  professorId: string;
  name: string;
  /** Os temas que o aluno precisa destravar. São os tipos do professor. */
  themes: string[];
  label: string;
  /** Fichas ainda válidas na pilha dele. */
  alive: number;
  /** Fichas já resgatadas — no máximo uma por conta. */
  redeemedTotal: number;
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
 *
 * A ficha vale por TIPO, não por professor: a bancada escolhe o tema da questão
 * que o aluno acertou, que é a única coisa que ela sabe na hora.
 */
@Injectable()
export class AdminCaptureTokensService {
  private readonly logger = new Logger(AdminCaptureTokensService.name);

  constructor(private prisma: PrismaService) {}

  /** Última tiragem em destaque + estoque vivo por tipo. */
  async inventory(): Promise<{
    lastBatch: {
      batch: string;
      createdAt: Date;
      createdBy: string | null;
      source: string;
      copies: number;
      total: number;
    } | null;
    types: InventoryRow[];
    rares: RareInventoryRow[];
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

    // Contagem no BANCO, não em memória. `capture_tokens` cresce uma linha por
    // ficha impressa durante o evento inteiro (dezenas de milhares), e trazer a
    // tabela para filtrar em JS custaria a tabela toda por abertura de tela.
    // Os quatro agrupamentos são cobertos pelo índice [type, redeemedAt].
    const contar = (where: object) =>
      this.prisma.captureToken.groupBy({
        by: ['type'],
        where,
        _count: { _all: true },
      });
    // Sem tiragem registrada não há o que contar por tiragem — e não existe
    // valor "impossível" para filtrar: um sentinela como '\0' é rejeitado pelo
    // Postgres (`invalid byte sequence for encoding UTF8`), e é justamente
    // este o estado de uma instalação nova, antes da primeira tiragem.
    const semTiragem = Promise.resolve(
      [] as { type: string | null; _count: { _all: number } }[],
    );
    const [vivas, resgatadas, vivasNoBatch, resgatadasNoBatch, variantes] =
      await Promise.all([
        contar({ redeemedAt: null }),
        contar({ redeemedAt: { not: null } }),
        lastBatch
          ? contar({ batch: lastBatch.batch, redeemedAt: null })
          : semTiragem,
        lastBatch
          ? contar({ batch: lastBatch.batch, redeemedAt: { not: null } })
          : semTiragem,
        this.prisma.professorVariant.findMany({
          // `rare: false` porque esta contagem responde "quantos professores
          // podem sair numa ficha DESTE TIPO", e o raro nunca sai em ficha
          // comum. Sem o filtro, o painel diria que Matemática tem 4
          // professores quando só 3 são alcançáveis por ficha comum — e a
          // decisão de imprimir sairia de um número errado.
          where: { professor: { active: true, rare: false } },
          select: { professorId: true, types: true },
        }),
      ]);

    const mapear = (
      linhas: { type: string | null; _count: { _all: number } }[],
    ) =>
      new Map(
        linhas
          .filter((l) => l.type !== null)
          .map((l) => [l.type as string, l._count._all]),
      );
    const porTipo = {
      vivas: mapear(vivas),
      resgatadas: mapear(resgatadas),
      vivasNoBatch: mapear(vivasNoBatch),
      resgatadasNoBatch: mapear(resgatadasNoBatch),
    };

    // Professores DISTINTOS por tipo: um professor de dois tipos rende três
    // variantes, e contar variantes diria "3 professores de IA" onde há 1.
    const professoresPorTipo = new Map<string, Set<string>>();
    for (const v of variantes) {
      for (const type of v.types) {
        const set = professoresPorTipo.get(type) ?? new Set<string>();
        set.add(v.professorId);
        professoresPorTipo.set(type, set);
      }
    }

    // A roda inteira, sempre: um tipo sem ficha e sem professor é justamente o
    // que a tela precisa mostrar, e ele não apareceria vindo do `groupBy`.
    const types: InventoryRow[] = TYPE_CYCLE.map((type) => {
      const naTiragemVivas = porTipo.vivasNoBatch.get(type) ?? 0;
      const naTiragemResgatadas = porTipo.resgatadasNoBatch.get(type) ?? 0;
      return {
        type,
        label: labelFor([type]),
        professors: professoresPorTipo.get(type)?.size ?? 0,
        lastBatch: {
          total: naTiragemVivas + naTiragemResgatadas,
          redeemed: naTiragemResgatadas,
        },
        alive: porTipo.vivas.get(type) ?? 0,
        redeemedTotal: porTipo.resgatadas.get(type) ?? 0,
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
      types,
      rares: await this.estoqueDeRaros(),
    };
  }

  /**
   * Estoque das pilhas raras, uma linha por raro ativo.
   *
   * A contagem é por VARIANTE, não por tipo: a ficha rara é do caminho legado
   * (`capture_tokens.variantId`) e tem `type: null`, então ela nunca aparece no
   * `groupBy` por tipo que alimenta o estoque comum. O índice
   * `[variantId, redeemedAt]` já cobre esta consulta.
   */
  private async estoqueDeRaros(): Promise<RareInventoryRow[]> {
    const raros = await this.prisma.professor.findMany({
      where: { rare: true, active: true },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        types: true,
        variants: { select: { id: true } },
      },
    });
    if (!raros.length) return [];

    const contar = (redeemed: boolean) =>
      this.prisma.captureToken.groupBy({
        by: ['variantId'],
        where: {
          variant: { professor: { rare: true } },
          redeemedAt: redeemed ? { not: null } : null,
        },
        _count: { _all: true },
      });
    const [vivas, resgatadas] = await Promise.all([
      contar(false),
      contar(true),
    ]);

    const mapear = (
      linhas: { variantId: string | null; _count: { _all: number } }[],
    ) =>
      new Map(
        linhas
          .filter((l) => l.variantId !== null)
          .map((l) => [l.variantId as string, l._count._all]),
      );
    const porVariante = {
      vivas: mapear(vivas),
      resgatadas: mapear(resgatadas),
    };

    // Somado sobre as variantes do raro: hoje ele tem exatamente uma, mas um
    // raro cadastrado antes desta regra poderia ter mais, e somar é o que
    // impede a tela de mostrar estoque a menos do que existe no papel.
    const somar = (ids: string[], mapa: Map<string, number>) =>
      ids.reduce((total, id) => total + (mapa.get(id) ?? 0), 0);

    return raros.map((raro) => {
      const ids = raro.variants.map((v) => v.id);
      return {
        professorId: raro.id,
        name: raro.name,
        themes: raro.types,
        label: labelFor(raro.types),
        alive: somar(ids, porVariante.vivas),
        redeemedTotal: somar(ids, porVariante.resgatadas),
      };
    });
  }

  /**
   * Imprime a pilha de UM professor raro.
   *
   * Pilha própria por raro, rotulada com o nome dele: com gate de dois temas,
   * "✦ RARO — MATEMÁTICA" seria ambíguo, e a mesa não pode ter de decidir nada.
   * A tiragem grava `rareProfessorId` e deixa `types` vazio — é assim que uma
   * tiragem rara se distingue de uma comum no histórico.
   */
  async generateRare(
    userId: string,
    professorId: string,
    copies: number,
  ): Promise<{ html: string; batch: string; total: number }> {
    const professor = await this.prisma.professor.findFirst({
      // `rare` E `active` na mesma consulta: 404 sem dizer qual dos dois falhou
      // é o suficiente para o painel, e evita uma segunda ida ao banco.
      where: { id: professorId, rare: true, active: true },
      select: {
        id: true,
        name: true,
        types: true,
        variants: { select: { id: true, typeKey: true } },
      },
    });
    if (!professor) {
      throw new NotFoundException(
        'Professor raro não encontrado ou fora de circulação.',
      );
    }

    // A variante COMPLETA, que é a única que o raro tem (ver
    // professor-variants.ts). Escolher pelo typeKey e não pela primeira da
    // lista mantém a ficha correta mesmo num raro que tenha variantes antigas.
    const typeKey = typeKeyOf(professor.types);
    const variant =
      professor.variants.find((v) => v.typeKey === typeKey) ??
      professor.variants[0];
    if (!variant) {
      throw new BadRequestException(
        `${professor.name} está sem variante — reative o professor ou ` +
          'cadastre-o de novo para materializá-la.',
      );
    }

    const batch = newBatchId();
    const entries = buildRareSheetEntries(
      {
        id: variant.id,
        professorName: professor.name,
        themes: professor.types,
      },
      copies,
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.captureToken.createMany({
        data: entries.map((e) => ({
          // `variantId` e NÃO `type`: a ficha rara entrega exatamente aquela
          // variante, sem passar pelo sorteio.
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
          types: [],
          rareProfessorId: professor.id,
        },
      });
    });

    this.logger.log(
      JSON.stringify({
        audit: 'qr_batch_rare',
        batch,
        by: userId,
        professor: professor.id,
        copies,
        total: entries.length,
      }),
    );

    return {
      html: await renderSheetInline(entries, batch, copies),
      batch,
      total: entries.length,
    };
  }

  /** O plano da tiragem, sem gravar nada. É o primeiro dos dois passos. */
  async preview(
    copies: number,
    types?: string[],
  ): Promise<{ lines: PlanLine[]; total: number }> {
    const alvos = this.resolveTypes(types);
    const porTipo = await this.contarProfessoresAtivos();

    return {
      lines: alvos.map((type) => ({
        type,
        label: labelFor([type]),
        // Vai no plano de propósito: é a última tela antes de imprimir, e é
        // onde "este tipo não tem professor" ainda dá para cancelar de graça.
        professors: porTipo.get(type)?.size ?? 0,
        copies,
      })),
      total: alvos.length * copies,
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
    types?: string[],
    { allowEmpty = false }: { allowEmpty?: boolean } = {},
  ): Promise<{ html: string; batch: string; total: number }> {
    const alvos = this.resolveTypes(types);

    // Ficha de tipo sem professor ativo é papel que não captura nada: quem
    // escanear leva um erro e vai para a fila da bancada. Passa só com
    // confirmação explícita — imprimir por engano custa a tiragem inteira.
    if (!allowEmpty) {
      const porTipo = await this.contarProfessoresAtivos();
      const vazios = alvos.filter((t) => !porTipo.get(t)?.size);
      if (vazios.length) {
        throw new BadRequestException(
          `Sem professor ativo: ${vazios.map((t) => labelFor([t])).join(', ')}. ` +
            'Cadastre um professor do tipo ou confirme a tiragem mesmo assim.',
        );
      }
    }

    const batch = newBatchId();
    const entries = buildSheetEntries(alvos, copies);

    await this.prisma.$transaction(async (tx) => {
      await tx.captureToken.createMany({
        data: entries.map((e) => ({
          type: e.type,
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
          types: alvos,
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
        types: alvos.length,
        total: entries.length,
      }),
    );

    return {
      html: await renderSheetInline(entries, batch, copies),
      batch,
      total: entries.length,
    };
  }

  /** Os tipos da tiragem: os marcados, ou a roda inteira quando nada vier. */
  private resolveTypes(types?: string[]): string[] {
    if (!types?.length) return [...TYPE_CYCLE];

    // O DTO já tem allowlist; esta é a segunda barreira, porque daqui sai HTML
    // impresso e a lista também vira `qr_batches.types`.
    const desconhecidos = types.filter(
      (t) => !(TYPE_CYCLE as readonly string[]).includes(t),
    );
    if (desconhecidos.length) {
      throw new BadRequestException(
        `Tipo fora da roda: ${desconhecidos.join(', ')}`,
      );
    }
    // Ordem da roda e sem repetição: pedir o mesmo tipo duas vezes dobraria a
    // tiragem sem que o total confirmado na tela dissesse isso.
    return TYPE_CYCLE.filter((t) => types.includes(t));
  }

  /** Professores ativos distintos por tipo. */
  private async contarProfessoresAtivos(): Promise<Map<string, Set<string>>> {
    const variantes = await this.prisma.professorVariant.findMany({
      where: { professor: { active: true } },
      select: { professorId: true, types: true },
    });

    const porTipo = new Map<string, Set<string>>();
    for (const v of variantes) {
      for (const type of v.types) {
        const set = porTipo.get(type) ?? new Set<string>();
        set.add(v.professorId);
        porTipo.set(type, set);
      }
    }
    return porTipo;
  }
}
