import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import {
  PUBLIC_PROFESSOR_SELECT,
  PublicProfessor,
} from '../professors/public-professor.select';
import {
  MAX_MISSED_PHASES,
  MAX_TURNS,
  PHASE_TIMEOUT_MS,
} from './battle-room.service';
import { carregaTime, recusaDoPedido } from './build-team';
import { chooseBotMove } from './engine/bot';
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
import { buildMoveset } from './engine/moves';
import { efeitosVisiveis } from './efeitos-visiveis';
import {
  Action,
  benchCombatant,
  hasAlive,
  isAlive,
  movimentosAcumuladosVisiveis,
  nextAliveIndex,
  ownMemberView,
  publicMemberView,
  switchEvent,
  teamHp,
  TeamMember,
} from './team';

/** Os dois formatos do treino: um contra um, ou três contra três. */
export const TAMANHOS_DO_TREINO = [1, 3] as const;
export type TamanhoDoTreino = (typeof TAMANHOS_DO_TREINO)[number];

/** O nome do lado do bot em toda a interface. */
export const NOME_DO_BOT = 'Bot de treino';

type TreinoPhase = 'picking' | 'preview' | 'active' | 'switching' | 'done';

/** O aluno é sempre o `player`; o bot é sempre o `enemy`. */
const ALUNO: CombatantKey = 'player';
const BOT: CombatantKey = 'enemy';

interface TreinoRoom {
  id: string;
  userId: string;
  name: string;
  phase: TreinoPhase;
  tamanho: TamanhoDoTreino;
  team: TeamMember[];
  activeIndex: number;
  leadCaptureId?: string;
  owesEntry: boolean;
  picking?: boolean;
  missedPhases: number;
  bot: TeamMember[];
  botIndex: number;
  state?: BattleState;
  pending?: Action;
  turn: number;
  deadline: number;
  timer?: NodeJS.Timeout;
}

export interface TreinoEmitter {
  emitToUser(userId: string, event: string, payload: unknown): void;
  onRoomClosed(userIds: string[]): void;
}

type Ack =
  | { ok: true; [k: string]: unknown }
  | { ok: false; message: string; code?: string };
type ActionAck = { ok: true; turn: number } | { ok: false; message: string };

type Rng = () => number;

/**
 * O treino de batalha: o aluno com o PRÓPRIO time (1 ou 3 exemplares) contra
 * um bot com o mesmo número de professores comuns sorteados.
 *
 *   picking ──▶ preview ──▶ active ⇄ switching ──▶ done
 *
 * Irmã da raid, pelo mesmo motivo que a raid é irmã do PvP: `BattleRoomService`
 * é o caminho ranqueado, pensado para dois humanos, e um `if (isBot)` em cada
 * etapa dele é o risco que ninguém quer correr. O que é compartilhado de
 * verdade continua compartilhado:
 * - `engine/` resolve os turnos, e `engine/bot.ts` escolhe o golpe do bot;
 * - `team.ts` cuida de trocas e banco de reservas;
 * - `build-team.ts` monta o time a partir das capturas;
 * - os eventos de socket são os MESMOS, com `mode: 'treino'` — o front reusa a
 *   seleção e a arena do ranqueado.
 *
 * Do ranqueado vêm os prazos (60s por fase, abandono em 3 faltas) e o teto de
 * turnos decidido por HP somado. Diferente dele, e de propósito:
 * - **nada é gravado**: sem Elo, sem linha `Battle`, sem cooldown de dupla —
 *   é treino, e treinar não pode custar nada;
 * - **o tamanho é exato**: quem pediu 3v3 leva 3, e o bot também;
 * - **o bot nunca troca por vontade própria**; quando um cai, o próximo vivo
 *   entra na mesma rodada, sem fase de escolha.
 */
@Injectable()
export class TreinoRoomService implements OnModuleDestroy {
  private readonly rooms = new Map<string, TreinoRoom>();
  private readonly roomByUser = new Map<string, string>();
  private readonly logger = new Logger(TreinoRoomService.name);
  private emitter: TreinoEmitter = {
    emitToUser: () => {},
    onRoomClosed: () => {},
  };
  /** Injetável para o teste escolher o time do bot. */
  private rng: Rng = Math.random;

  constructor(private prisma: PrismaService) {}

  configure(emitter: TreinoEmitter, rng?: Rng): void {
    this.emitter = emitter;
    if (rng) this.rng = rng;
  }

  hasActiveRoom(userId: string): boolean {
    return this.roomByUser.has(userId);
  }

