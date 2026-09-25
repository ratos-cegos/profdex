// Quem aparece de frente e quem aparece de costas num palco de batalha.
//
// Parece trivial demais para virar módulo, e é justamente por isso que quebrou:
// o PvP usava `spriteFrenteDe` nos DOIS lados, e o jogador ficava se olhando de
// frente no meio da arena. Regra de uma linha em duas views é regra que
// divergem. Aqui ela é função pura — o único tipo de coisa que este front testa.
import { spriteCostasDe, spriteFrenteDe } from '../data/professorArte.js'

/**
 * A perspectiva clássica de batalha por turnos: você de costas, em primeiro
 * plano; o oponente de frente, ao fundo.
 *
 * Quem não tem arte de costas cai no sprite frontal — `spriteCostasDe` já
 * resolve isso, então nenhum professor do elenco fica sem imagem.
 *
 * @param {object|null|undefined} you O professor em campo do seu lado.
 * @param {object|null|undefined} foe O professor em campo do lado do oponente.
 * @returns {{ you: string, foe: string }} URLs de sprite de cada lado.
 */
export function spritesDaBatalha(you, foe) {
  return {
    you: spriteCostasDe(you),
    foe: spriteFrenteDe(foe),
  }
}
