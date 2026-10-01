// Quem aparece de frente e quem aparece de costas num palco de batalha.
//
// Parece trivial demais para virar módulo, e é justamente por isso que quebrou:
// o PvP usava `spriteFrenteDe` nos DOIS lados, e o jogador ficava se olhando de
// frente no meio da arena. Regra de uma linha em duas views é regra que
// divergem. Aqui ela é função pura — o único tipo de coisa que este front testa.
import { spriteCostasDe, spriteFrenteDoEstagio } from '../data/professorArte.js'

/**
 * A perspectiva clássica de batalha por turnos: você de costas, em primeiro
 * plano; o oponente de frente, ao fundo.
 *
 * Quem não tem arte de costas cai no sprite frontal — `spriteCostasDe` já
 * resolve isso, então nenhum professor do elenco fica sem imagem.
 *
 * O `estagioDoFoe` só existe na raid: o lendário troca de corpo a cada terço de
 * vida. Ausente (PvP, treino) ou fora de 2 e 3, cai na arte normal do professor
 * — e também cai nela quando o estágio existe mas a arte dele não, porque as
 * quatro colunas são nullable e a arte chega em levas.
 *
 * @param {object|null|undefined} you O professor em campo do seu lado.
 * @param {object|null|undefined} foe O professor em campo do lado do oponente.
 * @param {number|undefined} [estagioDoFoe] Estágio da raid do lado inimigo.
 * @returns {{ you: string, foe: string }} URLs de sprite de cada lado.
 */
export function spritesDaBatalha(you, foe, estagioDoFoe) {
  return {
    you: spriteCostasDe(you),
    foe: spriteFrenteDoEstagio(foe, estagioDoFoe),
  }
}
