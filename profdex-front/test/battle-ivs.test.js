import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createCombatant,
  playerFirstChance,
  turnOrder,
  IV_BONUS_MAX,
  ivBonus,
} from '../src/composables/battleEngine.js'

// O motor tem duas cópias (aqui e em profdex-back/src/battle/engine/engine.ts).
// Estes testes fixam os números que as DUAS precisam produzir: se alguém mexer
// só num lado, PvE e PvP passam a jogar jogos diferentes.

test('IVs alteram vida e atributos, com o teto de bônus do ranqueado', () => {
  const combatant = createCombatant({
    name: 'Exemplar',
    types: ['humanas'],
    ivs: { ivHp: 15, ivRigor: 12, ivDidatica: 8, ivRaciocinio: 4 },
  })
  // O banco guarda 0–15; o combate usa 0–5.
  assert.equal(IV_BONUS_MAX, 5)
  assert.equal(combatant.maxHp, 125) // 120 + 5
  assert.equal(Math.round(combatant.baseStats.rigor * 1000) / 1000, 104) // 12/15 * 5
  assert.equal(Math.round(combatant.baseStats.didatica * 1000) / 1000, 102.667)
  assert.equal(Math.round(combatant.baseStats.raciocinio * 1000) / 1000, 101.333)
})

test('ivBonus reescala 0-15 para 0-IV_BONUS_MAX', () => {
  assert.equal(ivBonus(0), 0)
  assert.equal(ivBonus(15), IV_BONUS_MAX)
  assert.equal(ivBonus(undefined), 0)
})

test('a Velocidade maior abre o turno; empate é cara ou coroa', () => {
  // Igual ao servidor. O bot do treino não tem IVs: qualquer IV de Velocidade
  // já dá a iniciativa, e o empate não vai mais sempre para o jogador.
  const lado = (ivA, ivB) => ({
    player: createCombatant({ name: 'A', types: ['humanas'], ivs: { ivRaciocinio: ivA } }),
    enemy: createCombatant({ name: 'B', types: ['humanas'], ivs: { ivRaciocinio: ivB } }),
  })

  assert.equal(playerFirstChance(lado(1, 0)), 1)
  assert.equal(playerFirstChance(lado(0, 15)), 0)
  assert.equal(playerFirstChance(lado(9, 9)), 0.5)

  // Buff conta: um estágio vale mais que o IV inteiro.
  const acelerado = lado(0, 15)
  acelerado.player.stages.raciocinio = 1
  assert.equal(playerFirstChance(acelerado), 1)

  for (let i = 0; i < 200; i++) assert.equal(turnOrder(lado(15, 0), null, null)[0].key, 'player')

  const lados = new Set()
  for (let i = 0; i < 200; i++) lados.add(turnOrder(lado(9, 9), null, null)[0].key)
  assert.deepEqual([...lados].sort(), ['enemy', 'player'])
})
