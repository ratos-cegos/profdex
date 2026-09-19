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

// Deriva um tipo estável a partir de uma "semente" (slug/id/nome) — mesmo hash
// do front, para professor sem tipo mapeado cair no MESMO tipo dos dois lados.
export function typeIdFromSeed(seed: string | null | undefined): TypeId {
  const s = seed ?? '';
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return TYPE_CYCLE[h % N];
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
