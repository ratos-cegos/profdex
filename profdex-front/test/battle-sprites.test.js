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

// ── Sprites de ESTÁGIO da raid ───────────────────────────────────────────────
// O lendário troca de corpo a cada terço de vida. O estágio 1 usa a arte normal
// (a mesma da ficha da Profdex) e os estágios 2 e 3 têm par próprio.
const LENDARIO = {
  spriteFrontUrl: '/uploads/tanaka-frente.png',
  spriteBackUrl: '/uploads/tanaka-costas.png',
  spriteFrontE2Url: '/uploads/tanaka-frente-e2.png',
  spriteBackE2Url: '/uploads/tanaka-costas-e2.png',
  spriteFrontE3Url: '/uploads/tanaka-frente-e3.png',
  spriteBackE3Url: '/uploads/tanaka-costas-e3.png',
}

test('o estágio escolhe o par de sprites do chefe', () => {
  assert.equal(spritesDaBatalha(null, LENDARIO, 1).foe, '/uploads/tanaka-frente.png')
  assert.equal(spritesDaBatalha(null, LENDARIO, 2).foe, '/uploads/tanaka-frente-e2.png')
  assert.equal(spritesDaBatalha(null, LENDARIO, 3).foe, '/uploads/tanaka-frente-e3.png')
})

test('sem estágio (PvP e treino) a arte é a normal', () => {
  assert.equal(spritesDaBatalha(null, LENDARIO).foe, '/uploads/tanaka-frente.png')
  assert.equal(spritesDaBatalha(null, LENDARIO, null).foe, '/uploads/tanaka-frente.png')
})

// As quatro colunas são nullable e a arte chega em levas: estágio sem sprite
// tem de continuar jogável, só não muda de cara.
test('estágio sem arte cai na arte de base em vez de quebrar', () => {
  const semEstagios = { spriteFrontUrl: '/uploads/tanaka-frente.png' }

  assert.equal(spritesDaBatalha(null, semEstagios, 2).foe, '/uploads/tanaka-frente.png')
  assert.equal(spritesDaBatalha(null, semEstagios, 3).foe, '/uploads/tanaka-frente.png')
})

test('o estágio do chefe não mexe no sprite de costas do aluno', () => {
  const aluno = { spriteFrontUrl: '/f.png', spriteBackUrl: '/c.png' }

  assert.equal(spritesDaBatalha(aluno, LENDARIO, 3).you, '/c.png')
})
