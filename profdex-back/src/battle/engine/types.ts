// Roda de tipos — port TS de profdex-front/src/data/types.js (parte mecânica;
// o front continua dono dos metadados visuais: ícone, cor, descrição).
//
// Regra: a roda é cíclica. Cada tipo é SUPER-EFICAZ (2×) contra os 2 tipos
// SEGUINTES no sentido horário e FRACO (0,5×) contra os 2 anteriores. Contra os
// demais o dano é neutro (1×). A ordem do array É a roda.

export const SUPER_EFFECTIVE = 2;
export const NOT_EFFECTIVE = 0.5;
export const NEUTRAL = 1;

export const TYPE_CYCLE = [
  'humanas',
  'matematica',
  'ia',
  'robotica',
  'arquitetura',
  'engenharia-software',
  'redes',
  'banco',
  'algoritmos',
] as const;

export type TypeId = (typeof TYPE_CYCLE)[number];

const N = TYPE_CYCLE.length;
const INDEX_BY_ID = new Map<string, number>(TYPE_CYCLE.map((t, i) => [t, i]));

// Chave estável de uma combinação de tipos: ids ordenados e unidos por "+".
// A ordenação é o que faz ["ia","humanas"] e ["humanas","ia"] serem a mesma
// variante, sem depender da ordem em que o professor lista os tipos.
export function typeKeyOf(types: string[]): string {
  return [...new Set(types)].sort().join('+');
}

// Todas as combinações não-vazias dos tipos de um professor — é isso que vira
// uma variante colecionável. Um professor de dois tipos rende três (cada tipo
// sozinho e os dois juntos); de um tipo, rende uma só.
// Ordem: das mais simples para as mais completas, alfabética dentro de cada
// tamanho, para a tiragem impressa sair sempre igual.
export function typeCombinations(types: string[]): string[][] {
  const unicos = [...new Set(types)].sort();
  const combinacoes: string[][] = [];

  for (let mascara = 1; mascara < 1 << unicos.length; mascara++) {
    combinacoes.push(unicos.filter((_, i) => mascara & (1 << i)));
  }

  return combinacoes.sort(
    (a, b) => a.length - b.length || typeKeyOf(a).localeCompare(typeKeyOf(b)),
  );
}

// Multiplicador de `attackerId` atacando `defenderId`.
export function effectiveness(attackerId: string, defenderId: string): number {
  const a = INDEX_BY_ID.get(attackerId);
  const d = INDEX_BY_ID.get(defenderId);
  if (a === undefined || d === undefined) return NEUTRAL;
  const forward = (d - a + N) % N; // distância no sentido horário
  if (forward === 1 || forward === 2) return SUPER_EFFECTIVE;
  if (forward === N - 1 || forward === N - 2) return NOT_EFFECTIVE;
  return NEUTRAL;
}

// Efetividade de um golpe contra defensor de 1 OU 2 tipos: produto das
// efetividades (4× / 2× / 1× / 0,5× / 0,25×, como em Pokémon).
export function typeMultiplier(
  attackType: string,
  defenderTypes: string | string[],
): number {
  const list = Array.isArray(defenderTypes) ? defenderTypes : [defenderTypes];
  return list.reduce((mult, d) => mult * effectiveness(attackType, d), 1);
}
