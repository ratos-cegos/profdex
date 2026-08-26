import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { MetricsService } from '../metrics/metrics.service';
import { PrismaService } from '../prisma/prisma.service';
import { pairKeyOf } from './cooldown.service';
import {
  BattleEvent,
  BattleState,
  CombatantKey,
  createCombatant,
  performMove,
  statusLabel,
  turnOrder,
  upkeep,
} from './engine/engine';
import { buildMoveset, getMoveById, Move } from './engine/moves';
import { typesForProfessor } from './engine/professor-types';
import { RatingOutcome, RatingService } from './rating.service';

export const PICK_TIMEOUT_MS = 60 * 1000;
export const TURN_TIMEOUT_MS = 60 * 1000;
// Turnos seguidos sem escolher = abandono (cobre rage quit e queda longa).
export const MAX_MISSED_TURNS = 3;

interface RoomPlayer {
  userId: string;
  name: string;
  key: CombatantKey; // 'player' = quem convidou (A) · 'enemy' = convidado (B)
  // O exemplar escolhido, não o professor: é ele que carrega a combinação de
  // tipos e o deck gravados na captura.
  professor?: { id: string; slug: string; name: string };
  captureId?: string;
  types?: string[];
  moves?: Move[];
  ivs?: { ivHp: number; ivRigor: number; ivDidatica: number; ivRaciocinio: number };
  missedTurns: number;
}

interface Room {
  id: string;
  phase: 'picking' | 'active' | 'done';
  players: Record<CombatantKey, RoomPlayer>;
  state?: BattleState;
  pending: Partial<Record<CombatantKey, string>>; // moveId escolhido no turno
  turn: number;
  deadline: number;
  timer?: NodeJS.Timeout;
}

/** O gateway conecta o serviço aos sockets/presença sem dependência circular. */
export interface RoomEmitter {
  emitToUser(userId: string, event: string, payload: unknown): void;
  /** Chamado quando a sala fecha por qualquer motivo — libera presença etc. */
  onRoomClosed(userIds: string[]): void;
}

type Ack = { ok: true } | { ok: false; message: string };

/**
 * Ack do golpe. Carrega o turno em que o golpe foi ACEITO — que não é
 * necessariamente `room.turn` quando o ack chega ao cliente, porque este mesmo
 * golpe pode ter fechado a rodada e virado o turno. Ver `move()`.
 */
type MoveAck = { ok: true; turn: number } | { ok: false; message: string };

/**
 * Salas de batalha PvP — estado em memória, timers no servidor, resultado no
 * banco. O motor (engine/) é quem resolve as rodadas; aqui ficam as regras de
 * SALA: seleção às cegas, turnos simultâneos com deadline, abandono, resync.
 */
@Injectable()
export class BattleRoomService implements OnModuleDestroy {
  private readonly rooms = new Map<string, Room>();
  private readonly roomByUser = new Map<string, string>();
  private readonly logger = new Logger(BattleRoomService.name);
  private emitter: RoomEmitter = {
    emitToUser: () => {},
    onRoomClosed: () => {},
  };

  constructor(
    private prisma: PrismaService,
    private ratings: RatingService,
    private metrics: MetricsService,
  ) {}

  configure(emitter: RoomEmitter): void {
    this.emitter = emitter;
  }

  /**
   * Desligamento (deploy/restart): batalhas ativas viram `annulled` — sem
   * pontos e SEM consumir cooldown (a dupla não teve batalha de verdade).
   * Melhor do que deixar partidas órfãs "active" para sempre no banco.
   */
  async onModuleDestroy(): Promise<void> {
    for (const room of [...this.rooms.values()]) {
      this.broadcast(room, 'battle:cancelled', { reason: 'server_shutdown' });
      if (room.phase === 'active') {
        await this.prisma.battle
          .update({
            where: { id: room.id },
            data: { status: 'annulled', finishedAt: new Date() },
          })
          .catch(() => {}); // desligando: melhor perder o update que travar
        this.logger.warn(`Batalha ${room.id} anulada por desligamento`);
      }
      this.close(room);
    }
  }

  hasActiveRoom(userId: string): boolean {
    return this.roomByUser.has(userId);
  }

