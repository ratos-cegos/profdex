// Quanto cada evento da batalha fica na tela, em milissegundos.
//
// Um lugar só para o PvP (PvpArenaView) e o treino (useBattle): antes eram duas
// cópias dos mesmos números, e ajustar a leitura numa tela deixava a outra
// para trás.
//
// Os valores antigos (850ms por mensagem) não davam tempo de ler "Eron usou
// Decoreba!" e o dano que vinha em seguida — a rodada passava como um borrão.
// Estes seguram cada texto o suficiente para uma leitura com o celular na mão,
// e dão à troca e à queda o tempo da própria animação do palco (0,6s de
// transição do sprite) antes da próxima frase.
export const TEMPO = Object.freeze({
  mensagem: 1600,
  // Dano: primeiro o impacto (sprite tremendo, barra descendo), depois a frase
  // "Causou N de dano!".
  danoImpacto: 600,
  danoTexto: 1200,
  cura: 1100,
  status: 500,
  eficacia: 1400,
  queda: 900,
  troca: 1300,
})

export const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