  onModuleDestroy(): void {
    for (const room of [...this.rooms.values()]) {
      this.emitter.emitToUser(room.userId, 'battle:cancelled', {
        reason: 'server_shutdown',
      });
      this.close(room);
    }
  }

  // ── Início ────────────────────────────────────────────────────────────────

  async start(
    user: { userId: string; name: string },
    tamanho: unknown,
  ): Promise<Ack> {
    if (!TAMANHOS_DO_TREINO.includes(tamanho as TamanhoDoTreino)) {
      return { ok: false, message: 'Escolha 1 contra 1 ou 3 contra 3.' };
    }
    const n = tamanho as TamanhoDoTreino;
    if (this.roomByUser.has(user.userId)) {
      return { ok: false, message: 'Você já está num treino.' };
    }

    const capturas = await this.prisma.capture
      .count({ where: { userId: user.userId } })
      .catch(() => null);
    if (capturas === null) {
      return {
        ok: false,
        message: 'Não deu para abrir o treino. Tente de novo.',
      };
    }
    if (capturas < n) {
      return {
        ok: false,
        code: 'TREINO_SEM_EXEMPLARES',
        message:
          n === 1
            ? 'Capture um professor para montar seu time.'
            : `Para o 3 contra 3 você precisa de 3 exemplares (tem ${capturas}).`,
      };
    }

    const bot = await this.sorteiaTimeDoBot(n);
    if (!bot) {
      return { ok: false, message: 'Não há professores para o treino agora.' };
    }

    const room: TreinoRoom = {
      id: randomUUID(),
      userId: user.userId,
      name: user.name,
      phase: 'picking',
      tamanho: n,
      team: [],
      activeIndex: 0,
      owesEntry: false,
      missedPhases: 0,
      bot,
      botIndex: 0,
      turn: 0,
      deadline: 0,
    };
    this.armTimer(room, () => this.onPickTimeout(room));
    this.rooms.set(room.id, room);
    this.roomByUser.set(user.userId, room.id);

    this.emitter.emitToUser(user.userId, 'battle:start', {
      battleId: room.id,
      mode: 'treino',
      tamanho: n,
      pickDeadline: room.deadline,
      opponent: { name: NOME_DO_BOT },
    });
    this.logger.log(`Treino ${room.id}: ${user.userId}, ${n}v${n}`);
    return { ok: true, battleId: room.id };
  }

  /**
   * `n` professores COMUNS ativos, sem repetir enquanto houver elenco — os
   * mesmos que a Profdex conta (`professors.service.ts`). Raro e lendário
   * ficam de fora: são prêmio, não sparring.
   *
   * Deck sorteado pelo `buildMoveset` e IV zero: o bot é o professor "de
   * fábrica", sem o exemplar de ninguém por trás.
   */
  private async sorteiaTimeDoBot(n: number): Promise<TeamMember[] | null> {
    const comuns = await this.prisma.professor
      .findMany({
        where: { active: true, rare: false, legendary: false },
        select: PUBLIC_PROFESSOR_SELECT,
      })
      .catch((error: Error) => {
        this.logger.error('Falha sorteando o time do bot', error);
        return null;
      });
    if (!comuns?.length) return null;

    const baralho = [...comuns];
    // Fisher-Yates com o rng da sala: o teste escolhe a ordem.
    for (let i = baralho.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [baralho[i], baralho[j]] = [baralho[j], baralho[i]];
    }
    // Elenco menor que o time (ambiente de teste com 2 comuns, por exemplo):
    // repete a partir do início em vez de recusar o treino.
    const escolhidos = Array.from(
      { length: n },
      (_, i) => baralho[i % baralho.length],
    );
    return escolhidos.map((professor, i) => this.membroDoBot(professor, i));
  }

  private membroDoBot(professor: PublicProfessor, i: number): TeamMember {
    const types = professor.types;
    const moves = buildMoveset(types);
    return {
      captureId: `bot:${professor.slug}:${i}`,
      professor,
      types,
      moves,
      combatant: createCombatant({ name: professor.name, types, moves }),
    };
  }

  // ── Seleção do time ───────────────────────────────────────────────────────

