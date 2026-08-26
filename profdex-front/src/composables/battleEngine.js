// Motor de batalha puro (sem Vue) — testável de forma headless.
//
// Modela atributos (rigor/didática/raciocínio), estágios (à la Pokémon),
// status (paralisia/confusão/dano-por-turno), escudos (bloqueio/redução/
// reflexão/esquiva), buffs temporizados e por-turno, e resolve golpes em uma
// lista de EVENTOS que a camada de UI (useBattle.js) anima com timing.
//
// A vantagem de tipo vem de types.js (effectiveness): 2× / 0,5× / 1×.

import { typeMultiplier } from '../data/types.js'
import { EFFECT, STAT, STAT_LABEL, CATEGORY, getMoveById } from '../data/moves.js'

export const DEFAULT_MAX_HP = 120
const DAMAGE_SCALE = 0.4 // calibra poder→dano contra a vida
const STAB = 1.5 // bônus quando o golpe é do mesmo tipo do usuário
const STAGE_MIN = -6
const STAGE_MAX = 6

export const STATUS = {
  PARALISIA: 'paralisia',
  CONFUSAO: 'confusao',
  QUEIMADURA: 'queimadura', // dano por turno
}

const STATUS_LABEL = {
  paralisia: 'Travado',
  confusao: 'Confuso',
  queimadura: 'Queimando',
}

export function statusLabel(status) {
  return status ? STATUS_LABEL[status.kind] || '' : ''
}

// ── Combatente ──────────────────────────────────────────────────────────────
export function createCombatant({ name, type, types, maxHp, moves = [], ivs = {} }) {
  // Aceita `types` (1–2) ou `type` (string) por compatibilidade.
  const typeList = (Array.isArray(types) ? types : types ? [types] : type ? [type] : []).filter(Boolean)
  const resolvedMaxHp = maxHp ?? DEFAULT_MAX_HP + (ivs.ivHp ?? 0)
  return {
    name,
    types: typeList,
    maxHp: resolvedMaxHp,
    hp: resolvedMaxHp,
    moves,
    stages: { rigor: 0, didatica: 0, raciocinio: 0 },
    baseStats: {
      rigor: 100 + (ivs.ivRigor ?? 0),
      didatica: 100 + (ivs.ivDidatica ?? 0),
      raciocinio: 100 + (ivs.ivRaciocinio ?? 0),
    },
    status: null, // { kind, turns, power? }
    shields: [], // { mode:'block'|'reduce'|'reflect'|'evade', amount, turns }
    timedBuffs: [], // { stat, delta, turns } — revertem ao expirar
    regen: [], // { stat, delta, turns } — aplicam a cada turno (permanente)
    debuffImmuneTurns: 0,
    forceMiss: false, // próximo ataque deste combatente erra
    usage: {}, // moveId -> nº de usos (grow/accuracyGain)
    lastAttackId: null, // último ataque (repeatLast)
    hpAtTurnStart: resolvedMaxHp, // p/ undoDamage
  }
}

const clampStage = (v) => Math.max(STAGE_MIN, Math.min(STAGE_MAX, v))

// Multiplicador de atributo a partir do estágio (padrão Pokémon).
function stageMultiplier(stage) {
  const s = clampStage(stage)
  return s >= 0 ? (2 + s) / 2 : 2 / (2 - s)
}

export function effectiveStat(combatant, stat) {
  return ((combatant.baseStats?.[stat] ?? 100) / 100) * stageMultiplier(combatant.stages[stat])
}

const rand = (min, max) => min + Math.random() * (max - min)
const randint = (min, max) => Math.floor(rand(min, max + 1))
const chance = (p) => Math.random() < p

// ── Ordem do turno: maior raciocínio age primeiro (empate → jogador) ─────────
export function turnOrder(state, playerMove, enemyMove) {
  const ps = effectiveStat(state.player, STAT.RACIOCINIO)
  const es = effectiveStat(state.enemy, STAT.RACIOCINIO)
  const playerFirst = ps >= es
  const p = { key: 'player', move: playerMove }
  const e = { key: 'enemy', move: enemyMove }
  return playerFirst ? [p, e] : [e, p]
}

