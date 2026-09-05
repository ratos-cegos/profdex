/**
 * Regras de TIME do PvP — o que acontece entre os exemplares de um jogador.
 *
 * Vive fora do motor de propósito. O motor (`engine/engine.ts`) resolve um
 * combatente contra outro e tem uma cópia gêmea no front
 * (`profdex-front/src/composables/battleEngine.js`) que precisa continuar
 * idêntica nas regras de combate. Composição de time é regra de SALA: o treino
 * contra o bot continua 1 contra 1 e não deve herdar nada daqui.
 *
 * Funções puras, sem Prisma e sem socket, para o teste ser direto.
 */

import { Combatant } from './engine/engine';
import { Move } from './engine/moves';

export const MAX_TEAM_SIZE = 3;

/** Um exemplar levado para a batalha. O `combatant` sobrevive às trocas. */
export interface TeamMember {
  captureId: string;
  professor: { id: string; slug: string; name: string };
  types: string[];
  moves: Move[];
  ivs?: {
    ivHp: number;
    ivRigor: number;
    ivDidatica: number;
    ivRaciocinio: number;
  };
  /** Criado no `begin`; é o objeto que o motor muta. */
  combatant: Combatant;
}

/** A ação de um jogador no turno: bater ou trocar. Uma ou outra, nunca as duas. */
export type Action =
  | { kind: 'move'; moveId: string }
  | { kind: 'switch'; captureId: string };

export const isAlive = (m: TeamMember): boolean => m.combatant.hp > 0;

/**
 * Limpa o que é de CAMPO quando o exemplar sai (por troca ou por nocaute).
 *
 * Fica: `hp`, paralisia e queimadura — são condições que o professor carrega.
 * Sai: tudo que foi construído durante a permanência em campo, incluindo
 * confusão, que é "está tonto agora" e não uma condição persistente.
 *
 * As duas pontas importam. Se o status sobrevivesse por inteiro, trocar viraria
 * cura e paralisia deixaria de valer algo; se os buffs sobrevivessem,
 * trocar-e-voltar viraria um reset grátis do combo (e `usage`, que alimenta
 * grow/accuracyGain, se acumularia para sempre).
 */
export function benchCombatant(c: Combatant): void {
  c.stages = { rigor: 0, didatica: 0, raciocinio: 0 };
  c.shields = [];
  c.timedBuffs = [];
  c.regen = [];
  c.debuffImmuneTurns = 0;
  c.forceMiss = false;
  c.usage = {};
  c.lastAttackId = null;
  c.hpAtTurnStart = c.hp;
  if (c.status?.kind === 'confusao') c.status = null;
}

/** HP somado do time — o desempate quando a batalha bate no teto de turnos. */
export function teamHp(team: TeamMember[]): number {
  return team.reduce((total, m) => total + Math.max(0, m.combatant.hp), 0);
}

export const hasAlive = (team: TeamMember[]): boolean => team.some(isAlive);

/**
 * Próximo exemplar vivo pela ordem de seleção — o fallback de quando o jogador
 * não escolhe quem entra. Devolve -1 se não sobrou ninguém.
 */
export function nextAliveIndex(team: TeamMember[], exclude: number): number {
  return team.findIndex((m, i) => i !== exclude && isAlive(m));
}

/** Só o que é público de um exemplar: professor e tipos. Nunca IVs nem golpes. */
export function publicMemberView(m: TeamMember) {
  return {
    professor: m.professor,
    types: m.types,
    hp: Math.max(0, m.combatant.hp),
    maxHp: m.combatant.maxHp,
    fainted: !isAlive(m),
  };
}

/** A mesma visão, mais o `captureId` — só para o DONO do time. */
export function ownMemberView(m: TeamMember) {
  return { ...publicMemberView(m), captureId: m.captureId };
}