  async pickTeam(userId: string, captureIds: string[]): Promise<Ack> {
    const room = this.roomOf(userId);
    if (!room || room.phase !== 'picking') {
      return { ok: false, message: 'Não há seleção em andamento.' };
    }
    if (room.picking || room.team.length) {
      return { ok: false, message: 'Você já escolheu.' };
    }

    const recusa = recusaDoPedido(captureIds, room.tamanho);
    if (recusa) return { ok: false, message: recusa };
    // Exato, ao contrário do PvP e da raid: o formato foi escolhido antes, e o
    // bot já tem esse tamanho. Um 3v1 não é o treino que o aluno pediu.
    if (captureIds.length !== room.tamanho) {
      return {
        ok: false,
        message: `Escolha ${room.tamanho} professores para o ${room.tamanho} contra ${room.tamanho}.`,
      };
    }

    room.picking = true;
    const carregado = await carregaTime(
      this.prisma,
      userId,
      captureIds,
      (error) =>
        this.logger.error(`Falha buscando capturas de ${userId}`, error),
    );
    if (!carregado.ok) {
      room.picking = false;
      return { ok: false, message: carregado.message };
    }
    // A sala pode ter fechado durante a consulta (timeout, saída).
    if (this.roomOf(userId) !== room || room.phase !== 'picking') {
      return { ok: false, message: 'Não há seleção em andamento.' };
    }
    room.team = carregado.team;
    room.missedPhases = 0;
    this.toPreview(room);
    return { ok: true };
  }

  private onPickTimeout(room: TreinoRoom): void {
    if (room.phase !== 'picking') return;
    this.emitter.emitToUser(room.userId, 'battle:cancelled', {
      reason: 'pick_timeout',
    });
    this.close(room);
  }

