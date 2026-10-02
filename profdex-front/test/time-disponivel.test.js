import assert from 'node:assert/strict'
import test from 'node:test'
import {
  professoresParaOTime,
  totalDeExemplares,
} from '../src/composables/timeDisponivel.js'

// A lista de escolha de time já errou duas vezes pela MESMA omissão: ela nasceu
// como "a dex", e todo professor que vive fora da contagem da dex ficava
// invisível para a batalha — primeiro os raros, depois o lendário. Como
// componente Vue não é testado neste repositório (ver battle-sprites.test.js),
// é este arquivo que impede a terceira vez.

const COMUM = { id: 'p-comum', name: 'Eron', slug: 'eron' }
const RARO = { id: 'p-raro', name: 'Mário', slug: 'mario' }
const LENDARIO = { id: 'p-lendario', name: 'Lendário', slug: 'lendario' }

/** Um exemplar por professor listado — o caso do aluno que pegou um de cada. */
const umDeCada = (ids) => (id) =>
  ids.includes(id) ? [{ id: `cap-${id}`, professorId: id }] : []

test('o lendário vencido entra na escolha de time', () => {
  const lista = professoresParaOTime(
    { dex: [COMUM], raros: [], lendario: [LENDARIO] },
    umDeCada(['p-comum', 'p-lendario']),
  )

  assert.deepEqual(
    lista.map((p) => p.id),
    ['p-comum', 'p-lendario'],
  )
})

test('o raro possuído entra na escolha de time', () => {
  const lista = professoresParaOTime(
    { dex: [COMUM], raros: [RARO], lendario: [] },
    umDeCada(['p-comum', 'p-raro']),
  )

  assert.deepEqual(
    lista.map((p) => p.id),
    ['p-comum', 'p-raro'],
  )
})

// O lendário é a última entrada da coleção; a faixa de escolha segue a mesma
// ordem da Profdex, então ele vem depois dos raros, que vêm depois da dex.
test('mantém a ordem dex → raros → lendário', () => {
  const lista = professoresParaOTime(
    { dex: [COMUM], raros: [RARO], lendario: [LENDARIO] },
    umDeCada(['p-comum', 'p-raro', 'p-lendario']),
  )

  assert.deepEqual(
    lista.map((p) => p.id),
    ['p-comum', 'p-raro', 'p-lendario'],
  )
})

// Antes de vencer a raid o servidor manda `legendary: null` de propósito (nome e
// arte não atravessam a fronteira antes da captura), e a lista é `[]`: a tela
// precisa ficar exatamente como era.
test('sem a raid vencida nada muda na lista', () => {
  const lista = professoresParaOTime(
    { dex: [COMUM], raros: [], lendario: [] },
    umDeCada(['p-comum']),
  )

  assert.deepEqual(
    lista.map((p) => p.id),
    ['p-comum'],
  )
})

// Descoberto não é capturado: sem exemplar não há o que pôr em campo, e um card
// vazio na faixa faria o aluno clicar à toa.
test('professor sem exemplar fica fora, mesmo estando na dex', () => {
  const lista = professoresParaOTime(
    { dex: [COMUM, RARO], raros: [], lendario: [LENDARIO] },
    umDeCada(['p-comum']),
  )

  assert.deepEqual(
    lista.map((p) => p.id),
    ['p-comum'],
  )
})

test('anexa os exemplares de cada professor', () => {
  const lista = professoresParaOTime(
    { dex: [], raros: [], lendario: [LENDARIO] },
    () => [{ id: 'cap-1' }, { id: 'cap-2' }],
  )

  assert.deepEqual(
    lista[0].exemplares.map((e) => e.id),
    ['cap-1', 'cap-2'],
  )
  // O professor original não é mutado: a lista é derivada a cada recálculo.
  assert.equal(LENDARIO.exemplares, undefined)
})

// O teto de slots conta EXEMPLARES, não professores: dois do mesmo professor são
// dois personagens e ocupam dois slots.
test('o total conta exemplares, não professores', () => {
  const lista = professoresParaOTime(
    { dex: [COMUM], raros: [], lendario: [LENDARIO] },
    () => [{ id: 'a' }, { id: 'b' }],
  )

  assert.equal(totalDeExemplares(lista), 4)
  assert.equal(totalDeExemplares([]), 0)
})

// Chamada sem nada (listas ainda não carregadas) não pode estourar: a tela monta
// antes das respostas chegarem.
test('não quebra sem fontes nenhuma', () => {
  assert.deepEqual(professoresParaOTime(), [])
  assert.deepEqual(professoresParaOTime({}, () => []), [])
})
