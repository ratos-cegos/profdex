import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { DEFAULT_MAX_HP } from './engine/engine';
import { MOVES_BY_TYPE } from './engine/moves';
import { SLUG_DO_RICARDO, SLUGS_DO_NDE } from './raid-eventos';
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
const capturas = (tipo = 'humanas') =>
  ['c1', 'c2', 'c3'].map((id) => ({
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
      types: [tipo],
    },
    variant: { types: [tipo] },
  }));

/**
 * `ia` é a mão RUIM contra o chefe de `matematica`: leva 2× e devolve 0,5×.
 *
 * Existe porque com `humanas` (a mão boa) o aluno ganha sem perder ninguém, e
 * um teste do evento do Ricardo — que dispara na queda do PENÚLTIMO — nunca
 * veria o gatilho.
 */
const TIPO_EM_DESVANTAGEM = 'ia';

/**
 * O elenco dos eventos, como `PUBLIC_PROFESSOR_SELECT` o entrega.
 *
 * Os slugs são os de produção: é por eles que `carregaElenco` acha o elenco, e
 * um slug errado aqui não quebraria teste nenhum — o carregamento degrada em
 * silêncio de propósito. Trocá-los desligaria os eventos sem ninguém notar, e é
 * por isso que os testes abaixo afirmam que os eventos ACONTECEM.
 */
const ELENCO = [
  ...SLUGS_DO_NDE.map((slug, i) => ({
    id: `nde-${i}`,
    slug,
    name: `NDE ${i}`,
    types: ['arquitetura'],
    spriteFrontUrl: `/uploads/${slug}-frente.png?v=1`,
    spriteBackUrl: `/uploads/${slug}-costas.png?v=1`,
    modelUrl: `/uploads/${slug}.glb?v=1`,
    pixelArt: false,
    active: true,
  })),
  {
    id: 'ricardo-1',
    slug: SLUG_DO_RICARDO,
    name: 'Ricardo Infiltrado',
    types: ['ia'],
    spriteFrontUrl: '/uploads/ricardo-infiltrado-frente.png?v=1',
    spriteBackUrl: '/uploads/ricardo-infiltrado-costas.png?v=1',
    modelUrl: '/uploads/ricardo-infiltrado.glb?v=1',
    pixelArt: false,
    active: true,
  },
];

