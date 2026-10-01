import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { writeAsset } from './asset-storage';
import {
  ASSET_FIELDS,
  ASSET_FIELDS_BASE,
  ASSET_FIELDS_ESTAGIO,
  AssetField,
  AssetValidationError,
  assertValidAsset,
  assetFileName,
  assetUrl,
  UploadedAsset,
} from './professor-assets';
import { ensureVariantsForProfessor } from './professor-variants';
import { ProfessorFormDto, UpdateProfessorDto } from './dto/professor-form.dto';
import { slugFromName } from './slug';

/** Os arquivos de uma requisição, por campo. O Multer entrega listas. */
export type UploadedAssets = Partial<Record<AssetField, UploadedAsset[]>>;

const ADMIN_PROFESSOR_SELECT = {
  id: true,
  name: true,
  slug: true,
  types: true,
  spriteFrontUrl: true,
  spriteBackUrl: true,
  modelUrl: true,
  spriteFrontE2Url: true,
  spriteBackE2Url: true,
  spriteFrontE3Url: true,
  spriteBackE3Url: true,
  pixelArt: true,
  active: true,
  rare: true,
  legendary: true,
} satisfies Prisma.ProfessorSelect;

/**
 * Erro de domínio estável: já existe um raro ATIVO usando um dos temas pedidos.
 *
 * Um raro por tema é o que mantém a pilha de papel e a instrução da mesa sem
 * ambiguidade (tarefa 15, decisão 8). Código e não texto — ver CODE_STYLE.
 */
export const TEMA_JA_TEM_RARO = 'TEMA_JA_TEM_RARO';

/**
 * Erro de domínio estável: já existe um lendário ATIVO.
 *
 * Só um por evento (tarefa 18, decisão 3). A Profdex desenha UM card na
 * posição `Y+1`, e o gate da raid pergunta "qual é o lendário?" no singular —
 * dois ativos criariam um estado que nenhuma das duas telas sabe representar.
 *
 * Validado contra os ATIVOS, como o raro: desativar o atual e cadastrar outro
 * continua sendo o caminho de troca no meio do evento.
 */
export const JA_EXISTE_LENDARIO = 'JA_EXISTE_LENDARIO';

/** Erro de domínio estável: marcaram raro e lendário no mesmo cadastro. */
export const RARO_E_LENDARIO = 'RARO_E_LENDARIO';

/**
 * Cadastro de professores pelo painel.
 *
 * Antes da tarefa 13, um professor novo exigia editar quatro arquivos, commitar
 * a arte e fazer deploy. Três regras sustentam o que ficou no lugar disso:
 *
 * 1. **Professor nunca é apagado.** "Remover" é desativar. As FKs de `captures`,
 *    `discoveries`, `battle_slots`, `capture_tokens` e `professor_variants`
 *    tornam o delete uma cascata que destrói coleção de aluno e histórico de
 *    ranking.
 * 2. **O slug é derivado do nome e imutável.** Ele nomeia os arquivos de arte;
 *    renomear em cascata significaria mover arquivos e reescrever URLs já
 *    cacheadas no celular de todo mundo.
 * 3. **Cadastrar é criar o professor E as variantes dele**, na mesma transação.
 *    Professor sem variante não entra no sorteio de captura — e nada na tela
 *    diria por quê.
 */
@Injectable()
export class AdminProfessorsService {
  private readonly logger = new Logger(AdminProfessorsService.name);

  constructor(private prisma: PrismaService) {}

  /** O elenco inteiro, inclusive inativos, com quantos exemplares circulam. */
  async list() {
    const [professors, capturas] = await Promise.all([
      this.prisma.professor.findMany({
        orderBy: [{ active: 'desc' }, { name: 'asc' }],
        select: ADMIN_PROFESSOR_SELECT,
      }),
      this.prisma.capture.groupBy({
        by: ['professorId'],
        _count: { _all: true },
      }),
    ]);

    const porProfessor = new Map(
      capturas.map((c) => [c.professorId, c._count._all]),
    );

    return professors.map((p) => ({
      ...p,
      capturedCount: porProfessor.get(p.id) ?? 0,
    }));
  }