// ── Upkeep: início do turno de um combatente ─────────────────────────────────
// Aplica dano-por-turno, buffs por-turno, expira temporizados e resolve
// paralisia/confusão. Retorna { events, canAct }.
export function upkeep(state, key) {
  const c = state[key]
  const events = []
  c.hpAtTurnStart = c.hp

  // Regen (buffs que sobem a cada turno)
  for (const r of c.regen) {
    c.stages[r.stat] = clampStage(c.stages[r.stat] + r.delta)
    r.turns -= 1
  }
  c.regen = c.regen.filter((r) => r.turns > 0)

  // Expira buffs temporizados (reverte o efeito)
  for (const b of c.timedBuffs) {
    b.turns -= 1
    if (b.turns <= 0) c.stages[b.stat] = clampStage(c.stages[b.stat] - b.delta)
  }
  c.timedBuffs = c.timedBuffs.filter((b) => b.turns > 0)

  // Escudos duram até serem consumidos por um golpe; imunidade a debuff expira.
  if (c.debuffImmuneTurns > 0) c.debuffImmuneTurns -= 1

  // Dano por turno (queimadura)
  if (c.status && c.status.kind === STATUS.QUEIMADURA) {
    const dmg = c.status.power
    c.hp = Math.max(0, c.hp - dmg)
    events.push({ type: 'message', text: `${c.name} sofre com o efeito contínuo!` })
    events.push({ type: 'damage', target: key, amount: dmg })
    c.status.turns -= 1
    if (c.status.turns <= 0) {
      c.status = null
      events.push({ type: 'message', text: `${c.name} se livrou do efeito.` })
    }
    if (c.hp <= 0) {
      events.push({ type: 'faint', target: key })
      return { events, canAct: false }
    }
  }

  // Paralisia: chance de perder o turno
  if (c.status && c.status.kind === STATUS.PARALISIA) {
    c.status.turns -= 1
    if (c.status.turns <= 0) c.status = null
    if (chance(0.35)) {
      events.push({ type: 'message', text: `${c.name} está travado e não conseguiu agir!` })
      return { events, canAct: false }
    }
  }

  // Confusão: chance de se atingir
  if (c.status && c.status.kind === STATUS.CONFUSAO) {
    c.status.turns -= 1
    if (c.status.turns <= 0) {
      c.status = null
      events.push({ type: 'message', text: `${c.name} recobrou o juízo.` })
    } else if (chance(0.33)) {
      const dmg = Math.max(1, Math.round(c.maxHp * 0.08))
      c.hp = Math.max(0, c.hp - dmg)
      events.push({ type: 'message', text: `${c.name} está confuso e se atingiu!` })
      events.push({ type: 'damage', target: key, amount: dmg })
      if (c.hp <= 0) events.push({ type: 'faint', target: key })
      return { events, canAct: c.hp > 0 ? false : false }
    }
  }

  return { events, canAct: true }
}

// Resolve poder/precisão efetivos considerando grow / accuracyGain / usos.
function effectiveAttack(attacker, move) {
  const uses = attacker.usage[move.id] || 0
  let power = move.power ?? 0
  let accuracy = move.accuracy ?? 1
  for (const e of move.effects) {
    if (e.kind === EFFECT.GROW) power += e.inc * uses
    if (e.kind === EFFECT.ACCURACY_GAIN) accuracy = Math.min(1, accuracy + e.inc * uses)
  }
  return { power, accuracy }
}

function hasFieldEffect(state) {
  const active = (c) =>
    c.status ||
    c.timedBuffs.length ||
    c.regen.length ||
    c.shields.length ||
    Object.values(c.stages).some((s) => s !== 0)
  return active(state.player) || active(state.enemy)
}

