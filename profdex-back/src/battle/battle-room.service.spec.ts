import { MetricsService } from '../metrics/metrics.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  BattleRoomService,
  MAX_MISSED_PHASES,
  MAX_TURNS,
  PHASE_TIMEOUT_MS,
} from './battle-room.service';
import { BattleState, CombatantKey } from './engine/engine';
import { buildMoveset } from './engine/moves';
import { RatingService } from './rating.service';

// O motor real é usado por padrão. Alguns testes precisam de um nocaute na hora
// exata — com `performMove` de verdade o dano é aleatório e o teste viraria um
// laço torcendo por um KO. Aqui a SALA é o objeto do teste; o combate tem os
// specs dele em engine/.
jest.mock('./engine/engine', () => {
  const actual = jest.requireActual('./engine/engine');
  return {
    __esModule: true,
    ...actual,
    performMove: jest.fn((...args: unknown[]) => actual.performMove(...args)),
    // Ordem fixa (player primeiro) para os testes lerem sempre a mesma coisa.
    turnOrder: jest.fn((_state: unknown, pm: unknown, em: unknown) => [
      { key: 'player', move: pm },
      { key: 'enemy', move: em },
    ]),
  };
});
// eslint-disable-next-line @typescript-eslint/no-require-imports
const engine = require('./engine/engine');
const performMoveMock = engine.performMove as jest.Mock;

/** Métrica é efeito colateral do fim da batalha: aqui só precisa não explodir. */
const metricsStub = () =>
  ({ record: jest.fn().mockReturnValue(0) }) as unknown as MetricsService;

type Emitted = { userId: string; event: string; payload: any };