  /**
   * Cadastra um professor com a arte dele.
   *
   * Os arquivos são gravados DEPOIS do commit, e o professor é desfeito se a
   * gravação falhar: ele acabou de nascer, não tem captura nem ficha apontando
   * para ele, então apagá-lo é seguro — e deixar um professor cadastrado com
   * três URLs para arquivos inexistentes não é.
   */
  async create(dto: ProfessorFormDto, files: UploadedAssets) {
    const slug = this.slugOuErro(dto.name);
    const rare = dto.rare ?? false;
    const legendary = dto.legendary ?? false;

    // As duas vias de aquisição são excludentes: o raro sai de ficha após 5
    // acertos por tema, o lendário sai de uma raid após a dex fechada. Um
    // professor que exigisse os dois não é regra que alguém explica na fila.
    if (rare && legendary) {
      throw new ConflictException({
        code: RARO_E_LENDARIO,
        message:
          'Um professor é raro OU lendário, nunca os dois: são vias de ' +
          'captura diferentes. Escolha uma.',
      });
    }

    // ANTES da arte e da transação: um 409 aqui não pode ter escrito arquivo
    // nenhum no volume de uploads nem consumido um slug.
    if (rare) await this.assertTemasLivres(dto.types);
    if (legendary) await this.assertSemLendario();
    const arte = this.validarArte(files, {
      exigirBase: true,
      exigirEstagios: legendary,
    });

    const versao = Date.now();
    const professor = await this.prisma
      .$transaction(async (tx) => {
        // ANTES do `create`, e a ordem aqui é a correção de um bug que foi para
        // produção: depois dele, esta consulta enxerga a linha recém-inserida
        // (que é rara, ativa e tem os temas pedidos), o professor conflita
        // CONSIGO MESMO e nenhum raro consegue nascer. O rollback ainda
        // escondia o rastro — o banco ficava sem raro nenhum, e a tentativa
        // seguinte falhava igual.
        //
        // Ela repete a checagem de fora da transação porque aquela roda antes
        // da validação da arte, para um 409 não escrever arquivo nenhum. Esta
        // aqui apenas estreita a janela entre a checagem e o insert; ela NÃO
        // fecha a corrida entre dois admins simultâneos, porque em READ
        // COMMITTED uma transação não vê o insert não commitado da outra.
        // Fechar de verdade exigiria constraint de exclusão sobre `unnest`,
        // que o Prisma não gera — e o painel tem meia dúzia de usuários.
        if (rare) await this.assertTemasLivres(dto.types, tx);
        // Mesma história do raro, e pelo mesmo motivo de ordem: depois do
        // `create` esta consulta enxergaria a própria linha e nenhum lendário
        // nasceria nunca.
        if (legendary) await this.assertSemLendario(tx);

        const criado = await tx.professor.create({
          data: {
            name: dto.name.trim(),
            slug,
            types: dto.types,
            pixelArt: dto.pixelArt ?? false,
            rare,
            legendary,
            spriteFrontUrl: assetUrl(slug, 'spriteFront', versao),
            spriteBackUrl: assetUrl(slug, 'spriteBack', versao),
            modelUrl: assetUrl(slug, 'model', versao),
            // Só o lendário tem estágios; para o resto as quatro ficam nulas.
            ...(legendary
              ? {
                  spriteFrontE2Url: assetUrl(slug, 'spriteFrontE2', versao),
                  spriteBackE2Url: assetUrl(slug, 'spriteBackE2', versao),
                  spriteFrontE3Url: assetUrl(slug, 'spriteFrontE3', versao),
                  spriteBackE3Url: assetUrl(slug, 'spriteBackE3', versao),
                }
              : {}),
          },
          select: ADMIN_PROFESSOR_SELECT,
        });

        // Mesma transação: professor sem variante é professor fora do sorteio.
        // Raro e lendário ganham UMA variante — ver professor-variants.ts.
        await ensureVariantsForProfessor(tx, criado.id, criado.types, {
          rare: criado.rare,
          legendary: criado.legendary,
        });
        return criado;
      })
      .catch((error: unknown) => {
        throw this.traduzirErroDePrisma(error, dto.name);
      });

    try {
      await this.gravarArte(slug, arte);
    } catch (error) {
      await this.desfazer(professor.id);
      this.logger.error(`Falha gravando a arte de ${slug}`, error as Error);
      throw new BadRequestException(
        'Não foi possível salvar os arquivos de arte. O professor não foi ' +
          'cadastrado — tente de novo.',
      );
    }

    this.logger.log(
      JSON.stringify({
        audit: 'professor_created',
        slug,
        types: professor.types,
        rare,
        legendary,
      }),
    );
    return { ...professor, capturedCount: 0 };
  }

