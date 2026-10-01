/**
 * Regras de TIME — o que acontece entre os exemplares de um jogador, nas três
 * salas do servidor: PvP, raid e treino contra o bot (1 ou 3 de cada lado).
 *
 * Vive fora do motor de propósito. O motor (`engine/engine.ts`) resolve um
 * combatente contra outro e tem uma cópia gêmea no front
 * (`profdex-front/src/composables/battleEngine.js`) que precisa continuar
 * idêntica nas regras de combate. Composição de time é regra de SALA. O único
 * combate que não passa por aqui é o treino SEM exemplar (o boneco da
 * `ArenaView`), que roda só no front.
 *
 * Funções puras, sem Prisma e sem socket, para o teste ser direto.
 */

import { BattleEvent, Combatant } from './engine/engine';
import { EFFECT, Move } from './engine/moves';
import { efeitosVisiveis } from './efeitos-visiveis';

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
  /**
   * Arte dos estágios 2 e 3 da raid. OPCIONAIS, ao contrário das quatro de
   * cima: só o lendário tem estágios, e exigi-las aqui deixaria de compilar
   * todo lugar que monta um professor comum para a batalha. O combate cai na
   * arte de base quando faltam — estágio sem arte funciona, só não muda de cara.
   */
  spriteFrontE2Url?: string | null;
  spriteBackE2Url?: string | null;
  spriteFrontE3Url?: string | null;
  spriteBackE3Url?: string | null;
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
 * Limpa efeitos de uso imediato quando o exemplar sai (por troca ou nocaute).
 * HP, condições, estágios de atributo e usos de golpes acumulativos pertencem
 * ao exemplar e continuam quando ele volta. Confusão, escudos e efeitos de
 * campo com duração curta continuam sendo descartados na troca.
 */
export function benchCombatant(c: Combatant): void {
  c.shields = [];
  c.timedBuffs = [];
  c.regen = [];
  c.debuffImmuneTurns = 0;
  c.forceMiss = false;
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

/** Estado já revelado da batalha, sem IVs nem o conjunto de golpes. */
export function publicMemberView(m: TeamMember) {
  return {
    professor: m.professor,
    types: m.types,
    hp: Math.max(0, m.combatant.hp),
    maxHp: m.combatant.maxHp,
    fainted: !isAlive(m),
    ...efeitosVisiveis(m.combatant),
  };
}

/**
 * Golpes acumulativos já usados. Só seguem para o dono do time, porque esse
 * resumo revela quais golpes o exemplar conhece.
 */
export function movimentosAcumuladosVisiveis(m: TeamMember) {
  return m.moves.flatMap((move) => {
    const usos = m.combatant.usage[move.id] ?? 0;
    if (!usos) return [];

    let bonusPoder = 0;
    let bonusPrecisaoBase = 0;
    let acumula = false;
    for (const effect of move.effects) {
      if (effect.kind === EFFECT.GROW) {
        bonusPoder += (effect.inc ?? 0) * usos;
        acumula = true;
      }
      if (effect.kind === EFFECT.ACCURACY_GAIN) {
        bonusPrecisaoBase += (effect.inc ?? 0) * usos;
        acumula = true;
      }
    }
    if (!acumula) return [];

    const precisaoBase = move.accuracy ?? 1;
    const bonusPrecisao = Math.round(
      (Math.min(1, precisaoBase + bonusPrecisaoBase) - precisaoBase) * 100,
    );
    return [{
      moveId: move.id,
      name: move.name,
      usos,
      bonusPoder,
      bonusPrecisao,
    }];
  });
}

/** A mesma visão, mais os dados particulares do dono do time. */
export function ownMemberView(m: TeamMember) {
  return {
    ...publicMemberView(m),
    captureId: m.captureId,
    movimentosAcumulados: movimentosAcumuladosVisiveis(m),
  };
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
