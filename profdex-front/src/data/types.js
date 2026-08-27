// Sistema de tipos da batalha (roda de vantagens).
//
// Regra: a roda é cíclica. Cada tipo é SUPER-EFICAZ (2×) contra os 2 tipos
// SEGUINTES no sentido horário e FRACO (0,5×) contra os 2 tipos ANTERIORES.
// Contra os demais o dano é neutro (1×).
//
// A ordem do array abaixo É a roda (sentido horário). Mudar a ordem muda as
// vantagens — os "forte/fraco" são derivados dela em runtime, não digitados à mão.
//
// ⚠️ O campo `icon` (emoji) é LEGADO. As telas renderizam `TypeIcon.vue`, que
// indexa pelo `id` e traz a arte oficial vetorial. O emoji continua aqui de
// propósito: um `{{ t.icon }}` esquecido em alguma tela não quebraria o build —
// renderizaria vazio, em silêncio. Mantido, ele degrada para o emoji antigo em
// vez de deixar um buraco. Não usar em código novo.

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

// ── Cor legível ─────────────────────────────────────────────────────────────
// Trazidos da landing page junto com o TypeIcon. Os ícones de tipo herdam
// `currentColor`, então quem decide a cor é quem os renderiza — e a paleta dos
// 9 tipos vai de #495057 (NPI, quase preto) a #F5A623 (Arquitetura, laranja
// claro). Uma cor fixa reprovaria em contraste na metade dos casos.

/**
 * Preto ou branco SOBRE a cor do tipo, escolhido por luminância relativa
 * (WCAG 2.1) em vez de no olho. Use quando o ícone fica em cima de uma área
 * preenchida com a cor canônica (setor da roda, badge sólida).
 */
export function onColor(hex) {
  const channel = (v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  const int = Number.parseInt(hex.slice(1), 16)
  const luminance =
    0.2126 * channel((int >> 16) & 255) +
    0.7152 * channel((int >> 8) & 255) +
    0.0722 * channel(int & 255)

  // Contraste contra branco = 1.05 / (L + 0.05); contra preto = (L + 0.05) / 0.05.
  // O ponto de virada é L ≈ 0,179.
  return luminance > 0.179 ? '#121418' : '#ffffff'
}

/**
 * Versão da cor do tipo que dá para LER sobre o fundo escuro do app.
 *
 * A paleta canônica foi desenhada para PREENCHER áreas, não para virar cor de
 * traço. O NPI (`#495057`) sobre `--bg-deep` (`#121418`) dá 1,7:1 — o ícone
 * sumiria. Este helper clareia até passar em 4,5:1 mantendo o matiz: continua
 * sendo "a cor do NPI", só que visível.
 *
 * @param {string} hex Cor canônica do tipo.
 * @param {number} minContrast Contraste mínimo desejado (4.5 = AA para texto).
 */
export function legibleColor(hex, minContrast = 4.5) {
  const toLinear = (v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  const luminance = (r, g, b) => 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)

  // Luminância do --bg-deep (#121418), fixa: é o fundo de todas as telas.
  const BG = 0.00603
  const int = Number.parseInt(hex.slice(1), 16)
  let [r, g, b] = [(int >> 16) & 255, (int >> 8) & 255, int & 255]

  // Clareia em passos de 6% na direção do branco. 20 passos chegam a ~71% de
  // branco no pior caso — suficiente para qualquer cor da paleta, e o laço
  // sempre termina.
  for (let step = 0; step < 20; step++) {
    if ((luminance(r, g, b) + 0.05) / (BG + 0.05) >= minContrast) break
    r = Math.round(r + (255 - r) * 0.06)
    g = Math.round(g + (255 - g) * 0.06)
    b = Math.round(b + (255 - b) * 0.06)
  }

  return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')
}
