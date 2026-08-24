// Roteiro da batalha que roda em loop na seção "Batalha" da landing.
//
// ⚠️ Isto NÃO é o motor de batalha. O motor real vive em
// profdex-back/src/battle/ e resolve dano no servidor; aqui os números são
// escritos à mão, porque o objetivo é uma vitrine determinística — a mesma
// partida, do mesmo jeito, toda vez que alguém rola a página até aqui.
//
// O que NÃO é hardcoded: a efetividade de tipo. A seção calcula o
// multiplicador com o `typeMultiplier` de data/types.js, ou seja, a mesma roda
// que a batalha de verdade usa. Se alguém reordenar o TYPE_CYCLE, a mensagem
// ("super-eficaz" / "pouco eficaz") acompanha sozinha em vez de virar mentira.
//
// Consequência prática disso, e é de propósito: Gustavo é Arquitetura, e
// Arquitetura é 1× contra Algoritmos (Mário) e 0,5× contra IA/ML (Eron). Ele
// ganha as duas, mas apanha para derrubar o Eron — que é exatamente a leitura
// certa de um duelo contra dois tipos combinados.

/** Quem o visitante "controla" — o mesmo avatar da arena PvE. */
export const PLAYER_SLUG = 'gustavo'

/**
 * O moveset de quatro golpes, montado a partir do movepool do tipo dele
 * (Arquitetura) — é a regra que o `battle.desc` do copy.js descreve.
 *
 * `category` sai da lista `battle.moveCategories`: nem todo golpe é dano, e a
 * demo escolhe um de defesa no meio da segunda luta justamente para isso
 * aparecer.
 */
export const PLAYER_MOVES = [
  { name: 'Refatorar', category: 'ataque', type: 'arquitetura' },
  { name: 'Microserviços', category: 'ataque', type: 'arquitetura' },
  { name: 'Load Balancer', category: 'defesa', type: 'arquitetura' },
  { name: 'Débito Técnico', category: 'debuff', type: 'arquitetura' },
]

/**
 * As duas lutas, em ordem, em loop infinito.
 *
 * Cada turno é UM destes dois formatos:
 *   { move: <índice em PLAYER_MOVES>, enemyHp?: <0-100>, note?: <texto> }
 *   { enemyMove: <nome>, playerHp: <0-100> }
 *
 * O HP é ABSOLUTO (o valor em que a barra fica depois do golpe), e não o dano
 * subtraído: assim dá para ler a curva da luta na vertical, sem somar nada de
 * cabeça, e um ajuste no meio não desloca todos os turnos seguintes.
 */
export const BATTLES = [
  {
    enemy: 'mario',
    turns: [
      { move: 0, enemyHp: 68 },
      { enemyMove: 'Backtracking', playerHp: 82 },
      { move: 1, enemyHp: 34 },
      { enemyMove: 'Força Bruta', playerHp: 71 },
      { move: 0, enemyHp: 0 },
    ],
  },
  {
    enemy: 'eron',
    turns: [
      { move: 0, enemyHp: 79 },
      { enemyMove: 'Overfitting', playerHp: 78 },
      { move: 2, note: 'A defesa de Gustavo subiu!' },
      { enemyMove: 'Monolito', playerHp: 66 },
      { move: 1, enemyHp: 52 },
      { enemyMove: 'Overfitting', playerHp: 49 },
      { move: 1, enemyHp: 31 },
      { move: 0, enemyHp: 0 },
    ],
  },
]
