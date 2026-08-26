// Motor de batalha — port TS de profdex-front/src/composables/battleEngine.js.
//
// Mesmas mecânicas do single-player (atributos, estágios, status, escudos,
// buffs, eventos), com UM ajuste para PvP: empate de velocidade na ordem do
// turno vira cara ou coroa (no original o empate favorecia o `player`, que era
// sempre o humano — em PvP os dois são humanos).
//
// As chaves 'player'/'enemy' foram mantidas para o port ficar auditável contra
// o original. Em PvP: player = quem convidou (A), enemy = convidado (B); o
// gateway espelha a perspectiva ao emitir para B.

import { typeMultiplier } from './types';
import {
  CATEGORY,
  EFFECT,
  getMoveById,
  Move,
  Stat,
  STAT,
  STAT_LABEL,
} from './moves';

export const DEFAULT_MAX_HP = 120;
const DAMAGE_SCALE = 0.4; // calibra poder→dano contra a vida
const STAB = 1.5; // bônus quando o golpe é do mesmo tipo do usuário
const STAGE_MIN = -6;
const STAGE_MAX = 6;

export const STATUS = {
  PARALISIA: 'paralisia',
  CONFUSAO: 'confusao',
  QUEIMADURA: 'queimadura', // dano por turno
} as const;

export type StatusKind = (typeof STATUS)[keyof typeof STATUS];

const STATUS_LABEL: Record<StatusKind, string> = {
  paralisia: 'Travado',
  confusao: 'Confuso',
  queimadura: 'Queimando',
};

export interface CombatantStatus {
  kind: StatusKind;
  turns: number;
  power?: number;
}

export function statusLabel(status: CombatantStatus | null): string {
  return status ? STATUS_LABEL[status.kind] || '' : '';
}

export type CombatantKey = 'player' | 'enemy';

export type BattleEvent =
  | { type: 'message'; text: string }
  | { type: 'damage'; target: CombatantKey; amount: number }
  | { type: 'heal'; target: CombatantKey; amount: number }
  | { type: 'status'; target: CombatantKey }
  | { type: 'effectiveness'; level: 'super4' | 'super' | 'weak' | 'weak4' }
  | { type: 'faint'; target: CombatantKey };

interface Shield {
  mode: 'block' | 'reduce' | 'reflect' | 'evade';
  amount: number;
  turns: number;
}

interface TimedBuff {
  stat: Stat;
  delta: number;
  turns: number;
}

export interface Combatant {
  name: string;
  types: string[];
  maxHp: number;
  hp: number;
  moves: Move[];
  stages: Record<Stat, number>;
  baseStats: Record<Stat, number>;
  status: CombatantStatus | null;
  shields: Shield[];
  timedBuffs: TimedBuff[]; // revertem ao expirar
  regen: TimedBuff[]; // aplicam a cada turno (permanente)
  debuffImmuneTurns: number;
  forceMiss: boolean; // próximo ataque deste combatente erra
  usage: Record<string, number>; // moveId -> nº de usos (grow/accuracyGain)
  lastAttackId: string | null; // último ataque (repeatLast)
  hpAtTurnStart: number; // p/ undoDamage
}

export interface BattleState {
  player: Combatant;
  enemy: Combatant;
}

/**
 * Teto do bônus que um IV concede em combate.
 *
 * O banco guarda 0–15 por atributo (e as estrelas usam essa faixa cheia), mas
 * o que entra na conta da batalha é reescalado para 0–IV_BONUS_MAX. Guardar a
 * faixa larga e converter aqui deixa o balanceamento ajustável por uma
 * constante, sem migration nem backfill.
 *
 * Por que 5 e não 15: o PvP é ranqueado por Elo, e a diferença entre dois
 * jogadores tem de continuar sendo decisão, não sorte de captura. Medido com
 * o motor real, em espelho perfeito e escolha de golpe aleatória (n=6000):
 * com teto 15, o exemplar de IV total maior vencia 64% das partidas; com
 * teto 5 e a ordem de turno proporcional (ver `turnOrder`), cai para ~53%.
 * Ver `iv-balance.spec.ts`, que falha se esse número voltar a subir.
 */
