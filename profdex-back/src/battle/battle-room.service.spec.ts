import { MetricsService } from '../metrics/metrics.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  BattleRoomService,
  MAX_MISSED_TURNS,
  PICK_TIMEOUT_MS,
  TURN_TIMEOUT_MS,
} from './battle-room.service';
import { RatingService } from './rating.service';

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
  const captureFindUnique = jest.fn();

  const ana = { userId: 'user-ana', name: 'Ana' };
  const bia = { userId: 'user-bia', name: 'Bia' };

  const prisma = {
    battle: { create: battleCreate, update: battleUpdate },
    capture: { findUnique: captureFindUnique },
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

  const professorOf = (owner: string) => ({
    id: `prof-${owner}`,
    slug: owner === ana.userId ? 'mario' : 'eron',
    name: owner === ana.userId ? 'Mario' : 'Eron',
  });

  beforeEach(() => {
    jest.useFakeTimers();
    emitted = [];
    closed = [];
    battleCreate.mockReset().mockResolvedValue({});
    battleUpdate.mockReset().mockResolvedValue({});
    applyResult.mockClear();
    captureFindUnique.mockReset().mockImplementation(({ where }: any) =>
      Promise.resolve({
        professor: professorOf(where.userId_professorId.userId),
      }),
    );

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

  async function startBattle() {
    service.create(ana, bia);
    await service.pick(ana.userId, 'prof-a');
    await service.pick(bia.userId, 'prof-b');
    // deixa promises do begin assentarem
    await Promise.resolve();
  }

  it('cancels the room when picks time out, without persisting', async () => {
    service.create(ana, bia);
    await service.pick(ana.userId, 'prof-a'); // só a Ana escolheu

    jest.advanceTimersByTime(PICK_TIMEOUT_MS);

    expect(eventsFor(ana.userId, 'battle:cancelled')).toHaveLength(1);
    expect(eventsFor(bia.userId, 'battle:cancelled')).toHaveLength(1);
    expect(battleCreate).not.toHaveBeenCalled(); // sem cooldown consumido
    expect(closed).toHaveLength(1);
  });

  it('rejects picking a professor that was not captured', async () => {
    captureFindUnique.mockResolvedValue(null);
    service.create(ana, bia);

    const result = await service.pick(ana.userId, 'prof-nao-capturado');

    expect(result.ok).toBe(false);
  });

  it('begins the battle when both picked: persists and sends personal decks', async () => {
    await startBattle();

    expect(battleCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          pairKey: 'user-ana:user-bia',
          status: 'active',
        }),
      }),
    );

    const beginA = eventsFor(ana.userId, 'battle:begin')[0].payload;
    const beginB = eventsFor(bia.userId, 'battle:begin')[0].payload;
    expect(beginA.you.moves).toHaveLength(4);
    expect(beginA.you.professor.slug).toBe('mario');
    expect(beginA.foe.professor.slug).toBe('eron');
    expect(beginA.foe.moves).toBeUndefined(); // deck do rival não é entregue
    expect(beginB.you.professor.slug).toBe('eron');
  });

  it('blind pick: opponent learns THAT you picked, never WHICH', async () => {
    service.create(ana, bia);
    await service.pick(ana.userId, 'prof-a');

    const notice = eventsFor(bia.userId, 'battle:pick:opponent');
    expect(notice).toHaveLength(1);
    expect(notice[0].payload).toEqual({});
    expect(eventsFor(bia.userId, 'battle:begin')).toHaveLength(0);
  });

  it('resolves the round when both submit moves', async () => {
    await startBattle();
    const beginA = eventsFor(ana.userId, 'battle:begin')[0].payload;
    const beginB = eventsFor(bia.userId, 'battle:begin')[0].payload;

    expect(service.move(ana.userId, beginA.you.moves[0].id).ok).toBe(true);
    // avisa o rival que o oponente já escolheu
    expect(eventsFor(bia.userId, 'battle:move:opponent')).toHaveLength(1);

    expect(service.move(bia.userId, beginB.you.moves[0].id).ok).toBe(true);
    await Promise.resolve();

    const roundA = eventsFor(ana.userId, 'battle:round');
    const roundB = eventsFor(bia.userId, 'battle:round');
    expect(
      roundA.length + eventsFor(ana.userId, 'battle:end').length,
    ).toBeGreaterThan(0);
    if (roundA.length) {
      expect(roundA[0].payload.turn).toBe(2);
      expect(roundA[0].payload.events.length).toBeGreaterThan(0);
      // perspectiva espelhada: mesmos eventos, alvos invertidos
      const dmgA = roundA[0].payload.events.filter(
        (e: any) => e.type === 'damage',
      );
      const dmgB = roundB[0].payload.events.filter(
        (e: any) => e.type === 'damage',
      );
      expect(dmgA.map((e: any) => e.amount)).toEqual(
        dmgB.map((e: any) => e.amount),
      );
      if (dmgA.length) expect(dmgA[0].target).not.toBe(dmgB[0].target);
    }
  });

  // Regressão do travamento relatado no evento: quem move em SEGUNDO recebe
  // `battle:round` antes do ack do próprio golpe (a resolução é síncrona dentro
  // de `move()`). O cliente marcava "já joguei" ao receber o ack, carimbando um
  // turno que já tinha começado — e os botões de golpe morriam até o F5.
  // O ack carrega o turno em que o golpe foi aceito para o cliente descartá-lo
  // quando chega atrasado. Ver docs/BUG-BATALHA-TRAVANDO.md.
  it('ack do golpe carrega o turno em que foi aceito, não o já resolvido', async () => {
    await startBattle();
    const beginA = eventsFor(ana.userId, 'battle:begin')[0].payload;
    const beginB = eventsFor(bia.userId, 'battle:begin')[0].payload;

    const ackA = service.move(ana.userId, beginA.you.moves[0].id);
    expect(ackA).toEqual({ ok: true, turn: 1 });

    emitted = [];
    const ackB = service.move(bia.userId, beginB.you.moves[0].id);

    // A rodada já foi emitida quando o ack de Bia é produzido...
    expect(eventsFor(bia.userId, 'battle:round')).toHaveLength(1);
    expect(eventsFor(bia.userId, 'battle:round')[0].payload.turn).toBe(2);
    // ...e mesmo assim o ack aponta para o turno 1, o que ela de fato jogou.
    expect(ackB).toEqual({ ok: true, turn: 1 });

    // O servidor não considera que ninguém jogou o turno novo.
    expect((service.resync(bia.userId) as any).youMoved).toBe(false);
    expect((service.resync(ana.userId) as any).youMoved).toBe(false);
  });

  it('rejects a move outside your own deck', async () => {
    await startBattle();

    expect(service.move(ana.userId, 'golpe-que-nao-e-seu').ok).toBe(false);
  });

  it('turn timeout: the absent player just takes the hit', async () => {
    await startBattle();
    const beginA = eventsFor(ana.userId, 'battle:begin')[0].payload;

    service.move(ana.userId, beginA.you.moves[0].id);
    jest.advanceTimersByTime(TURN_TIMEOUT_MS);
    await Promise.resolve();

    const all = [
      ...eventsFor(ana.userId, 'battle:round'),
      ...eventsFor(ana.userId, 'battle:end'),
    ];
    expect(all.length).toBeGreaterThan(0);
  });

  it('declares abandonment after 3 straight missed turns', async () => {
    await startBattle();
    const beginA = eventsFor(ana.userId, 'battle:begin')[0].payload;

    // Ana joga sempre o golpe utilitário do deck. `buildMoveset` embaralha os
    // golpes, então pegar `moves[0]` sortearia um ATAQUE qualquer — e um golpe
    // forte derruba Bia na 2ª rodada, encerrando por 'nocaute' antes de o
    // contador de faltas chegar a 3 (era daí que vinha a intermitência deste
    // teste). O moveset sempre traz exatamente 1 golpe fora de ATAQUE, e sem
    // dano não existe KO: só o abandono pode terminar a batalha.
    const harmless = (moves: any[]) =>
      moves.find((m) => m.category !== 'ataque') ?? moves[0];

    for (let i = 0; i < MAX_MISSED_TURNS; i++) {
      const ended = eventsFor(ana.userId, 'battle:end').length > 0;
      if (ended) break;
      const beginPayload = i === 0 ? beginA : null;
      const roundPayload = eventsFor(ana.userId, 'battle:round').at(
        -1,
      )?.payload;
      const moves =
        (beginPayload ?? roundPayload)?.you?.moves ?? beginA.you.moves;
      service.move(ana.userId, harmless(moves).id); // Ana joga; Bia some
      jest.advanceTimersByTime(TURN_TIMEOUT_MS);
      await Promise.resolve();
      await Promise.resolve();
    }

    const endA = eventsFor(ana.userId, 'battle:end');
    expect(endA).toHaveLength(1);
    expect(endA[0].payload.result).toBe('win');
    expect(endA[0].payload.reason).toBe('abandono');
    // Abandono unilateral pontua como vitória normal; o payload carrega o Elo.
    expect(applyResult).toHaveBeenCalledWith(
      expect.any(String),
      ana.userId,
      bia.userId,
      ana.userId,
    );
    expect(endA[0].payload.rating).toEqual(
      expect.objectContaining({ delta: 20, rating: 1020 }),
    );
    expect(battleUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'abandoned',
          winnerId: ana.userId,
        }),
      }),
    );
    expect(closed).toHaveLength(1);
  });

  it('annuls active battles on shutdown (no points, no cooldown)', async () => {
    await startBattle();

    await service.onModuleDestroy();

    expect(eventsFor(ana.userId, 'battle:cancelled')[0].payload.reason).toBe(
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

  it('resync returns a personal snapshot mid-battle', async () => {
    await startBattle();

    const snapshot = service.resync(bia.userId) as any;

    expect(snapshot.phase).toBe('active');
    expect(snapshot.opponent.id).toBe(ana.userId);
    expect(snapshot.you.professor.slug).toBe('eron');
    expect(snapshot.you.moves).toHaveLength(4);
    expect(snapshot.foe.moves).toBeUndefined();
  });
});
