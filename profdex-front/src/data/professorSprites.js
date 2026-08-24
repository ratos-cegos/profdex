// Sprite 2D de cada professor — o que a ARENA usa.
//
// A batalha desenhava os dois lados com <model-viewer> e os .glb de
// /public/models. Só que esses arquivos têm 27 MB (Eron), 27 MB (Mário) e
// 74 MB (Gustavo): uma partida baixava e mantinha decodificados DOIS deles ao
// mesmo tempo, mais o contexto WebGL de cada um. Num iPhone isso estoura o
// orçamento de memória da aba, e o Safari descarta a página — que é o "refresh
// sozinho no meio da batalha". Ver docs/BUG-BATALHA-TRAVANDO.md.
//
// Os cartoons (`*-cartoon.png`) continuam nas fichas e na captura — ver
// ProfessorView.vue e ScanView.vue. A arena usa `{slug}-frente.png` /
// `{slug}-costas.png` em pixel art. Eron e Mário vêm de
// `profdex-landing/assets-src/sprites/` (captura 3× reamostrada para altura 64).
// Ver docs/ESTILO-VISUAL.md.
//
// Elenco do evento: Gustavo, Eron, Mário, João, Simone, Tânia (t-camis).
//
// O 3D não foi apagado — `professorModels.js` continua lá e serve a tela de AR,
// onde o modelo é o ponto da experiência e só um carrega por vez.

import { normalizeKey, PLAYER_KEY } from './professorTypes.js'

// Sprites DE FRENTE — é assim que o oponente aparece, ao fundo do palco.
export const PROFESSOR_SPRITES = {
  eron: '/professors/eron-frente.png',
  gustavo: '/professors/gustavo-frente.png',
  joao: '/professors/joao-frente.png',
  mario: '/professors/mario-frente.png',
  simone: '/professors/simone-frente.png',
  // Tânia = T. Camis (arquivos `tania-*.png`; slugs `t-camis` / `camis`).
  't-camis': '/professors/tania-frente.png',
  camis: '/professors/tania-frente.png',
  tania: '/professors/tania-frente.png',
  't-camis-palmeirense': '/professors/t-camis-palmeirense-frente.png',
}

// Sprites DE COSTAS — perspectiva clássica de batalha por turnos: quem joga vê
// o próprio personagem de costas, em primeiro plano, encarando o oponente que
// está de frente lá no fundo. Quem não tem arte de costas cai no sprite frontal.
export const PROFESSOR_SPRITES_COSTAS = {
  eron: '/professors/eron-costas.png',
  gustavo: '/professors/gustavo-costas.png',
  joao: '/professors/joao-costas.png',
  mario: '/professors/mario-costas.png',
  simone: '/professors/simone-costas.png',
  't-camis': '/professors/tania-costas.png',
  camis: '/professors/tania-costas.png',
  tania: '/professors/tania-costas.png',
  't-camis-palmeirense': '/professors/t-camis-palmeirense-costas.png',
}

export const ATAQUE_FRAMES = 6

// Folha horizontal de ataque (6 frames). Frente = oponente; costas = jogador.
export const PROFESSOR_ATAQUE = {
  eron: '/professors/eron-ataque-sheet.png',
  gustavo: '/professors/gustavo-ataque-sheet.png',
  joao: '/professors/joao-ataque-sheet.png',
  mario: '/professors/mario-ataque-sheet.png',
  simone: '/professors/simone-ataque-sheet.png',
  't-camis': '/professors/tania-ataque-sheet.png',
  camis: '/professors/tania-ataque-sheet.png',
  tania: '/professors/tania-ataque-sheet.png',
  't-camis-palmeirense': '/professors/t-camis-palmeirense-ataque-sheet.png',
}