export const IV_BONUS_MAX = 5;

/** Converte um IV bruto (0–15) no bônus efetivo de combate (0–IV_BONUS_MAX). */
export function ivBonus(iv: number | undefined): number {
  return ((iv ?? 0) / 15) * IV_BONUS_MAX;
}

// ── Combatente ──────────────────────────────────────────────────────────────
export function createCombatant(init: {
  name: string;
  type?: string;
  types?: string | string[];
  maxHp?: number;
  moves?: Move[];
  ivs?: { ivHp?: number; ivRigor?: number; ivDidatica?: number; ivRaciocinio?: number };
}): Combatant {
  const { name, type, types, moves = [], ivs = {} } = init;
  const maxHp = init.maxHp ?? DEFAULT_MAX_HP + Math.round(ivBonus(ivs.ivHp));
  // Aceita `types` (1–2) ou `type` (string) por compatibilidade.
  const typeList = (
    Array.isArray(types) ? types : types ? [types] : type ? [type] : []
  ).filter(Boolean);
  return {
    name,
    types: typeList,
    maxHp,
    hp: maxHp,
    moves,
    stages: { rigor: 0, didatica: 0, raciocinio: 0 },
    baseStats: {
      rigor: 100 + ivBonus(ivs.ivRigor),
      didatica: 100 + ivBonus(ivs.ivDidatica),
      raciocinio: 100 + ivBonus(ivs.ivRaciocinio),
    },
    status: null,
    shields: [],
    timedBuffs: [],
    regen: [],
    debuffImmuneTurns: 0,
    forceMiss: false,
    usage: {},
    lastAttackId: null,
    hpAtTurnStart: maxHp,
  };
}

const clampStage = (v: number) => Math.max(STAGE_MIN, Math.min(STAGE_MAX, v));

// Multiplicador de atributo a partir do estágio (padrão Pokémon).
function stageMultiplier(stage: number): number {
  const s = clampStage(stage);
  return s >= 0 ? (2 + s) / 2 : 2 / (2 - s);
}

export function effectiveStat(combatant: Combatant, stat: Stat): number {
  return ((combatant.baseStats[stat] ?? 100) / 100) * stageMultiplier(combatant.stages[stat]);
}

const rand = (min: number, max: number) => min + Math.random() * (max - min);
const randint = (min: number, max: number) => Math.floor(rand(min, max + 1));
const chance = (p: number) => Math.random() < p;

export interface TurnEntry {
  key: CombatantKey;
  move: Move | null;
}

// ── Ordem do turno: a velocidade PESA a moeda, não decide sozinha ───────────
//
// A versão anterior era um degrau (`ps > es`): quem tivesse 1 ponto a mais de
// raciocínio agia primeiro em TODOS os turnos da partida. Como `ivRaciocinio`
// é uniforme em 0–15, dois jogadores empatam em só 1 caso em 16 — ou seja, em
// ~94% das partidas ranqueadas um dos lados ganhava a iniciativa permanente no
// sorteio da captura. Medido com o motor real, isso sozinho valia 69% de
// vitória para o lado mais rápido, com 1 único ponto de diferença.
//
// Como peso de moeda, a mesma diferença de 1 ponto vale ~50,7%: o atributo
// continua importando (e os buffs/debuffs de estágio passam a importar mais,
// porque mexem na probabilidade em vez de já estarem saturados), sem que a
// sorte da captura decida a partida.
export function turnOrder(
  state: BattleState,
  playerMove: Move | null,
  enemyMove: Move | null,
): TurnEntry[] {
  const ps = effectiveStat(state.player, STAT.RACIOCINIO);
  const es = effectiveStat(state.enemy, STAT.RACIOCINIO);
  const playerFirst = chance(ps / (ps + es));
  const p: TurnEntry = { key: 'player', move: playerMove };
  const e: TurnEntry = { key: 'enemy', move: enemyMove };
  return playerFirst ? [p, e] : [e, p];
}

