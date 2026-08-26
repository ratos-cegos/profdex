import assert from 'node:assert/strict'
import test from 'node:test'
import { createCombatant, turnOrder, IV_BONUS_MAX, ivBonus } from '../src/composables/battleEngine.js'

// O motor tem duas cópias (aqui e em profdex-back/src/battle/engine/engine.ts).
// Estes testes fixam os números que as DUAS precisam produzir: se alguém mexer
// só num lado, PvE e PvP passam a jogar jogos diferentes.

test('IVs alteram vida e atributos, com o teto de bônus do ranqueado', () => {
  const combatant = createCombatant({
    name: 'Exemplar',
    types: ['logica'],
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

test('velocidade pesa a moeda da ordem de turno, não decide sozinha', () => {
  // Antes o empate ia sempre para o jogador, o que dava iniciativa permanente
  // contra o bot (que não tem IVs). Agora é probabilístico, igual ao servidor.
  const state = {
    player: createCombatant({ name: 'A', types: ['logica'], ivs: { ivRaciocinio: 15 } }),
    enemy: createCombatant({ name: 'B', types: ['logica'] }),
  }

  let primeiroDoJogador = 0
  for (let i = 0; i < 4000; i++) {
    if (turnOrder(state, null, null)[0].key === 'player') primeiroDoJogador++
  }
  const taxa = primeiroDoJogador / 4000

  // Vantagem real, mas longe do 100% de antes.
  assert.ok(taxa > 0.5, `esperado acima de 0,5, veio ${taxa}`)
  assert.ok(taxa < 0.56, `esperado abaixo de 0,56, veio ${taxa}`)
})
