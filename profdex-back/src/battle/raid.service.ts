import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { buildMoveset } from './engine/moves';
import { IV_MAX } from '../captures/capture-ivs';
import { MailService } from '../mail/mail.service';
import { MetricsService } from '../metrics/metrics.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  buildRaidFirstClearEmail,
  buildRaidFirstClearFallbackEmail,
  EMAIL_DO_PRIMEIRO,
} from './raid-first-clear.mail';
import {
  PUBLIC_PROFESSOR_SELECT,
  PublicProfessor,
} from '../professors/public-professor.select';
import { SettingsService } from '../settings/settings.service';

/**
 * Motivos de recusa da raid. Códigos estáveis, nunca o texto da mensagem — o
 * front decide o que dizer em cada um (ver .codex/CODE_STYLE.md).
 */
export const RAID_SEM_LENDARIO = 'RAID_SEM_LENDARIO';
export const RAID_BLOQUEADA = 'RAID_BLOQUEADA';
export const RAID_EM_COOLDOWN = 'RAID_EM_COOLDOWN';
export const RAID_JA_CAPTURADO = 'RAID_JA_CAPTURADO';
export const RAID_EM_ANDAMENTO = 'RAID_EM_ANDAMENTO';

/** Resultados que fazem o aluno esperar. `anulada` NÃO está aqui, de propósito. */
export const RESULTADOS_QUE_ESPERAM = [
  'derrota',
  'abandono',
  'limite_de_turnos',
];

export interface RaidStatus {
  /** Fechou a Profdex alguma vez. Permanente. */
  unlocked: boolean;
  /** Já venceu e capturou — a raid some da tela. */
  captured: boolean;
  /** O lendário, mas só depois de capturado: antes é silhueta e `???`. */
  legendary: PublicProfessor | null;
  /** Quantos professores ele tem, de quantos existem — comuns e raros. */
  dex: { captured: number; total: number };
  /** Timestamp em que a próxima tentativa libera; null = pode agora. */
  cooldownUntil: number | null;
  attempts: number;
}

/**
 * Quem pode entrar na raid, quando, e o que leva ao vencer.
 *
 * Separado da sala (`raid-room.service.ts`) pela mesma razão que `cooldown` e
 * `rating` são separados de `battle-room`: aqui é tudo banco e regra de
 * elegibilidade, lá é máquina de estados em memória. A sala pergunta, este
 * serviço responde — e é ele que qualquer teste de regra precisa montar.
 */
@Injectable()
export class RaidService implements OnModuleInit {
  private readonly logger = new Logger(RaidService.name);

  constructor(
    private prisma: PrismaService,
    private metrics: MetricsService,
    private settings: SettingsService,
    private mail: MailService,
  ) {}

  /**
   * Varre no boot as tentativas que ficaram abertas.
   *
   * A sala vive em memória: um restart (deploy, crash) deixa a linha da
   * tentativa sem `endedAt` para sempre. Sem esta varredura, o funil do painel
   * contaria como "em andamento" raids que morreram há horas — e o número que
   * decide se o 4× ficou justo passaria a mentir justamente no dia do evento.
   *
   * Nunca deixa o boot cair: banco fora do ar na subida é problema de outra
   * camada, e a raid não é a parte do app que deve derrubá-la.
   */
  async onModuleInit(): Promise<void> {
    await this.annulOrphanAttempts().catch((erro: unknown) =>
      this.logger.error('Falha varrendo tentativas órfãs', erro as Error),
    );
  }

  /**
   * O lendário ativo do evento, com a variante única dele.
   *
   * `findFirst` e não `findUnique`: o banco aceita mais de um (nenhuma coluna
   * impõe unicidade), quem impõe é o cadastro. Se dois escaparem por alguma
   * porta lateral, o app usa o mais antigo em vez de estourar — o card da
   * Profdex é singular e precisa de uma resposta, não de uma exceção.
   */
  async legendary() {
    return this.prisma.professor.findFirst({
      where: { legendary: true, active: true },
      orderBy: { id: 'asc' },
      select: {
        ...PUBLIC_PROFESSOR_SELECT,
        variants: { select: { id: true, types: true }, take: 1 },
      },
    });
  }