// Aplica dano ao defensor considerando escudos. Retorna { dealt, reflected, note }.
function applyDamageWithShields(defender, rawDamage) {
  let dealt = rawDamage
  let reflected = 0
  let note = null

  if (defender.shields.length) {
    // consome o escudo mais recente aplicável
    const idx = defender.shields.length - 1
    const s = defender.shields[idx]
    if (s.mode === 'evade') {
      defender.shields.splice(idx, 1)
      return { dealt: 0, reflected: 0, note: 'esquivou' }
    }
    if (s.mode === 'block') {
      defender.shields.splice(idx, 1)
      return { dealt: 0, reflected: 0, note: 'bloqueou' }
    }
    if (s.mode === 'reflect') {
      defender.shields.splice(idx, 1)
      reflected = Math.round(rawDamage * s.amount)
      return { dealt: 0, reflected, note: 'refletiu' }
    }
    if (s.mode === 'reduce') {
      defender.shields.splice(idx, 1)
      dealt = Math.round(rawDamage * (1 - s.amount))
      note = 'reduziu'
    }
  }

  defender.hp = Math.max(0, defender.hp - dealt)
  return { dealt, reflected, note }
}

function changeStage(target, targetKey, stat, delta, turns, events) {
  if (delta < 0 && target.debuffImmuneTurns > 0) {
    events.push({ type: 'message', text: `${target.name} está protegido de debuffs!` })
    return
  }
  target.stages[stat] = clampStage(target.stages[stat] + delta)
  if (turns > 0) target.timedBuffs.push({ stat, delta, turns })
  const up = delta > 0
  const statName = STAT_LABEL[stat] || stat
  events.push({
    type: 'message',
    text: `${target.name}: ${up ? '▲' : '▼'} ${statName} ${up ? 'subiu' : 'caiu'}!`,
  })
}

// ── Executa um golpe. Muta o estado e devolve a lista de eventos ─────────────
export function performMove(state, atkKey, move) {
  const events = []
  const attacker = state[atkKey]
  const defKey = atkKey === 'player' ? 'enemy' : 'player'

  attacker.usage[move.id] = (attacker.usage[move.id] || 0) + 1
  events.push({ type: 'message', text: `${attacker.name} usou ${move.name}!` })

  // repeatLast: repete o último ataque com bônus
  const repeat = move.effects.find((e) => e.kind === EFFECT.REPEAT_LAST)
  if (repeat) {
    const last = attacker.lastAttackId && getMoveById(attacker.lastAttackId)
    if (!last) {
      events.push({ type: 'message', text: 'Mas não havia golpe para repetir…' })
      return events
    }
    const boosted = { ...last, power: Math.round((last.power ?? 0) * repeat.mult), effects: last.effects.filter((e) => e.kind !== EFFECT.REPEAT_LAST) }
    events.push(...performMove(state, atkKey, boosted))
    return events
  }

  const isAttack = move.category === CATEGORY.ATAQUE && (move.power ?? 0) > 0

  if (isAttack) {
    attacker.lastAttackId = move.id
    resolveAttack(state, atkKey, move, events)
  } else {
    resolveUtility(state, atkKey, move, events)
  }

  return events
}

