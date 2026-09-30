import assert from 'node:assert/strict'
import test from 'node:test'
import { PLAYER_KEY, TREINO_ENEMY_KEY, sortearOponente } from '../src/data/treino.js'

const elenco = [{ slug: 'eron' }, { slug: 'gustavo' }, { slug: 'mario' }]

test('sorteia qualquer comum, menos o boneco do jogador', () => {
  const vistos = new Set()
  for (let i = 0; i < 10; i++) vistos.add(sortearOponente(elenco, () => i / 10))
  assert.deepEqual([...vistos].sort(), ['eron', 'mario'])
  assert.ok(!vistos.has(PLAYER_KEY))
})

test('elenco só com o boneco do jogador: luta contra ele', () => {
  assert.equal(sortearOponente([{ slug: PLAYER_KEY }]), PLAYER_KEY)
})

test('lista vazia ou ausente cai no fallback', () => {
  assert.equal(sortearOponente([]), TREINO_ENEMY_KEY)
  assert.equal(sortearOponente(undefined), TREINO_ENEMY_KEY)
})

test('nunca estoura o índice com Math.random no limite', () => {
  assert.equal(sortearOponente(elenco, () => 0.9999999), 'mario')
})