  // ── Criação (no aceite do convite) ────────────────────────────────────────

  create(
    inviter: { userId: string; name: string },
    invitee: { userId: string; name: string },
  ): { battleId: string; pickDeadline: number } {
    const room: Room = {
      id: randomUUID(),
      phase: 'picking',
      players: {
        player: { ...inviter, key: 'player', missedTurns: 0 },
        enemy: { ...invitee, key: 'enemy', missedTurns: 0 },
      },
      pending: {},
      turn: 0,
      deadline: Date.now() + PICK_TIMEOUT_MS,
    };
    room.timer = setTimeout(() => this.onPickTimeout(room), PICK_TIMEOUT_MS);

    this.rooms.set(room.id, room);
    this.roomByUser.set(inviter.userId, room.id);
    this.roomByUser.set(invitee.userId, room.id);
    return { battleId: room.id, pickDeadline: room.deadline };
  }

  // ── Seleção às cegas do professor ─────────────────────────────────────────

  async pick(userId: string, captureId: string): Promise<Ack> {
    const room = this.roomOf(userId);
    if (!room || room.phase !== 'picking') {
      return { ok: false, message: 'Não há seleção em andamento.' };
    }
    const me = this.slotOf(room, userId);
    if (me.professor) return { ok: false, message: 'Você já escolheu.' };

    // Só vale exemplar CAPTURADO pelo próprio usuário — validação no banco,
    // nunca no cliente. O `userId` no where é o que impede levar para a arena
    // o exemplar de outra pessoa.
    const capture = await this.prisma.capture.findFirst({
      where: { id: captureId, userId },
      select: {
        id: true,
        moves: true,
        ivHp: true,
        ivRigor: true,
        ivDidatica: true,
        ivRaciocinio: true,
        professor: { select: { id: true, slug: true, name: true } },
        variant: { select: { types: true } },
      },
    });
    if (!capture) {
      return {
        ok: false,
        message: 'Você só pode usar um professor que capturou.',
      };
    }

    // Tipos e deck vêm gravados na captura. O fallback cobre exemplares
    // anteriores a este modelo, que o seed ainda não corrigiu.
    const types = capture.variant?.types?.length
      ? capture.variant.types
      : typesForProfessor(capture.professor);
    const moves = capture.moves
      .map((id) => getMoveById(id))
      .filter((move) => move !== null);

    me.professor = capture.professor;
    me.captureId = capture.id;
    me.types = types;
    me.moves = moves.length ? moves : buildMoveset(types);
    me.ivs = {
      ivHp: capture.ivHp,
      ivRigor: capture.ivRigor,
      ivDidatica: capture.ivDidatica,
      ivRaciocinio: capture.ivRaciocinio,
    };
    // O oponente sabe QUE você escolheu, nunca QUAL (pick às cegas).
    this.emitToOther(room, me.key, 'battle:pick:opponent', {});

    const both = room.players.player.professor && room.players.enemy.professor;
    if (both) await this.begin(room);
    return { ok: true };
  }

  private async begin(room: Room): Promise<void> {
    this.clearTimer(room);
    room.phase = 'active';
    room.turn = 1;

    const combatants = {} as Record<
      CombatantKey,
      ReturnType<typeof createCombatant>
    >;
    for (const key of ['player', 'enemy'] as const) {
      const slot = room.players[key];
      // Tipos e deck já foram resolvidos no pick, a partir do exemplar
      // capturado — a batalha não sorteia mais nada.
      combatants[key] = createCombatant({
        name: slot.professor!.name,
        types: slot.types!,
        moves: slot.moves!,
        ivs: slot.ivs,
      });
    }
    room.state = { player: combatants.player, enemy: combatants.enemy };

    // A partir daqui a batalha existe oficialmente: conta para o cooldown.
    await this.prisma.battle.create({
      data: {
        id: room.id,
        pairKey: pairKeyOf(
          room.players.player.userId,
          room.players.enemy.userId,
        ),
        playerAId: room.players.player.userId,
        playerBId: room.players.enemy.userId,
        professorAId: room.players.player.professor!.id,
        professorBId: room.players.enemy.professor!.id,
        status: 'active',
      },
    });

    this.armTurnTimer(room);
    for (const key of ['player', 'enemy'] as const) {
      const me = room.players[key];
      const foe = room.players[this.otherKey(key)];
      this.emitter.emitToUser(me.userId, 'battle:begin', {
        battleId: room.id,
        turn: room.turn,
        deadline: room.deadline,
        you: this.combatantView(room, key, true),
        foe: {
          name: foe.name,
          ...this.combatantView(room, this.otherKey(key), false),
        },
      });
    }
    this.logger.log(
      `Batalha ${room.id}: ${room.players.player.professor!.slug} vs ${room.players.enemy.professor!.slug}`,
    );
  }