  /**
   * Progresso da coleção INTEIRA — a conta que destrava a raid.
   *
   * Comuns **e raros**: fechar a Profdex exige os dois. O raro já não custa só
   * escanear um papel — custa 5 acertos em cada tema dele na bancada —, então
   * exigi-lo é o que faz o lendário valer a fila, e não só a sorte da tiragem.
   *
   * Os dois filtros que sobraram importam, e cada um já foi um bug em potencial:
   * - `legendary: false` porque incluir o chefe tornaria o gate circular (só
   *   destravaria a raid quem já tivesse vencido a raid);
   * - `active: true` porque desativar um professor no painel deixaria a dex
   *   impossível de fechar — é o bug que o `collection_completed` tinha. Com o
   *   raro na conta, este filtro virou também a VÁLVULA DE ESCAPE do evento:
   *   raro cadastrado sem tiragem impressa, ou com tema que ninguém destrava,
   *   trancaria a raid para todo mundo, e desativá-lo o tira da conta na hora,
   *   sem deploy.
   */
  async dexProgress(userId: string): Promise<{
    captured: number;
    total: number;
  }> {
    const where = { legendary: false, active: true };
    const [capturas, total] = await Promise.all([
      this.prisma.capture.findMany({
        where: { userId, professor: where },
        select: { professorId: true },
        distinct: ['professorId'],
      }),
      this.prisma.professor.count({ where }),
    ]);
    return { captured: capturas.length, total };
  }

  /**
   * Destrava a raid se a dex estiver fechada, e GRAVA — nunca mais recalcula.
   *
   * Esta linha é o que impede que cadastrar um professor às 15h tire a raid de
   * quem fechou a coleção às 14h. Mesmo princípio de `RareUnlock`: o fato
   * aconteceu, e uma mudança posterior no catálogo não desfaz o que o aluno já
   * conquistou (tarefa 18, decisão 6).
   */
  async ensureUnlocked(userId: string): Promise<boolean> {
    const existente = await this.prisma.raidUnlock.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (existente) return true;

    const { captured, total } = await this.dexProgress(userId);
    if (total === 0 || captured < total) return false;

    // `create` com catch de duplicata em vez de upsert: duas abas do mesmo
    // aluno podem fechar a dex no mesmo instante, e o unique é quem resolve.
    await this.prisma.raidUnlock
      .create({ data: { userId, dexSize: total } })
      .catch((erro: unknown) => {
        if (
          erro instanceof Prisma.PrismaClientKnownRequestError &&
          erro.code === 'P2002'
        ) {
          return null; // outra aba ganhou a corrida; destravado do mesmo jeito
        }
        throw erro;
      });
    this.logger.log(
      JSON.stringify({ audit: 'raid_unlocked', userId, dexSize: total }),
    );
    return true;
  }

  /** Quanto falta para a próxima tentativa, em ms. 0 = pode agora. */
  async cooldownRemainingMs(userId: string): Promise<number> {
    const cooldown = await this.settings.raidCooldownMs();
    if (cooldown <= 0) return 0;

    const ultima = await this.prisma.raidAttempt.findFirst({
      where: {
        userId,
        endedAt: { not: null },
        result: { in: RESULTADOS_QUE_ESPERAM },
      },
      orderBy: { endedAt: 'desc' },
      select: { endedAt: true },
    });
    if (!ultima?.endedAt) return 0;

    const passou = Date.now() - ultima.endedAt.getTime();
    return Math.max(0, cooldown - passou);
  }

