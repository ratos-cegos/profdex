import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { chooseBotMove } from './engine/bot';
import {
  BattleEvent,
  BattleState,
  CombatantKey,
  createCombatant,
  DEFAULT_MAX_HP,
  performMove,
  statusLabel,
  turnOrder,
  upkeep,
} from './engine/engine';
import { buildMoveset, getMoveById, Move } from './engine/moves';
import { PUBLIC_PROFESSOR_SELECT } from '../professors/public-professor.select';
import { fraseDaAbertura } from './raid-opening';
import { RaidService } from './raid.service';
import {
  Action,
  benchCombatant,
  hasAlive,
  isAlive,
  MAX_TEAM_SIZE,
  nextAliveIndex,
  ownMemberView,
  publicMemberView,
  TeamMember,
} from './team';

/** Mesmo prazo de todas as fases do PvP: um número só para o aluno decorar. */
export const RAID_PHASE_TIMEOUT_MS = 60 * 1000;

/** Fases seguidas sem agir = abandono, exatamente como no ranqueado. */
export const RAID_MAX_MISSED_PHASES = 3;

type RaidPhase = 'picking' | 'preview' | 'active' | 'switching' | 'done';

/** O chefe é sempre o `enemy`; o aluno é sempre o `player`. */
const ALUNO: CombatantKey = 'player';
const CHEFE: CombatantKey = 'enemy';

interface RaidRoom {
  id: string;
  userId: string;
  name: string;
  phase: RaidPhase;
  team: TeamMember[];
  activeIndex: number;
  leadCaptureId?: string;
  owesEntry: boolean;
  picking?: boolean;
  missedPhases: number;
  boss: TeamMember;
  state?: BattleState;
  pending?: Action;
  turn: number;
  deadline: number;
  timer?: NodeJS.Timeout;
  /** Congelados no nascimento da sala — ver `SettingsService.raidRules`. */
  rules: { hpMultiplier: number; legendaryIv: number; turnCap: number };
  attemptId: string;
  attempts: number;
}

export interface RaidEmitter {
  emitToUser(userId: string, event: string, payload: unknown): void;
  onRoomClosed(userIds: string[]): void;
}

type Ack =
  | { ok: true; [k: string]: unknown }
  | { ok: false; message: string; code?: string };
type ActionAck = { ok: true; turn: number } | { ok: false; message: string };

/**
 * A raid: um aluno com até 3 exemplares contra o professor LENDÁRIO, que o
 * servidor joga.
 *
 *   picking ──▶ preview ──▶ active ⇄ switching ──▶ done
 *
 * É uma sala IRMÃ da do PvP, não uma generalização dela. `BattleRoomService`
 * nasceu para dois humanos — `roomByUser` com dois donos, `pairKey`, cooldown
 * de dupla, Elo, pick às cegas dos dois lados — e enfiar um bot lá dentro
 * significaria um `if (isBot)` em cada uma dessas. Aquele arquivo é o caminho
 * RANQUEADO, com 800 linhas de teste em cima e três bugs de ordem de emissão
 * já documentados: o risco de mexer nele não se paga (tarefa 18, decisão 1).
 *
 * O que é compartilhado de verdade está compartilhado: `engine/` resolve os
 * turnos, `team.ts` cuida de trocas e banco de reservas, e os eventos de socket
 * são os MESMOS do PvP — é por isso que o front reusa as duas telas. A única
 * diferença no contrato é um `mode: 'raid'` no `battle:begin`.
 *
 * Três regras que divergem do ranqueado, todas de propósito:
 * - **não há Elo** (PvE nunca ranqueou neste projeto);
 * - **no teto de turnos o chefe vence**, em vez de somar HP: contra um chefe,
 *   o tempo acabar significa que ele resistiu;
 * - **o chefe nunca troca** — ele é um só.
 */
@Injectable()
export class RaidRoomService implements OnModuleDestroy {
  private readonly rooms = new Map<string, RaidRoom>();
  private readonly roomByUser = new Map<string, string>();
  private readonly logger = new Logger(RaidRoomService.name);
  private emitter: RaidEmitter = {
    emitToUser: () => {},
    onRoomClosed: () => {},
  };

  constructor(
    private prisma: PrismaService,
    private raid: RaidService,
    private settings: SettingsService,
  ) {}

  configure(emitter: RaidEmitter): void {
    this.emitter = emitter;
  }