  private onPickTimeout(room: Room): void {
    // Alguém (ou os dois) não escolheu: cancela sem pontos e sem cooldown —
    // ninguém é punido na preparação; o pick às cegas já impede dodge tático.
    if (room.phase !== 'picking') return;
    this.broadcast(room, 'battle:cancelled', { reason: 'pick_timeout' });
    this.close(room);
  }

  // ── Turnos simultâneos ────────────────────────────────────────────────────

  move(userId: string, moveId: string): MoveAck {
    const room = this.roomOf(userId);
    if (!room || room.phase !== 'active') {
      return { ok: false, message: 'Nenhuma batalha em andamento.' };
    }
    const me = this.slotOf(room, userId);
    if (room.pending[me.key])
      return { ok: false, message: 'Você já escolheu neste turno.' };
    if (!me.moves?.some((m) => m.id === moveId)) {
      return { ok: false, message: 'Esse golpe não está no seu conjunto.' };
    }

    // Guardado ANTES de resolver: se este golpe fechar a rodada, `resolveRound`
    // incrementa `room.turn` ainda dentro desta chamada, e o ack sairia
    // carimbado com o turno seguinte — justamente o que o cliente usa para
    // decidir se o ack ainda vale.
    const turn = room.turn;

    room.pending[me.key] = moveId;
    this.emitToOther(room, me.key, 'battle:move:opponent', {});

    if (room.pending.player && room.pending.enemy) {
      // Atenção: isto emite `battle:round` de forma SÍNCRONA, ou seja, antes
      // de o ack abaixo ser enviado. Para quem move em segundo, o cliente
      // recebe a rodada nova e só depois a confirmação do próprio golpe — por
      // isso o ack precisa dizer a que turno pertence.
      this.resolveRound(room).catch((error: unknown) =>
        this.logger.error(
          `Falha resolvendo rodada de ${room.id}`,
          error as Error,
        ),
      );
    }
    return { ok: true, turn };
  }

  private onTurnTimeout(room: Room): void {
    if (room.phase !== 'active') return;
    this.resolveRound(room).catch((error: unknown) =>
      this.logger.error(`Falha no timeout de ${room.id}`, error as Error),
    );
  }