export const PROFESSOR_ATAQUE_COSTAS = {
  eron: '/professors/eron-ataque-costas-sheet.png',
  gustavo: '/professors/gustavo-ataque-costas-sheet.png',
  joao: '/professors/joao-ataque-costas-sheet.png',
  mario: '/professors/mario-ataque-costas-sheet.png',
  simone: '/professors/simone-ataque-costas-sheet.png',
  't-camis': '/professors/tania-ataque-costas-sheet.png',
  camis: '/professors/tania-ataque-costas-sheet.png',
  tania: '/professors/tania-ataque-costas-sheet.png',
  't-camis-palmeirense': '/professors/t-camis-palmeirense-ataque-costas-sheet.png',
}

// Quais sprites são pixel art de verdade. Só esses recebem
// `image-rendering: pixelated`: aplicar o filtro nos cartoons — que são desenho
// suave e entram na tela reduzidos — serrilharia as bordas deles.
const SPRITES_PIXEL_ART = new Set([
  PROFESSOR_SPRITES.eron,
  PROFESSOR_SPRITES.gustavo,
  PROFESSOR_SPRITES.joao,
  PROFESSOR_SPRITES.mario,
  PROFESSOR_SPRITES.simone,
  PROFESSOR_SPRITES.tania,
  PROFESSOR_SPRITES['t-camis-palmeirense'],
  PROFESSOR_SPRITES_COSTAS.eron,
  PROFESSOR_SPRITES_COSTAS.gustavo,
  PROFESSOR_SPRITES_COSTAS.joao,
  PROFESSOR_SPRITES_COSTAS.mario,
  PROFESSOR_SPRITES_COSTAS.simone,
  PROFESSOR_SPRITES_COSTAS.tania,
  PROFESSOR_SPRITES_COSTAS['t-camis-palmeirense'],
])

/** O sprite deve ser ampliado sem suavização? */
export function ehPixelArt(url) {
  return SPRITES_PIXEL_ART.has(url)
}

/** Padrão de quem ainda não tem arte própria. */
export const DEFAULT_SPRITE_URL = PROFESSOR_SPRITES.gustavo

function resolveKey(professor) {
  const candidates = [professor?.slug, professor?.name].filter(Boolean)
  for (const c of candidates) {
    const key = normalizeKey(c)
    if (PROFESSOR_SPRITES[key] || PROFESSOR_SPRITES_COSTAS[key]) return key
  }
  return null
}

/** Sprite do jogador na arena PvE — de costas, em primeiro plano. */
export const PLAYER_SPRITE_URL =
  PROFESSOR_SPRITES_COSTAS[PLAYER_KEY] ??
  PROFESSOR_SPRITES[PLAYER_KEY] ??
  DEFAULT_SPRITE_URL

/**
 * Resolve o sprite de frente de um professor: slug, depois nome, depois o padrão.
 */
export function spriteUrlForProfessor(professor) {
  const key = resolveKey(professor)
  if (key && PROFESSOR_SPRITES[key]) return PROFESSOR_SPRITES[key]
  return DEFAULT_SPRITE_URL
}

/**
 * Resolve o sprite de costas (jogador / primeiro plano). Cai na frente se não
 * houver costas próprias; depois no padrão.
 */
export function spriteCostasUrlForProfessor(professor) {
  const key = resolveKey(professor)
  if (key && PROFESSOR_SPRITES_COSTAS[key]) return PROFESSOR_SPRITES_COSTAS[key]
  if (key && PROFESSOR_SPRITES[key]) return PROFESSOR_SPRITES[key]
  return PLAYER_SPRITE_URL
}

/** Folha de ataque de frente (oponente). Sem arte, a arena cai no lunge CSS. */
export function ataqueSheetUrlForProfessor(professor) {
  const key = resolveKey(professor)
  if (key && PROFESSOR_ATAQUE[key]) return PROFESSOR_ATAQUE[key]
  return null
}

/** Folha de ataque de costas (jogador). */
export function ataqueCostasSheetUrlForProfessor(professor) {
  const key = resolveKey(professor)
  if (key && PROFESSOR_ATAQUE_COSTAS[key]) return PROFESSOR_ATAQUE_COSTAS[key]
  return null
}