  hasActiveRoom(userId: string): boolean {
    return this.roomByUser.has(userId);
  }

  /**
   * Desligamento: a tentativa é ANULADA, e anulada não consome cooldown.
   *
   * O PvP anula por não ter como retomar a partida; aqui há um motivo a mais e
   * mais forte — fazer o aluno esperar 30 minutos por um deploy nosso seria
   * cobrar dele um erro que não é dele.
   */
  async onModuleDestroy(): Promise<void> {
    for (const room of [...this.rooms.values()]) {
      this.emitter.emitToUser(room.userId, 'battle:cancelled', {
        reason: 'server_shutdown',
      });
      if (room.phase !== 'picking') {
        await this.raid.closeAttempt(room.attemptId, 'anulada', room.turn);
      }
      this.close(room);
    }
  }

  // ── Início ────────────────────────────────────────────────────────────────

  /**
   * Abre a sala. Todas as checagens de elegibilidade acontecem AQUI, no
   * servidor: destravamento, captura anterior e cooldown. O cliente só pede.
   */
  async start(user: { userId: string; name: string }): Promise<Ack> {
    if (this.roomByUser.has(user.userId)) {
      return { ok: false, message: 'Você já está numa raid.' };
    }

    const permissao = await this.raid.canStart(user.userId);
    if (!permissao.ok) {
      return {
        ok: false,
        code: permissao.code,
        message: this.mensagemDaRecusa(permissao.code, permissao.retryAt),
      };
    }

    const legendary = permissao.legendary;
    const rules = await this.settings.raidRules();
    const types = legendary.variants[0]?.types?.length
      ? legendary.variants[0].types
      : legendary.types;
    const moves = buildMoveset(types);
    const iv = rules.legendaryIv;

    const boss: TeamMember = {
      captureId: `boss:${legendary.id}`,
      // O professor INTEIRO, como o PvP faz (`battle-room.service.ts`). Antes
      // isto era um literal com só id/slug/name, e o chefe chegava ao front sem
      // arte — que então caía na sprite padrão e mostrava o Gustavo no lugar do
      // lendário. A consulta já trazia tudo (`PUBLIC_PROFESSOR_SELECT`); era o
      // literal que jogava fora.
      professor: legendary,
      types,
      moves,
      ivs: { ivHp: iv, ivRigor: iv, ivDidatica: iv, ivRaciocinio: iv },
      combatant: createCombatant({
        name: legendary.name,
        types,
        moves,
        ivs: { ivHp: iv, ivRigor: iv, ivDidatica: iv, ivRaciocinio: iv },
        // O `maxHp` explícito SUBSTITUI a fórmula de IV do motor — por isso o
        // chefe tem 4×120 e não 4×125. É o único ponto da raid que o motor
        // precisou aceitar, e ele já aceitava desde sempre.
        maxHp: DEFAULT_MAX_HP * rules.hpMultiplier,
      }),
    };

    const attemptId = await this.raid.openAttempt(user.userId, legendary.id);
    const attempts = await this.prisma.raidAttempt.count({
      where: { userId: user.userId },
    });

    const room: RaidRoom = {
      id: randomUUID(),
      userId: user.userId,
      name: user.name,
      phase: 'picking',
      team: [],
      activeIndex: 0,
      owesEntry: false,
      missedPhases: 0,
      boss,
      turn: 0,
      deadline: Date.now() + RAID_PHASE_TIMEOUT_MS,
      rules,
      attemptId,
      attempts,
    };
    room.timer = setTimeout(
      () => this.onPickTimeout(room),
      RAID_PHASE_TIMEOUT_MS,
    );

    this.rooms.set(room.id, room);
    this.roomByUser.set(user.userId, room.id);

    this.emitter.emitToUser(user.userId, 'battle:start', {
      battleId: room.id,
      mode: 'raid',
      pickDeadline: room.deadline,
      // O nome do chefe aparece AQUI e não antes: quem chegou a abrir a sala já
      // destravou a raid, então não há mais o que esconder dele. O segredo que
      // a Profdex guarda é para quem ainda não chegou.
      opponent: { id: legendary.id, name: legendary.name },
    });
    this.logger.log(`Raid ${room.id}: ${user.userId} vs ${legendary.slug}`);
    return { ok: true, battleId: room.id };
  }