// ── Upkeep: início do turno de um combatente ─────────────────────────────────
// Aplica dano-por-turno, buffs por-turno, expira temporizados e resolve
// paralisia/confusão. Retorna { events, canAct }.
export function upkeep(
  state: BattleState,
  key: CombatantKey,
): { events: BattleEvent[]; canAct: boolean } {
  const c = state[key];
  const events: BattleEvent[] = [];
  c.hpAtTurnStart = c.hp;

  // Regen (buffs que sobem a cada turno)
  for (const r of c.regen) {
    c.stages[r.stat] = clampStage(c.stages[r.stat] + r.delta);
    r.turns -= 1;
  }
  c.regen = c.regen.filter((r) => r.turns > 0);

  // Expira buffs temporizados (reverte o efeito)
  for (const b of c.timedBuffs) {
    b.turns -= 1;
    if (b.turns <= 0) c.stages[b.stat] = clampStage(c.stages[b.stat] - b.delta);
  }
  c.timedBuffs = c.timedBuffs.filter((b) => b.turns > 0);

  // Escudos duram até serem consumidos por um golpe; imunidade a debuff expira.
  if (c.debuffImmuneTurns > 0) c.debuffImmuneTurns -= 1;

  // Dano por turno (queimadura)
  if (c.status && c.status.kind === STATUS.QUEIMADURA) {
    const dmg = c.status.power ?? 8;
    c.hp = Math.max(0, c.hp - dmg);
    events.push({
      type: 'message',
      text: `${c.name} sofre com o efeito contínuo!`,
    });
    events.push({ type: 'damage', target: key, amount: dmg });
    c.status.turns -= 1;
    if (c.status.turns <= 0) {
      c.status = null;
      events.push({ type: 'message', text: `${c.name} se livrou do efeito.` });
    }
    if (c.hp <= 0) {
      events.push({ type: 'faint', target: key });
      return { events, canAct: false };
    }
  }

  // Paralisia: chance de perder o turno
  if (c.status && c.status.kind === STATUS.PARALISIA) {
    c.status.turns -= 1;
    if (c.status.turns <= 0) c.status = null;
    if (chance(0.35)) {
      events.push({
        type: 'message',
        text: `${c.name} está travado e não conseguiu agir!`,
      });
      return { events, canAct: false };
    }
  }

  // Confusão: chance de se atingir
  if (c.status && c.status.kind === STATUS.CONFUSAO) {
    c.status.turns -= 1;
    if (c.status.turns <= 0) {
      c.status = null;
      events.push({ type: 'message', text: `${c.name} recobrou o juízo.` });
    } else if (chance(0.33)) {
      const dmg = Math.max(1, Math.round(c.maxHp * 0.08));
      c.hp = Math.max(0, c.hp - dmg);
      events.push({
        type: 'message',
        text: `${c.name} está confuso e se atingiu!`,
      });
      events.push({ type: 'damage', target: key, amount: dmg });
      if (c.hp <= 0) events.push({ type: 'faint', target: key });
      return { events, canAct: false };
    }
  }

  return { events, canAct: true };
}

// Resolve poder/precisão efetivos considerando grow / accuracyGain / usos.
function effectiveAttack(attacker: Combatant, move: Move) {
  const uses = attacker.usage[move.id] || 0;
  let power = move.power ?? 0;
  let accuracy = move.accuracy ?? 1;
  for (const e of move.effects) {
    if (e.kind === EFFECT.GROW) power += (e.inc ?? 0) * uses;
    if (e.kind === EFFECT.ACCURACY_GAIN)
      accuracy = Math.min(1, accuracy + (e.inc ?? 0) * uses);
  }
  return { power, accuracy };
}

function hasFieldEffect(state: BattleState): boolean {
  const active = (c: Combatant) =>
    !!c.status ||
    c.timedBuffs.length > 0 ||
    c.regen.length > 0 ||
    c.shields.length > 0 ||
    Object.values(c.stages).some((s) => s !== 0);
  return active(state.player) || active(state.enemy);
}

