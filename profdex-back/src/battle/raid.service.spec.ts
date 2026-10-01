import { MailService } from '../mail/mail.service';
import { MetricsService } from '../metrics/metrics.service';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { EMAIL_DO_PRIMEIRO } from './raid-first-clear.mail';
import {
  RAID_BLOQUEADA,
  RAID_EM_COOLDOWN,
  RAID_FECHADA,
  RAID_JA_CAPTURADO,
  RAID_SEM_LENDARIO,
  RaidService,
} from './raid.service';

/**
 * O aviso do primeiro vencedor é disparado sem `await` de propósito (a tela de
 * vitória não espera e-mail). Os testes precisam devolver o controle ao loop
 * para que essa cadeia termine antes das asserções.
 */
const esperarOAviso = () => new Promise((resolve) => setImmediate(resolve));

const LENDARIO = {
  id: 'lendario-1',
  name: 'Tânia',
  slug: 'tania',
  types: ['matematica'],
  variants: [{ id: 'var-1', types: ['matematica'] }],
};

/**
 * Banco dublê com os poucos métodos que o serviço toca. Montado à mão em vez
 * de com um mock automático porque as ASSERÇÕES deste arquivo são sobre os
 * filtros das consultas — é exatamente o `where` que precisa ficar visível.
 */
function criarPrisma(over: Record<string, unknown> = {}) {
  const wheres: Record<string, unknown>[] = [];
  return {
    wheres,
    professor: {
      findFirst: jest.fn().mockResolvedValue(LENDARIO),
      count: jest.fn(({ where }: { where: Record<string, unknown> }) => {
        wheres.push(where);
        return Promise.resolve(3);
      }),
    },
    capture: {
      findMany: jest.fn(({ where }: { where: Record<string, unknown> }) => {
        wheres.push(where);
        return Promise.resolve([
          { professorId: 'a' },
          { professorId: 'b' },
          { professorId: 'c' },
        ]);
      }),
      create: jest.fn().mockResolvedValue({ id: 'captura-1' }),
      count: jest.fn().mockResolvedValue(21),
    },
    user: {
      // `ehAdmin` lê o papel do BANCO (e não do token). `aluno` é o caso de
      // toda esta suíte; quem testa o organizador sobrescreve.
      findUnique: jest.fn().mockResolvedValue({ role: 'aluno' }),
      findUniqueOrThrow: jest.fn().mockResolvedValue({
        name: 'Ana Souza',
        matricula: '202312345',
        email: 'ana.souza@edu.unifil.br',
        battleRating: 1180,
        battleWins: 7,
        battleLosses: 2,
        battleDraws: 1,
        engagementScore: 2450,
      }),
    },
    raidUnlock: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'unlock-1' }),
    },
    raidClear: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'clear-1' }),
    },
    raidAttempt: {
      findFirst: jest.fn().mockResolvedValue(null),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn().mockResolvedValue({ id: 'tentativa-1' }),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    professorVariant: { findFirst: jest.fn().mockResolvedValue(null) },
    $transaction: jest.fn(),
    ...over,
  };
}

/**
 * `opensAt` no passado (`0`) é o padrão dos testes: a trava de horário é assunto
 * de dois deles, e os outros vinte estão testando outra coisa.
 */
function criar(
  prisma: ReturnType<typeof criarPrisma>,
  cooldownMs = 30 * 60_000,
  opensAt = 0,
) {
  const metrics = { record: jest.fn() };
  const settings = {
    raidCooldownMs: jest.fn().mockResolvedValue(cooldownMs),
    raidOpensAtMs: jest.fn().mockResolvedValue(opensAt),
    // A janela DESLIGADA (abrir == fechar) nos testes que nao sao sobre ela:
    // com 18h-22h de verdade, metade desta suite passaria ou falharia conforme
    // a hora em que o CI rodasse. As bordas de horario vivem em
    // `raid-janela.spec.ts`, com o relogio entrando por parametro.
    raidJanela: jest
      .fn()
      .mockResolvedValue({ opensAt, horaDeAbrir: 0, horaDeFechar: 0 }),
  };
  const mail = { send: jest.fn().mockResolvedValue(true) };
  const service = new RaidService(
    prisma as unknown as PrismaService,
    metrics as unknown as MetricsService,
    settings as unknown as SettingsService,
    mail as unknown as MailService,
  );
  return { service, metrics, settings, mail };
}

