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
import {
  Action,
  benchCombatant,
  hasAlive,
  isAlive,
  MAX_TEAM_SIZE,
  nextAliveIndex,
  ownMemberView,
  publicMemberView,
  teamHp,
  TeamMember,
} from './team';

/**
 * Um prazo só para todas as fases (seleção, preview/lead, turno, entrada após
 * nocaute). Constantes diferentes por fase seriam mais um número para o jogador
 * decorar e para o teste cobrir, sem ganho.
 */
export const PHASE_TIMEOUT_MS = 60 * 1000;

/**
 * Fases seguidas sem agir = abandono. O contador é ÚNICO por jogador: deixar o
 * lead expirar, não escolher quem entra e não escolher golpe somam na mesma
 * conta, e qualquer ação válida zera. Quem some do jogo sai por aqui.
 */
export const MAX_MISSED_PHASES = 3;

/**
 * Teto de turnos. Trocar não consome recurso (o motor não tem PP), então dois
 * jogadores podem trocar para sempre — e a sala vive em memória, numa instância
 * só. No teto vence quem tiver mais HP somado; empate se igual.
 */
export const MAX_TURNS = 40;

type RoomPhase = 'picking' | 'preview' | 'active' | 'switching' | 'done';

interface RoomPlayer {
  userId: string;
  name: string;
  key: CombatantKey; // 'player' = quem convidou (A) · 'enemy' = convidado (B)
  /** Até 3 exemplares, na ordem de seleção — que é o fallback de tudo. */
  team: TeamMember[];
  activeIndex: number;
  /** Escolhido na fase de preview; até lá, indefinido. */
  leadCaptureId?: string;
  /** Está devendo escolher quem entra (fase `switching`). */
  owesEntry: boolean;
  /** Confirmação em voo: fecha a janela entre o `await` do banco e o time. */
  picking?: boolean;
  missedPhases: number;
}

