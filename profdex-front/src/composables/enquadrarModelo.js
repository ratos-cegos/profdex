// Enquadramento de um GLB de professor na cena 3D (ver SceneContent.vue).
//
// Os modelos são cadastrados pelo painel e cada um nasce na escala do editor de
// quem o exportou — e com o pivô onde o exportador deixou, que raramente é o
// centro do corpo. Sem normalizar, um professor aparece gigante, o outro é um
// ponto no chão, e o que tem pivô deslocado ORBITA em volta do nada em vez de
// girar no próprio eixo.
//
// A conta mora aqui, fora do componente, porque é a única parte disso que dá
// para verificar sem uma GPU: o resto é `objeto.scale.setScalar(...)`.

/**
 * A caixa que todo professor passa a ocupar, em unidades de cena.
 *
 * A câmera do Stage3D enquadra exatamente esta caixa. Mudar aqui sem mudar lá
 * deixa o professor cortado ou perdido no meio da tela.
 */
export const LADO_ALVO = 2

/**
 * Uma caixa vazia, do jeito que o Three as representa: `makeEmpty()` põe min em
 * +infinito e max em -infinito, então `max < min` em qualquer eixo é "ninguém
 * mediu nada ainda". É o que acontece enquanto o GLB não terminou de carregar.
 */
function vazia({ min, max }) {
  return max.x < min.x || max.y < min.y || max.z < min.z
}

/**
 * A escala e a posição que põem um modelo centrado no eixo de giro, de pé no
 * chão e inteiro dentro de LADO_ALVO.
 *
 * Aceita qualquer objeto com `min`/`max` em `{x,y,z}` — um `THREE.Box3` serve,
 * e o teste não precisa de três dimensões de dependência para existir.
 *
 * Devolve `null` quando não há o que enquadrar (modelo ainda carregando, ou
 * geometria degenerada); quem chama tenta de novo no frame seguinte.
 *
 * @param {{min: {x:number,y:number,z:number}, max: {x:number,y:number,z:number}}} caixa
 *   A caixa do modelo medida com a transformação dele zerada.
 * @returns {{escala: number, posicao: [number, number, number]} | null}
 */
export function enquadramentoDe(caixa) {
  if (!caixa || vazia(caixa)) return null

  const { min, max } = caixa
  const largura = max.x - min.x
  const altura = max.y - min.y
  const profundidade = max.z - min.z

  // `hypot` da base, e não o maior lado: o que precisa caber é o que o giro
  // VARRE, e um modelo a 45° apresenta para a câmera a diagonal da base.
  const extensao = Math.max(altura, Math.hypot(largura, profundidade))
  if (!Number.isFinite(extensao) || extensao <= 0) return null

  const escala = LADO_ALVO / extensao
  const centroX = (min.x + max.x) / 2
  const centroZ = (min.z + max.z) / 2

  return {
    escala,
    // x/z no centro: é o que faz o giro ser no próprio eixo. y nos pés: a
    // sombra cai debaixo do professor em vez de atravessá-lo.
    posicao: [-centroX * escala, -min.y * escala, -centroZ * escala],
  }
}