/**
 * A transação do `award`, com a tabela do prêmio começando com `anteriores`
 * linhas — é esse número que decide se o vencedor é o primeiro do evento.
 */
function criarTransacao(anteriores: number) {
  return {
    capture: { create: jest.fn().mockResolvedValue({ id: 'captura-1' }) },
    raidClear: {
      count: jest.fn().mockResolvedValue(anteriores),
      create: jest
        .fn()
        .mockResolvedValue({ clearedAt: new Date('2026-09-29T17:32:00Z') }),
    },
  };
}

describe('RaidService — o gate da Profdex', () => {
  /**
   * Os filtros da contagem. Cada um evita um jeito diferente de a raid ficar
   * impossível (ou trivial) de destravar, e os dois já foram bug em potencial em
   * alguma consulta deste projeto.
   *
   * O RARO está dentro: fechar a Profdex exige comuns e raros. A ausência de
   * `rare: false` aqui é a asserção — se alguém o recolocar, este teste cai.
   */
  it('conta comuns E raros ativos, e nunca o lendário', async () => {
    const prisma = criarPrisma();
    const { service } = criar(prisma);

    await service.dexProgress('ana');

    const esperado = { legendary: false, active: true };
    expect(prisma.capture.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'ana', professor: esperado },
      }),
    );
    expect(prisma.professor.count).toHaveBeenCalledWith({ where: esperado });
  });

  it('não destrava com a dex incompleta', async () => {
    const prisma = criarPrisma();
    prisma.capture.findMany = jest
      .fn()
      .mockResolvedValue([{ professorId: 'a' }]);
    const { service } = criar(prisma);

    await expect(service.ensureUnlocked('ana')).resolves.toBe(false);
    expect(prisma.raidUnlock.create).not.toHaveBeenCalled();
  });

  it('destrava e GRAVA quando a dex fecha', async () => {
    const prisma = criarPrisma();
    const { service } = criar(prisma);

    await expect(service.ensureUnlocked('ana')).resolves.toBe(true);
    expect(prisma.raidUnlock.create).toHaveBeenCalledWith({
      data: { userId: 'ana', dexSize: 3 },
    });
  });

  /**
   * O coração da decisão 6. Com a linha gravada, o serviço NÃO recalcula — e é
   * isso que impede que cadastrar um professor no meio do evento tire a raid
   * de quem já tinha fechado a coleção.
   */
  it('quem já destravou não passa pela contagem de novo', async () => {
    const prisma = criarPrisma();
    prisma.raidUnlock.findUnique = jest.fn().mockResolvedValue({ id: 'u1' });
    const { service } = criar(prisma);

    await expect(service.ensureUnlocked('ana')).resolves.toBe(true);
    expect(prisma.professor.count).not.toHaveBeenCalled();
    expect(prisma.capture.findMany).not.toHaveBeenCalled();
  });

  it('dex vazia (nenhum professor cadastrado) não destrava ninguém', async () => {
    const prisma = criarPrisma();
    prisma.professor.count = jest.fn().mockResolvedValue(0);
    prisma.capture.findMany = jest.fn().mockResolvedValue([]);
    const { service } = criar(prisma);

    await expect(service.ensureUnlocked('ana')).resolves.toBe(false);
  });
});

describe('RaidService — cooldown', () => {
  it('conta do FIM da tentativa, não do início', async () => {
    const prisma = criarPrisma();
    const dezMinAtras = new Date(Date.now() - 10 * 60_000);
    prisma.raidAttempt.findFirst = jest
      .fn()
      .mockResolvedValue({ endedAt: dezMinAtras });
    const { service } = criar(prisma);

    const restante = await service.cooldownRemainingMs('ana');

    // 30 de cooldown − 10 decorridos ≈ 20 min restantes.
    expect(Math.round(restante / 60_000)).toBe(20);
  });

  /**
   * `anulada` é o desfecho de um restart nosso ou de uma desistência na
   * preparação. Fazer o aluno esperar 30 min por um deploy seria cobrar dele
   * um erro que não é dele.
   */
  it('só olha para derrota, abandono e limite de turnos', async () => {
    const prisma = criarPrisma();
    const { service } = criar(prisma);

    await service.cooldownRemainingMs('ana');

    expect(prisma.raidAttempt.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          result: { in: ['derrota', 'abandono', 'limite_de_turnos'] },
        }),
      }),
    );
  });

  it('cooldown zerado no painel libera na hora', async () => {
    const prisma = criarPrisma();
    prisma.raidAttempt.findFirst = jest
      .fn()
      .mockResolvedValue({ endedAt: new Date() });
    const { service } = criar(prisma, 0);

    await expect(service.cooldownRemainingMs('ana')).resolves.toBe(0);
    // Nem consulta o banco: sem cooldown não há o que perguntar.
    expect(prisma.raidAttempt.findFirst).not.toHaveBeenCalled();
  });

  it('sem tentativa anterior, pode na hora', async () => {
    const prisma = criarPrisma();
    const { service } = criar(prisma);

    await expect(service.cooldownRemainingMs('ana')).resolves.toBe(0);
  });
});

