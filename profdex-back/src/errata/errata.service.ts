import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { lerAlternativas } from '../quiz/quiz.service';
import { ERRATA_PAGE_SIZE } from './errata.constants';
import type {
  AbrirErrataDto,
  CorrigirQuestaoDto,
  ResolverErrataDto,
} from './dto/errata.dto';

/**
 * A questão como a tela de revisão precisa vê-la — COM gabarito.
 *
 * É a única superfície do sistema que devolve `answer`, e é por isso que ela
 * vive atrás do AdminGuard e fora da bancada: a tela de errata mora dentro do
 * AdminLayout, e a bancada (virada para o aluno) não tem link para cá.
 */
const QUESTAO_PARA_REVISAO = {
  id: true,
  code: true,
  theme: true,
  difficulty: true,
  prompt: true,
  options: true,
  answer: true,
  active: true,
} satisfies Prisma.QuizQuestionSelect;

const ERRATA_SELECT = {
  id: true,
  status: true,
  notes: true,
  createdAt: true,
  resolvedAt: true,
  question: { select: QUESTAO_PARA_REVISAO },
  student: { select: { id: true, name: true, matricula: true } },
  openedBy: { select: { name: true } },
  resolvedBy: { select: { name: true } },
  attempt: {
    select: {
      id: true,
      correct: true,
      answerIndex: true,
      annulled: true,
      createdAt: true,
    },
  },
} satisfies Prisma.QuizErratumSelect;

type ErratumRow = Prisma.QuizErratumGetPayload<{
  select: typeof ERRATA_SELECT;
}>;

const VOUCHER_SELECT = {
  id: true,
  theme: true,
  reason: true,
  status: true,
  createdAt: true,
  redeemedAt: true,
  erratum: { select: { question: { select: { code: true } } } },
} satisfies Prisma.CaptureVoucherSelect;

/**
 * Errata: o aluno contesta a questão na bancada e, se tiver razão, sai com um
 * voucher que vale um QR sem responder outra pergunta.
 *
 * Três decisões moldam o resto:
 *
 * 1. **Quem opera não é quem decide.** O operador da bancada só ABRE a
 *    contestação (código + matrícula). Julgar é ato de painel, com o enunciado
 *    e o gabarito à vista.
 * 2. **A autoria nunca vem do corpo da requisição.** `openedById`,
 *    `resolvedById` e `redeemedById` saem sempre do principal da sessão — a
 *    pergunta depois do evento é "quem liberou isso?", e uma resposta que o
 *    cliente pôde escolher não vale nada.
 * 3. **Corrigir o gabarito não reprocessa o passado.** Quem já respondeu errado
 *    por causa da questão ruim é compensado pelo voucher, individualmente.
 *    Reprocessar tentativas antigas mudaria pontuação de gente que já foi
 *    embora do estande.
 */
@Injectable()
export class ErrataService {
  constructor(private prisma: PrismaService) {}

  // ── Contestação ───────────────────────────────────────────────────────────

  /**
   * Abre a contestação a partir do código da questão e da matrícula do aluno.
   * A tentativa é localizada, quando existe: é ela que a errata procedente
   * anula, tirando o aluno do cooldown daquele tema.
   */
  async abrir(operatorId: string, dto: AbrirErrataDto) {
    const [question, student] = await Promise.all([
      this.prisma.quizQuestion.findUnique({
        where: { code: dto.code },
        select: { id: true, theme: true },
      }),
      this.findAluno(dto.matricula),
    ]);

    if (!question) {
      throw new NotFoundException(
        `Nenhuma questão com o código #${dto.code}. Confira os 4 dígitos na tela da bancada.`,
      );
    }

    // Uma contestação aberta por vez para o mesmo par: a fila da bancada
    // duplicaria a mesma reclamação enquanto o painel não olhasse.
    const jaAberta = await this.prisma.quizErratum.findFirst({
      where: {
        questionId: question.id,
        studentId: student.id,
        status: 'aberta',
      },
      select: { id: true },
    });
    if (jaAberta) {
      throw new ConflictException(
        'Este aluno já tem uma contestação aberta para esta questão.',
      );
    }

    const attempt = await this.prisma.quizAttempt.findFirst({
      where: { userId: student.id, questionId: question.id },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });

    const criada = await this.prisma.quizErratum.create({
      data: {
        questionId: question.id,
        studentId: student.id,
        attemptId: attempt?.id ?? null,
        openedById: operatorId,
        notes: dto.notes || null,
      },
      select: ERRATA_SELECT,
    });

    return this.toErrata(criada);
  }