  /** Tudo que a Profdex precisa para desenhar (ou não) o card do lendário. */
  async status(userId: string): Promise<RaidStatus> {
    const [lendario, dex, unlockRow] = await Promise.all([
      this.legendary(),
      this.dexProgress(userId),
      this.prisma.raidUnlock.findUnique({
        where: { userId },
        select: { id: true },
      }),
    ]);

    // Destrava na leitura quando a dex acabou de fechar: o aluno não precisa
    // de outra ação para o card aparecer — ele captura o último professor e a
    // raid está lá quando ele volta para a coleção.
    const unlocked = unlockRow
      ? true
      : dex.total > 0 && dex.captured >= dex.total
        ? await this.ensureUnlocked(userId)
        : false;

    const clear = lendario
      ? await this.prisma.raidClear.findUnique({
          where: { userId },
          select: { id: true },
        })
      : null;
    const captured = !!clear;

    const [cooldownMs, attempts] = await Promise.all([
      unlocked && !captured ? this.cooldownRemainingMs(userId) : 0,
      unlocked
        ? this.prisma.raidAttempt.count({ where: { userId } })
        : Promise.resolve(0),
    ]);

    // A arte e o NOME do lendário só atravessam a fronteira depois da captura.
    // Antes disso o card é silhueta com `???` — e se o servidor mandasse o
    // objeto, o DevTools revelaria quem é para a fila inteira antes da primeira
    // vitória, que é justamente o momento que a feature existe para criar.
    const publico = lendario
      ? {
          id: lendario.id,
          name: lendario.name,
          slug: lendario.slug,
          types: lendario.types,
          spriteFrontUrl: lendario.spriteFrontUrl,
          spriteBackUrl: lendario.spriteBackUrl,
          modelUrl: lendario.modelUrl,
          pixelArt: lendario.pixelArt,
          active: lendario.active,
        }
      : null;
    return {
      unlocked,
      captured,
      legendary: captured ? publico : null,
      dex,
      cooldownUntil: cooldownMs > 0 ? Date.now() + cooldownMs : null,
      attempts,
    };
  }

  /**
   * Checa tudo que precisa ser verdade para uma tentativa começar.
   *
   * Devolve o código da recusa em vez de lançar: quem chama é a sala, que
   * precisa transformar isso numa mensagem de socket, não num 500.
   */
  async canStart(userId: string): Promise<
    | {
        ok: true;
        legendary: NonNullable<Awaited<ReturnType<RaidService['legendary']>>>;
      }
    | { ok: false; code: string; retryAt?: number }
  > {
    const legendary = await this.legendary();
    if (!legendary) return { ok: false, code: RAID_SEM_LENDARIO };

    if (!(await this.ensureUnlocked(userId))) {
      return { ok: false, code: RAID_BLOQUEADA };
    }

    const clear = await this.prisma.raidClear.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (clear) return { ok: false, code: RAID_JA_CAPTURADO };

    const espera = await this.cooldownRemainingMs(userId);
    if (espera > 0) {
      return {
        ok: false,
        code: RAID_EM_COOLDOWN,
        retryAt: Date.now() + espera,
      };
    }

    return { ok: true, legendary };
  }

  /** Abre a linha da tentativa. É ela que sustenta cooldown e contagem. */
  async openAttempt(userId: string, professorId: string): Promise<string> {
    const attempt = await this.prisma.raidAttempt.create({
      data: { userId, professorId },
      select: { id: true },
    });
    this.metrics.record(userId, null, [
      {
        type: 'raid_started',
        occurredAt: new Date(),
        metadata: { professorId },
      },
    ]);
    return attempt.id;
  }

  /** Fecha a tentativa. `anulada` é a única que não faz o aluno esperar. */
  async closeAttempt(
    attemptId: string,
    result: string,
    turns: number,
  ): Promise<void> {
    await this.prisma.raidAttempt
      .update({
        where: { id: attemptId },
        data: { result, turns, endedAt: new Date() },
      })
      .catch((erro: unknown) => {
        // Nunca deixar a contabilidade derrubar o fim da batalha: o aluno já
        // viu o resultado na tela.
        this.logger.error(
          `Falha fechando tentativa ${attemptId}`,
          erro as Error,
        );
      });
  }

