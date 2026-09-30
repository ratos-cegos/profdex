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

import { BattleEvent, Combatant } from './engine/engine';
import { Move } from './engine/moves';

export const MAX_TEAM_SIZE = 3;

/**
 * O professor de um exemplar em batalha — **com a arte**.
 *
 * Os quatro campos de arte são obrigatórios, e a razão é um bug de 27/09/2026:
 * a raid montava este objeto à mão com só `id`/`slug`/`name`, o front recebia
 * um professor sem arte e caía na sprite padrão (`SPRITE_PADRAO`, que é o
 * Gustavo). O chefe lendário aparecia com a cara de outro professor, e a
 * primeira suspeita foi upload quebrado — a arte estava certa o tempo todo.
 *
 * Declarados aqui, omitir qualquer um deles deixa de compilar. É o que impede
 * o próximo caminho de batalha de repetir o erro.
 *
 * Tipo estrutural em vez de `PublicProfessor` para este módulo continuar sem
 * importar nada de Prisma — ver a nota no topo do arquivo.
 */
export interface BattleProfessor {
  id: string;
  slug: string;
  name: string;
  spriteFrontUrl: string | null;
  spriteBackUrl: string | null;
  modelUrl: string | null;
  pixelArt: boolean;
}

/** Um exemplar levado para a batalha. O `combatant` sobrevive às trocas. */
export interface TeamMember {
  captureId: string;
  professor: BattleProfessor;
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

/**
 * O evento de troca, com QUEM entra: professor, tipos e HP no instante da
 * entrada.
 *
 * Só o nome não bastava. O `you`/`foe` da rodada chega com o estado FINAL
 * (depois dos golpes), e a arena anima a fila antes de chegar lá: sem os dados
 * de quem entrou, ela trocava o sprite cedo demais e descontava o dano seguinte
 * do HP de quem SAIU — o substituto aparecia tombado, com a animação de queda
 * de outro. Aqui vai a visão pública (a mesma do banco de reservas), nunca
 * golpes nem IVs, e o evento é o mesmo para os dois lados.
 */
export function switchEvent(
  target: 'player' | 'enemy',
  m: TeamMember,
): Extract<BattleEvent, { type: 'switch' }> {
  const { professor, types, hp, maxHp } = publicMemberView(m);
  return {
    type: 'switch',
    target,
    name: m.professor.name,
    professor,
    types,
    hp,
    maxHp,
  };
}
