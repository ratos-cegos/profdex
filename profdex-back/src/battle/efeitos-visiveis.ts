/**
 * O que a HUD precisa saber sobre os efeitos de um combatente.
 *
 * O motor rastreia muito mais do que a tela mostrava: estágios de atributo
 * (−6..+6 em três atributos), escudos, buffs temporizados, regen, imunidade a
 * debuff e `forceMiss`. Nada disso atravessava a fronteira — só o status, e já
 * traduzido. O jogador via um ▲ passar numa mensagem de 850ms e depois tinha de
 * decorar que o ataque dele estava em +2.
 *
 * Esta função manda o ESTADO, não o rótulo. Quem escreve "▲2 ATK" é o front
 * (`src/data/battle-efeitos.js`), e por dois motivos:
 *
 * 1. a arena de TREINO roda o motor no cliente e tem o mesmo estado na mão —
 *    construir o rótulo aqui obrigaria a duplicar a tradução lá, que é
 *    exatamente o tipo de cópia que o teste de paridade existe para vigiar;
 * 2. rótulo é decisão de tela (cabe em 9px de fonte pixel?), não de servidor.
 *
 * `status` continua indo traduzido ao lado destes campos: quebrar aquele
 * contrato não traria nada, e o treino já desenha o chip a partir dele.
 */

import { Combatant } from './engine/engine';
import { Stat } from './engine/moves';

export interface EfeitosVisiveis {
  /** `paralisia` | `confusao` | `queimadura`, ou null. */
  statusKind: string | null;
  statusTurns: number | null;
  /** Estágios dos três atributos, como o motor os guarda (−6..+6). */
  stages: Record<Stat, number>;
  /**
   * O modo do escudo que vai ser consumido pelo próximo golpe, ou null.
   *
   * O ÚLTIMO da pilha, porque é o que `applyDamageWithShields` consome — mandar
   * a pilha inteira descreveria uma defesa que o motor não dá.
   */
  escudo: string | null;
}

export function efeitosVisiveis(c: Combatant): EfeitosVisiveis {
  return {
    statusKind: c.status?.kind ?? null,
    statusTurns: c.status?.turns ?? null,
    // Cópia: o objeto do combatente é mutado pelo motor a cada turno, e mandar a
    // referência deixaria o payload mudando depois de montado.
    stages: { ...c.stages },
    escudo: c.shields.length ? c.shields[c.shields.length - 1].mode : null,
  };
}