function resolveAttack(state, atkKey, move, events) {
  const attacker = state[atkKey]
  const defKey = atkKey === 'player' ? 'enemy' : 'player'
  const defender = state[defKey]

  const { power, accuracy } = effectiveAttack(attacker, move)

  // Precisão: forceMiss do atacante + esquiva por raciocínio do defensor
  if (attacker.forceMiss) {
    attacker.forceMiss = false
    events.push({ type: 'message', text: 'O golpe saiu pela culatra e errou!' })
    return
  }
  const evasion = Math.max(0, (defender.stages.raciocinio - attacker.stages.raciocinio) * 0.05)
  const hitChance = Math.max(0.1, Math.min(1, accuracy - evasion))
  if (!chance(hitChance)) {
    events.push({ type: 'message', text: `${attacker.name} errou o ataque!` })
    return
  }

  // Efetividade combinada contra os (1–2) tipos do defensor + STAB.
  const eff = typeMultiplier(move.type, defender.types)
  const stab = attacker.types.includes(move.type) ? STAB : 1
  const atkMult = effectiveStat(attacker, STAT.RIGOR)
  const ignoreDef = move.effects.some((e) => e.kind === EFFECT.IGNORE_DEFENSE)
  const defMult = ignoreDef ? 1 : effectiveStat(defender, STAT.DIDATICA)

  let bonus = stab
  if (move.effects.some((e) => e.kind === EFFECT.COMBO_BONUS) && hasFieldEffect(state)) {
    bonus *= move.effects.find((e) => e.kind === EFFECT.COMBO_BONUS).mult
  }
  if (move.effects.some((e) => e.kind === EFFECT.WEAK_POINT) && eff > 1) {
    bonus *= move.effects.find((e) => e.kind === EFFECT.WEAK_POINT).mult
  }

  // Quantidade de golpes (multi-hit)
  let hits = 1
  const mh = move.effects.find((e) => e.kind === EFFECT.MULTI_HIT)
  const mhf = move.effects.find((e) => e.kind === EFFECT.MULTI_HIT_FIXED)
  if (mh) hits = randint(mh.min, mh.max)
  else if (mhf) hits = mhf.hits

  let totalDealt = 0
  let reflectedTotal = 0
  for (let i = 0; i < hits; i++) {
    if (defender.hp <= 0) break
    const variance = rand(0.85, 1)
    const raw = Math.max(
      1,
      Math.round(power * DAMAGE_SCALE * atkMult / defMult * eff * bonus * variance),
    )
    const { dealt, reflected, note } = applyDamageWithShields(defender, raw)
    totalDealt += dealt
    reflectedTotal += reflected
    if (dealt > 0) events.push({ type: 'damage', target: defKey, amount: dealt })
    else if (note) events.push({ type: 'message', text: `${defender.name} ${note} o golpe!` })
  }

  // Mensagem de efetividade (produto pode dar 4× / 2× / 1× / 0,5× / 0,25×)
  if (totalDealt > 0) {
    if (eff > 1) events.push({ type: 'effectiveness', level: eff >= 4 ? 'super4' : 'super' })
    else if (eff < 1) events.push({ type: 'effectiveness', level: eff <= 0.25 ? 'weak4' : 'weak' })
    if (hits > 1) events.push({ type: 'message', text: `Acertou ${hits} vezes!` })
  }

  // Reflexão: devolve dano ao atacante
  if (reflectedTotal > 0) {
    attacker.hp = Math.max(0, attacker.hp - reflectedTotal)
    events.push({ type: 'message', text: 'O golpe foi refletido!' })
    events.push({ type: 'damage', target: atkKey, amount: reflectedTotal })
  }

  if (defender.hp <= 0) {
    events.push({ type: 'faint', target: defKey })
    return
  }

  // Efeitos secundários no defensor (chance)
  for (const e of move.effects) {
    if (e.kind === EFFECT.PARALYZE && chance(e.chance)) applyStatus(defender, defKey, STATUS.PARALISIA, events)
    if (e.kind === EFFECT.CONFUSE && chance(e.chance)) applyStatus(defender, defKey, STATUS.CONFUSAO, events)
    if (e.kind === EFFECT.DOT && chance(e.chance)) applyStatus(defender, defKey, STATUS.QUEIMADURA, events, e.power, e.turns)
  }

  // Recuo no atacante
  const rec = move.effects.find((e) => e.kind === EFFECT.RECOIL)
  if (rec && totalDealt > 0) {
    const self = Math.max(1, Math.round(totalDealt * rec.fraction))
    attacker.hp = Math.max(0, attacker.hp - self)
    events.push({ type: 'message', text: `${attacker.name} sofre o recuo!` })
    events.push({ type: 'damage', target: atkKey, amount: self })
    if (attacker.hp <= 0) events.push({ type: 'faint', target: atkKey })
  }
}

function applyStatus(target, targetKey, kind, events, power = 8, turns = 3) {
  if (target.status) return // um status de cada vez
  target.status = { kind, turns, power }
  const verb = {
    paralisia: 'foi travado',
    confusao: 'ficou confuso',
    queimadura: 'começou a sofrer dano contínuo',
  }[kind]
  events.push({ type: 'message', text: `${target.name} ${verb}!` })
  events.push({ type: 'status', target: targetKey })
}