describe('BattleRoomService', () => {
  let service: BattleRoomService;
  let emitted: Emitted[];
  let closed: string[][];
  const battleCreate = jest.fn();
  const battleUpdate = jest.fn();
  const slotUpdateMany = jest.fn();
  const captureFindMany = jest.fn();

  const ana = { userId: 'user-ana', name: 'Ana' };
  const bia = { userId: 'user-bia', name: 'Bia' };

  const prisma = {
    battle: { create: battleCreate, update: battleUpdate },
    battleSlot: { updateMany: slotUpdateMany },
    capture: { findMany: captureFindMany },
    $transaction: jest.fn((ops: any) =>
      Array.isArray(ops) ? Promise.all(ops) : ops(prisma),
    ),
  } as unknown as PrismaService;

  const applyResult = jest.fn().mockResolvedValue({
    deltaA: 20,
    deltaB: 0,
    ratingA: 1020,
    ratingB: 1000,
    tierA: 'Bronze',
    tierB: 'Bronze',
  });
  const ratingService = { applyResult } as unknown as RatingService;

  // Três exemplares por jogadora — o suficiente para time cheio, reserva e
  // repetição de professor com capturas diferentes.
  const TIPOS = [['algoritmos'], ['arquitetura', 'ia-ml'], ['redes']];
  const capturaDe = (userId: string, i: number) => ({
    id: `cap-${userId}-${i}`,
    moves: buildMoveset(TIPOS[i]).map((m) => m.id),
    ivHp: 0,
    ivRigor: 0,
    ivDidatica: 0,
    ivRaciocinio: 0,
    // O índice 2 repete o professor do índice 0 de propósito: dois exemplares
    // do mesmo professor são legítimos no mesmo time.
    professor: {
      id: `prof-${userId}-${i === 2 ? 0 : i}`,
      slug: `${userId}-p${i === 2 ? 0 : i}`,
      name: `Prof ${i === 2 ? 0 : i}`,
    },
    variant: { types: TIPOS[i] },
  });
  let capturas: Record<string, any[]>;

  const idsDe = (u: { userId: string }, ...indices: number[]) =>
    indices.map((i) => capturas[u.userId][i].id);

  beforeEach(() => {
    jest.useFakeTimers();
    emitted = [];
    closed = [];
    battleCreate.mockReset().mockResolvedValue({});
    battleUpdate.mockReset().mockResolvedValue({});
    slotUpdateMany.mockReset().mockResolvedValue({ count: 0 });
    applyResult.mockClear();
    performMoveMock.mockClear();
    performMoveMock.mockImplementation((...args: unknown[]) =>
      jest.requireActual('./engine/engine').performMove(...args),
    );

    capturas = {
      [ana.userId]: [0, 1, 2].map((i) => capturaDe(ana.userId, i)),
      [bia.userId]: [0, 1, 2].map((i) => capturaDe(bia.userId, i)),
    };
    // Espelha `findMany({ where: { id: { in }, userId } })`: exemplar de outra
    // pessoa simplesmente não é encontrado.
    captureFindMany.mockReset().mockImplementation(({ where }: any) => {
      const minhas = capturas[where.userId] ?? [];
      return Promise.resolve(minhas.filter((c) => where.id.in.includes(c.id)));
    });

    service = new BattleRoomService(prisma, ratingService, metricsStub());
    service.configure({
      emitToUser: (userId, event, payload) =>
        emitted.push({ userId, event, payload }),
      onRoomClosed: (userIds) => closed.push(userIds),
    });
  });

  afterEach(() => jest.useRealTimers());

  const eventsFor = (userId: string, event: string) =>
    emitted.filter((e) => e.userId === userId && e.event === event);
  const lastPayload = (userId: string, event: string) =>
    eventsFor(userId, event).at(-1)?.payload;

  /**
   * Drena a fila de microtasks. Com fake timers, um `await Promise.resolve()`
   * avança UM nível — e encerrar uma batalha encadeia transação, Elo e emissão.
   * Contar os níveis à mão torna o teste refém da implementação.
   */
  const flush = async () => {
    for (let i = 0; i < 20; i++) await Promise.resolve();
  };

  /** Faz o próximo golpe zerar o alvo — nocaute sem depender do RNG. */
  function nocauteNoProximoGolpe(alvo: CombatantKey) {
    performMoveMock.mockImplementationOnce((state: BattleState) => {
      state[alvo].hp = 0;
      return [{ type: 'faint', target: alvo }];
    });
  }

  async function pickBoth(timeA = [0], timeB = [0]) {
    service.create(ana, bia);
    await service.pickTeam(ana.userId, idsDe(ana, ...timeA));
    await service.pickTeam(bia.userId, idsDe(bia, ...timeB));
  }

  /** Vai até a batalha começar, com o lead sendo o primeiro de cada time. */
  async function startBattle(timeA = [0], timeB = [0]) {
    await pickBoth(timeA, timeB);
    await service.chooseLead(ana.userId, idsDe(ana, timeA[0])[0]);
    await service.chooseLead(bia.userId, idsDe(bia, timeB[0])[0]);
    await Promise.resolve();
  }

  const meusGolpes = (u: { userId: string }) =>
    (
      lastPayload(u.userId, 'battle:begin') ??
      lastPayload(u.userId, 'battle:round')
    ).you.moves;

  // ── Seleção do time ──────────────────────────────────────────────────────

  describe('seleção do time', () => {
    it.each([[[0]], [[0, 1]], [[0, 1, 2]]])(
      'aceita time de tamanho %s',
      async (time) => {
        service.create(ana, bia);
        const r = await service.pickTeam(ana.userId, idsDe(ana, ...time));
        expect(r.ok).toBe(true);
      },
    );

    it('aceita dois exemplares do MESMO professor', async () => {
      service.create(ana, bia);
      // índices 0 e 2 são capturas diferentes do mesmo professor
      const r = await service.pickTeam(ana.userId, idsDe(ana, 0, 2));
      expect(r.ok).toBe(true);
    });

    it('recusa o mesmo exemplar repetido', async () => {
      service.create(ana, bia);
      const id = idsDe(ana, 0)[0];
      const r = await service.pickTeam(ana.userId, [id, id]);
      expect(r).toEqual({
        ok: false,
        message: expect.stringContaining('duas vezes'),
      });
    });

    it('recusa time maior que 3', async () => {
      service.create(ana, bia);
      const r = await service.pickTeam(ana.userId, [
        ...idsDe(ana, 0, 1, 2),
        'cap-extra',
      ]);
      expect(r.ok).toBe(false);
    });

    it('recusa time vazio', async () => {
      service.create(ana, bia);
      expect((await service.pickTeam(ana.userId, [])).ok).toBe(false);
    });

    // O guard "já escolheu" olha `me.team`, que só é preenchido DEPOIS da
    // consulta ao banco. Sem uma trava marcada antes do await, duas mensagens
    // do mesmo socket (toque duplo, cliente reenviando) passavam as duas:
    // o rival recebia dois `battle:pick:opponent` e o preview podia disparar
    // em duplicidade.
    it('recusa duas confirmações simultâneas do mesmo jogador', async () => {
      service.create(ana, bia);

      const [r1, r2] = await Promise.all([
        service.pickTeam(ana.userId, idsDe(ana, 0, 1)),
        service.pickTeam(ana.userId, idsDe(ana, 2)),
      ]);

      expect([r1.ok, r2.ok].filter(Boolean)).toHaveLength(1);
      expect(eventsFor(bia.userId, 'battle:pick:opponent')).toHaveLength(1);
    });

    it('libera nova tentativa quando a confirmação é recusada', async () => {
      service.create(ana, bia);

      expect((await service.pickTeam(ana.userId, idsDe(bia, 0))).ok).toBe(false);
      // A trava não pode prender quem errou até o timeout da fase.
      expect((await service.pickTeam(ana.userId, idsDe(ana, 0))).ok).toBe(true);
    });

    it('recusa exemplar de outra pessoa', async () => {
      service.create(ana, bia);
      const r = await service.pickTeam(ana.userId, idsDe(bia, 0));
      expect(r.ok).toBe(false);
    });

    it('recusa quando UM dos ids não é seu — não gera o resto', async () => {
      service.create(ana, bia);
      const r = await service.pickTeam(ana.userId, [
        ...idsDe(ana, 0),
        ...idsDe(bia, 1),
      ]);
      expect(r.ok).toBe(false);
    });

    it('às cegas: o rival sabe QUE você escolheu, nunca O QUÊ', async () => {
      service.create(ana, bia);
      await service.pickTeam(ana.userId, idsDe(ana, 0, 1));

      const aviso = eventsFor(bia.userId, 'battle:pick:opponent');
      expect(aviso).toHaveLength(1);
      expect(aviso[0].payload).toEqual({});
      expect(eventsFor(bia.userId, 'battle:preview')).toHaveLength(0);
    });

    // O formato aceita times de tamanhos diferentes, então cancelar por
    // lentidão puniria por uma regra que não existe.
    it('timeout do pick vale o que foi confirmado', async () => {
      service.create(ana, bia);
      await service.pickTeam(ana.userId, idsDe(ana, 0, 1));
      await service.pickTeam(bia.userId, idsDe(bia, 0));

      jest.advanceTimersByTime(PHASE_TIMEOUT_MS);

      expect(eventsFor(ana.userId, 'battle:cancelled')).toHaveLength(0);
      expect(eventsFor(ana.userId, 'battle:preview')).toHaveLength(1);
    });

    it('timeout do pick cancela quem não escolheu NADA, sem cooldown', async () => {
      service.create(ana, bia);
      await service.pickTeam(ana.userId, idsDe(ana, 0));

      jest.advanceTimersByTime(PHASE_TIMEOUT_MS);

      expect(eventsFor(ana.userId, 'battle:cancelled')).toHaveLength(1);
      expect(eventsFor(bia.userId, 'battle:cancelled')).toHaveLength(1);
      expect(battleCreate).not.toHaveBeenCalled();
      expect(closed).toHaveLength(1);
    });
  });

  // ── Team preview e lead ──────────────────────────────────────────────────

  describe('team preview', () => {
    it('revela os dois times quando os dois confirmam', async () => {
      await pickBoth([0, 1], [0, 1, 2]);

      const p = lastPayload(ana.userId, 'battle:preview');
      expect(p.you.team).toHaveLength(2);
      expect(p.foe.team).toHaveLength(3);
      expect(p.foe.name).toBe('Bia');
    });

    it('o time do rival vem sem captureId, sem golpes e sem IV', async () => {
      await pickBoth([0, 1], [0, 1]);

      const p = lastPayload(ana.userId, 'battle:preview');
      for (const m of p.foe.team) {
        expect(m).not.toHaveProperty('captureId');
        expect(m).not.toHaveProperty('moves');
        expect(m).not.toHaveProperty('ivs');
        expect(Object.keys(m).sort()).toEqual(
          ['fainted', 'hp', 'maxHp', 'professor', 'types'].sort(),
        );
      }
      // O seu vem com captureId: é com ele que você escolhe o lead.
      expect(p.you.team[0]).toHaveProperty('captureId');
    });

    it('o lead é às cegas e só começa quando os dois escolhem', async () => {
      await pickBoth([0, 1], [0, 1]);

      await service.chooseLead(ana.userId, idsDe(ana, 1)[0]);
      expect(eventsFor(bia.userId, 'battle:lead:opponent')).toHaveLength(1);
      expect(eventsFor(bia.userId, 'battle:lead:opponent')[0].payload).toEqual(
        {},
      );
      expect(eventsFor(ana.userId, 'battle:begin')).toHaveLength(0);

      await service.chooseLead(bia.userId, idsDe(bia, 0)[0]);
      await Promise.resolve();
      // O lead escolhido é quem entra, não o primeiro da lista.
      expect(lastPayload(ana.userId, 'battle:begin').you.professor.slug).toBe(
        capturas[ana.userId][1].professor.slug,
      );
    });

    it('recusa lead que não está no seu time', async () => {
      await pickBoth([0], [0]);
      const r = await service.chooseLead(ana.userId, idsDe(ana, 2)[0]);
      expect(r.ok).toBe(false);
    });

    it('timeout do lead entra com o primeiro da ordem de seleção', async () => {
      await pickBoth([1, 0], [0, 1]);

      jest.advanceTimersByTime(PHASE_TIMEOUT_MS);
      await flush();

      expect(lastPayload(ana.userId, 'battle:begin').you.professor.slug).toBe(
        capturas[ana.userId][1].professor.slug,
      );
    });
  });

  // ── Começo ───────────────────────────────────────────────────────────────

  describe('begin', () => {
    it('grava a batalha com um slot por exemplar e marca o lead', async () => {
      await startBattle([0, 1], [0]);

      const data = battleCreate.mock.calls[0][0].data;
      expect(data).toMatchObject({
        pairKey: 'user-ana:user-bia',
        status: 'active',
      });
      expect(data.slots.create).toHaveLength(3); // 2 de Ana + 1 de Bia
      const doLadoA = data.slots.create.filter((s: any) => s.side === 'a');
      expect(doLadoA.map((s: any) => s.slot)).toEqual([0, 1]);
      expect(doLadoA.filter((s: any) => s.lead)).toHaveLength(1);
      // O exemplar, não só o professor: é ele que carrega tipos, deck e IVs.
      expect(doLadoA[0]).toHaveProperty('captureId');
    });

    it('entrega o próprio deck e o time, nunca os golpes do rival', async () => {
      await startBattle([0, 1], [0, 1]);

      const p = lastPayload(ana.userId, 'battle:begin');
      expect(p.you.moves).toHaveLength(4);
      expect(p.you.team).toHaveLength(2);
      expect(p.foe.moves).toBeUndefined();
      expect(p.foe.team).toHaveLength(2);
      expect(p.foe.team[0]).not.toHaveProperty('captureId');
    });

    it('luta com o deck gravado no exemplar, não com um sorteio novo', async () => {
      await startBattle([0], [1]);

      expect(
        lastPayload(ana.userId, 'battle:begin').you.moves.map((m: any) => m.id),
      ).toEqual(capturas[ana.userId][0].moves);
      expect(lastPayload(bia.userId, 'battle:begin').you.types).toEqual([
        'arquitetura',
        'ia-ml',
      ]);
    });
  });

  // ── Turnos, troca e revezamento ──────────────────────────────────────────

  describe('turno', () => {
    it('resolve a rodada quando os dois agem', async () => {
      await startBattle();

      expect(service.move(ana.userId, meusGolpes(ana)[0].id).ok).toBe(true);
      expect(eventsFor(bia.userId, 'battle:move:opponent')).toHaveLength(1);
      expect(service.move(bia.userId, meusGolpes(bia)[0].id).ok).toBe(true);
      await Promise.resolve();

      expect(lastPayload(ana.userId, 'battle:round').turn).toBe(2);
    });

    it('recusa golpe fora do próprio deck', async () => {
      await startBattle();
      expect(service.move(ana.userId, 'golpe-que-nao-e-seu').ok).toBe(false);
    });

    // Regressão de docs/BUG-BATALHA-TRAVANDO.md: quem age em SEGUNDO recebe a
    // rodada antes do ack, e o cliente usa o turno do ack para descartá-lo.
    it('o ack carrega o turno em que a ação foi aceita', async () => {
      await startBattle();

      expect(service.move(ana.userId, meusGolpes(ana)[0].id)).toEqual({
        ok: true,
        turn: 1,
      });
      const ackB = service.move(bia.userId, meusGolpes(bia)[0].id);
      expect(eventsFor(bia.userId, 'battle:round')[0].payload.turn).toBe(2);
      expect(ackB).toEqual({ ok: true, turn: 1 });
      expect((service.resync(bia.userId) as any).youMoved).toBe(false);
    });

    it('uma ação por turno: quem já agiu não age de novo', async () => {
      await startBattle([0, 1], [0]);
      service.move(ana.userId, meusGolpes(ana)[0].id);

      expect(service.switchTo(ana.userId, idsDe(ana, 1)[0]).ok).toBe(false);
    });
  });

  describe('troca', () => {
    it('recusa trocar para quem já está em campo ou não é do time', async () => {
      await startBattle([0, 1], [0]);

      expect(service.switchTo(ana.userId, idsDe(ana, 0)[0]).ok).toBe(false);
      expect(service.switchTo(ana.userId, idsDe(bia, 1)[0]).ok).toBe(false);
      expect(service.switchTo(ana.userId, idsDe(ana, 1)[0]).ok).toBe(true);
    });

    it('quem entra COME o golpe do adversário', async () => {
      await startBattle([0, 1], [0]);
      const antes = lastPayload(ana.userId, 'battle:begin').you.team[1].hp;

      service.switchTo(ana.userId, idsDe(ana, 1)[0]);
      service.move(bia.userId, meusGolpes(bia)[0].id);
      await Promise.resolve();

      const round = lastPayload(ana.userId, 'battle:round');
      // O exemplar que entrou é agora o ativo...
      expect(round.you.professor.slug).toBe(
        capturas[ana.userId][1].professor.slug,
      );
      // ...e o evento de troca vem ANTES de qualquer dano.
      const tipos = round.events.map((e: any) => e.type);
      expect(tipos[0]).toBe('switch');
      if (tipos.includes('damage')) {
        expect(round.you.team[1].hp).toBeLessThan(antes);
      }
    });

    it('os dois trocando: ninguém ataca', async () => {
      await startBattle([0, 1], [0, 1]);

      service.switchTo(ana.userId, idsDe(ana, 1)[0]);
      service.switchTo(bia.userId, idsDe(bia, 1)[0]);
      await Promise.resolve();

      const round = lastPayload(ana.userId, 'battle:round');
      expect(round.events.filter((e: any) => e.type === 'damage')).toHaveLength(
        0,
      );
      expect(round.events.filter((e: any) => e.type === 'switch')).toHaveLength(
        2,
      );
    });
  });

  describe('nocaute e revezamento', () => {
    it('com reserva vivo, pede a entrada em vez de encerrar', async () => {
      await startBattle([0, 1], [0]);
      nocauteNoProximoGolpe('player');

      service.move(ana.userId, meusGolpes(ana)[0].id);
      service.move(bia.userId, meusGolpes(bia)[0].id);
      await Promise.resolve();

      expect(eventsFor(ana.userId, 'battle:end')).toHaveLength(0);
      const faint = lastPayload(ana.userId, 'battle:faint');
      expect(faint.youChoose).toBe(true);
      // O outro lado recebe o evento para mostrar "está escolhendo", sem pedido.
      expect(lastPayload(bia.userId, 'battle:faint').youChoose).toBe(false);
    });

    it('sem reserva, a batalha acaba', async () => {
      await startBattle([0], [0]);
      nocauteNoProximoGolpe('player');

      service.move(ana.userId, meusGolpes(ana)[0].id);
      service.move(bia.userId, meusGolpes(bia)[0].id);
      await flush();

      expect(lastPayload(ana.userId, 'battle:end').result).toBe('loss');
      expect(lastPayload(bia.userId, 'battle:end').result).toBe('win');
    });

    it('a entrada escolhida põe o exemplar em campo e retoma o turno', async () => {
      await startBattle([0, 1], [0]);
      nocauteNoProximoGolpe('player');
      service.move(ana.userId, meusGolpes(ana)[0].id);
      service.move(bia.userId, meusGolpes(bia)[0].id);
      await Promise.resolve();

      expect(service.enterWith(ana.userId, idsDe(ana, 1)[0]).ok).toBe(true);

      const round = lastPayload(ana.userId, 'battle:round');
      expect(round.you.professor.slug).toBe(
        capturas[ana.userId][1].professor.slug,
      );
    });

    it('recusa entrar com quem já caiu ou não é do time', async () => {
      await startBattle([0, 1], [0]);
      nocauteNoProximoGolpe('player');
      service.move(ana.userId, meusGolpes(ana)[0].id);
      service.move(bia.userId, meusGolpes(bia)[0].id);
      await Promise.resolve();

      expect(service.enterWith(ana.userId, idsDe(ana, 0)[0]).ok).toBe(false);
      expect(service.enterWith(ana.userId, idsDe(bia, 1)[0]).ok).toBe(false);
      // E quem não deve entrada não pode se antecipar.
      expect(service.enterWith(bia.userId, idsDe(bia, 0)[0]).ok).toBe(false);
    });

    it('timeout da entrada põe o próximo vivo pela ordem', async () => {
      await startBattle([0, 1, 2], [0]);
      nocauteNoProximoGolpe('player');
      service.move(ana.userId, meusGolpes(ana)[0].id);
      service.move(bia.userId, meusGolpes(bia)[0].id);
      await Promise.resolve();

      jest.advanceTimersByTime(PHASE_TIMEOUT_MS);
      await Promise.resolve();

      expect(lastPayload(ana.userId, 'battle:round').you.professor.slug).toBe(
        capturas[ana.userId][1].professor.slug,
      );
    });
  });

  // ── Fins de partida ──────────────────────────────────────────────────────

  describe('teto de turnos', () => {
    // Sem teto, dois jogadores trocando para sempre deixam a sala aberta em
    // memória — e a instância é uma só.
    it('encerra no turno 40 pelo HP somado', async () => {
      await startBattle([0, 1], [0]);
      // Ninguém toma dano: só passa turno.
      performMoveMock.mockImplementation(() => []);

      for (let i = 0; i < MAX_TURNS + 2; i++) {
        if (eventsFor(ana.userId, 'battle:end').length) break;
        const golpes = meusGolpes(ana);
        service.move(ana.userId, golpes[0].id);
        service.move(bia.userId, meusGolpes(bia)[0].id);
        await Promise.resolve();
      }

      const fim = lastPayload(ana.userId, 'battle:end');
      expect(fim.reason).toBe('limite_de_turnos');
      // Ana levou 2 exemplares e ninguém tomou dano: mais HP somado.
      expect(fim.result).toBe('win');
    });
  });

  describe('abandono', () => {
    it('3 faltas em qualquer fase encerram por abandono', async () => {
      await startBattle([0], [0]);
      // Sem dano: só o contador pode terminar a batalha.
      performMoveMock.mockImplementation(() => []);

      for (let i = 0; i < MAX_MISSED_PHASES; i++) {
        if (eventsFor(ana.userId, 'battle:end').length) break;
        service.move(ana.userId, meusGolpes(ana)[0].id); // Ana joga; Bia some
        jest.advanceTimersByTime(PHASE_TIMEOUT_MS);
        await flush();
      }

      const fim = lastPayload(ana.userId, 'battle:end');
      expect(fim.result).toBe('win');
      expect(fim.reason).toBe('abandono');
      expect(applyResult).toHaveBeenCalledWith(
        expect.any(String),
        ana.userId,
        bia.userId,
        ana.userId,
      );
      expect(battleUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'abandoned',
            winnerId: ana.userId,
          }),
        }),
      );
    });

    // O contador é único: deixar o lead expirar já conta como uma falta.
    it('a falta do lead soma na mesma conta do turno', async () => {
      await pickBoth([0], [0]);
      await service.chooseLead(ana.userId, idsDe(ana, 0)[0]); // só Ana escolhe
      jest.advanceTimersByTime(PHASE_TIMEOUT_MS); // Bia leva 1 falta
      await flush();
      performMoveMock.mockImplementation(() => []);

      // Faltam 2 turnos para Bia estourar, em vez dos 3 de quem chegou zerado.
      for (let i = 0; i < 2; i++) {
        service.move(ana.userId, meusGolpes(ana)[0].id);
        jest.advanceTimersByTime(PHASE_TIMEOUT_MS);
        await flush();
      }

      expect(lastPayload(ana.userId, 'battle:end')?.reason).toBe('abandono');
    });
  });

  it('marca quem caiu nos slots ao encerrar', async () => {
    await startBattle([0], [0]);
    nocauteNoProximoGolpe('player');
    service.move(ana.userId, meusGolpes(ana)[0].id);
    service.move(bia.userId, meusGolpes(bia)[0].id);
    await flush();

    expect(slotUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          captureId: { in: [idsDe(ana, 0)[0]] },
        }),
        data: { fainted: true },
      }),
    );
  });

  it('anula batalhas ativas no desligamento (sem pontos, sem cooldown)', async () => {
    await startBattle();

    await service.onModuleDestroy();

    expect(lastPayload(ana.userId, 'battle:cancelled').reason).toBe(
      'server_shutdown',
    );
    expect(battleUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'annulled' }),
      }),
    );
    expect(applyResult).not.toHaveBeenCalled();
    expect(closed).toHaveLength(1);
  });

  describe('resync', () => {
    it('devolve o time e o próprio deck no meio da batalha', async () => {
      await startBattle([0, 1], [0]);

      const s = service.resync(bia.userId) as any;
      expect(s.phase).toBe('active');
      expect(s.opponent.id).toBe(ana.userId);
      expect(s.you.moves).toHaveLength(4);
      expect(s.foe.moves).toBeUndefined();
      expect(s.foe.team).toHaveLength(2);
    });

    it('cobre a fase de preview', async () => {
      await pickBoth([0, 1], [0]);

      const s = service.resync(ana.userId) as any;
      expect(s.phase).toBe('preview');
      expect(s.you.team).toHaveLength(2);
      expect(s.foe.team).toHaveLength(1);
    });

    it('cobre a fase de substituição', async () => {
      await startBattle([0, 1], [0]);
      nocauteNoProximoGolpe('player');
      service.move(ana.userId, meusGolpes(ana)[0].id);
      service.move(bia.userId, meusGolpes(bia)[0].id);
      await Promise.resolve();

      expect((service.resync(ana.userId) as any).phase).toBe('switching');
      expect((service.resync(ana.userId) as any).youChoose).toBe(true);
      expect((service.resync(bia.userId) as any).youChoose).toBe(false);
    });
  });
});
