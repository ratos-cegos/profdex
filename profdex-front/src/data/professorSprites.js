// Sprite 2D de cada professor — o que a ARENA usa.
//
// A batalha desenhava os dois lados com <model-viewer> e os .glb de
// /public/models. Só que esses arquivos têm 27 MB (Eron), 27 MB (Mário) e
// 74 MB (Gustavo): uma partida baixava e mantinha decodificados DOIS deles ao
// mesmo tempo, mais o contexto WebGL de cada um. Num iPhone isso estoura o
// orçamento de memória da aba, e o Safari descarta a página — que é o "refresh
// sozinho no meio da batalha". Ver docs/BUG-BATALHA-TRAVANDO.md.
//
// Os cartoons já existiam (usados nas barras de HP) e pesam ~90 KB. Mesma
// convenção de chave do professorTypes.js/professorModels.js: slug ou nome
// normalizado resolvem o mesmo arquivo.
//
// O 3D não foi apagado — `professorModels.js` continua lá e serve a tela de AR,
// onde o modelo é o ponto da experiência e só um carrega por vez.

import { normalizeKey, PLAYER_KEY } from './professorTypes.js'

export const PROFESSOR_SPRITES = {
  eron: '/professors/eron-cartoon.png',
  gustavo: '/professors/gustavo-cartoon.png',
  mario: '/professors/mario-cartoon.png',
}

/** Padrão de quem ainda não tem arte própria. */
export const DEFAULT_SPRITE_URL = PROFESSOR_SPRITES.gustavo

/** Sprite do jogador na arena PvE — sempre o mesmo boneco. */
export const PLAYER_SPRITE_URL =
  PROFESSOR_SPRITES[PLAYER_KEY] ?? DEFAULT_SPRITE_URL

/**
 * Resolve o sprite de um professor: slug, depois nome, depois o padrão.
 *
 * Sem `modelUrl` da API por enquanto — aquele campo aponta para .glb, e servir
 * um modelo 3D dentro de uma <img> não renderiza nada.
 */
export function spriteUrlForProfessor(professor) {
  const candidates = [professor?.slug, professor?.name].filter(Boolean)
  for (const c of candidates) {
    const hit = PROFESSOR_SPRITES[normalizeKey(c)]
    if (hit) return hit
  }
  return DEFAULT_SPRITE_URL
}
