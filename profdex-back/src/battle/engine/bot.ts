/**
 * O cérebro do adversário controlado pelo servidor — hoje, o chefe da raid.
 *
 * Porte fiel de `chooseEnemyMove` (`profdex-front/src/composables/battleEngine.js`),
 * que até aqui só existia no front porque só o treino contra bot precisava
 * dele: o PvP tem dois humanos e o motor do back nunca escolheu nada sozinho.
 *
 * **Fiel de propósito, e não "melhorado".** Uma IA ótima contra um aluno com
 * time ruim vira uma parede que ninguém passa, e o prêmio do primeiro a
 * capturar nunca seria entregue. Ela já não é burra: prioriza golpe
 * super-efetivo em 3 de 4 turnos e se cura quando está para cair. Se a raid
 * ficar fácil demais, o ajuste barato é `raid.hp_multiplier` no painel — um
 * clique — e não esta função, que é deploy.
 *
 * Mantido em arquivo próprio, fora de `engine.ts`: o motor tem uma cópia gêmea
 * no front que precisa continuar idêntica nas regras de COMBATE, e escolha de
 * golpe não é regra de combate. Colocar isto lá dentro criaria uma divergência
 * de arquivo que a `engine-parity.spec.ts` teria que aprender a ignorar.
 */

import { BattleState, CombatantKey } from './engine';
import { CATEGORY, EFFECT, Move } from './moves';
import { typeMultiplier } from './types';

/**
 * Sorteio injetável. O padrão é `Math.random`; o teste passa uma sequência
 * conhecida para afirmar a escolha, em vez de rodar mil vezes e olhar média.
 */
export type Rng = () => number;

/**
 * Escolhe o golpe do lado controlado pelo servidor.
 *
 * `self` é quem decide e `foe` quem sofre — parametrizado em vez de fixo em
 * `enemy` porque o lado do bot na raid é o `enemy`, mas amarrar isso aqui
 * deixaria a função inútil para qualquer outro uso (e intestável de um lado só).
 *
 * Devolve `null` apenas se o combatente não tiver nenhum golpe, o que não
 * acontece com exemplar bem formado — mas é melhor que o chamador trate um
 * nulo do que a sala estourar num `undefined.id` no meio de um turno.
 */
export function chooseBotMove(
  state: BattleState,
  self: CombatantKey,
  rng: Rng = Math.random,
): Move | null {
  const eu = state[self];
  const alvo = state[self === 'player' ? 'enemy' : 'player'];
  const pool = eu.moves;
  if (!pool.length) return null;

  const chance = (p: number) => rng() < p;
  const pick = (arr: Move[]) => arr[Math.floor(rng() * arr.length)];

  const ataques = pool.filter(
    (m) => m.category === CATEGORY.ATAQUE && (m.power ?? 0) > 0,
  );
  const curas = pool.filter((m) =>
    m.effects.some((e) => e.kind === EFFECT.HEAL),
  );
  const utilitarios = pool.filter((m) => m.category !== CATEGORY.ATAQUE);

  // Abaixo de 30% de vida, tende a se curar — é o que faz o chefe parecer que
  // está lutando pela vida em vez de trocar dano até cair.
  if (eu.hp < eu.maxHp * 0.3 && curas.length && chance(0.6)) {
    return pick(curas);
  }

  const superEfetivos = ataques.filter(
    (m) => typeMultiplier(m.type, alvo.types) > 1,
  );
  if (superEfetivos.length && chance(0.75)) return pick(superEfetivos);

  if (utilitarios.length && chance(0.25)) return pick(utilitarios);

  return ataques.length ? pick(ataques) : pick(pool);
}