function montar({
  hpMultiplier = 4,
  legendaryIv = 15,
  turnCap = 60,
  elenco = ELENCO,
  tipoDoAluno = 'humanas',
}: {
  hpMultiplier?: number;
  legendaryIv?: number;
  turnCap?: number;
  elenco?: unknown[];
  tipoDoAluno?: string;
} = {}) {
  const emitidos: { userId: string; event: string; payload: any }[] = [];

  const prisma = {
    capture: { findMany: jest.fn().mockResolvedValue(capturas(tipoDoAluno)) },
    raidAttempt: { count: jest.fn().mockResolvedValue(3) },
    professor: { findMany: jest.fn().mockResolvedValue(elenco) },
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
    (ctx.prisma.capture.findMany as jest.Mock).mockResolvedValue([
      capturas()[0],
    ]);
    await ctx.service.start(ALUNO);

    await expect(
      ctx.service.pickTeam(ALUNO.userId, ['c1', 'de-outro']),
    ).resolves.toMatchObject({ ok: false });
  });

  /** 1 a 3, como no PvP — exigir exatamente 3 seria validação divergente. */
  it('aceita time de um exemplar só', async () => {
    const ctx = montar();
    (ctx.prisma.capture.findMany as jest.Mock).mockResolvedValue([
      capturas()[0],
    ]);
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

describe('RaidRoomService — os três estágios', () => {
  const randomOriginal = Math.random;

  beforeEach(() => {
    jest.useFakeTimers();
    // Sorteio fixo, igual ao bloco da vitória. Aqui ele também fixa os tipos
    // dos estágios: a partir de `matematica`, o primeiro candidato a distância
    // ≥2 é `robotica`, e depois `engenharia-software`.
    Math.random = () => 0;
  });
  afterEach(() => {
    jest.useRealTimers();
    Math.random = randomOriginal;
  });

  /** Todo evento de roteiro emitido na partida, em ordem. */
  const roteiros = (ctx: ReturnType<typeof montar>) =>
    ctx.emitidos
      .flatMap((e) => (e.payload?.events ?? []) as any[])
      .filter((ev) => ev.type === 'roteiro');

  it('abre no estágio 1 com os tipos do banco', async () => {
    const ctx = montar();
    await atePrimeiroTurno(ctx);

    const begin = ctx.ultimo('battle:begin');
    expect(begin.foe.estagio).toBe(1);
    expect(begin.foe.totalDeEstagios).toBe(3);
    // A ficha da Profdex diz `matematica`; a abertura não pode mentir.
    expect(begin.foe.types).toEqual(['matematica']);
    expect(begin.foe.efeitoDoEstagio).toBe('Rigor Formal');
  });

  it('cruzar dois terços da vida vira o estágio e narra a roleta', async () => {
    const ctx = montar({ hpMultiplier: 1, legendaryIv: 0 });
    await atePrimeiroTurno(ctx);
    await jogarAteOFim(ctx);

    const virada = roteiros(ctx)[0];
    expect(virada.roleta.kind).toBe('tipo');
    expect(virada.roleta.opcoes).toHaveLength(9);
    expect(virada.roleta.resultado).toBe('robotica');
    expect(virada.linhas.length).toBeGreaterThanOrEqual(2);
    // A última linha é o anúncio do efeito do tipo em que caiu.
    expect(virada.linhas).toContain(
      'Ele ergueu uma blindagem que se recompõe sozinha.',
    );
  });

  it('passa pelos três estágios numa partida que vai até o fim', async () => {
    const ctx = montar({ hpMultiplier: 1, legendaryIv: 0 });
    await atePrimeiroTurno(ctx);
    await jogarAteOFim(ctx);

    const virados = roteiros(ctx).filter((r) => r.roleta?.kind === 'tipo');
    // Duas viradas: 1→2 e 2→3. O estágio 1 não é anunciado por roteiro.
    expect(virados).toHaveLength(2);
    expect(virados.map((r) => r.roleta.resultado)).toEqual([
      'robotica',
      'engenharia-software',
    ]);
  });

  it('a virada troca os tipos do chefe', async () => {
    const ctx = montar({ hpMultiplier: 1, legendaryIv: 0 });
    await atePrimeiroTurno(ctx);
    const tiposIniciais = ctx.ultimo('battle:begin').foe.types;

    await jogarAteOFim(ctx);

    const tiposVistos = new Set(
      ctx.emitidos
        .filter((e) => e.payload?.foe?.types)
        .map((e) => e.payload.foe.types.join('+')),
    );
    expect(tiposIniciais).toEqual(['matematica']);
    expect(tiposVistos.size).toBeGreaterThan(1);
    expect([...tiposVistos]).toContain('robotica');
  });

  it('a virada refaz o moveset a partir do tipo novo', async () => {
    // Os golpes do chefe não vão no payload (só os do aluno vão), então a
    // verificação é pela superfície observável: as mensagens "usou X!".
    const ctx = montar({ hpMultiplier: 1, legendaryIv: 0 });
    await atePrimeiroTurno(ctx);
    await jogarAteOFim(ctx);

    const usados = new Set(
      ctx.emitidos
        .flatMap((e) => (e.payload?.events ?? []) as any[])
        .filter((ev) => ev.type === 'message')
        .map((ev) => /^Tânia usou (.+)!$/.exec(ev.text)?.[1])
        .filter(Boolean),
    );

    const nomesDoTipo = (tipo: string) =>
      MOVES_BY_TYPE[tipo].map((m) => m.name);
    const usouDeRobotica = nomesDoTipo('robotica').some((n) => usados.has(n));

    expect(usados.size).toBeGreaterThan(0);
    expect(usouDeRobotica).toBe(true);
  });

  it('não repete o roteiro a cada turno do mesmo estágio', async () => {
    const ctx = montar({ hpMultiplier: 1, legendaryIv: 0 });
    await atePrimeiroTurno(ctx);
    await jogarAteOFim(ctx);

    const porResultado = roteiros(ctx)
      .filter((r) => r.roleta?.kind === 'tipo')
      .map((r) => r.roleta.resultado);
    // Um roteiro por estágio, não um por turno.
    expect(new Set(porResultado).size).toBe(porResultado.length);
  });

  it('o nome do efeito do estágio chega ao front', async () => {
    const ctx = montar({ hpMultiplier: 1, legendaryIv: 0 });
    await atePrimeiroTurno(ctx);
    await jogarAteOFim(ctx);

    const nomes = new Set(
      ctx.emitidos
        .filter((e) => e.payload?.foe?.efeitoDoEstagio)
        .map((e) => e.payload.foe.efeitoDoEstagio),
    );
    expect(nomes).toContain('Rigor Formal'); // matematica, estágio 1
    expect(nomes).toContain('Blindagem'); // robotica, estágio 2
  });

  it('o efeito do estágio não corre enquanto o NDE segura', async () => {
    // O estágio 3 deste sorteio é ENSW ("Refatoração Contínua", cura 15/turno) e
    // o evento do NDE também cura o chefe. Somar as duas era exatamente o que se
    // combinou não fazer — uma fonte de cura por vez.
    const ctx = montar({ hpMultiplier: 1, legendaryIv: 0 });
    await atePrimeiroTurno(ctx);
    await jogarAteOFim(ctx);

    // A janela se mede na fila INTEIRA de eventos, não só nas mensagens: a
    // chegada e a queda do NDE são `roteiro`, e procurá-las entre `message`
    // devolvia -1 — a fatia ia até o fim da luta e pegava a cura legítima de
    // depois que o chefe voltou.
    const fila = ctx.emitidos.flatMap(
      (e) => (e.payload?.events ?? []) as any[],
    );
    const temLinha = (ev: any, trecho: string) =>
      ev.type === 'roteiro' &&
      (ev.linhas ?? []).some((l: string) => l.includes(trecho));

    const iChegada = fila.findIndex((ev) => temLinha(ev, 'NDE DA COORDENAÇÃO'));
    const iQueda = fila.findIndex((ev) => temLinha(ev, 'O NDE caiu'));
    expect(iChegada).toBeGreaterThanOrEqual(0);
    expect(iQueda).toBeGreaterThan(iChegada);

    const durante = fila
      .slice(iChegada, iQueda)
      .filter((ev) => ev.type === 'message')
      .map((ev) => ev.text as string);

    expect(durante.some((t) => t.includes('atrás do NDE'))).toBe(true);
    expect(durante.some((t) => t.includes('refatora e recupera'))).toBe(false);
  });

  it('o chefe ainda cai: três estágios não tornam a raid invencível', async () => {
    // Guarda de balanceamento. O estágio 3 deste sorteio é ENSW, que cura 15
    // por turno — se a soma dos efeitos passar do dano que um time consegue
    // fazer, a raid fica matematicamente invencível e é aqui que se descobre.
    const ctx = montar({ hpMultiplier: 1, legendaryIv: 0 });
    await atePrimeiroTurno(ctx);

    const fim = await jogarAteOFim(ctx);

    expect(fim.result).toBe('win');
  });
});

describe('RaidRoomService — o evento do NDE', () => {
  const randomOriginal = Math.random;

  beforeEach(() => {
    jest.useFakeTimers();
    Math.random = () => 0;
  });
  afterEach(() => {
    jest.useRealTimers();
    Math.random = randomOriginal;
  });

  /** Índice da emissão que contém um evento aprovado pelo predicado. */
  const indiceDaEmissaoCom = (
    ctx: ReturnType<typeof montar>,
    ok: (ev: any) => boolean,
  ) =>
    ctx.emitidos.findIndex((e) =>
      ((e.payload?.events ?? []) as any[]).some(ok),
    );

  const eventos = (ctx: ReturnType<typeof montar>) =>
    ctx.emitidos.flatMap((e) => (e.payload?.events ?? []) as any[]);

  it('os quatro entram no último estágio e assumem o lado do inimigo', async () => {
    const ctx = montar({ hpMultiplier: 1, legendaryIv: 0 });
    await atePrimeiroTurno(ctx);
    await jogarAteOFim(ctx);

    const comNde = ctx.emitidos.find((e) => e.payload?.foe?.evento === 'nde');
    expect(comNde).toBeDefined();
    expect(comNde!.payload.foe.professores).toHaveLength(4);
    expect(comNde!.payload.foe.nomeEmCampo).toBe('NDE da Coordenação');
    expect(comNde!.payload.foe.maxHp).toBe(100);
    // O chefe fica no banco do lado inimigo, vivo — é ali que o aluno vê a
    // barra dele subir enquanto se cura.
    expect(comNde!.payload.foe.team[0].fainted).toBe(false);
  });

  it('REGRESSÃO: derrubar o NDE não ganha a raid', async () => {
    // `state.enemy.hp <= 0` significava vitória. Com o NDE ocupando o assento,
    // sem a guarda isso entregaria o lendário ao aluno de graça — o pior bug
    // possível nesta entrega.
    const ctx = montar({ hpMultiplier: 1, legendaryIv: 0 });
    await atePrimeiroTurno(ctx);
    await jogarAteOFim(ctx);

    const iQueda = indiceDaEmissaoCom(
      ctx,
      (ev) =>
        ev.type === 'roteiro' &&
        ev.linhas?.some((l: string) => l.includes('O NDE caiu')),
    );
    const iFim = ctx.emitidos.findIndex((e) => e.event === 'battle:end');

    expect(iQueda).toBeGreaterThanOrEqual(0);
    expect(iFim).toBeGreaterThan(iQueda);
    // E a luta continuou de verdade: houve rodada depois da queda deles.
    const rodadasDepois = ctx.emitidos
      .slice(iQueda + 1)
      .filter((e) => e.event === 'battle:round');
    expect(rodadasDepois.length).toBeGreaterThan(0);
  });

  it('o chefe volta ao assento quando os quatro caem', async () => {
    const ctx = montar({ hpMultiplier: 1, legendaryIv: 0 });
    await atePrimeiroTurno(ctx);
    await jogarAteOFim(ctx);

    const iQueda = indiceDaEmissaoCom(
      ctx,
      (ev) =>
        ev.type === 'roteiro' &&
        ev.linhas?.some((l: string) => l.includes('O NDE caiu')),
    );
    const depois = ctx.emitidos
      .slice(iQueda)
      .find((e) => e.payload?.foe && e.payload.foe.evento === null);

    expect(depois).toBeDefined();
    expect(depois!.payload.foe.nomeEmCampo).toBe('Tânia');
  });

  // A arena anima a troca no ponto certo da fila com os dados que o `switch`
  // traz (battleOcupante.js). Só com o nome, a barra seguia a de quem saiu: o
  // chefe voltava com o 0 de HP do NDE até a rodada acabar.
  it('as trocas do NDE e do chefe trazem a barra de quem entra', async () => {
    const ctx = montar({ hpMultiplier: 1, legendaryIv: 0 });
    await atePrimeiroTurno(ctx);
    await jogarAteOFim(ctx);

    const trocas = eventos(ctx).filter(
      (ev) => ev.type === 'switch' && ev.target === 'enemy',
    );
    const entradaDoNde = trocas.find((ev) => ev.name === 'NDE da Coordenação');
    expect(entradaDoNde).toMatchObject({ hp: 100, maxHp: 100 });
    expect(entradaDoNde.types).toEqual(expect.any(Array));

    const voltaDoChefe = trocas.find((ev) => ev.name === 'Tânia');
    expect(voltaDoChefe).toBeDefined();
    expect(voltaDoChefe.professor).toMatchObject({ name: 'Tânia' });
    expect(voltaDoChefe.hp).toBeGreaterThan(0);
    expect(voltaDoChefe.maxHp).toBeGreaterThanOrEqual(voltaDoChefe.hp);
  });

  it('o NDE ataca com o Golpe do NDE, e o golpe não está no movepool', async () => {
    const ctx = montar({ hpMultiplier: 1, legendaryIv: 0 });
    await atePrimeiroTurno(ctx);
    await jogarAteOFim(ctx);

    const usou = eventos(ctx).some(
      (ev) => ev.type === 'message' && ev.text?.includes('usou Golpe do NDE'),
    );
    expect(usou).toBe(true);
    // Não pode ter entrado no catálogo: o movepool é 9 tipos × 8 golpes, número
    // que `moves.spec.ts` afirma e o teste de paridade compara com o front.
    expect(MOVES_BY_TYPE.humanas.map((m) => m.id)).not.toContain(
      'golpe-do-nde',
    );
  });

  it('sem o elenco no banco, o evento simplesmente não acontece', async () => {
    const ctx = montar({ hpMultiplier: 1, legendaryIv: 0, elenco: [] });
    await atePrimeiroTurno(ctx);

    const fim = await jogarAteOFim(ctx);

    expect(
      eventos(ctx).some(
        (ev) => ev.type === 'roteiro' && ev.linhas?.[0]?.includes('NDE'),
      ),
    ).toBe(false);
    // E a raid termina normal: degradar não pode virar travamento.
    expect(fim.result).toBe('win');
  });
});

describe('RaidRoomService — o evento do Ricardo', () => {
  const randomOriginal = Math.random;

  beforeEach(() => {
    jest.useFakeTimers();
    Math.random = () => 0;
  });
  afterEach(() => {
    jest.useRealTimers();
    Math.random = randomOriginal;
  });

  const roteirosDeBuff = (ctx: ReturnType<typeof montar>) =>
    ctx.emitidos
      .flatMap((e) => (e.payload?.events ?? []) as any[])
      .filter((ev) => ev.type === 'roteiro' && ev.roleta?.kind === 'buff');

  it('chega quando cai o penúltimo do time, com a roleta de buffs', async () => {
    // Chefe cheio (4×120, IV 15) contra três exemplares: o aluno perde, e no
    // caminho o penúltimo cai — que é o gatilho.
    const ctx = montar({ tipoDoAluno: TIPO_EM_DESVANTAGEM });
    await atePrimeiroTurno(ctx);
    await jogarAteOFim(ctx);

    const [roteiro] = roteirosDeBuff(ctx);
    expect(roteiro).toBeDefined();
    expect(roteiro.roleta.opcoes).toHaveLength(9);
    expect(roteiro.roleta.opcoes).toContain(roteiro.roleta.resultado);
    expect(roteiro.linhas.join(' ')).toContain('Ricardo Infiltrado');
  });

  it('chega uma vez só', async () => {
    const ctx = montar({ tipoDoAluno: TIPO_EM_DESVANTAGEM });
    await atePrimeiroTurno(ctx);
    await jogarAteOFim(ctx);

    expect(roteirosDeBuff(ctx)).toHaveLength(1);
  });

  it('o buff cai em quem ENTRA, não em quem acabou de tombar', async () => {
    // Com `Math.random = () => 0` a roleta sempre dá Ponto Extra (+1 nos três
    // atributos). O que importa é o roteiro sair no mesmo lote do `switch` do
    // aluno: é isso que garante que o alvo é o substituto.
    const ctx = montar({ tipoDoAluno: TIPO_EM_DESVANTAGEM });
    await atePrimeiroTurno(ctx);
    await jogarAteOFim(ctx);

    const lote = ctx.emitidos.find((e) =>
      ((e.payload?.events ?? []) as any[]).some(
        (ev) => ev.type === 'roteiro' && ev.roleta?.kind === 'buff',
      ),
    );
    const tipos = ((lote!.payload.events ?? []) as any[]).map((ev) => ev.type);
    const iSwitch = tipos.indexOf('switch');
    const iRoteiro = tipos.indexOf('roteiro');

    expect(iSwitch).toBeGreaterThanOrEqual(0);
    expect(iRoteiro).toBeGreaterThan(iSwitch);
  });

  it('não chega com time de um só exemplar', async () => {
    // Com um exemplar, a primeira queda já é o fim da raid: não há substituto
    // para receber o buff, e o gatilho não pode disparar.
    const ctx = montar({ tipoDoAluno: TIPO_EM_DESVANTAGEM });
    await ctx.service.start(ALUNO);
    await ctx.service.pickTeam(ALUNO.userId, ['c1']);
    ctx.service.chooseLead(ALUNO.userId, 'c1');
    await jogarAteOFim(ctx);

    expect(roteirosDeBuff(ctx)).toHaveLength(0);
  });

  it('sem o Ricardo no banco, o evento não acontece', async () => {
    const ctx = montar({ elenco: [], tipoDoAluno: TIPO_EM_DESVANTAGEM });
    await atePrimeiroTurno(ctx);

    const fim = await jogarAteOFim(ctx);

    expect(roteirosDeBuff(ctx)).toHaveLength(0);
    expect(fim).toBeDefined();
  });
});
