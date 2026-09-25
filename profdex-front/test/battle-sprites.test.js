import assert from 'node:assert/strict'
import test from 'node:test'
import { spritesDaBatalha } from '../src/composables/battleSprites.js'
import { SPRITE_PADRAO } from '../src/data/professorArte.js'

// Perspectiva de batalha por turnos. O PvP usava o sprite de FRENTE nos dois
// lados, e o jogador via a própria cara em primeiro plano — este teste é o que
// impede a volta disso, já que componente Vue não é testado neste repositório.

const comAsDuasArtes = {
  name: 'Eron',
  spriteFrontUrl: '/professors/eron-frente.png',
  spriteBackUrl: '/professors/eron-costas.png',
}

const soDeFrente = {
  name: 'Mário',
  spriteFrontUrl: '/professors/mario-frente.png',
  spriteBackUrl: null,
}

test('você aparece de costas e o rival de frente', () => {
  const sprites = spritesDaBatalha(comAsDuasArtes, soDeFrente)

  assert.equal(sprites.you, '/professors/eron-costas.png')
  assert.equal(sprites.foe, '/professors/mario-frente.png')
})

test('professor sem arte de costas cai no sprite frontal', () => {
  const sprites = spritesDaBatalha(soDeFrente, comAsDuasArtes)

  assert.equal(sprites.you, '/professors/mario-frente.png')
  assert.equal(sprites.foe, '/professors/eron-frente.png')
})

test('lado ainda não carregado usa o sprite padrão em vez de <img> quebrada', () => {
  // Acontece de verdade: o PvP monta a tela antes do primeiro snapshot chegar.
  const sprites = spritesDaBatalha(null, undefined)

  assert.equal(sprites.you, SPRITE_PADRAO)
  assert.equal(sprites.foe, SPRITE_PADRAO)
})
