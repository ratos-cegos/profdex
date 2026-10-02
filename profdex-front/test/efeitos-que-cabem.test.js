import assert from 'node:assert/strict'
import test from 'node:test'
import { quantasCabem } from '../src/composables/efeitosQueCabem.js'

test('cabem todas: nada de "+N"', () => {
  // 40 + 3 + 40 + 3 + 40 = 126
  assert.equal(quantasCabem([40, 40, 40], 126), 3)
  assert.equal(quantasCabem([40, 40, 40], 200, { larguraDoMais: 22 }), 3)
})

test('sobra uma: ela vira "+1", e o selo também precisa caber', () => {
  // 3 cabem em 126, mas não 4 (169). Com o "+N" (22) junto: 40+3+40+3+22 = 108
  // cabe; 40+3+40+3+40+3+22 = 151 não → 2 etiquetas + "+2".
  assert.equal(quantasCabem([40, 40, 40, 40], 145, { larguraDoMais: 22 }), 2)
})

test('etiqueta larga demais sozinha: só o "+N"', () => {
  assert.equal(quantasCabem([180, 40], 145, { larguraDoMais: 22 }), 0)
})

test('sem efeitos ou sem largura: zero', () => {
  assert.equal(quantasCabem([], 145), 0)
  assert.equal(quantasCabem([40], 0), 0)
  assert.equal(quantasCabem([40], NaN), 0)
})

test('o gap entra na conta', () => {
  assert.equal(quantasCabem([50, 50], 100, { gap: 0 }), 2)
  assert.equal(quantasCabem([50, 50], 100, { gap: 3, larguraDoMais: 20 }), 1)
})