describe('RaidService — canStart', () => {
  it('recusa quando não há lendário cadastrado', async () => {
    const prisma = criarPrisma();
    prisma.professor.findFirst = jest.fn().mockResolvedValue(null);
    const { service } = criar(prisma);

    await expect(service.canStart('ana')).resolves.toMatchObject({
      ok: false,
      code: RAID_SEM_LENDARIO,
    });
  });

  it('recusa quem não fechou a Profdex', async () => {
    const prisma = criarPrisma();
    prisma.capture.findMany = jest
      .fn()
      .mockResolvedValue([{ professorId: 'a' }]);
    const { service } = criar(prisma);

    await expect(service.canStart('ana')).resolves.toMatchObject({
      ok: false,
      code: RAID_BLOQUEADA,
    });
  });

  it('recusa quem já capturou o lendário', async () => {
    const prisma = criarPrisma();
    prisma.raidClear.findUnique = jest.fn().mockResolvedValue({ id: 'c1' });
    const { service } = criar(prisma);

    await expect(service.canStart('ana')).resolves.toMatchObject({
      ok: false,
      code: RAID_JA_CAPTURADO,
    });
  });

  it('recusa e diz QUANDO libera quando está em cooldown', async () => {
    const prisma = criarPrisma();
    prisma.raidAttempt.findFirst = jest
      .fn()
      .mockResolvedValue({ endedAt: new Date() });
    const { service } = criar(prisma);

    const resultado = await service.canStart('ana');

    expect(resultado).toMatchObject({ ok: false, code: RAID_EM_COOLDOWN });
    expect((resultado as { retryAt: number }).retryAt).toBeGreaterThan(
      Date.now(),
    );
  });

  it('libera quem fechou a dex, não capturou e está fora do cooldown', async () => {
    const prisma = criarPrisma();
    const { service } = criar(prisma);

    await expect(service.canStart('ana')).resolves.toMatchObject({ ok: true });
  });
});

/**
 * A trava de HORÁRIO (`raid.opens_at`). É a única do jogo que não depende do que
 * o aluno fez: o lendário é o momento de palco da feira e só acontece com
 * plateia na hora marcada.
 *
 * Quem decide é sempre este serviço, com o relógio do SERVIDOR. O front recebe
 * `opensAt` para desenhar a contagem, e nada mais — mexer na hora do aparelho
 * (que este público mexe) não atravessa esta função.
 */
