import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { DEFAULT_MAX_HP } from './engine/engine';
import { RaidRoomService } from './raid-room.service';
import { RaidService } from './raid.service';

const LENDARIO = {
  id: 'lendario-1',
  name: 'Tânia',
  slug: 'tania',
  types: ['matematica'],
  // A arte, como `PUBLIC_PROFESSOR_SELECT` a entrega. Ela existe aqui para o
  // teste de regressão lá embaixo poder conferir que ela ATRAVESSA até o front.
  spriteFrontUrl: '/uploads/tania-frente.png?v=1',
  spriteBackUrl: '/uploads/tania-costas.png?v=1',
  modelUrl: '/uploads/tania.glb?v=1',
  pixelArt: false,
  variants: [{ id: 'var-1', types: ['matematica'] }],
};

const ALUNO = { userId: 'ana', name: 'Ana' };

/**
 * Três exemplares comuns do aluno, como o banco os devolve na seleção.
 *
 * `humanas` não é decorativo: na roda ele é super-efetivo contra `matematica`
 * (o tipo do chefe) e resiste à volta. Com `ia`, que perde nos dois sentidos,
 * o teste da vitória mediria o balanceamento da roda em vez do que ele quer
 * medir — que o desfecho "venceu" entrega o exemplar.
 */
const CAPTURAS = ['c1', 'c2', 'c3'].map((id) => ({
  id,
  moves: [], // vazio → a sala monta o deck a partir dos tipos
  ivHp: 0,
  ivRigor: 0,
  ivDidatica: 0,
  ivRaciocinio: 0,
  professor: {
    id: `p-${id}`,
    name: `Prof ${id}`,
    slug: `p-${id}`,
    types: ['humanas'],
  },
  variant: { types: ['humanas'] },
}));

function montar({
  hpMultiplier = 4,
  legendaryIv = 15,
  turnCap = 60,
}: { hpMultiplier?: number; legendaryIv?: number; turnCap?: number } = {}) {
  const emitidos: { userId: string; event: string; payload: any }[] = [];

  const prisma = {
    capture: { findMany: jest.fn().mockResolvedValue(CAPTURAS) },
    raidAttempt: { count: jest.fn().mockResolvedValue(3) },
    professorVariant: {
      findFirst: jest.fn().mockResolvedValue({ id: 'var-1' }),
    },
  } as unknown as PrismaService;

  const raid = {
    canStart: jest.fn().mockResolvedValue({ ok: true, legendary: LENDARIO }),
    openAttempt: jest.fn().mockResolvedValue('tentativa-1'),
    closeAttempt: jest.fn().mockResolvedValue(undefined),
    award: jest.fn().mockResolvedValue({ captureId: 'captura-nova' }),
  };

  const settings = {
    raidRules: jest
      .fn()
      .mockResolvedValue({ hpMultiplier, legendaryIv, turnCap }),
    raidCooldownMs: jest.fn().mockResolvedValue(30 * 60_000),
  };

  const service = new RaidRoomService(
    prisma,
    raid as unknown as RaidService,
    settings as unknown as SettingsService,
  );
  service.configure({
    emitToUser: (userId, event, payload) =>
      emitidos.push({ userId, event, payload }),
    onRoomClosed: jest.fn(),
  });

  const ultimo = (event: string) =>
    [...emitidos].reverse().find((e) => e.event === event)?.payload;

  return { service, raid, prisma, settings, emitidos, ultimo };
}

/** Abre a sala e chega até a arena, com o time confirmado e o lead escolhido. */
async function atePrimeiroTurno(ctx: ReturnType<typeof montar>) {
  await ctx.service.start(ALUNO);
  await ctx.service.pickTeam(ALUNO.userId, ['c1', 'c2', 'c3']);
  ctx.service.chooseLead(ALUNO.userId, 'c1');
}

/**
 * Joga a raid até o fim, sempre com o primeiro golpe do ativo.
 *
 * Trata a fase de substituição explicitamente: ignorá-la não travaria o teste,
 * ele apenas terminaria em ABANDONO — três entradas não escolhidas somam três
 * faltas —, e o teste da vitória passaria a afirmar o contrário do que quer.
 */