// Aplica dano ao defensor considerando escudos.
function applyDamageWithShields(defender: Combatant, rawDamage: number) {
  let dealt = rawDamage;
  let reflected = 0;
  let note: string | null = null;

  if (defender.shields.length) {
    // consome o escudo mais recente aplicável
    const idx = defender.shields.length - 1;
    const s = defender.shields[idx];
    if (s.mode === 'evade') {
      defender.shields.splice(idx, 1);
      return { dealt: 0, reflected: 0, note: 'esquivou' };
    }
    if (s.mode === 'block') {
      defender.shields.splice(idx, 1);
      return { dealt: 0, reflected: 0, note: 'bloqueou' };
    }
    if (s.mode === 'reflect') {
      defender.shields.splice(idx, 1);
      reflected = Math.round(rawDamage * s.amount);
      return { dealt: 0, reflected, note: 'refletiu' };
    }
    if (s.mode === 'reduce') {
      defender.shields.splice(idx, 1);
      dealt = Math.round(rawDamage * (1 - s.amount));
      note = 'reduziu';
    }
  }

  defender.hp = Math.max(0, defender.hp - dealt);
  return { dealt, reflected, note };
}

function changeStage(
  target: Combatant,
  stat: Stat,
  delta: number,
  turns: number,
  events: BattleEvent[],
) {
  if (delta < 0 && target.debuffImmuneTurns > 0) {
    events.push({
      type: 'message',
      text: `${target.name} está protegido de debuffs!`,
    });
    return;
  }
  target.stages[stat] = clampStage(target.stages[stat] + delta);
  if (turns > 0) target.timedBuffs.push({ stat, delta, turns });
  const up = delta > 0;
  const statName = STAT_LABEL[stat] || stat;
  events.push({
    type: 'message',
    text: `${target.name}: ${up ? '▲' : '▼'} ${statName} ${up ? 'subiu' : 'caiu'}!`,
  });
}

// ── Executa um golpe. Muta o estado e devolve a lista de eventos ─────────────
export function performMove(
  state: BattleState,
  atkKey: CombatantKey,
  move: Move,
): BattleEvent[] {
  const events: BattleEvent[] = [];
  const attacker = state[atkKey];

  attacker.usage[move.id] = (attacker.usage[move.id] || 0) + 1;
  events.push({ type: 'message', text: `${attacker.name} usou ${move.name}!` });

  // repeatLast: repete o último ataque com bônus
  const repeat = move.effects.find((e) => e.kind === EFFECT.REPEAT_LAST);
  if (repeat) {
    const last = attacker.lastAttackId
      ? getMoveById(attacker.lastAttackId)
      : null;
    if (!last) {
      events.push({
        type: 'message',
        text: 'Mas não havia golpe para repetir…',
      });
      return events;
    }
    const boosted: Move = {
      ...last,
      power: Math.round((last.power ?? 0) * (repeat.mult ?? 1)),
      effects: last.effects.filter((e) => e.kind !== EFFECT.REPEAT_LAST),
    };
    events.push(...performMove(state, atkKey, boosted));
    return events;
  }

  const isAttack = move.category === CATEGORY.ATAQUE && (move.power ?? 0) > 0;

  if (isAttack) {
    attacker.lastAttackId = move.id;
    resolveAttack(state, atkKey, move, events);
  } else {
    resolveUtility(state, atkKey, move, events);
  }

  return events;
}