  private async resolveRound(room: Room): Promise<void> {
    this.clearTimer(room);
    const state = room.state!;

    // Contabiliza inatividade ANTES de resolver: quem estourou o limite
    // abandona — e a rodada nem precisa acontecer.
    for (const key of ['player', 'enemy'] as const) {
      const slot = room.players[key];
      slot.missedTurns = room.pending[key] ? 0 : slot.missedTurns + 1;
    }
    const abandonedP = room.players.player.missedTurns >= MAX_MISSED_TURNS;
    const abandonedE = room.players.enemy.missedTurns >= MAX_MISSED_TURNS;
    if (abandonedP || abandonedE) {
      await this.finish(room, {
        status: 'abandoned',
        winnerKey:
          abandonedP && abandonedE ? null : abandonedP ? 'enemy' : 'player',
        reason: 'abandono',
      });
      return;
    }

    const moveOf = (key: CombatantKey): Move | null =>
      room.pending[key]
        ? (room.players[key].moves!.find((m) => m.id === room.pending[key]) ??
          null)
        : null;

    const events: BattleEvent[] = [];
    const order = turnOrder(state, moveOf('player'), moveOf('enemy'));
    for (const entry of order) {
      if (state.player.hp <= 0 || state.enemy.hp <= 0) break;
      const up = upkeep(state, entry.key);
      events.push(...up.events);
      if (state.player.hp <= 0 || state.enemy.hp <= 0) break;
      if (up.canAct && entry.move) {
        events.push(...performMove(state, entry.key, entry.move));
      } else if (up.canAct && !entry.move) {
        events.push({
          type: 'message',
          text: `${state[entry.key].name} não escolheu a tempo e perdeu o turno!`,
        });
      }
    }

    room.pending = {};
    const deadP = state.player.hp <= 0;
    const deadE = state.enemy.hp <= 0;

    if (deadP || deadE) {
      await this.finish(
        room,
        {
          status: 'finished',
          winnerKey: deadP && deadE ? null : deadP ? 'enemy' : 'player',
          reason: 'nocaute',
        },
        events,
      );
      return;
    }

    room.turn += 1;
    this.armTurnTimer(room);
    for (const key of ['player', 'enemy'] as const) {
      this.emitter.emitToUser(room.players[key].userId, 'battle:round', {
        battleId: room.id,
        turn: room.turn,
        deadline: room.deadline,
        events: this.viewEvents(events, key),
        you: this.combatantView(room, key, false),
        foe: this.combatantView(room, this.otherKey(key), false),
      });
    }
  }

  // ── Fim da batalha ────────────────────────────────────────────────────────

  private async finish(
    room: Room,
    outcome: {
      status: 'finished' | 'abandoned';
      winnerKey: CombatantKey | null;
      reason: string;
    },
    events: BattleEvent[] = [],
  ): Promise<void> {
    room.phase = 'done';
    this.clearTimer(room);
    const winner = outcome.winnerKey ? room.players[outcome.winnerKey] : null;

    await this.prisma.battle.update({
      where: { id: room.id },
      data: {
        status: outcome.status,
        winnerId: winner?.userId ?? null,
        finishedAt: new Date(),
      },
    });

    // Elo: nocaute/empate e abandono unilateral pontuam. Abandono DUPLO não —
    // ninguém jogou de verdade (mas o cooldown fica consumido, por design).
    let ratings: RatingOutcome | null = null;
    if (outcome.status === 'finished' || winner) {
      ratings = await this.ratings.applyResult(
        room.id,
        room.players.player.userId,
        room.players.enemy.userId,
        winner?.userId ?? null,
      );
    }

    for (const key of ['player', 'enemy'] as const) {
      const me = room.players[key];
      const myRating = ratings
        ? key === 'player'
          ? {
              delta: ratings.deltaA,
              rating: ratings.ratingA,
              tier: ratings.tierA,
            }
          : {
              delta: ratings.deltaB,
              rating: ratings.ratingB,
              tier: ratings.tierB,
            }
        : null;
      this.emitter.emitToUser(me.userId, 'battle:end', {
        battleId: room.id,
        events: this.viewEvents(events, key),
        result: !winner ? 'draw' : winner.key === key ? 'win' : 'loss',
        reason: outcome.reason,
        rating: myRating,
        you: this.combatantView(room, key, false),
        foe: this.combatantView(room, this.otherKey(key), false),
      });
    }
    // Métrica de engajamento, registrada no servidor: a batalha vale muitos
    // pontos e o resultado é conhecido aqui, não no cliente. Abandono duplo não
    // conta — ninguém jogou de verdade.
    if (outcome.status === 'finished' || winner) {
      const occurredAt = new Date();
      for (const key of ['player', 'enemy'] as const) {
        const me = room.players[key];
        const eventos: Parameters<MetricsService['record']>[2] = [
          {
            type: 'battle_finished',
            occurredAt,
            metadata: { battleId: room.id, turns: room.turn },
          },
        ];
        if (winner?.userId === me.userId) {
          eventos.push({ type: 'battle_won', occurredAt });
        }
        this.metrics.record(me.userId, null, eventos);
      }
    }

    // Linha de auditoria: com a dupla, horários e deltas dá para investigar
    // padrões de win trading além do cooldown (mesma dupla alternando etc.).
    this.logger.log(
      JSON.stringify({
        audit: 'battle_end',
        battleId: room.id,
        pair: pairKeyOf(room.players.player.userId, room.players.enemy.userId),
        status: outcome.status,
        reason: outcome.reason,
        winner: winner?.userId ?? null,
        turns: room.turn,
        deltas: ratings ? { a: ratings.deltaA, b: ratings.deltaB } : null,
      }),
    );
    this.close(room);
  }