async function jogarAteOFim(ctx: ReturnType<typeof montar>, maxTurnos = 80) {
  for (let i = 0; i < maxTurnos && !ctx.ultimo('battle:end'); i += 1) {
    const caiu = ctx.ultimo('battle:faint');
    const round = ctx.ultimo('battle:round');
    const precisaEntrar =
      caiu?.youChoose &&
      (!round ||
        ctx.emitidos.lastIndexOf(acharEvento(ctx, 'battle:faint')) >
          ctx.emitidos.lastIndexOf(acharEvento(ctx, 'battle:round')));

    if (precisaEntrar) {
      const proximo = caiu.you.team.find(
        (m: any) => !m.fainted && m.captureId !== caiu.you.activeCaptureId,
      );
      if (!proximo) break;
      ctx.service.enterWith(ALUNO.userId, proximo.captureId);
      continue;
    }

    const atual = round ?? ctx.ultimo('battle:begin');
    const golpe = atual?.you?.moves?.[0]?.id;
    if (!golpe) break;
    ctx.service.move(ALUNO.userId, golpe);
    await jest.runOnlyPendingTimersAsync();
  }
  return ctx.ultimo('battle:end');
}

const acharEvento = (ctx: ReturnType<typeof montar>, event: string) =>
  [...ctx.emitidos].reverse().find((e) => e.event === event)!;

describe('RaidRoomService — o corpo do chefe', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  /**
   * O multiplicador SUBSTITUI a fórmula de HP do motor — por isso 4×120 = 480
   * e não 4×125. É a diferença entre o dial fazer o que o painel promete e ele
   * carregar um bônus de IV escondido.
   */
  it('nasce com 4×120 de vida, sem somar o bônus de IV do HP', async () => {
    const ctx = montar({ hpMultiplier: 4, legendaryIv: 15 });

    await atePrimeiroTurno(ctx);

    expect(ctx.ultimo('battle:begin').foe.maxHp).toBe(DEFAULT_MAX_HP * 4);
  });

  it('o multiplicador do painel vale para a sala nova', async () => {
    const ctx = montar({ hpMultiplier: 2 });

    await atePrimeiroTurno(ctx);

    expect(ctx.ultimo('battle:begin').foe.maxHp).toBe(DEFAULT_MAX_HP * 2);
  });

  it('a sala congela as regras no nascimento — uma leitura só', async () => {
    const ctx = montar();

    await atePrimeiroTurno(ctx);

    // Mexer no painel com a raid em andamento não pode mudar a vida do chefe
    // com o aluno já lutando.
    expect(ctx.settings.raidRules).toHaveBeenCalledTimes(1);
  });
});

/**
 * Regressão de 27/09/2026: o chefe chegava ao front sem arte.
 *
 * `openRoom` montava o professor do chefe à mão, com só `id`/`slug`/`name`. O
 * front faz `professor?.spriteFrontUrl || SPRITE_PADRAO`, então o lendário
 * recém-cadastrado aparecia na raid com a sprite padrão — a do Gustavo. A
 * suspeita natural foi upload quebrado; a arte estava certa o tempo todo, e a
 * consulta (`PUBLIC_PROFESSOR_SELECT`) já a trazia. Era o literal que a perdia.
 */
describe('RaidRoomService — a arte do chefe', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('manda a arte do lendário no battle:begin, não a sprite padrão', async () => {
    const ctx = montar();

    await atePrimeiroTurno(ctx);

    expect(ctx.ultimo('battle:begin').foe.professor).toMatchObject({
      id: 'lendario-1',
      name: 'Tânia',
      spriteFrontUrl: '/uploads/tania-frente.png?v=1',
      spriteBackUrl: '/uploads/tania-costas.png?v=1',
      modelUrl: '/uploads/tania.glb?v=1',
    });
  });

  /**
   * O front só cai na sprite padrão quando o campo é falsy. Um `undefined`
   * aqui é indistinguível, na tela, de um professor sem arte cadastrada.
   */
  it('nenhum campo de arte chega indefinido', async () => {
    const ctx = montar();

    await atePrimeiroTurno(ctx);

    const { professor } = ctx.ultimo('battle:begin').foe;
    for (const campo of ['spriteFrontUrl', 'spriteBackUrl', 'modelUrl']) {
      expect(professor[campo]).toBeTruthy();
    }
  });
});