describe('RaidService — a hora de abrir', () => {
  const EM_UMA_HORA = () => Date.now() + 3_600_000;

  it('recusa antes da hora e diz QUANDO abre', async () => {
    const prisma = criarPrisma();
    const abre = EM_UMA_HORA();
    const { service } = criar(prisma, 30 * 60_000, abre);

    await expect(service.canStart('ana')).resolves.toEqual({
      ok: false,
      code: RAID_FECHADA,
      retryAt: abre,
    });
  });

  /**
   * A ordem das recusas é a resposta que se quer dar: antes das 19h todo mundo
   * ouve "abre às 19h", inclusive quem ainda não fechou a Profdex. O contrário
   * mandaria quem já fechou procurar um professor que não falta.
   */
  it('a hora vem antes da coleção na ordem das recusas', async () => {
    const prisma = criarPrisma();
    prisma.capture.findMany = jest
      .fn()
      .mockResolvedValue([{ professorId: 'a' }]);
    const { service } = criar(prisma, 30 * 60_000, EM_UMA_HORA());

    await expect(service.canStart('ana')).resolves.toMatchObject({
      code: RAID_FECHADA,
    });
  });

  it('depois da hora, a trava não existe mais', async () => {
    const prisma = criarPrisma();
    const { service } = criar(prisma, 30 * 60_000, Date.now() - 1);

    await expect(service.canStart('ana')).resolves.toMatchObject({ ok: true });
  });

  /**
   * O card precisa de três coisas para desenhar a contagem em vez do botão: o
   * instante, a hora escrita (no fuso do EVENTO, não no do aparelho) e o relógio
   * do servidor para contar a partir dele.
   */
  it('o status leva a hora, o rótulo e o relógio do servidor', async () => {
    const prisma = criarPrisma();
    const abre = Date.parse('2026-10-01T22:00:00Z'); // 19h em Londrina
    const { service } = criar(prisma, 30 * 60_000, abre);

    const status = await service.status('ana');

    expect(status).toMatchObject({
      unlocked: true,
      opensAt: abre,
      // Só a HORA, nunca o dia: `rotuloDaAbertura` omite o dia quando a abertura
      // é hoje, e `status()` usa o relógio real. Fixar '01/10 19h' aqui era uma
      // bomba de data — passava até 30/09/2026 e quebrou em 01/10, o dia do
      // evento. Como o rótulo é formatado com o relógio por parâmetro, as duas
      // formas já estão travadas em `raid-opening.spec.ts`; este teste é sobre o
      // status CARREGAR o rótulo.
      opensAtLabel: expect.stringContaining('19h'),
      open: false,
    });
    expect(Math.abs(status.now - Date.now())).toBeLessThan(1_000);
  });

  it('o status abre quando a hora já passou', async () => {
    const prisma = criarPrisma();
    const { service } = criar(prisma, 30 * 60_000, Date.now() - 60_000);

    await expect(service.status('ana')).resolves.toMatchObject({ open: true });
  });

  /**
   * A trava é do EVENTO, não do aluno: quem já capturou continua com o lendário
   * na coleção, e destravar a Profdex continua acontecendo antes das 19h — o
   * aluno fecha a dex de tarde e encontra o card com a contagem esperando.
   */
  it('não impede a Profdex de destravar antes da hora', async () => {
    const prisma = criarPrisma();
    const { service } = criar(prisma, 30 * 60_000, EM_UMA_HORA());

    await expect(service.status('ana')).resolves.toMatchObject({
      unlocked: true,
      open: false,
    });
    expect(prisma.raidUnlock.create).toHaveBeenCalled();
  });
});

describe('RaidService — o prêmio', () => {
  /** Uma transação só: captura sem `RaidClear` deixaria o vencedor fora da
   *  fila do prêmio, e o contrário daria prêmio sem exemplar. */
  it('cria o exemplar com IV 15 nos quatro e a linha da fila do prêmio', async () => {
    const prisma = criarPrisma();
    const tx = criarTransacao(2);
    prisma.$transaction = jest.fn((fn: (t: unknown) => unknown) => fn(tx));
    const { service, metrics } = criar(prisma);

    const resultado = await service.award(
      'ana',
      { id: 'lendario-1', types: ['matematica'] },
      'var-1',
      'tentativa-9',
      4,
    );

    expect(resultado).toEqual({ captureId: 'captura-1' });
    expect(tx.capture.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'ana',
          professorId: 'lendario-1',
          variantId: 'var-1',
          ivHp: 15,
          ivRigor: 15,
          ivDidatica: 15,
          ivRaciocinio: 15,
        }),
      }),
    );
    expect(tx.raidClear.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'ana',
          captureId: 'captura-1',
          attemptId: 'tentativa-9',
          attempts: 4,
        }),
      }),
    );

    // Os três eventos, server-only: descoberta + captura + o lendário.
    const eventos = metrics.record.mock.calls[0][2] as { type: string }[];
    expect(eventos.map((e) => e.type)).toEqual([
      'professor_discovered',
      'professor_captured',
      'legendary_captured',
    ]);
  });

  /**
   * Duas abas vencendo ao mesmo tempo: o `@@unique` de `raid_clears.user_id`
   * derruba a segunda. A vitória continua na tela; o segundo exemplar, não.
   */
  it('vitória repetida não cria um segundo exemplar', async () => {
    const prisma = criarPrisma();
    const duplicata = Object.assign(new Error('Unique constraint failed'), {
      code: 'P2002',
      clientVersion: '6',
      name: 'PrismaClientKnownRequestError',
    });
    Object.setPrototypeOf(
      duplicata,
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      (require('@prisma/client') as typeof import('@prisma/client')).Prisma
        .PrismaClientKnownRequestError.prototype,
    );
    prisma.$transaction = jest.fn().mockRejectedValue(duplicata);
    const { service } = criar(prisma);

    await expect(
      service.award('ana', { id: 'l1', types: ['ia'] }, null, 't1', 2),
    ).resolves.toBeNull();
  });
});