  /**
   * O prêmio: o exemplar do lendário e a linha que responde "quem foi o
   * primeiro?".
   *
   * Os dois numa transação só porque a segunda é a que vale o prêmio físico.
   * Uma captura sem `RaidClear` deixaria o aluno com o professor e fora da fila
   * do prêmio; um `RaidClear` sem captura, o contrário. Nenhum dos dois é
   * recuperável depois sem alguém conferir logs à mão no meio do evento.
   *
   * O `@@unique` de `RaidClear.userId` é o porteiro da regra "uma por conta":
   * duas vitórias simultâneas (duas abas) colidem no banco, e a segunda sai
   * por aqui sem criar um exemplar duplicado.
   *
   * É daqui também que sai o aviso por e-mail do PRIMEIRO vencedor do evento —
   * ver `avisarPrimeiroVencedor`.
   */
  async award(
    userId: string,
    legendary: { id: string; types: string[] },
    variantId: string | null,
    attemptId: string,
    attempts: number,
  ): Promise<{ captureId: string } | null> {
    const moves = buildMoveset(legendary.types).map((m) => m.id);
    // IV no teto nos quatro: decisão do Gustavo (Q11). O corpo inflado do chefe
    // (`raid.hp_multiplier`) NÃO acompanha — o exemplar que o aluno leva tem os
    // 120 de HP de qualquer professor, mais o bônus do IV.
    const ivs = {
      ivHp: IV_MAX,
      ivRigor: IV_MAX,
      ivDidatica: IV_MAX,
      ivRaciocinio: IV_MAX,
    };

    try {
      const { capture, clear } = await this.prisma.$transaction(async (tx) => {
        const criada = await tx.capture.create({
          data: {
            userId,
            professorId: legendary.id,
            variantId,
            moves,
            ...ivs,
          },
          select: { id: true },
        });
        // Quem já venceu ANTES desta linha existir. A ordem é decidida aqui
        // dentro, e não depois, porque dois alunos vencendo no mesmo segundo
        // veriam a tabela vazia nos dois `count` e o evento ganharia dois
        // "primeiros" — e um prêmio só.
        const anteriores = await tx.raidClear.count();
        const criadoClear = await tx.raidClear.create({
          data: {
            userId,
            professorId: legendary.id,
            captureId: criada.id,
            attemptId,
            attempts,
          },
          select: { clearedAt: true },
        });
        return {
          capture: criada,
          clear: { primeiro: anteriores === 0, em: criadoClear.clearedAt },
        };
      });

      // Fora da transação e sem `await`: a tela de vitória do aluno não pode
      // esperar uma chamada HTTP para o serviço de e-mail, e uma falha dela não
      // pode desfazer a captura que já está no banco.
      if (clear.primeiro) {
        void this.avisarPrimeiroVencedor(userId, clear.em, attempts);
      }

      const occurredAt = new Date();
      this.metrics.record(userId, null, [
        {
          type: 'professor_discovered',
          occurredAt,
          metadata: { professorId: legendary.id },
        },
        {
          type: 'professor_captured',
          occurredAt,
          metadata: { professorId: legendary.id },
        },
        {
          type: 'legendary_captured',
          occurredAt,
          metadata: { professorId: legendary.id, attempts },
        },
      ]);

      this.logger.log(
        JSON.stringify({
          audit: 'raid_cleared',
          userId,
          professorId: legendary.id,
          attempts,
          captureId: capture.id,
        }),
      );
      return { captureId: capture.id };
    } catch (erro) {
      if (
        erro instanceof Prisma.PrismaClientKnownRequestError &&
        erro.code === 'P2002'
      ) {
        // Já tinha capturado (corrida entre duas abas). A vitória continua
        // valendo na tela; o que não acontece é o segundo exemplar.
        this.logger.warn(`Raid vencida de novo por ${userId} — sem 2ª captura`);
        return null;
      }
      throw erro;
    }
  }