  /** Mostra o time do bot, como o preview do ranqueado mostra o do rival. */
  private toPreview(room: TreinoRoom): void {
    this.clearTimer(room);
    room.phase = 'preview';
    this.armTimer(room, () => this.onPreviewTimeout(room));
    this.emitter.emitToUser(room.userId, 'battle:preview', {
      battleId: room.id,
      mode: 'treino',
      deadline: room.deadline,
      you: { team: room.team.map(ownMemberView) },
      foe: { name: NOME_DO_BOT, team: room.bot.map(publicMemberView) },
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

  private onPreviewTimeout(room: TreinoRoom): void {
    if (room.phase !== 'preview') return;
    room.activeIndex = 0;
    room.leadCaptureId = room.team[0].captureId;
    room.missedPhases += 1;
    this.begin(room);
  }

  // ── Batalha ───────────────────────────────────────────────────────────────

  private begin(room: TreinoRoom): void {
    this.clearTimer(room);
    room.phase = 'active';
    room.turn = 1;
    room.state = {
      player: room.team[room.activeIndex].combatant,
      enemy: room.bot[room.botIndex].combatant,
    };
    this.armTimer(room, () => this.onTurnTimeout(room));
    this.emitRound(room, 'battle:begin', []);
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
    build: (room: TreinoRoom) => Action | string,
  ): ActionAck {
    const room = this.roomOf(userId);
    if (!room) return { ok: false, message: 'Nenhum treino em andamento.' };
    if (room.phase === 'switching') {
      return { ok: false, message: 'Escolha quem entra primeiro.' };
    }
    if (room.phase !== 'active') {
      return { ok: false, message: 'Nenhum treino em andamento.' };
    }
    if (room.pending) {
      return { ok: false, message: 'Você já escolheu neste turno.' };
    }

    const action = build(room);
    if (typeof action === 'string') return { ok: false, message: action };

    // Carimbado antes de resolver: resolver incrementa `room.turn` ainda
    // dentro desta chamada, e o cliente usa o turno do ack para descartar
    // confirmações de uma etapa que já virou.
    const turn = room.turn;
    room.pending = action;
    room.missedPhases = 0;
    // Como na raid: o bot decide na hora, então a rodada resolve já.
    this.resolveRound(room);
    return { ok: true, turn };
  }

  private onTurnTimeout(room: TreinoRoom): void {
    if (room.phase !== 'active') return;
    this.resolveRound(room);
  }

  private resolveRound(room: TreinoRoom): void {
    this.clearTimer(room);
    const state = room.state!;

    if (!room.pending) room.missedPhases += 1;
    if (room.missedPhases >= MAX_MISSED_PHASES) {
      this.finish(room, 'loss', 'abandono');
      return;
    }

    const events: BattleEvent[] = [];

    // 1. Troca resolve antes de qualquer golpe (regra do motor, igual ao PvP).
    if (room.pending?.kind === 'switch') {
      events.push(...this.applySwitch(room, room.pending.captureId));
    }

    // 2. O bot sempre age; quem pode perder o turno é o aluno.
    const golpeDoAluno =
      room.pending?.kind === 'move'
        ? (room.team[room.activeIndex].moves.find(
            (m) => m.id === (room.pending as { moveId: string }).moveId,
          ) ?? null)
        : null;
    const golpeDoBot = chooseBotMove(state, BOT, this.rng);

    for (const entry of turnOrder(state, golpeDoAluno, golpeDoBot)) {
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

    // 3. Nocautes. O motor já emitiu o `faint`; aqui a sala cuida do banco.
    const botCaiu = state.enemy.hp <= 0;
    const alunoCaiu = state.player.hp <= 0;
    if (botCaiu) benchCombatant(state.enemy);
    if (alunoCaiu) benchCombatant(state.player);

    const botSemTime = !hasAlive(room.bot);
    const alunoSemTime = !hasAlive(room.team);
    if (botSemTime || alunoSemTime) {
      // Os dois zerados na mesma rodada: empate, como no ranqueado.
      const result =
        botSemTime && alunoSemTime ? 'draw' : botSemTime ? 'win' : 'loss';
      this.finish(room, result, 'nocaute', events);
      return;
    }

    // O próximo do bot entra na hora, com os dados de quem entra (a arena
    // troca o ocupante no ponto certo da fila).
    if (botCaiu) {
      room.botIndex = nextAliveIndex(room.bot, room.botIndex);
      const entra = room.bot[room.botIndex];
      state.enemy = entra.combatant;
      events.push(switchEvent(BOT, entra), {
        type: 'message',
        text: `${entra.professor.name} entra em campo!`,
      });
    }

    if (alunoCaiu) {
      this.toSwitching(room, events);
      return;
    }

    // 4. Teto de turnos: vence quem tem mais vida somada, como no ranqueado.
    if (room.turn >= MAX_TURNS) {
      const seu = teamHp(room.team);
      const doBot = teamHp(room.bot);
      events.push({
        type: 'message',
        text: `Limite de ${MAX_TURNS} turnos! Vence quem tem mais vida somada.`,
      });
      this.finish(
        room,
        seu === doBot ? 'draw' : seu > doBot ? 'win' : 'loss',
        'limite_de_turnos',
        events,
      );
      return;
    }

    room.turn += 1;
    this.armTimer(room, () => this.onTurnTimeout(room));
    this.emitRound(room, 'battle:round', events);
  }

  private applySwitch(room: TreinoRoom, captureId: string): BattleEvent[] {
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
      switchEvent(ALUNO, entra),
      {
        type: 'message',
        text: `${sai.professor.name} volta! ${entra.professor.name} entra em campo!`,
      },
    ];
  }

  private toSwitching(room: TreinoRoom, events: BattleEvent[]): void {
    room.phase = 'switching';
    room.owesEntry = true;
    this.armTimer(room, () => this.onSwitchingTimeout(room));
    this.emitter.emitToUser(room.userId, 'battle:faint', {
      battleId: room.id,
      deadline: room.deadline,
      youChoose: true,
      events,
      you: this.sideView(room, ALUNO),
      foe: this.sideView(room, BOT),
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

  private onSwitchingTimeout(room: TreinoRoom): void {
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

  private resumeAfterSwitching(room: TreinoRoom): void {
    this.clearTimer(room);
    if (room.missedPhases >= MAX_MISSED_PHASES) {
      this.finish(room, 'loss', 'abandono');
      return;
    }

    room.phase = 'active';
    room.pending = undefined;
    room.turn += 1;
    this.armTimer(room, () => this.onTurnTimeout(room));

    const entrou = room.team[room.activeIndex];
    this.emitRound(room, 'battle:round', [
      switchEvent(ALUNO, entrou),
      { type: 'message', text: `${entrou.professor.name} entra em campo!` },
    ]);
  }

  // ── Fim ───────────────────────────────────────────────────────────────────

  private finish(
    room: TreinoRoom,
    result: 'win' | 'loss' | 'draw',
    reason: 'nocaute' | 'limite_de_turnos' | 'abandono',
    events: BattleEvent[] = [],
  ): void {
    room.phase = 'done';
    this.clearTimer(room);
    this.emitter.emitToUser(room.userId, 'battle:end', {
      battleId: room.id,
      mode: 'treino',
      events,
      result,
      reason,
      rating: null, // treino não ranqueia — o campo existe para a tela do PvP
      you: this.sideView(room, ALUNO),
      foe: this.sideView(room, BOT),
    });
    this.logger.log(
      JSON.stringify({
        audit: 'treino_end',
        treinoId: room.id,
        userId: room.userId,
        tamanho: room.tamanho,
        result,
        reason,
        turns: room.turn,
      }),
    );
    this.close(room);
  }

  /** Sair da preparação, sem custo nenhum. */
  leaveSelection(userId: string): Ack {
    const room = this.roomOf(userId);
    if (!room) return { ok: false, message: 'Nenhum treino em andamento.' };
    if (room.phase !== 'picking' && room.phase !== 'preview') {
      return {
        ok: false,
        message: 'O treino já começou — use Fugir na arena.',
      };
    }
    this.emitter.emitToUser(room.userId, 'battle:cancelled', {
      reason: 'left',
      byYou: true,
    });
    this.close(room);
    return { ok: true };
  }

  /**
   * Desistir de um treino começado. Diferente do ranqueado, é de graça: não há
   * Elo nem adversário humano esperando. Encerra como derrota por abandono,
   * para a tela de resultado ser a mesma de sempre.
   */
  forfeit(userId: string): Ack {
    const room = this.roomOf(userId);
    if (!room || (room.phase !== 'active' && room.phase !== 'switching')) {
      return { ok: false, message: 'Nenhum treino em andamento.' };
    }
    this.finish(room, 'loss', 'abandono');
    return { ok: true };
  }

  /**
   * Snapshot para reconexão, ou **null** sem treino — o mesmo contrato da raid:
   * o gateway encadeia raid, treino e PvP, e só o último devolve `idle`.
   */
  resync(userId: string): Record<string, unknown> | null {
    const room = this.roomOf(userId);
    if (!room || room.phase === 'done') return null;
    const base = {
      battleId: room.id,
      mode: 'treino',
      tamanho: room.tamanho,
      phase: room.phase,
      opponent: { name: NOME_DO_BOT },
      deadline: room.deadline,
    };

    if (room.phase === 'picking') {
      return { ...base, youPicked: !!room.team.length, foePicked: true };
    }
    if (room.phase === 'preview') {
      return {
        ...base,
        you: { team: room.team.map(ownMemberView) },
        foe: { name: NOME_DO_BOT, team: room.bot.map(publicMemberView) },
        youPicked: !!room.leadCaptureId,
        // O bot nunca está "escolhendo": sem isto a tela mostraria "aguardando
        // o rival…" para sempre.
        foePicked: true,
      };
    }
    return {
      ...base,
      turn: room.turn,
      youChoose: room.owesEntry,
      youMoved: !!room.pending,
      foeMoved: true,
      you: this.sideView(room, ALUNO),
      foe: this.sideView(room, BOT),
    };
  }

  // ── Auxiliares ────────────────────────────────────────────────────────────

  private armTimer(room: TreinoRoom, onTimeout: () => void): void {
    this.clearTimer(room);
    room.deadline = Date.now() + PHASE_TIMEOUT_MS;
    room.timer = setTimeout(onTimeout, PHASE_TIMEOUT_MS);
  }

  /** O aluno é sempre `player`: os eventos já saem no referencial dele. */
  private sideView(room: TreinoRoom, key: CombatantKey) {
    const own = key === ALUNO;
    const team = own ? room.team : room.bot;
    const active = team[own ? room.activeIndex : room.botIndex];
    if (!active) return null;
    const c = active.combatant;
    return {
      ...(own ? { userId: room.userId } : { name: NOME_DO_BOT }),
      professor: active.professor,
      types: c.types,
      hp: Math.max(0, c.hp),
      maxHp: c.maxHp,
      status: statusLabel(c.status),
      ...efeitosVisiveis(c),
      movimentosAcumulados: movimentosAcumuladosVisiveis(active),
      activeCaptureId: own ? active.captureId : undefined,
      team: team.map(own ? ownMemberView : publicMemberView),
      ...(own ? { moves: active.moves } : {}),
    };
  }

  private emitRound(room: TreinoRoom, event: string, events: BattleEvent[]) {
    this.emitter.emitToUser(room.userId, event, {
      battleId: room.id,
      mode: 'treino',
      turn: room.turn,
      deadline: room.deadline,
      events,
      you: this.sideView(room, ALUNO),
      foe: this.sideView(room, BOT),
    });
  }

  private roomOf(userId: string): TreinoRoom | null {
    const id = this.roomByUser.get(userId);
    return id ? (this.rooms.get(id) ?? null) : null;
  }

  private clearTimer(room: TreinoRoom): void {
    if (room.timer) clearTimeout(room.timer);
    room.timer = undefined;
  }

  private close(room: TreinoRoom): void {
    this.clearTimer(room);
    this.rooms.delete(room.id);
    if (this.roomByUser.get(room.userId) === room.id) {
      this.roomByUser.delete(room.userId);
    }
    this.emitter.onRoomClosed([room.userId]);
  }
}