  /**
   * Edita nome, tipos, `pixelArt` e arte. O slug NÃO muda — ver a nota no topo.
   *
   * Aqui a arte é gravada ANTES do update, na ordem inversa da criação: o
   * professor já existe e não pode ser desfeito, então o que importa é que a URL
   * com versão nova só seja publicada depois de o arquivo novo estar no disco.
   */
  async update(id: string, dto: UpdateProfessorDto, files: UploadedAssets) {
    const atual = await this.acharOuErro(id);
    const arte = this.validarArte(files, {
      exigirBase: false,
      exigirEstagios: false,
    });

    await this.gravarArte(atual.slug, arte);

    const versao = Date.now();
    const data: Prisma.ProfessorUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.types !== undefined) data.types = dto.types;
    if (dto.pixelArt !== undefined) data.pixelArt = dto.pixelArt;
    if (arte.spriteFront) {
      data.spriteFrontUrl = assetUrl(atual.slug, 'spriteFront', versao);
    }
    if (arte.spriteBack) {
      data.spriteBackUrl = assetUrl(atual.slug, 'spriteBack', versao);
    }
    if (arte.model) data.modelUrl = assetUrl(atual.slug, 'model', versao);
    // Estágios: trocados um a um, como os de base. Subir só a frente do estágio
    // 3 é caso real — a arte chega em levas.
    if (arte.spriteFrontE2) {
      data.spriteFrontE2Url = assetUrl(atual.slug, 'spriteFrontE2', versao);
    }
    if (arte.spriteBackE2) {
      data.spriteBackE2Url = assetUrl(atual.slug, 'spriteBackE2', versao);
    }
    if (arte.spriteFrontE3) {
      data.spriteFrontE3Url = assetUrl(atual.slug, 'spriteFrontE3', versao);
    }
    if (arte.spriteBackE3) {
      data.spriteBackE3Url = assetUrl(atual.slug, 'spriteBackE3', versao);
    }

    const professor = await this.prisma.$transaction(async (tx) => {
      const salvo = await tx.professor.update({
        where: { id },
        data,
        select: ADMIN_PROFESSOR_SELECT,
      });

      // Só ACRESCENTA as variantes que faltam. Reduzir de dois tipos para um
      // não apaga a variante dupla: pode haver ficha impressa ou exemplar no
      // bolso de aluno apontando para ela. Ela apenas deixa de ser sorteada,
      // porque o sorteio filtra pelos tipos atuais do professor.
      //
      // `salvo.rare` vem do banco, não do corpo: `rare` é imutável, e é ele que
      // mantém o raro com UMA variante mesmo depois de uma troca de tipos.
      await ensureVariantsForProfessor(tx, salvo.id, salvo.types, {
        rare: salvo.rare,
        legendary: salvo.legendary,
      });
      return salvo;
    });