  /** Fila de revisão. Sem filtro, devolve tudo — abertas primeiro. */
  async listar(status?: string) {
    const linhas = await this.prisma.quizErratum.findMany({
      where: status ? { status } : {},
      // Abertas antes das julgadas, e dentro de cada grupo a mais antiga
      // primeiro: é uma fila, não um feed.
      orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
      take: ERRATA_PAGE_SIZE,
      select: ERRATA_SELECT,
    });

    return linhas.map((linha) => this.toErrata(linha));
  }

  /**
   * Julga a contestação. Procedente emite o voucher e anula a tentativa **na
   * mesma transação**: um voucher sem a anulação deixaria o aluno preso no
   * cooldown, e uma anulação sem voucher o deixaria sem a compensação.
   */
  async resolver(adminId: string, id: string, dto: ResolverErrataDto) {
    const erratum = await this.prisma.quizErratum.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        studentId: true,
        attemptId: true,
        question: { select: { theme: true } },
      },
    });
    if (!erratum) throw new NotFoundException('Contestação não encontrada.');
    if (erratum.status !== 'aberta') {
      throw new ConflictException(
        `Esta contestação já foi julgada como ${erratum.status}.`,
      );
    }

    const procedente = dto.status === 'procedente';

    const atualizada = await this.prisma.$transaction(async (tx) => {
      if (procedente) {
        await tx.captureVoucher.create({
          data: {
            userId: erratum.studentId,
            erratumId: erratum.id,
            theme: erratum.question.theme,
            reason: 'errata',
            issuedById: adminId,
          },
        });

        // A tentativa sai do cooldown e do relatório, mas a linha fica: ela é
        // histórico, e o voucher aponta para ela.
        if (erratum.attemptId) {
          await tx.quizAttempt.update({
            where: { id: erratum.attemptId },
            data: { annulled: true },
          });
        }
      }

      // A errata é atualizada POR ÚLTIMO porque é ela que relê a tentativa no
      // `select`. Na ordem inversa, a resposta saía com `annulled: false` —
      // lida antes da anulação acontecer — e a tela dizia que a tentativa
      // seguia valendo enquanto o cooldown já tinha sido liberado.
      return tx.quizErratum.update({
        where: { id },
        data: {
          status: dto.status,
          notes: dto.notes ?? undefined,
          resolvedById: adminId,
          resolvedAt: new Date(),
        },
        select: ERRATA_SELECT,
      });
    });

    return this.toErrata(atualizada);
  }

  /**
   * Corrige a questão contestada. Não mexe em tentativa nenhuma: o passado é
   * compensado por voucher, não reescrito (ver o comentário da classe).
   */
  async corrigirQuestao(id: string, dto: CorrigirQuestaoDto) {
    const atual = await this.prisma.quizQuestion.findUnique({
      where: { id },
      select: { options: true, answer: true },
    });
    if (!atual) throw new NotFoundException('Questão não encontrada.');

    // O gabarito precisa fazer sentido para a lista que ficar valendo — trocar
    // as alternativas sem reapontar o `answer` deixaria a questão sem resposta
    // certa, e isso só apareceria na frente do próximo aluno.
    const options = dto.options ?? lerAlternativas(atual.options);
    const answer = dto.answer ?? atual.answer;
    if (answer >= options.length) {
      throw new BadRequestException(
        `O gabarito aponta para a alternativa ${answer + 1}, e a questão tem ${options.length}.`,
      );
    }

    try {
      return await this.prisma.quizQuestion.update({
        where: { id },
        data: {
          prompt: dto.prompt,
          options: dto.options,
          answer: dto.answer,
          active: dto.active,
        },
        select: QUESTAO_PARA_REVISAO,
      });
    } catch (error) {
      // P2002 = o enunciado é a chave natural do banco de questões.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'Já existe uma questão com este enunciado.',
        );
      }
      throw error;
    }
  }

  // ── Vouchers ──────────────────────────────────────────────────────────────

  /**
   * Os vouchers disponíveis do próprio aluno. `userId` vem SEMPRE da sessão —
   * aceitar o id do cliente aqui seria expor o voucher de qualquer um.
   */
  async meusVouchers(userId: string) {
    const linhas = await this.prisma.captureVoucher.findMany({
      where: { userId, status: 'disponivel' },
      orderBy: { createdAt: 'desc' },
      select: VOUCHER_SELECT,
    });

    return linhas.map((linha) => this.toVoucher(linha));
  }

  /** Busca por matrícula, para o operador dar o check na mesa. */
  async vouchersDoAluno(matricula: string) {
    const student = await this.findAluno(matricula);
    const linhas = await this.prisma.captureVoucher.findMany({
      where: { userId: student.id },
      // Disponíveis primeiro: é o que o operador procura. Os usados ficam
      // logo abaixo para responder "alguém já deu check nisso?".
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: ERRATA_PAGE_SIZE,
      select: VOUCHER_SELECT,
    });

    return {
      aluno: {
        id: student.id,
        name: student.name,
        matricula: student.matricula,
      },
      vouchers: linhas.map((linha) => this.toVoucher(linha)),
    };
  }

  /**
   * Dá o check: marca o voucher como usado e registra quem o entregou.
   *
   * O `updateMany` condicional em `status: 'disponivel'` é o que torna a
   * operação idempotente sob concorrência — dois operadores tocando o mesmo
   * voucher, ou um toque duplo no botão, e só o primeiro encontra linha para
   * atualizar. O segundo sai com 409 e nenhuma ficha extra é entregue.
   */
  async resgatar(adminId: string, id: string) {
    const { count } = await this.prisma.captureVoucher.updateMany({
      where: { id, status: 'disponivel' },
      data: { status: 'usado', redeemedById: adminId, redeemedAt: new Date() },
    });

    if (!count) {
      const existente = await this.prisma.captureVoucher.findUnique({
        where: { id },
        select: { status: true },
      });
      if (!existente) throw new NotFoundException('Voucher não encontrado.');
      throw new ConflictException(
        `Este voucher já está como "${existente.status}".`,
      );
    }

    const atualizado = await this.prisma.captureVoucher.findUniqueOrThrow({
      where: { id },
      select: VOUCHER_SELECT,
    });
    return this.toVoucher(atualizado);
  }

  // ── Interno ───────────────────────────────────────────────────────────────

  private async findAluno(matricula: string) {
    const user = await this.prisma.user.findUnique({
      where: { matricula: matricula.trim() },
      select: { id: true, name: true, matricula: true },
    });
    if (!user) {
      throw new NotFoundException(
        'Matrícula não encontrada. O aluno precisa ter entrado no app pelo menos uma vez.',
      );
    }
    return user;
  }

  /** Allowlist de saída da errata. O gabarito sai aqui — rota de admin. */
  private toErrata(linha: ErratumRow) {
    return {
      id: linha.id,
      status: linha.status,
      notes: linha.notes,
      criadaEm: linha.createdAt,
      resolvidaEm: linha.resolvedAt,
      abertaPor: linha.openedBy.name,
      resolvidaPor: linha.resolvedBy?.name ?? null,
      aluno: linha.student,
      questao: {
        id: linha.question.id,
        code: linha.question.code,
        theme: linha.question.theme,
        difficulty: linha.question.difficulty,
        prompt: linha.question.prompt,
        options: lerAlternativas(linha.question.options),
        answer: linha.question.answer,
        active: linha.question.active,
      },
      tentativa: linha.attempt
        ? {
            id: linha.attempt.id,
            correct: linha.attempt.correct,
            answerIndex: linha.attempt.answerIndex,
            annulled: linha.attempt.annulled,
            quando: linha.attempt.createdAt,
          }
        : null,
    };
  }

  /**
   * Allowlist de saída do voucher. Sem `userId`, sem `issuedById`: o aluno lê
   * isto no celular, e nada aqui precisa identificar terceiros.
   */
  private toVoucher(linha: {
    id: string;
    theme: string | null;
    reason: string;
    status: string;
    createdAt: Date;
    redeemedAt: Date | null;
    erratum: { question: { code: string } } | null;
  }) {
    return {
      id: linha.id,
      theme: linha.theme,
      reason: linha.reason,
      status: linha.status,
      // O código da questão contestada é o que dá contexto ao card na tela do
      // aluno: "Errata da questão #4821".
      questaoCode: linha.erratum?.question.code ?? null,
      criadoEm: linha.createdAt,
      resgatadoEm: linha.redeemedAt,
    };
  }
}
