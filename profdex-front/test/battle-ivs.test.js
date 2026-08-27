import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createCombatant,
  effectiveStat,
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

  // Determinístico: a probabilidade é a regra. Amostrar aqui deixaria o teste
  // instável, porque o valor esperado (~0,512) fica a menos de 2 desvios de
  // um limite em 0,5.
  const ps = effectiveStat(state.player, 'raciocinio')
  const es = effectiveStat(state.enemy, 'raciocinio')
  const probabilidade = ps / (ps + es)

  assert.ok(probabilidade > 0.5, `esperado acima de 0,5, veio ${probabilidade}`)
  assert.ok(probabilidade < 0.53, `esperado abaixo de 0,53, veio ${probabilidade}`)

  // Guarda de fumaça, com margem larga: a ordem realmente varia entre os dois.
  const lados = new Set()
  for (let i = 0; i < 200; i++) lados.add(turnOrder(state, null, null)[0].key)
  assert.deepEqual([...lados].sort(), ['enemy', 'player'])
})