/**
 * O aviso do PRIMEIRO vencedor. Vale um prêmio físico e sai uma vez por evento
 * — as duas metades dessa frase são o que este bloco protege.
 */
describe('RaidService — o aviso do primeiro vencedor', () => {
  const vencer = (service: RaidService) =>
    service.award(
      'ana',
      { id: 'lendario-1', types: ['matematica'] },
      'var-1',
      'tentativa-9',
      4,
    );

  it('manda o e-mail com nome, matrícula e estatísticas quando é o primeiro', async () => {
    const prisma = criarPrisma();
    prisma.$transaction = jest.fn((fn: (t: unknown) => unknown) =>
      fn(criarTransacao(0)),
    );
    const { service, mail } = criar(prisma);

    await vencer(service);
    await esperarOAviso();

    expect(mail.send).toHaveBeenCalledTimes(1);
    const [para, assunto, corpo] = mail.send.mock.calls[0] as string[];
    expect(para).toBe(EMAIL_DO_PRIMEIRO);
    expect(assunto).toContain('Ana Souza');
    expect(corpo).toContain('202312345');
    expect(corpo).toContain('ana.souza@edu.unifil.br');
    // As estatísticas pedidas: tentativas, dex, raros, exemplares, Elo e pontos.
    expect(corpo).toContain('3/3');
    expect(corpo).toContain('1180 de Elo');
    expect(corpo).toContain('7V 2D 1E');
    expect(corpo).toContain('2.450 pontos');
    expect(corpo).toContain('Exemplares');
    expect(corpo).toContain('>21<');
  });

  /** A regra inteira: "apenas o primeiro". */
  it('NÃO manda e-mail para quem venceu depois do primeiro', async () => {
    const prisma = criarPrisma();
    prisma.$transaction = jest.fn((fn: (t: unknown) => unknown) =>
      fn(criarTransacao(1)),
    );
    const { service, mail } = criar(prisma);

    await vencer(service);
    await esperarOAviso();

    expect(mail.send).not.toHaveBeenCalled();
  });

  /**
   * As estatísticas são enfeite; o aviso, não. Perder o e-mail inteiro porque
   * uma consulta falhou seria trocar a informação que vale o prêmio pelos
   * detalhes dela.
   */
  it('sem as estatísticas, manda o aviso mínimo em vez de nada', async () => {
    const prisma = criarPrisma();
    prisma.$transaction = jest.fn((fn: (t: unknown) => unknown) =>
      fn(criarTransacao(0)),
    );
    prisma.user.findUniqueOrThrow = jest
      .fn()
      .mockRejectedValue(new Error('banco fora do ar'));
    const { service, mail } = criar(prisma);

    await expect(vencer(service)).resolves.toEqual({ captureId: 'captura-1' });
    await esperarOAviso();

    expect(mail.send).toHaveBeenCalledTimes(1);
    const [, assunto, corpo] = mail.send.mock.calls[0] as string[];
    expect(assunto).toContain('sem estatísticas');
    expect(corpo).toContain('ana');
  });

  /**
   * A vitória já está gravada e o aluno já viu a tela. Um e-mail que não sai não
   * pode virar exceção — nem rejeição não tratada, já que ninguém dá `await`.
   */
  it('a vitória não falha quando o envio falha', async () => {
    const prisma = criarPrisma();
    prisma.$transaction = jest.fn((fn: (t: unknown) => unknown) =>
      fn(criarTransacao(0)),
    );
    const { service, mail } = criar(prisma);
    mail.send = jest.fn().mockRejectedValue(new Error('rede fora'));

    await expect(vencer(service)).resolves.toEqual({ captureId: 'captura-1' });
    await esperarOAviso();
  });
});

