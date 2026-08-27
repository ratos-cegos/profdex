import assert from 'node:assert/strict'
import test from 'node:test'
import { fraquezasDe, typeMultiplier } from '../src/data/types.js'

test('tipo duplo produz fraqueza 4x e resistência 0,25x', () => {
  const types = ['calculo', 'ia-ml']
  assert.equal(typeMultiplier('logica', types), 4)
  assert.equal(typeMultiplier('robotica', types), 0.25)

  const groups = fraquezasDe(types)
  assert.ok(groups.fraco4.some((type) => type.id === 'logica'))
  assert.ok(groups.resiste4.some((type) => type.id === 'robotica'))
})
