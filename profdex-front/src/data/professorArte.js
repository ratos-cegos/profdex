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
 * Sprite de frente de um ESTÁGIO da raid.
 *
 * O lendário troca de corpo a cada terço de vida (ver `raid-estagios.ts` no
 * back). O estágio 1 usa a arte normal — a mesma da ficha da Profdex — e os
 * estágios 2 e 3 têm par próprio.
 *
 * Cai na arte de base quando a do estágio falta, e isso é regra e não acidente:
 * as quatro colunas são nullable, a arte chega em levas, e estágio sem sprite
 * tem de continuar jogável — ele só não muda de cara. Qualquer estágio fora de
 * 2 e 3 também cai aqui, o que cobre o `undefined` de todo combate que não é
 * raid.
 */
export function spriteFrenteDoEstagio(professor, estagio) {
  if (estagio === 2) return professor?.spriteFrontE2Url || spriteFrenteDe(professor)
  if (estagio === 3) return professor?.spriteFrontE3Url || spriteFrenteDe(professor)
  return spriteFrenteDe(professor)
}

/**
 * Sprite de costas de um estágio. Existe por simetria — o chefe nunca aparece de
 * costas (quem fica de costas é o professor do ALUNO) —, e porque o cadastro
 * exige os quatro arquivos: deixar metade sem uso no código seria convidar a
 * próxima pessoa a achar que falta algo.
 */
export function spriteCostasDoEstagio(professor, estagio) {
  if (estagio === 2) return professor?.spriteBackE2Url || spriteCostasDe(professor)
  if (estagio === 3) return professor?.spriteBackE3Url || spriteCostasDe(professor)
  return spriteCostasDe(professor)
}

/**
 * Modelo 3D da tela de AR. Sprite não serve aqui: o modelo é o ponto da
 * experiência, e só um carrega por vez.
 */
export function modeloDe(professor) {
  return professor?.modelUrl || MODELO_PADRAO
}

/**
 * Este professor tem modelo 3D PRÓPRIO?
 *
 * A pergunta existe porque `modeloDe` cai no Gustavo quando não há modelo, e
 * esse fallback é certo na AR (uma imagem neutra em vez de nada) e errado na
 * revelação da bancada: ali o 3D ANUNCIA quem o aluno acabou de capturar, e
 * mostrar o Gustavo no lugar do professor certo é pior que não mostrar 3D
 * nenhum (tarefa 17, decisão 17). Quem não tem modelo aparece pelo sprite.
 *
 * Mora aqui, e não na view, para o painel de professores e a bancada
 * responderem a mesma coisa — existem 3 GLB para um elenco maior.
 */
export function temModeloProprio(professor) {
  return Boolean(professor?.modelUrl)
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
