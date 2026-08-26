import assert from 'node:assert/strict'
import test from 'node:test'
import { createCombatant } from '../src/composables/battleEngine.js'

test('IVs alteram vida e atributos do combatente', () => {
  const combatant = createCombatant({
    name: 'Exemplar',
    types: ['logica'],
    ivs: { ivHp: 15, ivRigor: 12, ivDidatica: 8, ivRaciocinio: 4 },
  })
  assert.equal(combatant.maxHp, 135)
  assert.deepEqual(combatant.baseStats, { rigor: 112, didatica: 108, raciocinio: 104 })
})