function resolveUtility(state, atkKey, move, events) {
  const self = state[atkKey]
  const foeKey = atkKey === 'player' ? 'enemy' : 'player'
  const foe = state[foeKey]

  for (const e of move.effects) {
    switch (e.kind) {
      case EFFECT.STAT_CHANGE: {
        if (e.target === 'self') changeStage(self, atkKey, e.stat, e.delta, e.turns, events)
        else changeStage(foe, foeKey, e.stat, e.delta, e.turns, events)
        break
      }
      case EFFECT.STAT_GROW_PER_TURN: {
        self.regen.push({ stat: e.stat, delta: e.delta, turns: e.turns })
        events.push({ type: 'message', text: `${self.name} vai ficar mais forte a cada turno!` })
        break
      }
      case EFFECT.HEAL: {
        const amount = Math.min(self.maxHp - self.hp, Math.round(self.maxHp * e.fraction))
        self.hp += amount
        events.push({ type: 'message', text: amount > 0 ? `${self.name} recuperou vida!` : `${self.name} já está no máximo.` })
        if (amount > 0) events.push({ type: 'heal', target: atkKey, amount })
        break
      }
      case EFFECT.CLEANSE: {
        if (self.status) {
          self.status = null
          events.push({ type: 'message', text: `${self.name} limpou seus efeitos negativos.` })
        }
        break
      }
      case EFFECT.RESET_DEBUFFS: {
        for (const stat of Object.keys(self.stages)) {
          if (self.stages[stat] < 0) self.stages[stat] = 0
        }
        self.status = null
        events.push({ type: 'message', text: `${self.name} reajustou seus atributos.` })
        break
      }
      case EFFECT.SHIELD: {
        self.shields.push({ mode: e.mode, amount: e.amount, turns: e.turns })
        const label = { block: 'vai bloquear', reduce: 'vai reduzir', reflect: 'vai refletir', evade: 'vai esquivar' }[e.mode]
        events.push({ type: 'message', text: `${self.name} ${label} o próximo golpe!` })
        break
      }
      case EFFECT.DEBUFF_IMMUNE: {
        self.debuffImmuneTurns = e.turns
        events.push({ type: 'message', text: `${self.name} está imune a debuffs por ${e.turns} turnos!` })
        break
      }
      case EFFECT.FORCE_MISS: {
        foe.forceMiss = true
        events.push({ type: 'message', text: `${foe.name} vai errar o próximo ataque!` })
        break
      }
      case EFFECT.UNDO_DAMAGE: {
        const restored = Math.min(self.maxHp, self.hpAtTurnStart) - self.hp
        if (restored > 0) {
          self.hp += restored
          events.push({ type: 'message', text: `${self.name} desfez o dano do último turno!` })
          events.push({ type: 'heal', target: atkKey, amount: restored })
        } else {
          events.push({ type: 'message', text: 'Não havia dano para desfazer.' })
        }
        break
      }
      default:
        break
    }
  }
}

// ── IA do inimigo ────────────────────────────────────────────────────────────
// Heurística leve: cura se estiver muito ferido; senão prioriza um ataque
// super-eficaz; senão um ataque qualquer; utilitário de vez em quando.
export function chooseEnemyMove(state) {
  const enemy = state.enemy
  const player = state.player
  const pool = enemy.moves

  const attacks = pool.filter((m) => m.category === CATEGORY.ATAQUE && (m.power ?? 0) > 0)
  const heals = pool.filter((m) => m.effects.some((e) => e.kind === EFFECT.HEAL))
  const utils = pool.filter((m) => m.category !== CATEGORY.ATAQUE)

  if (enemy.hp < enemy.maxHp * 0.3 && heals.length && chance(0.6)) {
    return pick(heals)
  }

  const superAtk = attacks.filter((m) => typeMultiplier(m.type, player.types) > 1)
  if (superAtk.length && chance(0.75)) return pick(superAtk)

  if (utils.length && chance(0.25)) return pick(utils)

  return attacks.length ? pick(attacks) : pick(pool)
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}
