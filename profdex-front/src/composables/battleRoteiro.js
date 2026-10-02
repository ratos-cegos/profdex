// O que o overlay de roteiro recebe de um evento `roteiro` da raid.
//
// A arena montava o objeto à mão com `{ linhas, roleta }` — uma linha escrita
// antes de o evento ganhar o `ator` (quem protagoniza a cena: o Ricardo
// Infiltrado, os quatro do NDE, o chefe que se transforma). O servidor mandava a
// sprite, o `AtorDoRoteiro` sabia desenhá-la, e ela se perdia no meio: em
// produção nenhum dos três momentos mostrava o personagem.
//
// Mora aqui, função pura, para um teste poder dizer que os campos chegam.

/** @param {object} ev O evento `roteiro` como veio do servidor. */
export function roteiroDoOverlay(ev) {
  return {
    linhas: ev?.linhas ?? [],
    roleta: ev?.roleta ?? null,
    ator: ev?.ator ?? null,
    estagio: ev?.estagio ?? null,
  }
}
