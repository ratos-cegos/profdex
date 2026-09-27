import assert from 'node:assert/strict'
import test from 'node:test'
import { atributosDe, melhorExemplarDe, IV_MAX } from '../src/data/professorAtributos.js'

// A ficha mostra o exemplar que o aluno levaria para a arena. Os números aqui
// TÊM de ser os que `createCombatant` produz — a tela anterior inventava um
// hash do slug, e foi exatamente isso que fez a ficha discordar da batalha.

const exemplar = (ivHp, ivRigor, ivDidatica, ivRaciocinio) => ({
  ivHp,
  ivRigor,
  ivDidatica,
  ivRaciocinio,
})
const valores = (stats) => Object.fromEntries(stats.map((s) => [s.key, s.value]))

test('o melhor exemplar é o de maior soma de IV', () => {
  const fraco = exemplar(1, 1, 1, 1)
  const forte = exemplar(15, 0, 15, 0)
  assert.equal(melhorExemplarDe([fraco, forte]), forte)
  assert.equal(melhorExemplarDe([forte, fraco]), forte)
})

test('empate na soma fica com o primeiro da lista', () => {
  // Duas listas da MESMA coleção não podem trocar o exemplar mostrado.
  const a = exemplar(15, 0, 0, 0)
  const b = exemplar(0, 15, 0, 0)
  assert.equal(melhorExemplarDe([a, b]), a)
})

test('coleção vazia não tem melhor exemplar', () => {
  assert.equal(melhorExemplarDe([]), null)
  assert.equal(melhorExemplarDe(), null)
})

test('os atributos são os do motor, não os da tela', () => {
  const stats = atributosDe(exemplar(15, 12, 8, 4))
  // Espelha battle-ivs.test.js: 120 + 5 de PV, e o bônus /15 × 5 nos demais.
  assert.deepEqual(valores(stats), {
    pv: 125,
    rigor: 104,
    didatica: 100 + (8 / 15) * 5,
    raciocinio: 100 + (4 / 15) * 5,
  })
})

test('sem exemplar a ficha mostra o chassi, com as barras zeradas', () => {
  const stats = atributosDe(null)
  assert.deepEqual(valores(stats), { pv: 120, rigor: 100, didatica: 100, raciocinio: 100 })
  assert.deepEqual(
    stats.map((s) => s.fill),
    [0, 0, 0, 0],
  )
})

test('a barra é o IV normalizado, não o atributo', () => {
  // Proporcional ao atributo, as quatro barras ficariam em ~95% e nenhum
  // exemplar se distinguiria do outro.
  const stats = atributosDe(exemplar(IV_MAX, 0, IV_MAX, 0))
  assert.deepEqual(
    stats.map((s) => s.fill),
    [1, 0, 1, 0],
  )
})