  /** Snapshot para reconexão no meio da batalha (null = sem sala). */
  resync(userId: string): unknown {
    const room = this.roomOf(userId);
    if (!room || room.phase === 'done') return null;
    const me = this.slotOf(room, userId);
    const foe = room.players[this.otherKey(me.key)];

    if (room.phase === 'picking') {
      return {
        battleId: room.id,
        phase: 'picking',
        opponent: { id: foe.userId, name: foe.name },
        deadline: room.deadline,
        youPicked: !!me.professor,
        foePicked: !!foe.professor,
      };
    }
    return {
      battleId: room.id,
      phase: 'active',
      opponent: { id: foe.userId, name: foe.name },
      turn: room.turn,
      deadline: room.deadline,
      youMoved: !!room.pending[me.key],
      foeMoved: !!room.pending[foe.key],
      you: this.combatantView(room, me.key, true),
      foe: { name: foe.name, ...this.combatantView(room, foe.key, false) },
    };
  }

  // ── Auxiliares ────────────────────────────────────────────────────────────

  private armTurnTimer(room: Room): void {
    room.deadline = Date.now() + TURN_TIMEOUT_MS;
    room.timer = setTimeout(() => this.onTurnTimeout(room), TURN_TIMEOUT_MS);
  }

  /**
   * Visão de um combatente. `withMoves` só para o DONO (o moveset do oponente
   * não é segredo absoluto, mas não dar de graça dificulta ferramentas de
   * auxílio). O professor do oponente só é revelado com a batalha ativa.
   */
  private combatantView(room: Room, key: CombatantKey, withMoves: boolean) {
    const slot = room.players[key];
    const c = room.state?.[key];
    if (!c) return null;
    return {
      userId: slot.userId,
      professor: slot.professor,
      types: c.types,
      hp: c.hp,
      maxHp: c.maxHp,
      status: statusLabel(c.status),
      ...(withMoves ? { moves: slot.moves } : {}),
    };
  }

  /** Espelha a perspectiva: para o convidado (enemy), 'player' é o rival. */
  private viewEvents(
    events: BattleEvent[],
    recipient: CombatantKey,
  ): BattleEvent[] {
    if (recipient === 'player') return events;
    const flip = (t: CombatantKey): CombatantKey =>
      t === 'player' ? 'enemy' : 'player';
    return events.map((ev) =>
      'target' in ev ? { ...ev, target: flip(ev.target) } : ev,
    );
  }

  private otherKey(key: CombatantKey): CombatantKey {
    return key === 'player' ? 'enemy' : 'player';
  }

  private roomOf(userId: string): Room | null {
    const id = this.roomByUser.get(userId);
    return id ? (this.rooms.get(id) ?? null) : null;
  }

  private slotOf(room: Room, userId: string): RoomPlayer {
    return room.players.player.userId === userId
      ? room.players.player
      : room.players.enemy;
  }

  private emitToOther(
    room: Room,
    from: CombatantKey,
    event: string,
    payload: unknown,
  ) {
    this.emitter.emitToUser(
      room.players[this.otherKey(from)].userId,
      event,
      payload,
    );
  }

  private broadcast(room: Room, event: string, payload: unknown): void {
    for (const key of ['player', 'enemy'] as const) {
      this.emitter.emitToUser(room.players[key].userId, event, payload);
    }
  }

  private clearTimer(room: Room): void {
    if (room.timer) clearTimeout(room.timer);
    room.timer = undefined;
  }

  private close(room: Room): void {
    this.clearTimer(room);
    const userIds = [room.players.player.userId, room.players.enemy.userId];
    this.rooms.delete(room.id);
    for (const id of userIds) {
      if (this.roomByUser.get(id) === room.id) this.roomByUser.delete(id);
    }
    this.emitter.onRoomClosed(userIds);
  }
}
