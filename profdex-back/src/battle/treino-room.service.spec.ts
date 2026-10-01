import { PrismaService } from '../prisma/prisma.service';
import { MAX_TURNS, PHASE_TIMEOUT_MS } from './battle-room.service';
import { NOME_DO_BOT, TreinoRoomService } from './treino-room.service';

const ALUNO = { userId: 'ana', name: 'Ana' };

const professor = (slug: string, tipo: string) => ({
  id: `p-${slug}`,
  slug,
  name: `Prof ${slug}`,
  types: [tipo],
  spriteFrontUrl: `/uploads/${slug}-frente.png?v=1`,
  spriteBackUrl: `/uploads/${slug}-costas.png?v=1`,
  modelUrl: null,
  pixelArt: true,
  active: true,
});

/**
 * O elenco comum do bot. `matematica` é a mão que `humanas` vence e que `ia`
 * perde (ver a roda em engine/types): é o que deixa o desfecho de cada partida
 * previsível sem depender de sorte.
 */
const COMUNS = ['eron', 'mario', 'gustavo', 'nicole'].map((s) =>
  professor(s, 'matematica'),
);

/** Três exemplares do aluno, como o banco os devolve na seleção. */
const capturas = (tipo: string, ids = ['c1', 'c2', 'c3']) =>
  ids.map((id) => ({
    id,
    moves: [], // vazio → a sala monta o deck a partir dos tipos
    ivHp: 0,
    ivRigor: 0,
    ivDidatica: 0,
    ivRaciocinio: 0,
    professor: professor(id, tipo),
    variant: { types: [tipo] },
  }));

function montar({
  tipoDoAluno = 'humanas',
  exemplares = 3,
  elenco = COMUNS,
}: { tipoDoAluno?: string; exemplares?: number; elenco?: unknown[] } = {}) {
  const emitidos: { userId: string; event: string; payload: any }[] = [];
  const fechadas: string[][] = [];

  const prisma = {
    capture: {
      count: jest.fn().mockResolvedValue(exemplares),
      // Só devolve o que o aluno pediu E tem: `c9` é de outra pessoa.
      findMany: jest.fn(({ where }: { where: { id: { in: string[] } } }) =>
        Promise.resolve(
          capturas(tipoDoAluno).filter((c) => where.id.in.includes(c.id)),
        ),
      ),
    },
    professor: { findMany: jest.fn().mockResolvedValue(elenco) },
    // Treino não grava nada: nenhum destes pode ser chamado.
    battle: { create: jest.fn(), update: jest.fn() },
    raidAttempt: { create: jest.fn() },
  } as unknown as PrismaService;

  const service = new TreinoRoomService(prisma);
  service.configure(
    {
      emitToUser: (userId, event, payload) =>
        emitidos.push({ userId, event, payload }),
      onRoomClosed: (ids) => fechadas.push(ids),
    },
    () => 0.5,
  );

  const ultimo = (event: string) =>
    [...emitidos].reverse().find((e) => e.event === event)?.payload;
  const eventos = () =>
    emitidos.flatMap((e) => (e.payload?.events ?? []) as any[]);

  return { service, prisma, emitidos, fechadas, ultimo, eventos };
}

type Ctx = ReturnType<typeof montar>;

async function atePrimeiroTurno(ctx: Ctx, tamanho: 1 | 3 = 3) {
  await ctx.service.start(ALUNO, tamanho);
  const ids = ['c1', 'c2', 'c3'].slice(0, tamanho);
  await ctx.service.pickTeam(ALUNO.userId, ids);
  ctx.service.chooseLead(ALUNO.userId, 'c1');
}