function resolveAttack(
  state: BattleState,
  atkKey: CombatantKey,
  move: Move,
  events: BattleEvent[],
) {
  const attacker = state[atkKey];
  const defKey: CombatantKey = atkKey === 'player' ? 'enemy' : 'player';
  const defender = state[defKey];

  const { power, accuracy } = effectiveAttack(attacker, move);

  // Precisão: forceMiss do atacante + esquiva por velocidade do defensor
  if (attacker.forceMiss) {
    attacker.forceMiss = false;
    events.push({
      type: 'message',
      text: 'O golpe saiu pela culatra e errou!',
    });
    return;
  }
  const evasion = Math.max(
    0,
    (defender.stages.raciocinio - attacker.stages.raciocinio) * 0.05,
  );
  const hitChance = Math.max(0.1, Math.min(1, accuracy - evasion));
  if (!chance(hitChance)) {
    events.push({ type: 'message', text: `${attacker.name} errou o ataque!` });
    return;
  }

  // Efetividade combinada contra os (1–2) tipos do defensor + STAB.
  const eff = typeMultiplier(move.type, defender.types);
  const stab = attacker.types.includes(move.type) ? STAB : 1;
  const atkMult = effectiveStat(attacker, STAT.RIGOR);
  const ignoreDef = move.effects.some((e) => e.kind === EFFECT.IGNORE_DEFENSE);
  const defMult = ignoreDef ? 1 : effectiveStat(defender, STAT.DIDATICA);

  let bonus = stab;
  const combo = move.effects.find((e) => e.kind === EFFECT.COMBO_BONUS);
  if (combo && hasFieldEffect(state)) bonus *= combo.mult ?? 1;
  const weak = move.effects.find((e) => e.kind === EFFECT.WEAK_POINT);
  if (weak && eff > 1) bonus *= weak.mult ?? 1;

  // Quantidade de golpes (multi-hit)
  let hits = 1;
  const mh = move.effects.find((e) => e.kind === EFFECT.MULTI_HIT);
  const mhf = move.effects.find((e) => e.kind === EFFECT.MULTI_HIT_FIXED);
  if (mh) hits = randint(mh.min ?? 2, mh.max ?? 5);
  else if (mhf) hits = mhf.hits ?? 2;

  let totalDealt = 0;
  let reflectedTotal = 0;
  for (let i = 0; i < hits; i++) {
    if (defender.hp <= 0) break;
    const variance = rand(0.85, 1);
    const raw = Math.max(
      1,
      Math.round(
        ((power * DAMAGE_SCALE * atkMult) / defMult) * eff * bonus * variance,
      ),
    );
    const { dealt, reflected, note } = applyDamageWithShields(defender, raw);
    totalDealt += dealt;
    reflectedTotal += reflected;
    if (dealt > 0)
      events.push({ type: 'damage', target: defKey, amount: dealt });
    else if (note)
      events.push({
        type: 'message',
        text: `${defender.name} ${note} o golpe!`,
      });
  }

  // Mensagem de efetividade (produto pode dar 4× / 2× / 1× / 0,5× / 0,25×)
  if (totalDealt > 0) {
    if (eff > 1)
      events.push({
        type: 'effectiveness',
        level: eff >= 4 ? 'super4' : 'super',
      });
    else if (eff < 1)
      events.push({
        type: 'effectiveness',
        level: eff <= 0.25 ? 'weak4' : 'weak',
      });
    if (hits > 1)
      events.push({ type: 'message', text: `Acertou ${hits} vezes!` });
  }

  // Reflexão: devolve dano ao atacante
  if (reflectedTotal > 0) {
    attacker.hp = Math.max(0, attacker.hp - reflectedTotal);
    events.push({ type: 'message', text: 'O golpe foi refletido!' });
    events.push({ type: 'damage', target: atkKey, amount: reflectedTotal });
  }

  if (defender.hp <= 0) {
    events.push({ type: 'faint', target: defKey });
    return;
  }

  // Efeitos secundários no defensor (chance)
  for (const e of move.effects) {
    if (e.kind === EFFECT.PARALYZE && chance(e.chance ?? 0))
      applyStatus(defender, defKey, STATUS.PARALISIA, events);
    if (e.kind === EFFECT.CONFUSE && chance(e.chance ?? 0))
      applyStatus(defender, defKey, STATUS.CONFUSAO, events);
    if (e.kind === EFFECT.DOT && chance(e.chance ?? 0))
      applyStatus(
        defender,
        defKey,
        STATUS.QUEIMADURA,
        events,
        e.power,
        e.turns,
      );
  }

  // Recuo no atacante
  const rec = move.effects.find((e) => e.kind === EFFECT.RECOIL);
  if (rec && totalDealt > 0) {
    const self = Math.max(1, Math.round(totalDealt * (rec.fraction ?? 0.25)));
    attacker.hp = Math.max(0, attacker.hp - self);
    events.push({ type: 'message', text: `${attacker.name} sofre o recuo!` });
    events.push({ type: 'damage', target: atkKey, amount: self });
    if (attacker.hp <= 0) events.push({ type: 'faint', target: atkKey });
  }
}

