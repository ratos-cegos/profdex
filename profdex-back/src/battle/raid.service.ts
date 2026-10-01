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
import { estadoDaJanela, fechaEm } from './raid-janela';
import { rotuloDaAbertura } from './raid-opening';
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
export const RAID_FECHADA = 'RAID_FECHADA';
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
  /**
   * Timestamp da abertura da raid no evento (`raid.opens_at`). Vale para TODO
   * mundo, ao contrário do `unlocked`, e é com ele que o front desenha a
   * contagem no card em vez do botão.
   */
  opensAt: number;
  /** A mesma hora já escrita no fuso do evento — ver `raid-opening.ts`. */
  opensAtLabel: string;
  /**
   * Quando a porta (re)abre: `opensAt` antes do evento, a próxima vez que o
   * relógio bate a hora de abrir quando é só a janela diária que está fechada, e
   * `null` quando já está aberta.
   *
   * Existe separado de `opensAt` porque os dois divergem depois do primeiro dia:
   * `opensAt` é o marco do evento e não se move, e é dele que sai a contagem de
   * antes da estreia. Quem desenha "ABRE EM 40MIN" às 17h20 de um sábado é este.
   */
  abreEm: number | null;
  /** `abreEm` já escrito no fuso do evento. */
  abreEmLabel: string;
  /** Quando a janela de hoje fecha. `null` se a janela está desligada. */
  fechaEm: number | null;
  /** A porta está aberta AGORA: abertura do evento e janela diária, as duas. */
  open: boolean;
  /**
   * O relógio do SERVIDOR no instante da resposta.
   *
   * Os três timestamps daqui (`opensAt`, `cooldownUntil`, este) são do relógio
   * do servidor, e o front conta o tempo a partir DELE em vez do
   * `Date.now()` do aparelho. É o que impede que um relógio adiantado — de
   * propósito ou não, e este público tem DevTools aberto — mostre "CAPTURAR"
   * antes da hora e renda uma recusa que parece bug em vez de regra.
   *
   * Quem DECIDE nunca foi o front (ver `canStart`); isto é para a tela não
   * mentir.
   */
  now: number;
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
    const [lendario, dex, unlockRow, janela, admin] = await Promise.all([
      this.legendary(),
      this.dexProgress(userId),
      this.prisma.raidUnlock.findUnique({
        where: { userId },
        select: { id: true },
      }),
      this.settings.raidJanela(),
      this.ehAdmin(userId),
    ]);
    const opensAt = janela.opensAt;

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
      // `!admin` junto das outras condições: o organizador não espera entre
      // tentativas (ver `canStart`), e mostrar "aguarde 28 min" no card para
      // quem o servidor vai deixar entrar seria a tela contradizendo a regra.
      unlocked && !captured && !admin ? this.cooldownRemainingMs(userId) : 0,
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
          // O card da coleção não desenha estágio — quem troca de sprite na
          // virada é a arena. Vão porque a cópia é explícita de propósito (é
          // ela que torna visível o que atravessa a fronteira) e o tipo
          // `PublicProfessor` cobra o conjunto inteiro.
          spriteFrontE2Url: lendario.spriteFrontE2Url,
          spriteBackE2Url: lendario.spriteBackE2Url,
          spriteFrontE3Url: lendario.spriteFrontE3Url,
          spriteBackE3Url: lendario.spriteBackE3Url,
          pixelArt: lendario.pixelArt,
          active: lendario.active,
        }
      : null;
    // Um `now` só para a resposta inteira: dois `Date.now()` no mesmo objeto
    // podem cair em milissegundos diferentes, e aí o `open` e a contagem que o
    // front deriva não estariam falando do mesmo instante.
    const now = Date.now();
    const estado = estadoDaJanela({ agora: now, ...janela });
    // Para o organizador a porta está sempre aberta, e a TELA precisa saber:
    // `podeDesafiar` no front exige `open`, então sem isto o botão ficaria
    // desabilitado e o privilégio de `canStart` não teria como ser alcançado.
    const aberta = estado.aberta || admin;
    // Aberta não tem para onde reabrir — inclusive para o organizador, que não
    // deve ver contagem nenhuma.
    const abreEm = aberta ? null : estado.reabreEm;
    return {
      unlocked,
      captured,
      legendary: captured ? publico : null,
      dex,
      // A hora da abertura é pública, e de propósito: ela não revela NADA sobre
      // o lendário (nem nome, nem arte, nem se este aluno pode desafiar) e é a
      // única informação que faz a fila estar na frente do estande às 19h.
      opensAt,
      opensAtLabel: rotuloDaAbertura(opensAt, now),
      abreEm,
      abreEmLabel: abreEm ? rotuloDaAbertura(abreEm, now) : '',
      // O organizador não tem hora de fechar: mostrar "fecha às 22h" para quem
      // ignora a janela seria a tela contradizendo a regra.
      fechaEm:
        estado.aberta && !admin
          ? fechaEm({
              agora: now,
              horaDeAbrir: janela.horaDeAbrir,
              horaDeFechar: janela.horaDeFechar,
            })
          : null,
      open: aberta,
      now,
      cooldownUntil: cooldownMs > 0 ? now + cooldownMs : null,
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

    // A trava do relógio vem ANTES da do aluno, e a ordem é a resposta que se
    // quer dar: fora do horário a recusa é a mesma para todo mundo ("abre às
    // 18h"), em vez de o aluno que fechou a Profdex às 15h ler "complete a
    // Profdex" e ir procurar o professor que falta — não falta nenhum.
    //
    // Duas travas num cheque só (ver `raid-janela.ts`): a abertura do evento e a
    // janela diária. É o ÚNICO ponto que consulta a janela, e é isso que faz
    // "quem está no meio termina" sair de graça — a partida em curso nunca
    // volta a passar por aqui.
    const estado = estadoDaJanela({
      agora: Date.now(),
      ...(await this.settings.raidJanela()),
    });
    // Uma leitura do papel para as duas dispensas abaixo. Ver `ehAdmin`.
    const admin = await this.ehAdmin(userId);

    // O organizador entra fora do horário.
    if (!estado.aberta && !admin) {
      return {
        ok: false,
        code: RAID_FECHADA,
        retryAt: estado.reabreEm ?? undefined,
      };
    }

    if (!(await this.ensureUnlocked(userId))) {
      return { ok: false, code: RAID_BLOQUEADA };
    }

    const clear = await this.prisma.raidClear.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (clear) return { ok: false, code: RAID_JA_CAPTURADO };

    // E não espera entre tentativas: o cooldown existe para o ALUNO não ocupar a
    // fila do estande repetindo a raid, e quem testa precisa repetir. Para o
    // aluno ele continua igual.
    //
    // As duas travas que SOBRAM para o organizador são as que protegem os dados
    // dele mesmo: dex fechada e já capturado.
    const espera = admin ? 0 : await this.cooldownRemainingMs(userId);
    if (espera > 0) {
      return {
        ok: false,
        code: RAID_EM_COOLDOWN,
        retryAt: Date.now() + espera,
      };
    }

    return { ok: true, legendary };
  }

  /**
   * A conta de ORGANIZADOR (`role: 'admin'`), que tem três privilégios na raid:
   * entra fora do horário, não entra na contagem e nunca é "o primeiro".
   *
   * A conta `@unifil.br` existe para exercitar o app — dar a si mesmo a Profdex
   * inteira e conferir a raid é operação normal (ver `scripts/dar-capturas.ts`).
   * Sem isto, testar a raid às três da tarde exigiria mexer na janela no painel e
   * lembrar de desfazer, com o estande cheio.
   *
   * Lê do BANCO e não do `role` do token, de propósito: o token guarda o papel
   * que a conta tinha no LOGIN, e um privilégio que ignora a trava de horário não
   * deve depender de um crachá velho. É uma consulta por tentativa, no caminho
   * que já faz várias.
   *
   * `=== 'admin'` e não `!== 'aluno'`: papel novo que aparecer NÃO ganha
   * privilégio por omissão.
   */
  private async ehAdmin(userId: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    return user?.role === 'admin';
  }

  /** Abre a linha da tentativa. É ela que sustenta cooldown e contagem. */
  async openAttempt(userId: string, professorId: string): Promise<string> {
    const attempt = await this.prisma.raidAttempt.create({
      data: { userId, professorId },
      select: { id: true },
    });
    // A LINHA da tentativa é criada para todo mundo — é ela que sustenta o
    // cooldown e a contagem de tentativas do próprio jogador, e o organizador
    // também precisa que a dele feche. O que ele não alimenta é a MÉTRICA: o
    // funil da raid no painel e os pontos de engajamento são sobre os alunos.
    if (!(await this.ehAdmin(userId))) {
      this.metrics.record(userId, null, [
        {
          type: 'raid_started',
          occurredAt: new Date(),
          metadata: { professorId },
        },
      ]);
    }
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

    const admin = await this.ehAdmin(userId);

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

        // O organizador leva o exemplar, mas NÃO entra na fila do prêmio.
        //
        // É a linha de `RaidClear` que decide quem foi "o primeiro" (pelo
        // `count` abaixo), que desenha a fila do prêmio no painel e que, sendo
        // `@unique` por conta, impede uma segunda tentativa. Criá-la para a
        // conta da mesa faria três estragos de uma vez: o primeiro ALUNO a
        // vencer deixaria de ser o primeiro e nunca receberia o e-mail, a fila
        // nasceria com a mesa em 1º lugar, e o organizador não conseguiria
        // testar a raid de novo.
        if (admin) return { capture: criada, clear: null };
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
      // `clear` é null para o organizador, então ele nunca é "o primeiro" —
      // que é exatamente o ponto: o e-mail do primeiro vencedor é sobre aluno.
      if (clear?.primeiro) {
        void this.avisarPrimeiroVencedor(userId, clear.em, attempts);
      }

      // Nem ponto de engajamento, nem contagem de captura: a vitória da mesa não
      // pode mexer no ranking nem no funil do painel. A captura em si existe (ela
      // é o que o organizador testa); o que não existe é o registro dela como
      // conquista de alguém que disputa com os alunos.
      if (!admin) {
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
      }

      this.logger.log(
        JSON.stringify({
          audit: 'raid_cleared',
          userId,
          professorId: legendary.id,
          attempts,
          captureId: capture.id,
          // No log fica: é como se explica, depois, por que a fila do prêmio não
          // tem uma linha para esta vitória.
          admin,
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