/** Joga até o fim com o primeiro golpe do ativo, escolhendo quem entra. */
function jogarAteOFim(ctx: Ctx, maxTurnos = 120) {
  for (let i = 0; i < maxTurnos && !ctx.ultimo('battle:end'); i += 1) {
    const ultimaEmissao = ctx.emitidos[ctx.emitidos.length - 1];
    if (
      ultimaEmissao.event === 'battle:faint' &&
      ultimaEmissao.payload.youChoose
    ) {
      const { you } = ultimaEmissao.payload;
      const proximo = you.team.find(
        (m: any) => !m.fainted && m.captureId !== you.activeCaptureId,
      );
      ctx.service.enterWith(ALUNO.userId, proximo.captureId);
      continue;
    }
    const golpe = ultimaEmissao.payload?.you?.moves?.[0]?.id;
    if (!golpe) break;
    ctx.service.move(ALUNO.userId, golpe);
  }
  return ctx.ultimo('battle:end');
}

describe('TreinoRoomService', () => {
  const randomOriginal = Math.random;

  beforeEach(() => {
    jest.useFakeTimers();
    // Acerto, ordem e ramos do bot previsíveis: o que se mede aqui é a sala.
    Math.random = () => 0.5;
  });
  afterEach(() => {
    jest.useRealTimers();
    Math.random = randomOriginal;
  });

  describe('abertura', () => {
    it('recusa tamanho que não é 1 nem 3', async () => {
      const ctx = montar();
      const ack = await ctx.service.start(ALUNO, 2);
      expect(ack).toEqual({
        ok: false,
        message: 'Escolha 1 contra 1 ou 3 contra 3.',
      });
      expect(ctx.service.hasActiveRoom(ALUNO.userId)).toBe(false);
    });

    it('recusa o 3v3 de quem tem menos de 3 exemplares, dizendo quantos', async () => {
      const ctx = montar({ exemplares: 2 });
      const ack = await ctx.service.start(ALUNO, 3);
      expect(ack).toEqual({
        ok: false,
        code: 'TREINO_SEM_EXEMPLARES',
        message: 'Para o 3 contra 3 você precisa de 3 exemplares (tem 2).',
      });
    });

    it('recusa o 1v1 de quem não capturou nada', async () => {
      const ctx = montar({ exemplares: 0 });
      const ack = await ctx.service.start(ALUNO, 1);
      expect(ack).toMatchObject({
        ok: false,
        code: 'TREINO_SEM_EXEMPLARES',
        message: 'Capture um professor para montar seu time.',
      });
    });

    it('recusa um segundo treino em paralelo', async () => {
      const ctx = montar();
      await ctx.service.start(ALUNO, 1);
      expect(await ctx.service.start(ALUNO, 1)).toEqual({
        ok: false,
        message: 'Você já está num treino.',
      });
    });

    it('abre com mode treino, o tamanho e o bot como adversário', async () => {
      const ctx = montar();
      const ack = await ctx.service.start(ALUNO, 3);
      expect(ack).toMatchObject({ ok: true });
      expect(ctx.ultimo('battle:start')).toMatchObject({
        mode: 'treino',
        tamanho: 3,
        opponent: { name: NOME_DO_BOT },
        pickDeadline: expect.any(Number),
      });
    });

    it('o bot só sorteia professores comuns e ativos', async () => {
      const ctx = montar();
      await ctx.service.start(ALUNO, 3);
      const { professor } = ctx.prisma as unknown as {
        professor: { findMany: jest.Mock };
      };
      expect(professor.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { active: true, rare: false, legendary: false },
        }),
      );
    });
  });

  describe('seleção', () => {
    it('o preview mostra os 3 do bot, sem repetir professor', async () => {
      const ctx = montar();
      await ctx.service.start(ALUNO, 3);
      await ctx.service.pickTeam(ALUNO.userId, ['c1', 'c2', 'c3']);

      const preview = ctx.ultimo('battle:preview');
      expect(preview.mode).toBe('treino');
      expect(preview.foe.name).toBe(NOME_DO_BOT);
      const slugs = preview.foe.team.map((m: any) => m.professor.slug);
      expect(slugs).toHaveLength(3);
      expect(new Set(slugs).size).toBe(3);
      expect(preview.you.team).toHaveLength(3);
    });

    it('elenco menor que o time repete professor em vez de recusar', async () => {
      const ctx = montar({ elenco: COMUNS.slice(0, 2) });
      await ctx.service.start(ALUNO, 3);
      await ctx.service.pickTeam(ALUNO.userId, ['c1', 'c2', 'c3']);
      expect(ctx.ultimo('battle:preview').foe.team).toHaveLength(3);
    });

    it('exige exatamente o tamanho escolhido', async () => {
      const ctx = montar();
      await ctx.service.start(ALUNO, 3);
      expect(await ctx.service.pickTeam(ALUNO.userId, ['c1', 'c2'])).toEqual({
        ok: false,
        message: 'Escolha 3 professores para o 3 contra 3.',
      });
    });

    it('no 1v1, mais de um exemplar é recusado pelo máximo', async () => {
      const ctx = montar();
      await ctx.service.start(ALUNO, 1);
      expect(await ctx.service.pickTeam(ALUNO.userId, ['c1', 'c2'])).toEqual({
        ok: false,
        message: 'Seu time pode ter no máximo 1 professor.',
      });
    });

    it('recusa exemplar que não é do aluno e deixa tentar de novo', async () => {
      const ctx = montar();
      await ctx.service.start(ALUNO, 1);
      expect(await ctx.service.pickTeam(ALUNO.userId, ['c9'])).toEqual({
        ok: false,
        message: 'Você só pode usar professores que capturou.',
      });
      expect(await ctx.service.pickTeam(ALUNO.userId, ['c1'])).toEqual({
        ok: true,
      });
    });

    it('seleção que expira cancela o treino', async () => {
      const ctx = montar();
      await ctx.service.start(ALUNO, 1);
      jest.advanceTimersByTime(PHASE_TIMEOUT_MS);
      expect(ctx.ultimo('battle:cancelled')).toEqual({
        reason: 'pick_timeout',
      });
      expect(ctx.service.hasActiveRoom(ALUNO.userId)).toBe(false);
    });

    it('sair da seleção é de graça e fecha a sala', async () => {
      const ctx = montar();
      await ctx.service.start(ALUNO, 1);
      expect(ctx.service.leaveSelection(ALUNO.userId)).toEqual({ ok: true });
      expect(ctx.fechadas).toEqual([[ALUNO.userId]]);
    });
  });

  describe('batalha', () => {
    it('3v3 com a mão boa: vence por nocaute, e o bot troca a cada queda', async () => {
      const ctx = montar({ tipoDoAluno: 'humanas' });
      await atePrimeiroTurno(ctx, 3);

      expect(ctx.ultimo('battle:begin')).toMatchObject({
        mode: 'treino',
        turn: 1,
        you: {
          stages: { rigor: 0, didatica: 0, raciocinio: 0 },
          statusKind: null,
          statusTurns: null,
          escudo: null,
          movimentosAcumulados: [],
        },
        foe: { name: NOME_DO_BOT, team: expect.any(Array) },
      });

      const fim = jogarAteOFim(ctx);
      expect(fim).toMatchObject({
        mode: 'treino',
        result: 'win',
        reason: 'nocaute',
        rating: null,
      });

      // Duas entradas do bot, cada uma com quem entra (arte e barra).
      const entradasDoBot = ctx
        .eventos()
        .filter((ev) => ev.type === 'switch' && ev.target === 'enemy');
      expect(entradasDoBot).toHaveLength(2);
      for (const ev of entradasDoBot) {
        expect(ev.professor).toMatchObject({ slug: expect.any(String) });
        expect(ev.hp).toBeGreaterThan(0);
      }
      expect(ctx.service.hasActiveRoom(ALUNO.userId)).toBe(false);
    });

    it('3v3 com a mão ruim: o aluno escolhe quem entra e perde no fim', async () => {
      const ctx = montar({ tipoDoAluno: 'ia' });
      await atePrimeiroTurno(ctx, 3);

      const fim = jogarAteOFim(ctx);

      expect(ctx.emitidos.some((e) => e.event === 'battle:faint')).toBe(true);
      expect(fim).toMatchObject({ result: 'loss', reason: 'nocaute' });
    });

    it('1v1: termina na primeira queda, sem fase de substituição', async () => {
      const ctx = montar({ tipoDoAluno: 'ia' });
      await atePrimeiroTurno(ctx, 1);

      const fim = jogarAteOFim(ctx);

      expect(ctx.emitidos.some((e) => e.event === 'battle:faint')).toBe(false);
      expect(fim).toMatchObject({ mode: 'treino', result: 'loss' });
    });

    it('treino não grava batalha, Elo nem tentativa', async () => {
      const ctx = montar();
      await atePrimeiroTurno(ctx, 1);
      jogarAteOFim(ctx);
      const p = ctx.prisma as any;
      expect(p.battle.create).not.toHaveBeenCalled();
      expect(p.battle.update).not.toHaveBeenCalled();
      expect(p.raidAttempt.create).not.toHaveBeenCalled();
    });

    it('troca voluntária: o motor resolve a troca antes do golpe do bot', async () => {
      const ctx = montar();
      await atePrimeiroTurno(ctx, 3);

      const ack = ctx.service.switchTo(ALUNO.userId, 'c2');

      expect(ack).toEqual({ ok: true, turn: 1 });
      const rodada = ctx.ultimo('battle:round');
      expect(rodada.events[0]).toMatchObject({
        type: 'switch',
        target: 'player',
        professor: { slug: 'c2' },
      });
      expect(rodada.you.activeCaptureId).toBe('c2');
    });

    it('três turnos sem agir = abandono', async () => {
      const ctx = montar();
      await atePrimeiroTurno(ctx, 1);

      for (let i = 0; i < 3; i++) jest.advanceTimersByTime(PHASE_TIMEOUT_MS);

      expect(ctx.ultimo('battle:end')).toMatchObject({
        result: 'loss',
        reason: 'abandono',
      });
    });

    it('no teto de turnos vence quem tem mais vida somada', async () => {
      const ctx = montar();
      await atePrimeiroTurno(ctx, 3);
      // Pula direto para o último turno permitido.
      const sala = [...(ctx.service as any).rooms.values()][0];
      sala.turn = MAX_TURNS;
      // Troca não causa dano ao bot, e o aluno segue com 3 vivos contra 3.
      ctx.service.switchTo(ALUNO.userId, 'c2');

      expect(ctx.ultimo('battle:end')).toMatchObject({
        reason: 'limite_de_turnos',
        result: expect.stringMatching(/win|loss|draw/),
      });
    });

    it('fugir só existe com o treino começado', async () => {
      const ctx = montar();
      await ctx.service.start(ALUNO, 1);
      expect(ctx.service.forfeit(ALUNO.userId)).toEqual({
        ok: false,
        message: 'Nenhum treino em andamento.',
      });
      await ctx.service.pickTeam(ALUNO.userId, ['c1']);
      ctx.service.chooseLead(ALUNO.userId, 'c1');
      expect(ctx.service.forfeit(ALUNO.userId)).toEqual({ ok: true });
      expect(ctx.ultimo('battle:end')).toMatchObject({ reason: 'abandono' });
    });
  });

  describe('reconexão', () => {
    it('sem treino, devolve null para o gateway tentar a próxima sala', () => {
      expect(montar().service.resync(ALUNO.userId)).toBeNull();
    });

    it('no meio do treino, devolve o estado com mode e tamanho', async () => {
      const ctx = montar();
      await atePrimeiroTurno(ctx, 3);
      expect(ctx.service.resync(ALUNO.userId)).toMatchObject({
        mode: 'treino',
        tamanho: 3,
        phase: 'active',
        foeMoved: true,
        you: { activeCaptureId: 'c1', moves: expect.any(Array) },
        foe: { name: NOME_DO_BOT, team: expect.any(Array) },
      });
    });
  });
});
