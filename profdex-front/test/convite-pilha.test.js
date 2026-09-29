import assert from 'node:assert/strict'
import test from 'node:test'
import { convitesVisiveis, rotaSilenciada, segundosRestantes } from '../src/services/convite-pilha.js'

const convites = [
  { inviteId: 'b', from: { id: '2', name: 'Bia' }, expiresAt: 30_000 },
  { inviteId: 'a', from: { id: '1', name: 'Ana' }, expiresAt: 10_000 },
  { inviteId: 'c', from: { id: '3', name: 'Caio' }, expiresAt: 50_000 },
]

test('o que expira primeiro fica no topo da pilha', () => {
  const ids = convitesVisiveis(convites, { path: '/profdex' }).map((c) => c.inviteId)
  assert.deepEqual(ids, ['a', 'b', 'c'])
})

test('não reordena a lista do store', () => {
  const copia = [...convites]
  convitesVisiveis(convites, { path: '/profdex' })
  assert.deepEqual(convites, copia)
})

test('some durante a batalha', () => {
  assert.deepEqual(convitesVisiveis(convites, { pvp: { battleId: 'x' }, path: '/pvp' }), [])
})

test('some em todo o /admin, inclusive a bancada do quiz', () => {
  for (const path of ['/admin', '/admin/quiz/bancada', '/admin/metricas', '/admin/professores']) {
    assert.equal(rotaSilenciada(path), true, path)
    assert.deepEqual(convitesVisiveis(convites, { path }), [], path)
  }
})

test('rotas parecidas com admin continuam mostrando', () => {
  for (const path of ['/', '/profdex', '/ranking', '/administracao-falsa', '/adminx']) {
    assert.equal(rotaSilenciada(path), false, path)
  }
})

test('lista vazia ou ausente não quebra', () => {
  assert.deepEqual(convitesVisiveis(undefined, { path: '/' }), [])
})

test('segundos restantes arredondam para cima e param no zero', () => {
  assert.equal(segundosRestantes(10_000, 0), 10)
  assert.equal(segundosRestantes(10_000, 9_001), 1)
  assert.equal(segundosRestantes(10_000, 12_000), 0)
})