    this.logger.log(
      JSON.stringify({
        audit: 'professor_updated',
        slug: professor.slug,
        types: professor.types,
      }),
    );
    return professor;
  }

  /**
   * O "remover" do painel. Desativado some do sorteio de captura, da tiragem de
   * fichas e da Profdex do aluno — mas quem já o capturou MANTÉM o exemplar, e o
   * histórico de batalha continua íntegro.
   */
  async setActive(id: string, active: boolean) {
    await this.acharOuErro(id);
    const professor = await this.prisma.professor.update({
      where: { id },
      data: { active },
      select: ADMIN_PROFESSOR_SELECT,
    });

    this.logger.log(
      JSON.stringify({
        audit: active ? 'professor_activated' : 'professor_deactivated',
        slug: professor.slug,
      }),
    );
    return professor;
  }

  // ── Bastidores ────────────────────────────────────────────────────────────

  private slugOuErro(name: string): string {
    const slug = slugFromName(name);
    if (!slug) {
      // Um nome só de símbolos ("###") normaliza para vazio, e um slug vazio
      // nomearia os arquivos de arte como "-frente.png".
      throw new BadRequestException(
        'O nome precisa ter pelo menos uma letra ou número.',
      );
    }
    return slug;
  }

  /**
   * No máximo UM raro ativo por tema (decisão 8).
   *
   * Validado contra os raros **ativos**, não contra o histórico: isso permite
   * retirar um raro e cadastrar outro no mesmo tema durante o evento. Os
   * `rare_unlocks` daquele tema continuam valendo e passam a habilitar o novo —
   * o destravamento é do TEMA, não do professor (decisão residual 3).
   */
  private async assertTemasLivres(
    types: string[],
    db: Pick<PrismaService, 'professor'> = this.prisma,
  ): Promise<void> {
    const ocupados = await db.professor.findMany({
      where: { rare: true, active: true, types: { hasSome: types } },
      select: { name: true, types: true },
    });
    if (!ocupados.length) return;

    const conflitos = [
      ...new Set(
        ocupados.flatMap((p) => p.types.filter((t) => types.includes(t))),
      ),
    ];
    throw new ConflictException({
      code: TEMA_JA_TEM_RARO,
      message:
        `Já existe professor raro ativo nestes temas: ${conflitos.join(', ')} ` +
        `(${ocupados.map((p) => p.name).join(', ')}). ` +
        'Cada tema comporta um raro — desative o atual ou escolha outro tema.',
      temas: conflitos,
    });
  }

  /**
   * No máximo UM lendário ativo (decisão 3).
   *
   * Sem filtro de tema, ao contrário do raro: o lendário não tem gate por tema
   * — o gate dele é a Profdex inteira, que é uma só.
   */
  private async assertSemLendario(
    db: Pick<PrismaService, 'professor'> = this.prisma,
  ): Promise<void> {
    const atual = await db.professor.findFirst({
      where: { legendary: true, active: true },
      select: { name: true },
    });
    if (!atual) return;

    throw new ConflictException({
      code: JA_EXISTE_LENDARIO,
      message:
        `Já existe um professor lendário ativo: ${atual.name}. ` +
        'Só pode haver um por evento — desative o atual para cadastrar outro.',
    });
  }

  private async acharOuErro(id: string) {
    const professor = await this.prisma.professor.findUnique({
      where: { id },
      select: { id: true, slug: true },
    });
    if (!professor) throw new NotFoundException('Professor não encontrado.');
    return professor;
  }

  /**
   * Confere os arquivos enviados e devolve só os válidos, por campo.
   *
   * A obrigatoriedade vem em DOIS interruptores porque são duas regras:
   *
   * - `exigirBase` separa o cadastro (os três de sempre são obrigatórios) da
   *   edição, que troca só o que veio;
   * - `exigirEstagios` vale apenas para o LENDÁRIO. Antes de existir, os quatro
   *   campos de estágio moravam em `ASSET_FIELDS` e seriam cobrados de todo
   *   mundo — cadastrar um professor comum passaria a pedir sete arquivos.
   */
  private validarArte(
    files: UploadedAssets,
    {
      exigirBase,
      exigirEstagios,
    }: { exigirBase: boolean; exigirEstagios: boolean },
  ): Partial<Record<AssetField, UploadedAsset>> {
    const arte: Partial<Record<AssetField, UploadedAsset>> = {};
    const obrigatorios = new Set<AssetField>([
      ...(exigirBase ? ASSET_FIELDS_BASE : []),
      ...(exigirEstagios ? ASSET_FIELDS_ESTAGIO : []),
    ]);

    for (const field of ASSET_FIELDS) {
      const file = files?.[field]?.[0];
      if (!file) {
        if (obrigatorios.has(field)) {
          throw new BadRequestException(
            ASSET_FIELDS_ESTAGIO.includes(field as never)
              ? 'O professor lendário precisa também dos 4 sprites de estágio: ' +
                  'frente e costas do estágio 2, frente e costas do estágio 3.'
              : 'Envie os três arquivos: sprite de frente, sprite de costas e modelo 3D.',
          );
        }
        continue;
      }

      try {
        assertValidAsset(field, file);
      } catch (error) {
        if (error instanceof AssetValidationError) {
          throw new BadRequestException(error.message);
        }
        throw error;
      }
      arte[field] = file;
    }

    return arte;
  }

  private async gravarArte(
    slug: string,
    arte: Partial<Record<AssetField, UploadedAsset>>,
  ): Promise<void> {
    for (const field of ASSET_FIELDS) {
      const file = arte[field];
      if (!file) continue;
      await writeAsset(assetFileName(slug, field), file.buffer);
    }
  }

  /** Desfaz um cadastro recém-criado. Só é chamado quando nada aponta para ele. */
  private async desfazer(id: string): Promise<void> {
    await this.prisma.professor.delete({ where: { id } }).catch((error) => {
      // Silenciar aqui deixaria um professor fantasma sem ninguém saber; o log
      // é o que permite limpá-lo à mão depois.
      this.logger.error(`Falha desfazendo o professor ${id}`, error as Error);
    });
  }

  /** Colisão de slug vira 409 com o nome em conflito, não um 500 do Prisma. */
  private traduzirErroDePrisma(error: unknown, name: string): Error {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      return new ConflictException(
        `Já existe um professor que gera o mesmo identificador de "${name}". ` +
          'Use um nome diferente (o sobrenome costuma resolver).',
      );
    }
    return error as Error;
  }
}