interface Room {
  id: string;
  phase: RoomPhase;
  players: Record<CombatantKey, RoomPlayer>;
  state?: BattleState;
  pending: Partial<Record<CombatantKey, Action>>;
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
 * Ack da ação do turno. Carrega o turno em que ela foi ACEITA — que não é
 * necessariamente `room.turn` quando o ack chega ao cliente, porque esta mesma
 * ação pode ter fechado a rodada e virado o turno. Ver `submit()`.
 */
type ActionAck = { ok: true; turn: number } | { ok: false; message: string };

/**
 * Salas de batalha PvP — estado em memória, timers no servidor, resultado no
 * banco. O motor (engine/) resolve as rodadas; as regras de time vivem em
 * `team.ts`. Aqui fica a máquina de estados da SALA:
 *
 *   picking ──▶ preview ──▶ active ⇄ switching ──▶ done
 *
 * Cada jogador leva ATÉ 3 exemplares e os times podem ter tamanhos diferentes —
 * não há compensação para quem leva menos: ter mais exemplares é a vantagem que
 * paga a captura, que é o ponto do evento.
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
      // `active` e `switching` são a mesma batalha em andamento: as duas têm
      // linha no banco e precisam ser anuladas.
      if (room.phase === 'active' || room.phase === 'switching') {
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
    const slot = (
      p: { userId: string; name: string },
      key: CombatantKey,
    ): RoomPlayer => ({
      ...p,
      key,
      team: [],
      activeIndex: 0,
      owesEntry: false,
      missedPhases: 0,
    });

    const room: Room = {
      id: randomUUID(),
      phase: 'picking',
      players: {
        player: slot(inviter, 'player'),
        enemy: slot(invitee, 'enemy'),
      },
      pending: {},
      turn: 0,
      deadline: Date.now() + PHASE_TIMEOUT_MS,
    };
    room.timer = setTimeout(() => this.onPickTimeout(room), PHASE_TIMEOUT_MS);

    this.rooms.set(room.id, room);
    this.roomByUser.set(inviter.userId, room.id);
    this.roomByUser.set(invitee.userId, room.id);
    return { battleId: room.id, pickDeadline: room.deadline };
  }

  // ── Seleção do time (às cegas) ────────────────────────────────────────────

  /**
   * Confirma o time: de 1 a 3 exemplares, na ordem em que o jogador quer.
   *
   * A trava de repetição é por `captureId`, não por professor: dois exemplares
   * do mesmo professor são personagens diferentes (tipos, deck e IVs próprios),
   * então levar dois Erons é legítimo — levar o MESMO Eron duas vezes não é.
   */
  async pickTeam(userId: string, captureIds: string[]): Promise<Ack> {
    const room = this.roomOf(userId);
    if (!room || room.phase !== 'picking') {
      return { ok: false, message: 'Não há seleção em andamento.' };
    }
    const me = this.slotOf(room, userId);
    // `me.team` só é preenchido DEPOIS da consulta ao banco, e entre o `await`
    // e a atribuição cabe uma segunda mensagem do mesmo socket (toque duplo,
    // cliente reenviando, script). As duas passariam por aqui, as duas
    // emitiriam `battle:pick:opponent` e as duas poderiam disparar o preview.
    // A trava precisa ser marcada antes do await.
    if (me.picking || me.team.length) {
      return { ok: false, message: 'Você já escolheu.' };
    }

    if (!Array.isArray(captureIds) || captureIds.length === 0) {
      return { ok: false, message: 'Escolha pelo menos um professor.' };
    }
    if (captureIds.length > MAX_TEAM_SIZE) {
      return {
        ok: false,
        message: `Seu time pode ter no máximo ${MAX_TEAM_SIZE} professores.`,
      };
    }
    if (new Set(captureIds).size !== captureIds.length) {
      return {
        ok: false,
        message: 'O mesmo exemplar não pode entrar duas vezes no time.',
      };
    }

    // Só vale exemplar CAPTURADO pelo próprio usuário — validação no banco,
    // nunca no cliente. O `userId` no where é o que impede levar para a arena
    // o exemplar de outra pessoa.
    me.picking = true;
    const captures = await this.prisma.capture
      .findMany({
        where: { id: { in: captureIds }, userId },
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
      })
      .catch((error: Error) => {
        // Banco fora do ar não pode deixar o jogador travado sem poder tentar
        // de novo até o timeout da fase.
        this.logger.error(`Falha buscando capturas de ${userId}`, error);
        return null;
      });

    if (captures === null) {
      me.picking = false;
      return {
        ok: false,
        message: 'Não deu para confirmar o time. Tente de novo.',
      };
    }
    if (captures.length !== captureIds.length) {
      me.picking = false;
      return {
        ok: false,
        message: 'Você só pode usar professores que capturou.',
      };
    }

    // A ordem do PEDIDO é a do time — `findMany` não garante ordem, e essa
    // ordem é o fallback do lead e da entrada após nocaute.
    const byId = new Map(captures.map((c) => [c.id, c]));
    me.team = captureIds.map((id) => {
      const capture = byId.get(id)!;
      // Tipos e deck vêm gravados na captura. O fallback cobre exemplares
      // anteriores a este modelo, que o seed ainda não corrigiu.
      const types = capture.variant?.types?.length
        ? capture.variant.types
        : typesForProfessor(capture.professor);
      const moves = capture.moves
        .map((moveId) => getMoveById(moveId))
        .filter((move): move is Move => move !== null);
      const ivs = {
        ivHp: capture.ivHp,
        ivRigor: capture.ivRigor,
        ivDidatica: capture.ivDidatica,
        ivRaciocinio: capture.ivRaciocinio,
      };
      return {
        captureId: capture.id,
        professor: capture.professor,
        types,
        moves: moves.length ? moves : buildMoveset(types),
        ivs,
        combatant: createCombatant({
          name: capture.professor.name,
          types,
          moves: moves.length ? moves : buildMoveset(types),
          ivs,
        }),
      };
    });

    me.missedPhases = 0;
    // O oponente sabe QUE você escolheu, nunca O QUÊ (pick às cegas).
    this.emitToOther(room, me.key, 'battle:pick:opponent', {});

    if (room.players.player.team.length && room.players.enemy.team.length) {
      this.toPreview(room);
    }
    return { ok: true };
  }