describe('RaidService — tentativas órfãs', () => {
  /**
   * Uma raid em andamento vive só em memória. Se o processo cai, a linha fica
   * aberta para sempre e o funil do painel passa a mentir.
   */
  it('o boot anula as tentativas que ficaram abertas, sem cobrar cooldown', async () => {
    const prisma = criarPrisma();
    prisma.raidAttempt.updateMany = jest.fn().mockResolvedValue({ count: 2 });
    const { service } = criar(prisma);

    await expect(service.annulOrphanAttempts()).resolves.toBe(2);
    expect(prisma.raidAttempt.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { endedAt: null },
        data: expect.objectContaining({ result: 'anulada' }),
      }),
    );
  });
});

/**
 * A conta de ORGANIZADOR na raid.
 *
 * A conta `@unifil.br` existe para exercitar o app: dar a si mesmo a Profdex
 * inteira e conferir a raid é operação normal. Sem estes três privilégios,
 * testar a raid às três da tarde exigiria mexer na janela no painel e lembrar de
 * desfazer, com o estande cheio.
 */
describe('RaidService — a conta de organizador', () => {
  const comoAdmin = (prisma: ReturnType<typeof criarPrisma>) => {
    prisma.user.findUnique.mockResolvedValue({ role: 'admin' });
  };

  /**
   * Prende o relógio num instante conhecido.
   *
   * `jest.setSystemTime` sozinho é NO-OP sem fake timers, e os testes de janela
   * daqui passariam só por sorte: `canStart` lê `Date.now()` de verdade, então
   * entre 18h e 22h de Londrina eles afirmariam o contrário do que querem.
   * Fake timers só nos testes de horário — os de `award` esperam o `setImmediate`
   * do e-mail, que o modo fake sequestraria.
   */
  const relogioEm = (iso: string) => jest.useFakeTimers({ now: new Date(iso) });

  afterEach(() => jest.useRealTimers());

  /** Fora de 18h–22h, com a abertura do evento já passada. */
  const foraDoHorario = { opensAt: 0, horaDeAbrir: 18, horaDeFechar: 22 };

  it('o aluno é recusado fora do horário', async () => {
    const prisma = criarPrisma();
    const ctx = criar(prisma);
    ctx.settings.raidJanela.mockResolvedValue(foraDoHorario);
    // Garante que a recusa é do HORÁRIO e não de outra trava.
    relogioEm('2026-10-02T18:00:00Z'); // 15h em Londrina

    await expect(ctx.service.canStart('ana')).resolves.toMatchObject({
      ok: false,
      code: 'RAID_FECHADA',
    });
  });

  /**
   * Prova que o relógio está preso de verdade: o relógio REAL da máquina que
   * roda isto quase nunca está entre 18h e 22h de Londrina, então sem o pin
   * funcionando este teste falharia.
   */
  it('o aluno entra DENTRO do horário', async () => {
    const prisma = criarPrisma();
    const ctx = criar(prisma);
    ctx.settings.raidJanela.mockResolvedValue(foraDoHorario);
    relogioEm('2026-10-02T22:00:00Z'); // 19h em Londrina

    await expect(ctx.service.canStart('ana')).resolves.toMatchObject({
      ok: true,
    });
  });

  it('o organizador entra fora do horário', async () => {
    const prisma = criarPrisma();
    comoAdmin(prisma);
    const ctx = criar(prisma);
    ctx.settings.raidJanela.mockResolvedValue(foraDoHorario);
    relogioEm('2026-10-02T18:00:00Z');

    await expect(ctx.service.canStart('ana')).resolves.toMatchObject({
      ok: true,
    });
  });

  it('o status abre para o organizador, sem contagem nem hora de fechar', async () => {
    // `podeDesafiar` no front exige `open`: sem isto o botão ficaria desabilitado
    // e o privilégio do `canStart` não teria como ser alcançado pela tela.
    const prisma = criarPrisma();
    comoAdmin(prisma);
    const ctx = criar(prisma);
    ctx.settings.raidJanela.mockResolvedValue(foraDoHorario);
    relogioEm('2026-10-02T18:00:00Z');

    const status = await ctx.service.status('ana');

    expect(status.open).toBe(true);
    expect(status.abreEm).toBeNull();
    expect(status.fechaEm).toBeNull();
  });

  it('a vitória do organizador NÃO cria linha na fila do prêmio', async () => {
    // É a linha de `RaidClear` que decide quem foi "o primeiro". Criá-la para a
    // mesa tiraria o e-mail do primeiro ALUNO, poria a mesa em 1º na fila do
    // painel e, por ser `@unique`, impediria um segundo teste.
    const prisma = criarPrisma();
    comoAdmin(prisma);
    const tx = criarTransacao(0);
    prisma.$transaction = jest.fn((fn: (t: unknown) => unknown) => fn(tx));
    const ctx = criar(prisma);

    const premio = await ctx.service.award(
      'ana',
      { id: 'lendario-1', types: ['ia'] },
      'var-1',
      'tentativa-1',
      3,
    );

    // O exemplar existe: é ele que o organizador está testando.
    expect(premio).toMatchObject({ captureId: expect.any(String) });
    expect(tx.capture.create).toHaveBeenCalled();
    expect(tx.raidClear.create).not.toHaveBeenCalled();
    // Nem o `count`: ele é o que decide "o primeiro", e a mesa não disputa isso.
    expect(tx.raidClear.count).not.toHaveBeenCalled();
  });

  it('a vitória do organizador não dispara o e-mail do primeiro vencedor', async () => {
    const prisma = criarPrisma();
    comoAdmin(prisma);
    prisma.$transaction = jest.fn((fn: (t: unknown) => unknown) =>
      fn(criarTransacao(0)),
    );
    const ctx = criar(prisma);

    await ctx.service.award(
      'ana',
      { id: 'lendario-1', types: ['ia'] },
      'var-1',
      'tentativa-1',
      3,
    );

    expect(ctx.mail.send).not.toHaveBeenCalled();
  });

  it('a vitória do organizador não registra métrica nenhuma', async () => {
    const prisma = criarPrisma();
    comoAdmin(prisma);
    prisma.$transaction = jest.fn((fn: (t: unknown) => unknown) =>
      fn(criarTransacao(0)),
    );
    const ctx = criar(prisma);

    await ctx.service.award(
      'ana',
      { id: 'lendario-1', types: ['ia'] },
      'var-1',
      'tentativa-1',
      3,
    );

    expect(ctx.metrics.record).not.toHaveBeenCalled();
  });

  it('a tentativa do organizador não entra no funil da raid', async () => {
    const prisma = criarPrisma();
    comoAdmin(prisma);
    const ctx = criar(prisma);

    await ctx.service.openAttempt('ana', 'lendario-1');

    // A LINHA da tentativa é criada (ela sustenta o cooldown e o fechamento);
    // a MÉTRICA é que não.
    expect(prisma.raidAttempt.create).toHaveBeenCalled();
    expect(ctx.metrics.record).not.toHaveBeenCalled();
  });

  it('para o ALUNO, nada disso muda: fila, e-mail e métrica continuam', async () => {
    const prisma = criarPrisma();
    // `anteriores: 0` → este aluno é o primeiro, então o e-mail também sai.
    const tx = criarTransacao(0);
    prisma.$transaction = jest.fn((fn: (t: unknown) => unknown) => fn(tx));
    const ctx = criar(prisma);

    await ctx.service.award(
      'ana',
      { id: 'lendario-1', types: ['ia'] },
      'var-1',
      'tentativa-1',
      3,
    );
    await esperarOAviso();

    expect(tx.raidClear.create).toHaveBeenCalled();
    expect(ctx.metrics.record).toHaveBeenCalled();
    expect(ctx.mail.send).toHaveBeenCalled();
  });

  it('papel desconhecido NÃO ganha privilégio', async () => {
    // `=== 'admin'` e não `!== 'aluno'`: um papel novo que apareça precisa
    // contar como aluno até alguém decidir o contrário.
    const prisma = criarPrisma();
    prisma.user.findUnique.mockResolvedValue({
      role: 'monitor',
    });
    const ctx = criar(prisma);
    ctx.settings.raidJanela.mockResolvedValue(foraDoHorario);
    relogioEm('2026-10-02T18:00:00Z');

    await expect(ctx.service.canStart('ana')).resolves.toMatchObject({
      ok: false,
      code: 'RAID_FECHADA',
    });
  });
});