describe('RaidRoomService — recusas', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('propaga o código da recusa do serviço, sem abrir sala', async () => {
    const ctx = montar();
    ctx.raid.canStart = jest
      .fn()
      .mockResolvedValue({ ok: false, code: 'RAID_BLOQUEADA' });

    const ack = await ctx.service.start(ALUNO);

    expect(ack).toMatchObject({ ok: false, code: 'RAID_BLOQUEADA' });
    expect(ctx.service.hasActiveRoom('ana')).toBe(false);
    expect(ctx.raid.openAttempt).not.toHaveBeenCalled();
  });

  /**
   * A recusa por horário diz a HORA, não "faltam 214 minutos": é o texto que o
   * aluno repete para o amigo na fila, e é ele que põe os dois na frente do
   * estande na hora certa. A hora é a do evento — ver `raid-opening.ts`.
   */
  it('diz a hora em que a raid abre quando ainda está fechada', async () => {
    const ctx = montar();
    ctx.raid.canStart = jest.fn().mockResolvedValue({
      ok: false,
      code: 'RAID_FECHADA',
      retryAt: Date.parse('2026-10-01T22:00:00Z'), // 19h em Londrina
    });

    const ack = await ctx.service.start(ALUNO);

    // Só `19h`, e não o dia: o dia entra na frase apenas quando a abertura não é
    // hoje, e travar isso aqui faria o teste falhar no dia 1º de outubro.
    expect((ack as { message: string }).message).toMatch(/abre.*19h/);
    expect(ctx.raid.openAttempt).not.toHaveBeenCalled();
  });

  it('traduz o cooldown em minutos na mensagem', async () => {
    const ctx = montar();
    ctx.raid.canStart = jest.fn().mockResolvedValue({
      ok: false,
      code: 'RAID_EM_COOLDOWN',
      retryAt: Date.now() + 5 * 60_000,
    });

    const ack = await ctx.service.start(ALUNO);

    expect((ack as { message: string }).message).toContain('5 min');
  });

  it('não abre uma segunda raid para quem já está numa', async () => {
    const ctx = montar();
    await ctx.service.start(ALUNO);

    await expect(ctx.service.start(ALUNO)).resolves.toMatchObject({
      ok: false,
    });
    expect(ctx.raid.openAttempt).toHaveBeenCalledTimes(1);
  });

  it('recusa exemplar que não é do aluno', async () => {
    const ctx = montar();
    (ctx.prisma.capture.findMany as jest.Mock).mockResolvedValue([CAPTURAS[0]]);
    await ctx.service.start(ALUNO);

    await expect(
      ctx.service.pickTeam(ALUNO.userId, ['c1', 'de-outro']),
    ).resolves.toMatchObject({ ok: false });
  });

  /** 1 a 3, como no PvP — exigir exatamente 3 seria validação divergente. */
  it('aceita time de um exemplar só', async () => {
    const ctx = montar();
    (ctx.prisma.capture.findMany as jest.Mock).mockResolvedValue([CAPTURAS[0]]);
    await ctx.service.start(ALUNO);

    await expect(
      ctx.service.pickTeam(ALUNO.userId, ['c1']),
    ).resolves.toMatchObject({ ok: true });
  });
});

describe('RaidRoomService — o teto de turnos', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  /**
   * A divergência mais importante em relação ao PvP. Lá o teto soma HP dos dois
   * times; aqui isso compararia três corpos com um de 4×. Contra um chefe, o
   * tempo acabar significa que ele RESISTIU.
   */
  it('no teto o lendário vence, e o aluno não captura', async () => {
    const ctx = montar({ turnCap: 1 });
    await atePrimeiroTurno(ctx);

    const golpe = ctx.ultimo('battle:begin').you.moves[0].id;
    ctx.service.move(ALUNO.userId, golpe);
    await jest.runOnlyPendingTimersAsync();

    const fim = ctx.ultimo('battle:end');
    expect(fim.result).toBe('loss');
    expect(fim.reason).toBe('limite_de_turnos');
    expect(fim.captured).toBe(false);
    expect(ctx.raid.award).not.toHaveBeenCalled();
    expect(ctx.raid.closeAttempt).toHaveBeenCalledWith(
      'tentativa-1',
      'limite_de_turnos',
      1,
    );
  });

  it('a derrota devolve quando a próxima tentativa libera', async () => {
    const ctx = montar({ turnCap: 1 });
    await atePrimeiroTurno(ctx);

    ctx.service.move(ALUNO.userId, ctx.ultimo('battle:begin').you.moves[0].id);
    await jest.runOnlyPendingTimersAsync();

    expect(ctx.ultimo('battle:end').retryAt).toBeGreaterThan(Date.now());
  });
});

