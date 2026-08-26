// Sistema de tipos da batalha (roda de vantagens).
//
// Regra: a roda é cíclica. Cada tipo é SUPER-EFICAZ (2×) contra os 2 tipos
// SEGUINTES no sentido horário e FRACO (0,5×) contra os 2 tipos ANTERIORES.
// Contra os demais o dano é neutro (1×).
//
// A ordem do array abaixo É a roda (sentido horário). Mudar a ordem muda as
// vantagens — os "forte/fraco" são derivados dela em runtime, não digitados à mão.

export const SUPER_EFFECTIVE = 2
export const NOT_EFFECTIVE = 0.5
export const NEUTRAL = 1

export const TYPE_CYCLE = [
  {
    id: 'logica',
    label: 'Lógica',
    icon: '🧩',
    color: '#6C4DE0',
    description: 'Prova formal, dedução e abstração pura.',
  },
  {
    id: 'calculo',
    label: 'Cálculo',
    icon: '📐',
    color: '#F03E3E',
    description: 'Limites, derivadas e otimização contínua.',
  },
  {
    id: 'ia-ml',
    label: 'IA / ML',
    icon: '🧠',
    color: '#12B886',
    description: 'Redes neurais, aprendizado e previsão.',
  },
  {
    id: 'robotica',
    label: 'Robótica',
    icon: '🤖',
    color: '#0CA5B8',
    description: 'Sensores, atuadores e controle físico.',
  },
  {
    id: 'arquitetura',
    label: 'Arquitetura',
    icon: '🖥️',
    color: '#F5A623',
    description: 'Hardware, pipelines e baixo nível.',
  },
  {
    id: 'npi',
    label: 'NPI',
    icon: '🧑‍🏫',
    color: '#495057',
    description: 'Práticas integradoras: projetos, code review e entregas.',
  },
  {
    id: 'redes',
    label: 'Redes',
    icon: '🌐',
    color: '#3B5BDB',
    description: 'Protocolos, roteamento e sistemas distribuídos.',
  },
  {
    id: 'banco',
    label: 'Banco de Dados',
    icon: '🗄️',
    color: '#E64980',
    description: 'Consultas, índices e álgebra relacional.',
  },
  {
    id: 'algoritmos',
    label: 'Algoritmos',
    icon: '🔀',
    color: '#66BB2E',
    description: 'Estruturas, complexidade e eficiência.',
  },
]

const N = TYPE_CYCLE.length
const INDEX_BY_ID = new Map(TYPE_CYCLE.map((t, i) => [t.id, i]))

export function getType(id) {
  const i = INDEX_BY_ID.get(id)
  return i === undefined ? null : TYPE_CYCLE[i]
}

// Deriva um id de tipo de forma determinística a partir de uma "semente"
// (slug/id/nome do professor). Estável: o mesmo professor cai sempre no mesmo
// tipo, mesmo que a API não traga um campo `type`.
export function typeIdFromSeed(seed) {
  const s = String(seed ?? '')
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return TYPE_CYCLE[h % N].id
}

// Tipo `n` posições adiante na roda (usado p/ garantir tipos distintos).
export function shiftType(id, n) {
  const i = INDEX_BY_ID.get(id)
  if (i === undefined) return id
  return TYPE_CYCLE[(i + n + N) % N].id
}

// Os 2 tipos seguintes (horário) — contra quem este tipo é forte.
export function strongAgainst(id) {
  const i = INDEX_BY_ID.get(id)
  if (i === undefined) return []
  return [TYPE_CYCLE[(i + 1) % N], TYPE_CYCLE[(i + 2) % N]]
}

// Os 2 tipos anteriores — contra quem este tipo é fraco.
export function weakAgainst(id) {
  const i = INDEX_BY_ID.get(id)
  if (i === undefined) return []
  return [TYPE_CYCLE[(i - 1 + N) % N], TYPE_CYCLE[(i - 2 + N) % N]]
}

// Multiplicador de dano de `attackerId` atacando `defenderId`.
// Usar em useBattle.js (rollDamage) quando os golpes tiverem tipo.
export function effectiveness(attackerId, defenderId) {
  const a = INDEX_BY_ID.get(attackerId)
  const d = INDEX_BY_ID.get(defenderId)
  if (a === undefined || d === undefined) return NEUTRAL
  const forward = (d - a + N) % N // distância no sentido horário
  if (forward === 1 || forward === 2) return SUPER_EFFECTIVE
  if (forward === N - 1 || forward === N - 2) return NOT_EFFECTIVE
  return NEUTRAL
}

// Efetividade de um golpe (tipo único) contra um defensor de 1 OU 2 tipos:
// produto das efetividades contra cada tipo do defensor. Combina em
// 4× / 2× / 1× / 0,5× / 0,25× (como em Pokémon).
export function typeMultiplier(attackType, defenderTypes) {
  const list = Array.isArray(defenderTypes) ? defenderTypes : [defenderTypes]
  return list.reduce((mult, d) => mult * effectiveness(attackType, d), 1)
}

// Agrupa todos os tipos ofensivos pela efetividade contra uma combinação de
// tipos. A função é pura para que cards, seletor de batalha e testes usem a
// mesma regra da arena.
export function fraquezasDe(defenderTypes) {
  const groups = { fraco4: [], fraco2: [], resiste2: [], resiste4: [] }
  for (const type of TYPE_CYCLE) {
    const multiplier = typeMultiplier(type.id, defenderTypes)
    if (multiplier >= 4) groups.fraco4.push(type)
    else if (multiplier > 1) groups.fraco2.push(type)
    else if (multiplier <= 0.25) groups.resiste4.push(type)
    else if (multiplier < 1) groups.resiste2.push(type)
  }
  return groups
}