  /**
   * Timeout da seleção: vale o que foi confirmado.
   *
   * O formato já aceita times de tamanhos diferentes, então cancelar a partida
   * de quem foi lento seria punir por uma regra que não existe. Só cancela
   * quando alguém não escolheu NADA — aí não há batalha para começar, e nem
   * pontos nem cooldown são consumidos (ninguém é punido na preparação).
   */
  private onPickTimeout(room: Room): void {
    if (room.phase !== 'picking') return;
    const vazios = (['player', 'enemy'] as const).filter(
      (key) => room.players[key].team.length === 0,
    );
    if (vazios.length) {
      for (const key of vazios) room.players[key].missedPhases += 1;
      this.broadcast(room, 'battle:cancelled', { reason: 'pick_timeout' });
      this.close(room);
      return;
    }
    this.toPreview(room);
  }

  // ── Team preview e escolha do lead ────────────────────────────────────────

  /**
   * Revela os dois times e pede o lead.
   *
   * O preview vem DEPOIS de os dois confirmarem — é por isso que ele não
   * devolve o counter-pick que a seleção às cegas existe para impedir. E o lead
   * é escolhido depois de ver o time do adversário: sem isso o preview seria
   * informação que não dá para usar, o pior dos dois mundos.
   */
  private toPreview(room: Room): void {
    this.clearTimer(room);
    room.phase = 'preview';
    this.armTimer(room, () => this.onPreviewTimeout(room));

    for (const key of ['player', 'enemy'] as const) {
      const me = room.players[key];
      const foe = room.players[this.otherKey(key)];
      this.emitter.emitToUser(me.userId, 'battle:preview', {
        battleId: room.id,
        deadline: room.deadline,
        // O seu time leva `captureId` porque é com ele que você escolhe o lead.
        // O do adversário não leva — nem IVs, nem golpes.
        you: { team: me.team.map(ownMemberView) },
        foe: { name: foe.name, team: foe.team.map(publicMemberView) },
      });
    }
  }

  /** Quem entra primeiro. Às cegas: o adversário só sabe que você escolheu. */
  async chooseLead(userId: string, captureId: string): Promise<Ack> {
    const room = this.roomOf(userId);
    if (!room || room.phase !== 'preview') {
      return { ok: false, message: 'Não há seleção em andamento.' };
    }
    const me = this.slotOf(room, userId);
    if (me.leadCaptureId) return { ok: false, message: 'Você já escolheu.' };

    const index = me.team.findIndex((m) => m.captureId === captureId);
    if (index < 0) {
      return { ok: false, message: 'Esse professor não está no seu time.' };
    }

    me.leadCaptureId = captureId;
    me.activeIndex = index;
    me.missedPhases = 0;
    this.emitToOther(room, me.key, 'battle:lead:opponent', {});

    if (room.players.player.leadCaptureId && room.players.enemy.leadCaptureId) {
      await this.begin(room);
    }
    return { ok: true };
  }

  private onPreviewTimeout(room: Room): void {
    if (room.phase !== 'preview') return;
    for (const key of ['player', 'enemy'] as const) {
      const slot = room.players[key];
      if (slot.leadCaptureId) continue;
      // Fallback: o primeiro da ordem de seleção. A partida anda de qualquer
      // jeito; quem não escolheu leva uma falta no contador de abandono.
      slot.activeIndex = 0;
      slot.leadCaptureId = slot.team[0].captureId;
      slot.missedPhases += 1;
    }
    void this.begin(room).catch((error: unknown) =>
      this.logger.error(`Falha iniciando ${room.id}`, error as Error),
    );
  }

  // ── Início da batalha ─────────────────────────────────────────────────────