  /**
   * Avisa por e-mail que o PRIMEIRO aluno do evento venceu o lendário.
   *
   * Sai uma vez por evento: quem decide é o `count` dentro da transação do
   * `award`, e `raid_clears` é esvaziado pelo `scripts/limpar-evento.js` — então
   * "o primeiro do evento" é o primeiro da tabela, sem coluna de edição nenhuma.
   *
   * **Nunca lança.** É chamado sem `await` e uma exceção aqui viraria rejeição
   * não tratada; pior, não há o que fazer com ela: a vitória está gravada, o
   * aluno já viu a tela e o aviso é conveniência. Se o e-mail não sair, o que
   * fica é a linha de auditoria com nome e matrícula — o bastante para achar o
   * aluno pelo log, e o painel continua listando os vencedores.
   */
  private async avisarPrimeiroVencedor(
    userId: string,
    clearedAt: Date,
    attempts: number,
  ): Promise<void> {
    try {
      // As estatísticas são enfeite; o aviso, não. Se a coleta falhar, vai o
      // corpo mínimo — perder o e-mail inteiro por causa de uma consulta seria
      // trocar o aviso pelos detalhes dele.
      const dados = await this.estatisticasDoVencedor(userId, attempts).catch(
        (erro: unknown) => {
          this.logger.error(
            `Estatísticas do primeiro vencedor (${userId}) indisponíveis`,
            erro as Error,
          );
          return null;
        },
      );

      const { subject, html } = dados
        ? buildRaidFirstClearEmail({ ...dados, clearedAt })
        : buildRaidFirstClearFallbackEmail(userId, clearedAt);

      const enviado = await this.mail.send(EMAIL_DO_PRIMEIRO, subject, html);

      this.logger.log(
        JSON.stringify({
          audit: 'raid_first_clear_notified',
          userId,
          to: EMAIL_DO_PRIMEIRO,
          sent: enviado,
          // No log porque é o que permite chamar o aluno no palco quando o
          // e-mail não sai (sem chave configurada, ou 403 do serviço).
          name: dados?.name ?? null,
          matricula: dados?.matricula ?? null,
        }),
      );

      if (!enviado) {
        this.logger.error(
          `O aviso do PRIMEIRO vencedor da raid NÃO foi enviado para ` +
            `${EMAIL_DO_PRIMEIRO}. Vencedor: ` +
            `${dados?.name ?? userId} (${dados?.matricula ?? 'matrícula indisponível'}).`,
        );
      }
    } catch (erro) {
      // Chamado sem `await`: engolir aqui é o que impede uma rejeição não
      // tratada derrubar o processo por causa de um e-mail.
      this.logger.error(
        `Falha avisando o primeiro vencedor (${userId})`,
        erro as Error,
      );
    }
  }

  /**
   * Os números que o e-mail do primeiro vencedor mostra ao lado do nome.
   *
   * `attempts` vem de fora, do mesmo valor gravado em `raid_clears`: recontar
   * `raid_attempts` aqui daria um número parecido e ocasionalmente diferente do
   * que o painel mostra, e "quantas tentativas ele gastou" é justamente a
   * história que o e-mail conta.
   */
  private async estatisticasDoVencedor(userId: string, attempts: number) {
    const [user, dex, raros, exemplares] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: {
          name: true,
          matricula: true,
          email: true,
          battleRating: true,
          battleWins: true,
          battleLosses: true,
          battleDraws: true,
          engagementScore: true,
        },
      }),
      // A mesma conta do gate: o lendário fica fora, então capturá-lo não mexe
      // neste número e o e-mail mostra a dex que ele fechou para chegar aqui.
      this.dexProgress(userId),
      this.prisma.capture.findMany({
        where: { userId, professor: { rare: true, active: true } },
        select: { professorId: true },
        distinct: ['professorId'],
      }),
      // Exemplares, não professores distintos: aqui o lendário recém-capturado
      // ENTRA, e é isso que se quer — é o total no bolso dele.
      this.prisma.capture.count({ where: { userId } }),
    ]);

    return {
      name: user.name,
      matricula: user.matricula,
      email: user.email,
      attempts,
      dex,
      rares: raros.length,
      captures: exemplares,
      battle: {
        rating: user.battleRating,
        wins: user.battleWins,
        losses: user.battleLosses,
        draws: user.battleDraws,
      },
      engagementScore: user.engagementScore,
    };
  }

  /**
   * Varre tentativas órfãs de um restart. Uma raid em andamento vive só em
   * memória: se o processo cai, a linha fica aberta para sempre e o aluno
   * nunca mais passa no cooldown (que ignora `endedAt: null`, mas a contagem
   * de tentativas ficaria errada e o painel mentiria sobre o funil).
   *
   * `anulada` porque a culpa é nossa: não consome cooldown.
   */
  async annulOrphanAttempts(): Promise<number> {
    const { count } = await this.prisma.raidAttempt.updateMany({
      where: { endedAt: null },
      data: { result: 'anulada', endedAt: new Date() },
    });
    if (count)
      this.logger.warn(`${count} tentativa(s) de raid anuladas no boot`);
    return count;
  }
}