  private mensagemDaRecusa(code: string, retryAt?: number): string {
    if (code === 'RAID_SEM_LENDARIO') return 'Não há raid disponível agora.';
    if (code === 'RAID_FECHADA') {
      return `A raid do lendário abre ${fraseDaAbertura(retryAt ?? Date.now())}.`;
    }
    if (code === 'RAID_BLOQUEADA') {
      return 'Complete a Profdex para desafiar o lendário.';
    }
    if (code === 'RAID_JA_CAPTURADO') return 'Você já capturou o lendário.';
    if (code === 'RAID_EM_COOLDOWN') {
      const minutos = Math.max(
        1,
        Math.ceil(((retryAt ?? Date.now()) - Date.now()) / 60_000),
      );
      return `Aguarde ${minutos} min para tentar de novo.`;
    }
    return 'Não foi possível iniciar a raid.';
  }

  // ── Seleção do time ───────────────────────────────────────────────────────

  /**
   * Confirma o time: 1 a 3 exemplares. As mesmas regras do PvP, e de propósito
   * — exigir exatamente 3 seria um caminho de validação divergente para
   * impedir algo que só prejudica quem faz (tarefa 18, decisão 10).
   */
  async pickTeam(userId: string, captureIds: string[]): Promise<Ack> {
    const room = this.roomOf(userId);
    if (!room || room.phase !== 'picking') {
      return { ok: false, message: 'Não há seleção em andamento.' };
    }
    // Trava ANTES do await, pelo mesmo motivo do PvP: dois toques no botão
    // passariam os dois por aqui e os dois disparariam a fase seguinte.
    if (room.picking || room.team.length) {
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

    room.picking = true;
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
          professor: { select: PUBLIC_PROFESSOR_SELECT },
          variant: { select: { types: true } },
        },
      })
      .catch((error: Error) => {
        this.logger.error(`Falha buscando capturas de ${userId}`, error);
        return null;
      });

    if (captures === null) {
      room.picking = false;
      return {
        ok: false,
        message: 'Não deu para confirmar o time. Tente de novo.',
      };
    }
    if (captures.length !== captureIds.length) {
      room.picking = false;
      return {
        ok: false,
        message: 'Você só pode usar professores que capturou.',
      };
    }

    const byId = new Map(captures.map((c) => [c.id, c]));
    room.team = captureIds.map((id) => {
      const capture = byId.get(id)!;
      const types = capture.variant?.types?.length
        ? capture.variant.types
        : capture.professor.types;
      const moves = capture.moves
        .map((moveId) => getMoveById(moveId))
        .filter((move): move is Move => move !== null);
      const deck = moves.length ? moves : buildMoveset(types);
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
        moves: deck,
        ivs,
        combatant: createCombatant({
          name: capture.professor.name,
          types,
          moves: deck,
          ivs,
        }),
      };
    });

    room.missedPhases = 0;
    this.toPreview(room);
    return { ok: true };
  }

  private onPickTimeout(room: RaidRoom): void {
    if (room.phase !== 'picking') return;
    // Ninguém confirmou nada: não há batalha para começar. A tentativa é
    // anulada (não consome cooldown) — punir na preparação seria cobrar por
    // uma raid que não aconteceu, e a regra vale igual no PvP.
    room.missedPhases += 1;
    this.emitter.emitToUser(room.userId, 'battle:cancelled', {
      reason: 'pick_timeout',
    });
    void this.raid.closeAttempt(room.attemptId, 'anulada', 0);
    this.close(room);
  }

  /**
   * Revela o chefe e pede o lead.
   *
   * O `preview` do PvP existe para mostrar o time do rival depois do pick às
   * cegas; aqui não há nada a revelar — o adversário é um só e o aluno sabe
   * quem é desde o `battle:start`. A fase sobrevive apenas como a tela de
   * "quem entra primeiro", e por isso a transição é IMEDIATA: nada de esperar
   * um segundo jogador confirmar.
   */
  private toPreview(room: RaidRoom): void {
    this.clearTimer(room);
    room.phase = 'preview';
    this.armTimer(room, () => this.onPreviewTimeout(room));
    this.emitter.emitToUser(room.userId, 'battle:preview', {
      battleId: room.id,
      mode: 'raid',
      deadline: room.deadline,
      you: { team: room.team.map(ownMemberView) },
      foe: {
        name: room.boss.professor.name,
        team: [publicMemberView(room.boss)],
      },
    });
  }

  chooseLead(userId: string, captureId: string): Ack {
    const room = this.roomOf(userId);
    if (!room || room.phase !== 'preview') {
      return { ok: false, message: 'Não há seleção em andamento.' };
    }
    if (room.leadCaptureId) return { ok: false, message: 'Você já escolheu.' };

    const index = room.team.findIndex((m) => m.captureId === captureId);
    if (index < 0) {
      return { ok: false, message: 'Esse professor não está no seu time.' };
    }

    room.leadCaptureId = captureId;
    room.activeIndex = index;
    room.missedPhases = 0;
    this.begin(room);
    return { ok: true };
  }

  private onPreviewTimeout(room: RaidRoom): void {
    if (room.phase !== 'preview') return;
    room.activeIndex = 0;
    room.leadCaptureId = room.team[0].captureId;
    room.missedPhases += 1;
    this.begin(room);
  }

  // ── Batalha ───────────────────────────────────────────────────────────────

  private begin(room: RaidRoom): void {
    this.clearTimer(room);
    room.phase = 'active';
    room.turn = 1;
    room.state = {
      player: room.team[room.activeIndex].combatant,
      enemy: room.boss.combatant,
    };
    this.armTurnTimer(room);

    this.emitter.emitToUser(room.userId, 'battle:begin', {
      battleId: room.id,
      mode: 'raid',
      turn: room.turn,
      deadline: room.deadline,
      you: this.sideView(room, ALUNO, true),
      foe: {
        name: room.boss.professor.name,
        ...this.sideView(room, CHEFE, false),
      },
    });
  }

  move(userId: string, moveId: string): ActionAck {
    return this.submit(userId, (room) =>
      room.team[room.activeIndex].moves.some((m) => m.id === moveId)
        ? { kind: 'move', moveId }
        : 'Esse golpe não está no seu conjunto.',
    );
  }

  switchTo(userId: string, captureId: string): ActionAck {
    return this.submit(userId, (room) => {
      const index = room.team.findIndex((m) => m.captureId === captureId);
      if (index < 0) return 'Esse professor não está no seu time.';
      if (index === room.activeIndex) return 'Esse professor já está em campo.';
      if (!isAlive(room.team[index])) return 'Esse professor já caiu.';
      return { kind: 'switch', captureId };
    });
  }

  private submit(
    userId: string,
    build: (room: RaidRoom) => Action | string,
  ): ActionAck {
    const room = this.roomOf(userId);
    if (!room) return { ok: false, message: 'Nenhuma raid em andamento.' };
    if (room.phase === 'switching') {
      return { ok: false, message: 'Escolha quem entra primeiro.' };
    }
    if (room.phase !== 'active') {
      return { ok: false, message: 'Nenhuma raid em andamento.' };
    }
    if (room.pending) {
      return { ok: false, message: 'Você já escolheu neste turno.' };
    }

    const action = build(room);
    if (typeof action === 'string') return { ok: false, message: action };

    // Carimbado antes de resolver, como no PvP: resolver a rodada incrementa
    // `room.turn` ainda dentro desta chamada, e o cliente usa o turno do ack
    // para descartar confirmações de uma etapa que já virou.
    const turn = room.turn;
    room.pending = action;
    room.missedPhases = 0;

    // Diferente do PvP: não há segundo humano para esperar. O chefe decide na
    // hora e a rodada resolve — é isso que faz a raid ter o ritmo de um jogo
    // single-player em vez do de uma partida por turnos com espera.
    void this.resolveRound(room).catch((error: unknown) =>
      this.logger.error(
        `Falha resolvendo rodada de ${room.id}`,
        error as Error,
      ),
    );
    return { ok: true, turn };
  }

  private onTurnTimeout(room: RaidRoom): void {
    if (room.phase !== 'active') return;
    void this.resolveRound(room).catch((error: unknown) =>
      this.logger.error(`Falha no timeout de ${room.id}`, error as Error),
    );
  }

  private async resolveRound(room: RaidRoom): Promise<void> {
    this.clearTimer(room);
    const state = room.state!;

    if (!room.pending) room.missedPhases += 1;
    if (room.missedPhases >= RAID_MAX_MISSED_PHASES) {
      await this.finish(room, { result: 'abandono', vitoria: false });
      return;
    }

    const events: BattleEvent[] = [];

    // 1. Troca resolve antes de qualquer golpe (regra do motor, igual ao PvP).
    if (room.pending?.kind === 'switch') {
      events.push(...this.applySwitch(room, room.pending.captureId));
    }

    // 2. O chefe SEMPRE age: ele nunca troca (é um só) e nunca fica sem
    //    escolher. Quem pode perder o turno é o aluno.
    const golpeDoAluno =
      room.pending?.kind === 'move'
        ? (room.team[room.activeIndex].moves.find(
            (m) => m.id === (room.pending as { moveId: string }).moveId,
          ) ?? null)
        : null;
    const golpeDoChefe = chooseBotMove(state, CHEFE);

    const order = turnOrder(state, golpeDoAluno, golpeDoChefe);
    for (const entry of order) {
      if (state.player.hp <= 0 || state.enemy.hp <= 0) break;
      // Quem trocou não passa por upkeep: gastou o turno na troca.
      if (entry.key === ALUNO && room.pending?.kind === 'switch') continue;
      const up = upkeep(state, entry.key);
      events.push(...up.events);
      if (state.player.hp <= 0 || state.enemy.hp <= 0) break;
      if (!up.canAct) continue;
      if (entry.move) {
        events.push(...performMove(state, entry.key, entry.move));
      } else if (entry.key === ALUNO) {
        events.push({
          type: 'message',
          text: `${state.player.name} não escolheu a tempo e perdeu o turno!`,
        });
      }
    }

    room.pending = undefined;

    // 3. Nocaute.
    const chefeCaiu = state.enemy.hp <= 0;
    const alunoCaiu = state.player.hp <= 0;

    if (chefeCaiu) {
      // A vitória do aluno vem primeiro mesmo se os dois caírem na mesma
      // rodada: derrubar o chefe é o objetivo, e um empate técnico que tira a
      // captura de quem acabou de derrubá-lo seria impossível de explicar.
      await this.finish(room, { result: 'vitoria', vitoria: true }, events);
      return;
    }

    if (alunoCaiu) {
      benchCombatant(state.player);
      if (!hasAlive(room.team)) {
        await this.finish(room, { result: 'derrota', vitoria: false }, events);
        return;
      }
      this.toSwitching(room, events);
      return;
    }

    // 4. Teto de turnos: contra um chefe, o tempo acabar significa que ele
    //    resistiu. Somar HP (como o PvP faz) compararia um time de três com um
    //    corpo de 4× — uma simetria que não existe aqui.
    if (room.turn >= room.rules.turnCap) {
      events.push({
        type: 'message',
        text: `${room.boss.professor.name} resistiu aos ${room.rules.turnCap} turnos!`,
      });
      await this.finish(
        room,
        { result: 'limite_de_turnos', vitoria: false },
        events,
      );
      return;
    }

    room.turn += 1;
    this.armTurnTimer(room);
    this.emitRound(room, 'battle:round', events);
  }

  private applySwitch(room: RaidRoom, captureId: string): BattleEvent[] {
    const index = room.team.findIndex((m) => m.captureId === captureId);
    if (index < 0 || index === room.activeIndex || !isAlive(room.team[index])) {
      return [];
    }
    const sai = room.team[room.activeIndex];
    benchCombatant(sai.combatant);
    room.activeIndex = index;
    const entra = room.team[index];
    room.state!.player = entra.combatant;
    return [
      { type: 'switch', target: ALUNO, name: entra.professor.name },
      {
        type: 'message',
        text: `${sai.professor.name} volta! ${entra.professor.name} entra em campo!`,
      },
    ];
  }

  private toSwitching(room: RaidRoom, events: BattleEvent[]): void {
    room.phase = 'switching';
    room.owesEntry = true;
    this.armTimer(room, () => this.onSwitchingTimeout(room));
    this.emitter.emitToUser(room.userId, 'battle:faint', {
      battleId: room.id,
      deadline: room.deadline,
      youChoose: true,
      events,
      you: this.sideView(room, ALUNO, true),
      foe: this.sideView(room, CHEFE, false),
    });
  }

  enterWith(userId: string, captureId: string): Ack {
    const room = this.roomOf(userId);
    if (!room || room.phase !== 'switching') {
      return { ok: false, message: 'Não há substituição em andamento.' };
    }
    const index = room.team.findIndex((m) => m.captureId === captureId);
    if (index < 0) {
      return { ok: false, message: 'Esse professor não está no seu time.' };
    }
    if (!isAlive(room.team[index])) {
      return { ok: false, message: 'Esse professor já caiu.' };
    }

    room.activeIndex = index;
    room.owesEntry = false;
    room.missedPhases = 0;
    room.state!.player = room.team[index].combatant;
    this.resumeAfterSwitching(room);
    return { ok: true };
  }

  private onSwitchingTimeout(room: RaidRoom): void {
    if (room.phase !== 'switching') return;
    const index = nextAliveIndex(room.team, room.activeIndex);
    if (index >= 0) {
      room.activeIndex = index;
      room.state!.player = room.team[index].combatant;
    }
    room.owesEntry = false;
    room.missedPhases += 1;
    this.resumeAfterSwitching(room);
  }

  private resumeAfterSwitching(room: RaidRoom): void {
    this.clearTimer(room);
    if (room.missedPhases >= RAID_MAX_MISSED_PHASES) {
      void this.finish(room, { result: 'abandono', vitoria: false }).catch(
        (error: unknown) =>
          this.logger.error(`Falha encerrando ${room.id}`, error as Error),
      );
      return;
    }

    room.phase = 'active';
    room.pending = undefined;
    room.turn += 1;
    this.armTurnTimer(room);

    const entrou = room.team[room.activeIndex];
    this.emitRound(room, 'battle:round', [
      { type: 'switch', target: ALUNO, name: entrou.professor.name },
      { type: 'message', text: `${entrou.professor.name} entra em campo!` },
    ]);
  }

  // ── Fim ───────────────────────────────────────────────────────────────────

  private async finish(
    room: RaidRoom,
    outcome: { result: string; vitoria: boolean },
    events: BattleEvent[] = [],
  ): Promise<void> {
    room.phase = 'done';
    this.clearTimer(room);

    let premio: { captureId: string } | null = null;
    if (outcome.vitoria) {
      const variantId = await this.prisma.professorVariant
        .findFirst({
          where: { professorId: room.boss.professor.id },
          select: { id: true },
          orderBy: { createdAt: 'asc' },
        })
        .then((v) => v?.id ?? null)
        .catch(() => null);

      premio = await this.raid
        .award(
          room.userId,
          { id: room.boss.professor.id, types: room.boss.types },
          variantId,
          room.attemptId,
          room.attempts,
        )
        .catch((error: unknown) => {
          // A captura falhou, mas a vitória aconteceu. Melhor entregar a tela
          // de vitória sem o exemplar (e gritar no log) do que fingir derrota
          // para alguém que ganhou — isso é recuperável à mão, a confiança não.
          this.logger.error(
            `Vitória de ${room.userId} sem captura gravada!`,
            error as Error,
          );
          return null;
        });
    }

    await this.raid.closeAttempt(room.attemptId, outcome.result, room.turn);

    // Cooldown só quando ele espera de verdade: vitória não gera espera (não há
    // segunda captura) e `anulada` nunca passa por aqui.
    const cooldownMs = outcome.vitoria
      ? 0
      : await this.settings.raidCooldownMs().catch(() => 0);

    this.emitter.emitToUser(room.userId, 'battle:end', {
      battleId: room.id,
      mode: 'raid',
      events,
      result: outcome.vitoria ? 'win' : 'loss',
      reason: outcome.result,
      rating: null, // PvE não ranqueia — o campo existe para o front reusar a tela
      captured: !!premio,
      retryAt: cooldownMs > 0 ? Date.now() + cooldownMs : null,
      you: this.sideView(room, ALUNO, true),
      foe: this.sideView(room, CHEFE, false),
    });

    this.logger.log(
      JSON.stringify({
        audit: 'raid_end',
        raidId: room.id,
        userId: room.userId,
        boss: room.boss.professor.slug,
        result: outcome.result,
        turns: room.turn,
        attempt: room.attempts,
        captured: !!premio,
      }),
    );
    this.close(room);
  }

  /**
   * Sair da preparação sem punição, como no PvP — e aqui a tentativa é anulada
   * junto, para que abrir e fechar a tela não queime o cooldown de 30 minutos.
   */
  leaveSelection(userId: string): Ack {
    const room = this.roomOf(userId);
    if (!room) return { ok: false, message: 'Nenhuma raid em andamento.' };
    if (room.phase !== 'picking' && room.phase !== 'preview') {
      return {
        ok: false,
        message: 'A raid já começou — sair agora conta como abandono.',
      };
    }
    this.emitter.emitToUser(room.userId, 'battle:cancelled', {
      reason: 'left',
      byYou: true,
    });
    void this.raid.closeAttempt(room.attemptId, 'anulada', 0);
    this.close(room);
    return { ok: true };
  }

  /**
   * Snapshot para reconexão, ou **null** quando não há raid.
   *
   * O null é o contrato com o gateway: ele tenta a raid primeiro e só cai no
   * `resync` do PvP se aqui não houver nada. Devolver `{ phase: 'idle' }` como
   * a sala do PvP faz mataria essa composição — o gateway não teria como
   * distinguir "não tem raid" de "tem raid, e ela acabou".
   */
  resync(userId: string): Record<string, unknown> | null {
    const room = this.roomOf(userId);
    if (!room || room.phase === 'done') return null;
    const base = {
      battleId: room.id,
      mode: 'raid',
      phase: room.phase,
      opponent: {
        id: room.boss.professor.id,
        name: room.boss.professor.name,
      },
      deadline: room.deadline,
    };

    if (room.phase === 'picking') {
      return { ...base, youPicked: false, foePicked: true };
    }
    if (room.phase === 'preview') {
      return {
        ...base,
        you: { team: room.team.map(ownMemberView) },
        foe: {
          name: room.boss.professor.name,
          team: [publicMemberView(room.boss)],
        },
        youPicked: !!room.leadCaptureId,
        // O chefe nunca está "escolhendo": sem isto a tela mostraria
        // "aguardando o rival…" para sempre.
        foePicked: true,
      };
    }
    return {
      ...base,
      turn: room.turn,
      youChoose: room.owesEntry,
      youMoved: !!room.pending,
      foeMoved: true,
      you: this.sideView(room, ALUNO, true),
      foe: {
        name: room.boss.professor.name,
        ...this.sideView(room, CHEFE, false),
      },
    };
  }

  // ── Auxiliares ────────────────────────────────────────────────────────────

  private armTimer(room: RaidRoom, onTimeout: () => void): void {
    room.deadline = Date.now() + RAID_PHASE_TIMEOUT_MS;
    room.timer = setTimeout(onTimeout, RAID_PHASE_TIMEOUT_MS);
  }

  private armTurnTimer(room: RaidRoom): void {
    this.armTimer(room, () => this.onTurnTimeout(room));
  }

  /**
   * Visão de um lado. O aluno é sempre `player`, então — diferente do PvP —
   * não há perspectiva para espelhar: `viewEvents` não existe aqui porque os
   * eventos já saem do motor no referencial de quem os recebe.
   */
  private sideView(room: RaidRoom, key: CombatantKey, own: boolean) {
    if (key === CHEFE) {
      const c = room.boss.combatant;
      return {
        professor: room.boss.professor,
        types: c.types,
        hp: Math.max(0, c.hp),
        maxHp: c.maxHp,
        status: statusLabel(c.status),
        team: [publicMemberView(room.boss)],
      };
    }
    const active = room.team[room.activeIndex];
    if (!active) return null;
    const c = active.combatant;
    return {
      userId: room.userId,
      professor: active.professor,
      types: c.types,
      hp: Math.max(0, c.hp),
      maxHp: c.maxHp,
      status: statusLabel(c.status),
      activeCaptureId: own ? active.captureId : undefined,
      team: room.team.map(own ? ownMemberView : publicMemberView),
      ...(own ? { moves: active.moves } : {}),
    };
  }

  private emitRound(
    room: RaidRoom,
    event: string,
    events: BattleEvent[],
  ): void {
    this.emitter.emitToUser(room.userId, event, {
      battleId: room.id,
      turn: room.turn,
      deadline: room.deadline,
      events,
      you: this.sideView(room, ALUNO, true),
      foe: this.sideView(room, CHEFE, false),
    });
  }

  private roomOf(userId: string): RaidRoom | null {
    const id = this.roomByUser.get(userId);
    return id ? (this.rooms.get(id) ?? null) : null;
  }

  private clearTimer(room: RaidRoom): void {
    if (room.timer) clearTimeout(room.timer);
    room.timer = undefined;
  }

  private close(room: RaidRoom): void {
    this.clearTimer(room);
    this.rooms.delete(room.id);
    if (this.roomByUser.get(room.userId) === room.id) {
      this.roomByUser.delete(room.userId);
    }
    this.emitter.onRoomClosed([room.userId]);
  }
}