  private async begin(room: Room): Promise<void> {
    this.clearTimer(room);
    room.phase = 'active';
    room.turn = 1;
    room.state = {
      player: this.activeOf(room, 'player').combatant,
      enemy: this.activeOf(room, 'enemy').combatant,
    };

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
        status: 'active',
        slots: {
          create: (['player', 'enemy'] as const).flatMap((key) =>
            room.players[key].team.map((m, i) => ({
              side: key === 'player' ? 'a' : 'b',
              slot: i,
              captureId: m.captureId,
              professorId: m.professor.id,
              lead: i === room.players[key].activeIndex,
            })),
          ),
        },
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
        you: this.sideView(room, key, true),
        foe: {
          name: foe.name,
          ...this.sideView(room, this.otherKey(key), false),
        },
      });
    }
    this.logger.log(
      `Batalha ${room.id}: ${this.describeTeam(room, 'player')} vs ${this.describeTeam(room, 'enemy')}`,
    );
  }

  // ── Turnos simultâneos ────────────────────────────────────────────────────

  /** Golpe do turno. Alternativa a `switchTo` — uma ação por turno, nunca as duas. */
  move(userId: string, moveId: string): ActionAck {
    return this.submit(userId, (me) =>
      me.team[me.activeIndex].moves.some((m) => m.id === moveId)
        ? { kind: 'move', moveId }
        : 'Esse golpe não está no seu conjunto.',
    );
  }

  /**
   * Troca do turno. Quem entra COME o golpe do adversário: é esse custo que faz
   * a troca ser uma decisão, e não a jogada certa em todo turno.
   */
  switchTo(userId: string, captureId: string): ActionAck {
    return this.submit(userId, (me) => {
      const index = me.team.findIndex((m) => m.captureId === captureId);
      if (index < 0) return 'Esse professor não está no seu time.';
      if (index === me.activeIndex) return 'Esse professor já está em campo.';
      if (!isAlive(me.team[index])) return 'Esse professor já caiu.';
      return { kind: 'switch', captureId };
    });
  }

  private submit(
    userId: string,
    build: (me: RoomPlayer) => Action | string,
  ): ActionAck {
    const room = this.roomOf(userId);
    if (!room) return { ok: false, message: 'Nenhuma batalha em andamento.' };
    if (room.phase === 'switching') {
      return { ok: false, message: 'Escolha quem entra primeiro.' };
    }
    if (room.phase !== 'active') {
      return { ok: false, message: 'Nenhuma batalha em andamento.' };
    }
    const me = this.slotOf(room, userId);
    if (room.pending[me.key]) {
      return { ok: false, message: 'Você já escolheu neste turno.' };
    }

    const action = build(me);
    if (typeof action === 'string') return { ok: false, message: action };

    // Guardado ANTES de resolver: se esta ação fechar a rodada, `resolveRound`
    // incrementa `room.turn` ainda dentro desta chamada, e o ack sairia
    // carimbado com o turno seguinte — justamente o que o cliente usa para
    // decidir se o ack ainda vale.
    const turn = room.turn;

    room.pending[me.key] = action;
    me.missedPhases = 0;
    // O oponente sabe que você agiu, nunca se foi golpe ou troca — saber que
    // vem uma troca entregaria a leitura do turno.
    this.emitToOther(room, me.key, 'battle:move:opponent', {});

    if (room.pending.player && room.pending.enemy) {
      // Atenção: isto emite `battle:round` de forma SÍNCRONA, ou seja, antes
      // de o ack abaixo ser enviado. Para quem age em segundo, o cliente
      // recebe a rodada nova e só depois a confirmação da própria ação — por
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
      if (!room.pending[key]) room.players[key].missedPhases += 1;
    }
    const abandonedP = room.players.player.missedPhases >= MAX_MISSED_PHASES;
    const abandonedE = room.players.enemy.missedPhases >= MAX_MISSED_PHASES;
    if (abandonedP || abandonedE) {
      await this.finish(room, {
        status: 'abandoned',
        winnerKey:
          abandonedP && abandonedE ? null : abandonedP ? 'enemy' : 'player',
        reason: 'abandono',
      });
      return;
    }

    const events: BattleEvent[] = [];

    // 1. As trocas resolvem ANTES de qualquer golpe, independente de
    //    Raciocínio — é o padrão que o jogador reconhece, e é o que dá custo
    //    real à troca: o que entra fica exposto ao ataque do adversário.
    for (const key of ['player', 'enemy'] as const) {
      const action = room.pending[key];
      if (action?.kind !== 'switch') continue;
      events.push(...this.applySwitch(room, key, action.captureId));
    }

    // 2. Se os DOIS trocaram, ninguém ataca — a rodada foi de reposicionamento.
    const golpes = (['player', 'enemy'] as const).filter(
      (key) => room.pending[key]?.kind === 'move',
    );
    if (golpes.length) {
      const moveOf = (key: CombatantKey): Move | null => {
        const action = room.pending[key];
        if (action?.kind !== 'move') return null;
        return (
          room.players[key].team[room.players[key].activeIndex].moves.find(
            (m) => m.id === action.moveId,
          ) ?? null
        );
      };

      const order = turnOrder(state, moveOf('player'), moveOf('enemy'));
      for (const entry of order) {
        if (state.player.hp <= 0 || state.enemy.hp <= 0) break;
        // Quem trocou não passa por upkeep: ele gastou o turno na troca e o
        // exemplar que entrou está fresco em campo.
        if (room.pending[entry.key]?.kind === 'switch') continue;
        const up = upkeep(state, entry.key);
        events.push(...up.events);
        if (state.player.hp <= 0 || state.enemy.hp <= 0) break;
        if (!up.canAct) continue;
        if (entry.move) {
          events.push(...performMove(state, entry.key, entry.move));
        } else {
          events.push({
            type: 'message',
            text: `${state[entry.key].name} não escolheu a tempo e perdeu o turno!`,
          });
        }
      }
    }

    room.pending = {};

    // 3. Nocaute: quem caiu sai de campo. Só acaba a batalha quando um lado
    //    fica sem ninguém em pé.
    const caidos = (['player', 'enemy'] as const).filter(
      (key) => state[key].hp <= 0,
    );
    if (caidos.length) {
      for (const key of caidos) benchCombatant(state[key]);
      const semTime = caidos.filter((key) => !hasAlive(room.players[key].team));
      if (semTime.length) {
        await this.finish(
          room,
          {
            status: 'finished',
            winnerKey: semTime.length === 2 ? null : this.otherKey(semTime[0]),
            reason: 'nocaute',
          },
          events,
        );
        return;
      }
      this.toSwitching(room, caidos, events);
      return;
    }

    // 4. Teto de turnos: sem ele, dois jogadores trocando para sempre deixam a
    //    sala aberta em memória indefinidamente.
    if (room.turn >= MAX_TURNS) {
      const hpP = teamHp(room.players.player.team);
      const hpE = teamHp(room.players.enemy.team);
      events.push({
        type: 'message',
        text: `Limite de ${MAX_TURNS} turnos! Vence quem tem mais vida somada.`,
      });
      await this.finish(
        room,
        {
          status: 'finished',
          winnerKey: hpP === hpE ? null : hpP > hpE ? 'player' : 'enemy',
          reason: 'limite_de_turnos',
        },
        events,
      );
      return;
    }

    room.turn += 1;
    this.armTurnTimer(room);
    this.broadcastRound(room, 'battle:round', events);
  }

  /** Aplica uma troca e devolve o evento que a UI anima. */
  private applySwitch(
    room: Room,
    key: CombatantKey,
    captureId: string,
  ): BattleEvent[] {
    const slot = room.players[key];
    const index = slot.team.findIndex((m) => m.captureId === captureId);
    if (index < 0 || index === slot.activeIndex || !isAlive(slot.team[index])) {
      return []; // já validado no `switchTo`; aqui é só defesa
    }
    const sai = slot.team[slot.activeIndex];
    benchCombatant(sai.combatant);
    slot.activeIndex = index;
    const entra = slot.team[index];
    room.state![key] = entra.combatant;
    return [
      { type: 'switch', target: key, name: entra.professor.name },
      {
        type: 'message',
        text: `${sai.professor.name} volta! ${entra.professor.name} entra em campo!`,
      },
    ];
  }

  // ── Entrada após nocaute ──────────────────────────────────────────────────

  /**
   * Pausa a rodada para quem perdeu o ativo escolher o substituto.
   *
   * O nocaute é onde a decisão pesa: entrada forçada faria metade das partidas
   * ser decidida na seleção. O fallback por tempo garante que ninguém trave a
   * batalha do outro.
   */
  private toSwitching(
    room: Room,
    caidos: CombatantKey[],
    events: BattleEvent[],
  ): void {
    room.phase = 'switching';
    for (const key of caidos) room.players[key].owesEntry = true;
    this.armTimer(room, () => this.onSwitchingTimeout(room));

    for (const key of ['player', 'enemy'] as const) {
      const me = room.players[key];
      this.emitter.emitToUser(me.userId, 'battle:faint', {
        battleId: room.id,
        deadline: room.deadline,
        // Quem não deve entrada recebe o evento mesmo assim, para a tela poder
        // mostrar "o adversário está escolhendo…" em vez de congelar.
        youChoose: me.owesEntry,
        events: this.viewEvents(events, key),
        you: this.sideView(room, key, true),
        foe: this.sideView(room, this.otherKey(key), false),
      });
    }
  }

  /** Quem entra no lugar de quem caiu. */
  enterWith(userId: string, captureId: string): Ack {
    const room = this.roomOf(userId);
    if (!room || room.phase !== 'switching') {
      return { ok: false, message: 'Não há substituição em andamento.' };
    }
    const me = this.slotOf(room, userId);
    if (!me.owesEntry)
      return { ok: false, message: 'Você não precisa trocar.' };

    const index = me.team.findIndex((m) => m.captureId === captureId);
    if (index < 0) {
      return { ok: false, message: 'Esse professor não está no seu time.' };
    }
    if (!isAlive(me.team[index])) {
      return { ok: false, message: 'Esse professor já caiu.' };
    }

    me.activeIndex = index;
    me.owesEntry = false;
    me.missedPhases = 0;
    room.state![me.key] = me.team[index].combatant;

    if (!this.someoneOwesEntry(room)) this.resumeAfterSwitching(room);
    return { ok: true };
  }

  private onSwitchingTimeout(room: Room): void {
    if (room.phase !== 'switching') return;
    for (const key of ['player', 'enemy'] as const) {
      const slot = room.players[key];
      if (!slot.owesEntry) continue;
      const index = nextAliveIndex(slot.team, slot.activeIndex);
      if (index < 0) continue; // não deveria acontecer: a batalha teria acabado
      slot.activeIndex = index;
      slot.owesEntry = false;
      slot.missedPhases += 1;
      room.state![key] = slot.team[index].combatant;
    }
    this.resumeAfterSwitching(room);
  }

  private someoneOwesEntry(room: Room): boolean {
    return (['player', 'enemy'] as const).some(
      (key) => room.players[key].owesEntry,
    );
  }

  private resumeAfterSwitching(room: Room): void {
    this.clearTimer(room);
    // Abandono também vale aqui: quem deixou a entrada expirar três vezes some
    // do jogo do mesmo jeito que quem não escolhe golpe.
    const abandonedP = room.players.player.missedPhases >= MAX_MISSED_PHASES;
    const abandonedE = room.players.enemy.missedPhases >= MAX_MISSED_PHASES;
    if (abandonedP || abandonedE) {
      void this.finish(room, {
        status: 'abandoned',
        winnerKey:
          abandonedP && abandonedE ? null : abandonedP ? 'enemy' : 'player',
        reason: 'abandono',
      }).catch((error: unknown) =>
        this.logger.error(`Falha encerrando ${room.id}`, error as Error),
      );
      return;
    }

    room.phase = 'active';
    room.pending = {};
    room.turn += 1;
    this.armTurnTimer(room);
    const entrou = (['player', 'enemy'] as const).map(
      (key) => this.activeOf(room, key).professor.name,
    );
    this.broadcastRound(room, 'battle:round', [
      { type: 'message', text: `${entrou.join(' e ')} em campo!` },
    ]);
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

    const caidos = (['player', 'enemy'] as const).flatMap((key) =>
      room.players[key].team.filter((m) => !isAlive(m)).map((m) => m.captureId),
    );
    await this.prisma.$transaction([
      this.prisma.battle.update({
        where: { id: room.id },
        data: {
          status: outcome.status,
          winnerId: winner?.userId ?? null,
          finishedAt: new Date(),
        },
      }),
      // Quem sobreviveu é metade da leitura do painel ("qual professor aguenta
      // mais"), e ela some se o slot não registrar o desfecho.
      this.prisma.battleSlot.updateMany({
        where: { battleId: room.id, captureId: { in: caidos } },
        data: { fainted: true },
      }),
    ]);

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
        you: this.sideView(room, key, true),
        foe: this.sideView(room, this.otherKey(key), false),
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
        teams: {
          a: room.players.player.team.length,
          b: room.players.enemy.team.length,
        },
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
    const base = {
      battleId: room.id,
      phase: room.phase,
      opponent: { id: foe.userId, name: foe.name },
      deadline: room.deadline,
    };

    if (room.phase === 'picking') {
      return {
        ...base,
        youPicked: me.team.length > 0,
        foePicked: foe.team.length > 0,
      };
    }
    if (room.phase === 'preview') {
      return {
        ...base,
        you: { team: me.team.map(ownMemberView) },
        foe: { name: foe.name, team: foe.team.map(publicMemberView) },
        youPicked: !!me.leadCaptureId,
        foePicked: !!foe.leadCaptureId,
      };
    }
    return {
      ...base,
      turn: room.turn,
      youChoose: me.owesEntry,
      youMoved: !!room.pending[me.key],
      foeMoved: !!room.pending[foe.key],
      you: this.sideView(room, me.key, true),
      foe: { name: foe.name, ...this.sideView(room, foe.key, false) },
    };
  }

  // ── Auxiliares ────────────────────────────────────────────────────────────

  private armTimer(room: Room, onTimeout: () => void): void {
    room.deadline = Date.now() + PHASE_TIMEOUT_MS;
    room.timer = setTimeout(onTimeout, PHASE_TIMEOUT_MS);
  }

  private armTurnTimer(room: Room): void {
    this.armTimer(room, () => this.onTurnTimeout(room));
  }

  private activeOf(room: Room, key: CombatantKey): TeamMember {
    const slot = room.players[key];
    return slot.team[slot.activeIndex];
  }

  /**
   * Visão de um lado: o exemplar em campo mais o time inteiro (para a HUD dos
   * reservas). `own` só para o DONO — é o que carrega os golpes e o `captureId`.
   *
   * O time do adversário já foi revelado no preview, então esconder o HP dos
   * reservas dele não criaria segredo: só obrigaria o jogador a memorizar o
   * que viu em campo.
   */
  private sideView(room: Room, key: CombatantKey, own: boolean) {
    const slot = room.players[key];
    const active = slot.team[slot.activeIndex];
    if (!active) return null;
    const c = active.combatant;
    return {
      userId: slot.userId,
      professor: active.professor,
      types: c.types,
      hp: Math.max(0, c.hp),
      maxHp: c.maxHp,
      status: statusLabel(c.status),
      activeCaptureId: own ? active.captureId : undefined,
      team: slot.team.map(own ? ownMemberView : publicMemberView),
      ...(own ? { moves: active.moves } : {}),
    };
  }

  private describeTeam(room: Room, key: CombatantKey): string {
    return room.players[key].team.map((m) => m.professor.slug).join('/');
  }

  private broadcastRound(
    room: Room,
    event: string,
    events: BattleEvent[],
  ): void {
    for (const key of ['player', 'enemy'] as const) {
      this.emitter.emitToUser(room.players[key].userId, event, {
        battleId: room.id,
        turn: room.turn,
        deadline: room.deadline,
        events: this.viewEvents(events, key),
        you: this.sideView(room, key, true),
        foe: this.sideView(room, this.otherKey(key), false),
      });
    }
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
