import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { carregaTime, recusaDoPedido } from './build-team';
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
import { efeitosVisiveis } from './efeitos-visiveis';
import { buildMoveset, EFFECT, getMoveById, Move } from './engine/moves';
import { TYPE_CYCLE } from './engine/types';
import {
  PUBLIC_PROFESSOR_SELECT,
  PublicProfessor,
} from '../professors/public-professor.select';
import { fraseDaAbertura } from './raid-opening';
import {
  costuraEfeitos,
  efeitoDoTipo,
  estagioDoHp,
  limpaCampoDoChefe,
  spriteDoEstagio,
  tiposDosEstagios,
  TOTAL_DE_ESTAGIOS,
} from './raid-estagios';
import {
  BlocoDoNde,
  criaBlocoDoNde,
  curaDoChefeForaDeCampo,
  roteiroDaChegadaDoNde,
  roteiroDaChegadaDoRicardo,
  roteiroDaQuedaDoNde,
  SLUG_DO_RICARDO,
  SLUGS_DO_NDE,
  sorteiaBuffDoRicardo,
  tiqueDaMonitoria,
} from './raid-eventos';
import { RaidService } from './raid.service';
import {
  Action,
  BattleProfessor,
  benchCombatant,
  hasAlive,
  isAlive,
  nextAliveIndex,
  ownMemberView,
  publicMemberView,
  switchEvent,
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
  /**
   * Tipos de cada estágio, sorteados no nascimento da sala (ver
   * `tiposDosEstagios`). Sorteia uma vez e guarda: sortear na virada faria o
   * resultado depender de quando a virada aconteceu, e um `resync` depois de um
   * F5 devolveria uma raid diferente da que o aluno estava jogando.
   */
  estagios: string[][];
  /** Estágio atual, 1..TOTAL_DE_ESTAGIOS. */
  estagio: number;
  /** Turnos já passados dentro do estágio atual — alimenta os efeitos. */
  turnoDoEstagio: number;

  /**
   * O elenco dos eventos, carregado do banco no nascimento da sala.
   *
   * Carregado UMA vez e congelado, como as `rules`: buscar na hora do evento
   * faria uma consulta no meio do turno e, pior, deixaria o evento depender de
   * o banco estar de pé naquele segundo. Lista vazia = evento simplesmente não
   * acontece (ver `carregaElenco`).
   */
  elenco: { nde: BattleProfessor[]; ricardo: BattleProfessor | null };
  /** Os quatro em campo. Enquanto existe, ELE é o `state.enemy`. */
  nde: BlocoDoNde | null;
  /** Cada evento acontece uma vez por raid. */
  ndeJaVeio: boolean;
  ricardoJaVeio: boolean;
  /** Concessões do Ricardo que vivem na sala, não no combatente. */
  monitoria: boolean;
  golpesCerteiros: number;
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
    // Os três estágios saem sorteados já aqui. O estágio 1 fica com os tipos do
    // banco — os mesmos da ficha da Profdex, que é o que o aluno usou para
    // montar o time.
    const estagios = tiposDosEstagios(types);
    const tiposDoEstagio1 = estagios[0];
    const moves = this.movesetDoEstagio(tiposDoEstagio1);
    const iv = rules.legendaryIv;

    const boss: TeamMember = {
      captureId: `boss:${legendary.id}`,
      // O professor INTEIRO, como o PvP faz (`battle-room.service.ts`). Antes
      // isto era um literal com só id/slug/name, e o chefe chegava ao front sem
      // arte — que então caía na sprite padrão e mostrava o Gustavo no lugar do
      // lendário. A consulta já trazia tudo (`PUBLIC_PROFESSOR_SELECT`); era o
      // literal que jogava fora.
      professor: legendary,
      types: tiposDoEstagio1,
      moves,
      ivs: { ivHp: iv, ivRigor: iv, ivDidatica: iv, ivRaciocinio: iv },
      combatant: createCombatant({
        name: legendary.name,
        types: tiposDoEstagio1,
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
      estagios,
      estagio: 1,
      turnoDoEstagio: 0,
      elenco: await this.carregaElenco(),
      nde: null,
      ndeJaVeio: false,
      ricardoJaVeio: false,
      monitoria: false,
      golpesCerteiros: 0,
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

    const recusa = recusaDoPedido(captureIds);
    if (recusa) return { ok: false, message: recusa };

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
    room.team = carregado.team;

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

    // 1.5. Efeito do estágio, ANTES da fase de ação: é o que permite ao efeito
    //      de redes marcar `forceMiss` no aluno antes de o golpe dele resolver,
    //      e deixa a cura de ENSW e o dano de humanas visíveis no topo do turno.
    //
    //      Com o NDE em campo o efeito do estágio NÃO corre: ele é do chefe, e o
    //      chefe está fora. No estágio de ENSW as duas curas (a do efeito e a do
    //      evento) somariam ~29 por turno, que era exatamente o que se combinou
    //      não fazer — uma fonte de cura por vez.
    if (room.nde) {
      events.push(...curaDoChefeForaDeCampo(room.boss.combatant));
    } else {
      events.push(...this.tiqueDoEstagio(room));
    }

    // 1.6. Monitoria (buff do Ricardo): cura o ativo por turno até o fim.
    if (room.monitoria) {
      events.push(...tiqueDaMonitoria(state.player, ALUNO));
    }

    // 2. O chefe SEMPRE age: ele nunca troca (é um só) e nunca fica sem
    //    escolher. Quem pode perder o turno é o aluno.
    let golpeDoAluno =
      room.pending?.kind === 'move'
        ? (room.team[room.activeIndex].moves.find(
            (m) => m.id === (room.pending as { moveId: string }).moveId,
          ) ?? null)
        : null;

    // Gabarito Vazado (buff do Ricardo): os próximos golpes não erram e furam a
    // Defesa. Não mexe na lista de golpes que o cliente recebe — só no objeto
    // entregue ao motor nesta resolução.
    if (golpeDoAluno && room.golpesCerteiros > 0) {
      room.golpesCerteiros -= 1;
      golpeDoAluno = {
        ...golpeDoAluno,
        accuracy: 1,
        effects: [...golpeDoAluno.effects, { kind: EFFECT.IGNORE_DEFENSE }],
      };
      events.push({
        type: 'message',
        text: `O gabarito vazado guia o golpe! (${room.golpesCerteiros} restam)`,
      });
    }

    // O estágio de banco devolve o último ataque do aluno em vez de o chefe
    // escolher o seu. Sem ataque registrado ainda, cai no bot normal — e não
    // vale com o NDE em campo, porque quem está no assento não é o chefe.
    const efeitoAtual = room.nde ? null : this.efeitoDoEstagio(room);
    const copiado =
      efeitoAtual?.copiaGolpeDoAluno && state.player.lastAttackId
        ? (getMoveById(state.player.lastAttackId) ?? null)
        : null;
    if (copiado) {
      events.push({
        type: 'message',
        text: `${state.enemy.name} consultou o log e devolveu ${copiado.name}!`,
      });
    }
    const golpeDoChefe = copiado ?? chooseBotMove(state, CHEFE);

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
    //
    // A guarda do NDE vem antes de tudo: enquanto os quatro ocupam o assento,
    // `state.enemy.hp <= 0` quer dizer que ELES caíram, não que a raid acabou.
    // Sem ela, derrubar o NDE entregaria o lendário de graça ao aluno.
    if (room.nde && state.enemy.hp <= 0) {
      events.push({ type: 'faint', target: CHEFE });
      events.push(roteiroDaQuedaDoNde(room.boss.professor.name));
      this.sentaOChefe(room);
      // Com quem volta (arte, tipos, HP de agora): a arena troca o ocupante no
      // ponto certo da fila, e não mostraria o chefe com a barra zerada do NDE.
      events.push(switchEvent(CHEFE, room.boss));
    }

    // A vida do chefe se lê no CORPO dele, nunca no assento: a Semana de Provas
    // (buff do Ricardo) pode derrubá-lo enquanto ele está fora de campo.
    const chefeCaiu = room.boss.combatant.hp <= 0;
    if (chefeCaiu && room.nde) this.sentaOChefe(room);
    const alunoCaiu = state.player.hp <= 0;

    if (chefeCaiu) {
      // A vitória do aluno vem primeiro mesmo se os dois caírem na mesma
      // rodada: derrubar o chefe é o objetivo, e um empate técnico que tira a
      // captura de quem acabou de derrubá-lo seria impossível de explicar.
      await this.finish(room, { result: 'vitoria', vitoria: true }, events);
      return;
    }

    // 3.5. Virada de estágio e chegada do NDE. Vêm DEPOIS do nocaute do chefe
    //      (não há transformação para quem já caiu) e ANTES do nocaute do aluno,
    //      para o roteiro sair no mesmo lote de eventos da troca forçada.
    events.push(...this.viraEstagioSePreciso(room));
    events.push(...this.chamaONdeSePreciso(room));

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
    room.turnoDoEstagio += 1;
    this.armTurnTimer(room);
    this.emitRound(room, 'battle:round', events);
  }

  // ── Estágios ──────────────────────────────────────────────────────────────

  /** Os tipos do estágio atual. */
  private tiposDoEstagio(room: RaidRoom): string[] {
    return room.estagios[room.estagio - 1] ?? room.estagios[0];
  }

  /**
   * O efeito de um estágio vem do PRIMEIRO tipo dele.
   *
   * Só importa no estágio 1, o único que pode ter dois tipos (os do banco); os
   * sorteados têm um só. Dois efeitos ao mesmo tempo dobrariam a dificuldade da
   * abertura sem o aluno ter como prever.
   */
  private efeitoDoEstagio(room: RaidRoom) {
    return efeitoDoTipo(this.tiposDoEstagio(room)[0]);
  }

  /** Moveset do estágio: sorteado dos tipos dele, com os efeitos costurados. */
  private movesetDoEstagio(tipos: string[]): Move[] {
    return costuraEfeitos(
      buildMoveset(tipos),
      efeitoDoTipo(tipos[0])?.injetaNosGolpes,
    );
  }

  private tiqueDoEstagio(room: RaidRoom): BattleEvent[] {
    const efeito = this.efeitoDoEstagio(room);
    if (!efeito?.porTurno) return [];
    const state = room.state!;
    return efeito.porTurno({
      // O corpo do chefe, nunca o assento: o assento pode estar com o NDE.
      chefe: room.boss.combatant,
      aluno: state.player,
      chefeKey: CHEFE,
      alunoKey: ALUNO,
      turnoDoEstagio: room.turnoDoEstagio,
      random: Math.random,
    });
  }

  /**
   * Transforma o chefe quando a barra cruza um terço.
   *
   * Duas regras, as duas aprendidas de um teste:
   *
   * 1. Só AVANÇA. A barra pode subir — o bot tem golpe de cura e o efeito de
   *    ENSW cura por turno — e voltar de estágio destransformaria o chefe na
   *    cara do aluno, apagando um marco que ele conquistou.
   *
   * 2. Avança UM estágio por vez, nunca direto para o que o HP indica. Um golpe
   *    forte pode cruzar os dois limiares na mesma rodada, e ir direto ao 3
   *    fazia o estágio 2 não existir: nem a transformação, nem o efeito, nem a
   *    sprite. Como esta checagem roda toda rodada, a fila se resolve sozinha no
   *    turno seguinte — o chefe pode passar uma rodada no estágio 2 com vida de
   *    estágio 3, e isso é melhor que sumir com um terço da luta.
   */
  private viraEstagioSePreciso(room: RaidRoom): BattleEvent[] {
    // Com o NDE no assento não há transformação: o chefe está fora de campo, e
    // ler a barra do assento aqui leria a vida dos quatro.
    if (room.nde) return [];

    const chefe = room.boss.combatant;
    const alvo = estagioDoHp(chefe.hp, chefe.maxHp);
    if (alvo <= room.estagio) return [];

    const estagioAnterior = room.estagio;
    room.estagio += 1;
    room.turnoDoEstagio = 0;

    const tipos = this.tiposDoEstagio(room);
    const efeito = efeitoDoTipo(tipos[0]);
    const moves = this.movesetDoEstagio(tipos);

    // O que o estágio anterior construiu sai; vida e status ficam.
    limpaCampoDoChefe(chefe);
    chefe.types = tipos;
    chefe.moves = moves;
    room.boss.types = tipos;
    room.boss.moves = moves;

    const eventos: BattleEvent[] = [
      {
        type: 'roteiro',
        // `target` + `estagio`: é com eles que a arena troca a arte do chefe
        // AQUI, atrás do overlay, e não no primeiro quadro do turno.
        target: CHEFE,
        estagio: room.estagio,
        roleta: { kind: 'tipo', opcoes: [...TYPE_CYCLE], resultado: tipos[0] },
        // A arte dos dois lados da transformação: a tela cresce a de ANTES e
        // troca pela de DEPOIS. Sem `spriteDepois` ela ainda funciona — só não
        // muda de cara, que é o que acontece enquanto a arte de estágio não
        // estiver cadastrada.
        ator: {
          nome: room.boss.professor.name,
          sprites: [
            spriteDoEstagio(room.boss.professor, estagioAnterior) ?? '',
          ],
          pixelArt: room.boss.professor.pixelArt,
          spriteDepois: spriteDoEstagio(room.boss.professor, room.estagio),
        },
        linhas: [
          `${room.boss.professor.name} não vai mais segurar.`,
          `Estágio ${alvo} de ${TOTAL_DE_ESTAGIOS} — ele agora é ${tipos.join(' / ')}!`,
          ...(efeito ? [efeito.anuncio] : []),
        ],
      },
    ];
    if (efeito?.aoEntrar) eventos.push(...efeito.aoEntrar(chefe, CHEFE));

    this.logger.log(
      `Raid ${room.id}: estágio ${room.estagio} (${tipos.join('+')}) — ${efeito?.nome ?? 'sem efeito'}`,
    );
    return eventos;
  }

  // ── Eventos de roteiro ────────────────────────────────────────────────────

  /**
   * Busca do banco os professores dos eventos, por slug.
   *
   * Por slug e não por id porque o schema trata `slug` como imutável (ele nomeia
   * os arquivos de arte), enquanto o id é uuid gerado no cadastro.
   *
   * Degrada em silêncio de propósito: faltando qualquer um dos quatro do NDE, o
   * evento simplesmente não acontece e a raid segue normal. Em noite de evento,
   * uma raid sem a cena do NDE é muito melhor que uma raid que estoura no
   * estágio 3. Não filtra por `active`: desativar é regra do SORTEIO de captura,
   * e estes cinco aqui são elenco de roteiro.
   */
  private async carregaElenco(): Promise<RaidRoom['elenco']> {
    try {
      const achados = await this.prisma.professor.findMany({
        where: { slug: { in: [...SLUGS_DO_NDE, SLUG_DO_RICARDO] } },
        select: PUBLIC_PROFESSOR_SELECT,
      });
      const porSlug = new Map(achados.map((p) => [p.slug, p]));

      // Ordem pelos SLUGS_DO_NDE, não pela consulta: a fila das quatro sprites
      // na tela precisa ser a mesma em toda tentativa.
      // O predicado narra `PublicProfessor` e não `BattleProfessor`: o primeiro
      // tem tudo do segundo MAIS `types` e `active`, então um predicado para o
      // tipo menor não é atribuível ao parâmetro. Atribuir a lista a
      // `BattleProfessor[]` no retorno funciona por estrutura.
      const nde = SLUGS_DO_NDE.map((slug) => porSlug.get(slug)).filter(
        (p): p is PublicProfessor => !!p,
      );

      if (nde.length < SLUGS_DO_NDE.length) {
        this.logger.warn(
          `Evento do NDE desligado: ${nde.length}/${SLUGS_DO_NDE.length} professores no banco`,
        );
      }

      return {
        nde: nde.length === SLUGS_DO_NDE.length ? nde : [],
        ricardo: porSlug.get(SLUG_DO_RICARDO) ?? null,
      };
    } catch (error) {
      this.logger.error(
        'Falha carregando o elenco dos eventos',
        error as Error,
      );
      return { nde: [], ricardo: null };
    }
  }

  /** Devolve o chefe ao assento do inimigo. */
  private sentaOChefe(room: RaidRoom): void {
    room.nde = null;
    room.state!.enemy = room.boss.combatant;
  }

  /**
   * O NDE entra quando o último estágio abre.
   *
   * Os quatro entram como UM corpo que ocupa o assento do inimigo — o motor tem
   * dois assentos, e é a leitura literal de "os 4 atacam juntos e sofrem os
   * ataques os 4 juntos". O chefe sai de campo, se cura e NÃO ataca: o evento
   * existe para dar tempo ao aluno de se preparar.
   */
  private chamaONdeSePreciso(room: RaidRoom): BattleEvent[] {
    if (room.ndeJaVeio || room.nde) return [];
    if (room.estagio < TOTAL_DE_ESTAGIOS) return [];
    if (!room.elenco.nde.length) return [];

    room.ndeJaVeio = true;
    room.nde = criaBlocoDoNde(room.elenco.nde);
    room.state!.enemy = room.nde.combatant;

    this.logger.log(`Raid ${room.id}: o NDE entrou em campo`);
    return [
      roteiroDaChegadaDoNde(room.boss.professor.name, room.elenco.nde),
      // Sem `professor`: são quatro, e vão em `professores`. Nome, tipos, HP e
      // os quatro seguem juntos para a arena trocar a barra E as sprites neste
      // ponto da fila — lidos do `foe` final da rodada, o grupo aparecia antes
      // da hora, ainda com a vida do chefe.
      {
        type: 'switch',
        target: CHEFE,
        name: room.nde.combatant.name,
        professores: room.nde.professores,
        types: room.nde.combatant.types,
        hp: room.nde.combatant.hp,
        maxHp: room.nde.combatant.maxHp,
      },
    ];
  }

  /**
   * O Ricardo chega quando cai o PENÚLTIMO professor do aluno.
   *
   * Penúltimo e não "o segundo": com time de 3 é a segunda queda, com time de 2
   * é a primeira — nos dois casos sempre sobra alguém para receber o buff. Com
   * time de 1 nunca dispara, porque a primeira queda já é o fim da raid.
   *
   * Chamado de `resumeAfterSwitching`, ou seja DEPOIS de o aluno escolher quem
   * entra: os buffs que mexem no ativo (Ponto Extra, Cola na Manga, Recurso
   * Deferido) têm de cair em quem vai lutar, não no que acabou de tombar.
   */
  private chamaORicardoSePreciso(room: RaidRoom): BattleEvent[] {
    if (room.ricardoJaVeio || !room.elenco.ricardo || !room.state) return [];
    const caidos = room.team.filter((m) => !isAlive(m)).length;
    if (caidos < 1 || caidos !== room.team.length - 1) return [];

    room.ricardoJaVeio = true;
    const buff = sorteiaBuffDoRicardo();
    this.logger.log(`Raid ${room.id}: Ricardo entregou ${buff.nome}`);

    return [
      roteiroDaChegadaDoRicardo(room.elenco.ricardo, buff),
      ...buff.aplica({
        aluno: room.state.player,
        chefe: room.boss.combatant,
        alunoKey: ALUNO,
        chefeKey: CHEFE,
        time: room.team,
        concede: {
          monitoria: () => {
            room.monitoria = true;
          },
          golpesCerteiros: (quantidade) => {
            room.golpesCerteiros = quantidade;
          },
        },
      }),
    ];
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
      switchEvent(ALUNO, entra),
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
      switchEvent(ALUNO, entrou),
      { type: 'message', text: `${entrou.professor.name} entra em campo!` },
      // O Ricardo chega AQUI, depois de o substituto estar em campo, para o
      // buff cair em quem vai lutar.
      ...this.chamaORicardoSePreciso(room),
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
      // Com o NDE em campo, o lado do inimigo É o NDE: a barra, o nome e as
      // sprites são deles. O chefe continua no BANCO do lado inimigo, curando —
      // e é ali que o aluno vê a barra dele subir, sem precisarmos animar uma
      // cura em quem não está no assento.
      if (room.nde) {
        const bloco = room.nde.combatant;
        return {
          professor: room.nde.professores[0],
          professores: room.nde.professores,
          nomeEmCampo: bloco.name,
          evento: 'nde',
          types: bloco.types,
          hp: Math.max(0, bloco.hp),
          maxHp: bloco.maxHp,
          status: statusLabel(bloco.status),
          // O estado dos efeitos, cru: quem escreve o rotulo e a tela.
          ...efeitosVisiveis(bloco),
          team: [publicMemberView(room.boss)],
          estagio: room.estagio,
          totalDeEstagios: TOTAL_DE_ESTAGIOS,
          efeitoDoEstagio: null,
        };
      }
      const c = room.boss.combatant;
      return {
        professor: room.boss.professor,
        professores: null,
        nomeEmCampo: c.name,
        evento: null,
        types: c.types,
        hp: Math.max(0, c.hp),
        maxHp: c.maxHp,
        status: statusLabel(c.status),
        // O estado dos efeitos, cru: quem escreve o rotulo e a tela.
        ...efeitosVisiveis(c),
        team: [publicMemberView(room.boss)],
        // O front usa `estagio` para escolher o par de sprites do estágio e
        // para rotular a fase; `efeitoDoEstagio` é o nome exibido da regra em
        // vigor, que sem isso só existiria na mensagem que passa e some.
        estagio: room.estagio,
        totalDeEstagios: TOTAL_DE_ESTAGIOS,
        efeitoDoEstagio: this.efeitoDoEstagio(room)?.nome ?? null,
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
      // O estado dos efeitos, cru: quem escreve o rotulo e a tela.
      ...efeitosVisiveis(c),
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