describe('RaidRoomService — abandono', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('três fases sem agir encerram a raid por abandono', async () => {
    const ctx = montar();
    await atePrimeiroTurno(ctx);

    // Três estouros de turno seguidos, sem nenhuma ação do aluno.
    for (let i = 0; i < 3; i += 1) await jest.runOnlyPendingTimersAsync();

    const fim = ctx.ultimo('battle:end');
    expect(fim.result).toBe('loss');
    expect(fim.reason).toBe('abandono');
    expect(ctx.raid.award).not.toHaveBeenCalled();
  });

  /**
   * Abrir a tela e desistir não pode queimar 30 minutos: a raid não aconteceu.
   * `anulada` é justamente o desfecho que o cooldown ignora.
   */
  it('sair da preparação anula a tentativa em vez de cobrar cooldown', async () => {
    const ctx = montar();
    await ctx.service.start(ALUNO);

    expect(ctx.service.leaveSelection(ALUNO.userId)).toMatchObject({
      ok: true,
    });
    expect(ctx.raid.closeAttempt).toHaveBeenCalledWith(
      'tentativa-1',
      'anulada',
      0,
    );
    expect(ctx.service.hasActiveRoom('ana')).toBe(false);
  });

  it('não dá para sair depois que a batalha começou', async () => {
    const ctx = montar();
    await atePrimeiroTurno(ctx);

    expect(ctx.service.leaveSelection(ALUNO.userId)).toMatchObject({
      ok: false,
    });
  });

  /** Restart nosso não pode custar 30 min de espera ao aluno. */
  it('o desligamento anula a tentativa em andamento', async () => {
    const ctx = montar();
    await atePrimeiroTurno(ctx);

    await ctx.service.onModuleDestroy();

    expect(ctx.raid.closeAttempt).toHaveBeenCalledWith(
      'tentativa-1',
      'anulada',
      expect.any(Number),
    );
    expect(ctx.ultimo('battle:cancelled').reason).toBe('server_shutdown');
  });
});

describe('RaidRoomService — a vitória', () => {
  const randomOriginal = Math.random;

  beforeEach(() => {
    jest.useFakeTimers();
    // Sorteio fixo: acerto garantido, sem crítico, e o bot sempre no primeiro
    // golpe da lista. Sem isto o desfecho da batalha varia entre execuções e o
    // teste viraria uma moeda.
    Math.random = () => 0;
  });
  afterEach(() => {
    jest.useRealTimers();
    Math.random = randomOriginal;
  });

  it('derrubar o chefe entrega o exemplar e fecha a tentativa como vitória', async () => {
    // Chefe fraquinho (1×120, sem IV) contra três exemplares: com o sorteio
    // fixo, o aluno vence sempre.
    const ctx = montar({ hpMultiplier: 1, legendaryIv: 0, turnCap: 60 });
    await atePrimeiroTurno(ctx);

    const fim = await jogarAteOFim(ctx);

    expect(fim.result).toBe('win');
    expect(fim.captured).toBe(true);
    // Vitória não gera espera: não há segunda captura para esperar.
    expect(fim.retryAt).toBeNull();
    expect(ctx.raid.award).toHaveBeenCalledWith(
      'ana',
      expect.objectContaining({ id: 'lendario-1' }),
      'var-1',
      'tentativa-1',
      3,
    );
    expect(ctx.raid.closeAttempt).toHaveBeenCalledWith(
      'tentativa-1',
      'vitoria',
      expect.any(Number),
    );
  });

  /**
   * A captura pode falhar (banco fora do ar) depois de uma vitória real. A tela
   * de vitória continua — fingir derrota para quem ganhou é o que não dá para
   * desfazer depois.
   */
  it('vitória sem captura gravada ainda é vitória na tela', async () => {
    const ctx = montar({ hpMultiplier: 1, legendaryIv: 0 });
    ctx.raid.award = jest.fn().mockResolvedValue(null);
    await atePrimeiroTurno(ctx);

    const fim = await jogarAteOFim(ctx);

    expect(fim.result).toBe('win');
    expect(fim.captured).toBe(false);
  });
});

describe('RaidRoomService — reconexão', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('sem sala devolve null, para o gateway cair no PvP', () => {
    const ctx = montar();
    expect(ctx.service.resync('ana')).toBeNull();
  });

  /**
   * O chefe nunca está "escolhendo". Sem `foePicked: true`, a tela de seleção
   * ficaria em "AGUARDANDO O RIVAL…" para sempre.
   */
  it('o snapshot marca o chefe como já pronto', async () => {
    const ctx = montar();
    await ctx.service.start(ALUNO);
    await ctx.service.pickTeam(ALUNO.userId, ['c1', 'c2', 'c3']);

    expect(ctx.service.resync('ana')).toMatchObject({
      mode: 'raid',
      phase: 'preview',
      foePicked: true,
    });
  });

  it('o snapshot da arena carrega o modo raid', async () => {
    const ctx = montar();
    await atePrimeiroTurno(ctx);

    expect(ctx.service.resync('ana')).toMatchObject({
      mode: 'raid',
      phase: 'active',
      // O chefe já agiu por definição: não há por quem esperar na raid.
      foeMoved: true,
    });
  });
});
