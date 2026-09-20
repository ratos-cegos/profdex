// A arte de um professor — sprites e modelo 3D.
//
// Antes da tarefa 13 isto eram DOIS mapas por slug (`professorSprites.js` e
// `professorModels.js`) mais quatro telas montando caminho na mão
// (`/professors/<slug>-cartoon.png`). Cadastrar um professor exigia editar os
// arquivos e fazer deploy — e qualquer um esquecido virava "o professor novo
// aparece sem imagem", sem nada dizendo o motivo.
//
// Agora a fonte é o BANCO: `spriteFrontUrl`, `spriteBackUrl`, `modelUrl` e
// `pixelArt` vêm na resposta de /professors. Este módulo só escolhe o fallback.

/**
 * Último recurso de quem não tem arte.
 *
 * O cadastro exige as três peças e o seed preenche os três professores
 * existentes, então na prática isto não é usado — ele existe para que um dado
 * incompleto vire uma imagem neutra em vez de um <img> quebrado no meio da
 * arena. É o Gustavo porque ele é o mascote do app e já vai no build.
 */
export const SPRITE_PADRAO = '/professors/gustavo-frente.png'
export const MODELO_PADRAO = '/models/modelo-gustavo.glb'

/** Sprite DE FRENTE — é assim que o oponente aparece, ao fundo do palco. */
export function spriteFrenteDe(professor) {
  return professor?.spriteFrontUrl || SPRITE_PADRAO
}

/**
 * Sprite DE COSTAS — perspectiva clássica de batalha por turnos: quem joga vê o
 * próprio personagem de costas, em primeiro plano. Quem não tem arte de costas
 * cai no sprite frontal, que é o comportamento de sempre.
 */
export function spriteCostasDe(professor) {
  return professor?.spriteBackUrl || spriteFrenteDe(professor)
}

/**
 * Modelo 3D da tela de AR. Sprite não serve aqui: o modelo é o ponto da
 * experiência, e só um carrega por vez.
 */
export function modeloDe(professor) {
  return professor?.modelUrl || MODELO_PADRAO
}

/**
 * A sprite deve ser ampliada sem suavização?
 *
 * Só a pixel art de verdade recebe `image-rendering: pixelated`. Aplicar o
 * filtro num cartoon — desenho suave, que entra na tela reduzido — serrilha as
 * bordas dele. É uma coluna do professor (`pixel_art`), marcada no cadastro,
 * porque isso é propriedade da ARTE e não do arquivo.
 */
export function ehPixelArt(professor) {
  return Boolean(professor?.pixelArt)
}