function applyStatus(
  target: Combatant,
  targetKey: CombatantKey,
  kind: StatusKind,
  events: BattleEvent[],
  power = 8,
  turns = 3,
) {
  if (target.status) return; // um status de cada vez
  target.status = { kind, turns, power };
  const verb = {
    paralisia: 'foi travado',
    confusao: 'ficou confuso',
    queimadura: 'começou a sofrer dano contínuo',
  }[kind];
  events.push({ type: 'message', text: `${target.name} ${verb}!` });
  events.push({ type: 'status', target: targetKey });
}

function resolveUtility(
  state: BattleState,
  atkKey: CombatantKey,
  move: Move,
  events: BattleEvent[],
) {
  const self = state[atkKey];
  const foeKey: CombatantKey = atkKey === 'player' ? 'enemy' : 'player';
  const foe = state[foeKey];

  for (const e of move.effects) {
    switch (e.kind) {
      case EFFECT.STAT_CHANGE: {
        if (!e.stat) break;
        if (e.target === 'self')
          changeStage(self, e.stat, e.delta ?? 1, e.turns ?? 0, events);
        else changeStage(foe, e.stat, e.delta ?? -1, e.turns ?? 0, events);
        break;
      }
      case EFFECT.STAT_GROW_PER_TURN: {
        if (!e.stat) break;
        self.regen.push({
          stat: e.stat,
          delta: e.delta ?? 1,
          turns: e.turns ?? 4,
        });
        events.push({
          type: 'message',
          text: `${self.name} vai ficar mais forte a cada turno!`,
        });
        break;
      }
      case EFFECT.HEAL: {
        const amount = Math.min(
          self.maxHp - self.hp,
          Math.round(self.maxHp * (e.fraction ?? 0.3)),
        );
        self.hp += amount;
        events.push({
          type: 'message',
          text:
            amount > 0
              ? `${self.name} recuperou vida!`
              : `${self.name} já está no máximo.`,
        });
        if (amount > 0) events.push({ type: 'heal', target: atkKey, amount });
        break;
      }
      case EFFECT.CLEANSE: {
        if (self.status) {
          self.status = null;
          events.push({
            type: 'message',
            text: `${self.name} limpou seus efeitos negativos.`,
          });
        }
        break;
      }
      case EFFECT.RESET_DEBUFFS: {
        for (const stat of Object.keys(self.stages) as Stat[]) {
          if (self.stages[stat] < 0) self.stages[stat] = 0;
        }
        self.status = null;
        events.push({
          type: 'message',
          text: `${self.name} reajustou seus atributos.`,
        });
        break;
      }
      case EFFECT.SHIELD: {
        if (!e.mode) break;
        self.shields.push({
          mode: e.mode,
          amount: e.amount ?? 0.5,
          turns: e.turns ?? 1,
        });
        const label = {
          block: 'vai bloquear',
          reduce: 'vai reduzir',
          reflect: 'vai refletir',
          evade: 'vai esquivar',
        }[e.mode];
        events.push({
          type: 'message',
          text: `${self.name} ${label} o próximo golpe!`,
        });
        break;
      }
      case EFFECT.DEBUFF_IMMUNE: {
        self.debuffImmuneTurns = e.turns ?? 3;
        events.push({
          type: 'message',
          text: `${self.name} está imune a debuffs por ${e.turns ?? 3} turnos!`,
        });
        break;
      }
      case EFFECT.FORCE_MISS: {
        foe.forceMiss = true;
        events.push({
          type: 'message',
          text: `${foe.name} vai errar o próximo ataque!`,
        });
        break;
      }
      case EFFECT.UNDO_DAMAGE: {
        const restored = Math.min(self.maxHp, self.hpAtTurnStart) - self.hp;
        if (restored > 0) {
          self.hp += restored;
          events.push({
            type: 'message',
            text: `${self.name} desfez o dano do último turno!`,
          });
          events.push({ type: 'heal', target: atkKey, amount: restored });
        } else {
          events.push({
            type: 'message',
            text: 'Não havia dano para desfazer.',
          });
        }
        break;
      }
      default:
        break;
    }
  }
}
