import assert from 'node:assert/strict'
import test from 'node:test'
import { fraquezasDe, typeMultiplier } from '../src/data/types.js'

test('tipo duplo produz fraqueza 4x e resistência 0,25x', () => {
  const types = ['matematica', 'ia']
  assert.equal(typeMultiplier('humanas', types), 4)
  assert.equal(typeMultiplier('robotica', types), 0.25)

  const groups = fraquezasDe(types)
  assert.ok(groups.fraco4.some((type) => type.id === 'humanas'))
  assert.ok(groups.resiste4.some((type) => type.id === 'robotica'))
})

// Os dois tipos que entraram na roda ocupam as vagas de Lógica e NPI, então
// herdam exatamente os matchups daquelas posições. O teste fixa isso: se
// alguém reordenar o TYPE_CYCLE sem perceber, o guia de tipos e a arena
// passariam a mostrar fraquezas diferentes das que o motor aplica.
test('fraquezasDe devolve os grupos certos para Humanas', () => {
  const grupos = fraquezasDe(['humanas'])

  assert.deepEqual(grupos.fraco2.map((t) => t.id).sort(), ['algoritmos', 'banco'])
  assert.deepEqual(grupos.resiste2.map((t) => t.id).sort(), ['ia', 'matematica'])
  assert.deepEqual(grupos.fraco4, [])
  assert.deepEqual(grupos.resiste4, [])
})

test('fraquezasDe devolve os grupos certos para Engenharia de Software', () => {
  const grupos = fraquezasDe(['engenharia-software'])

  assert.deepEqual(grupos.fraco2.map((t) => t.id).sort(), ['arquitetura', 'robotica'])
  assert.deepEqual(grupos.resiste2.map((t) => t.id).sort(), ['banco', 'redes'])
  assert.deepEqual(grupos.fraco4, [])
  assert.deepEqual(grupos.resiste4, [])
})
