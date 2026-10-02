import assert from 'node:assert/strict'
import test from 'node:test'
import { roteiroDoOverlay } from '../src/composables/battleRoteiro.js'

// O bug: a arena montava `{ linhas, roleta }` e o `ator` (a sprite do Ricardo,
// dos quatro do NDE, do chefe se transformando) nunca chegava ao overlay.
test('a chegada do Ricardo leva o ator até o overlay', () => {
  const ator = {
    nome: 'Ricardo Infiltrado',
    sprites: ['/uploads/ricardo-infiltrado-frente.png'],
    pixelArt: true,
  }
  const roleta = { kind: 'buff', opcoes: ['Ponto Extra', 'Cola na Manga'], resultado: 'Cola na Manga' }
  const r = roteiroDoOverlay({ type: 'roteiro', linhas: ['oi'], roleta, ator })
  assert.deepEqual(r, { linhas: ['oi'], roleta, ator, estagio: null })
})

test('a virada de estágio leva o estágio e a arte de depois', () => {
  const ator = { nome: 'Tânia', sprites: ['/a.png'], pixelArt: true, spriteDepois: '/b.png' }
  const r = roteiroDoOverlay({ type: 'roteiro', linhas: [], ator, estagio: 2, target: 'enemy' })
  assert.equal(r.ator.spriteDepois, '/b.png')
  assert.equal(r.estagio, 2)
})

test('evento sem ator nem roleta: só as linhas', () => {
  assert.deepEqual(roteiroDoOverlay({ type: 'roteiro', linhas: ['O NDE caiu!'] }), {
    linhas: ['O NDE caiu!'],
    roleta: null,
    ator: null,
    estagio: null,
  })
  assert.deepEqual(roteiroDoOverlay(undefined).linhas, [])
})
