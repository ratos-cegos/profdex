import assert from 'node:assert/strict'
import test from 'node:test'
import { abreviarNome } from '../src/services/abreviar-nome.js'

test('nome do meio vira inicial com ponto', () => {
  assert.equal(abreviarNome('Gregório Celso Garcia Campos'), 'Gregório C. G. Campos')
  assert.equal(abreviarNome('João Pedro Nascimento'), 'João P. Nascimento')
  assert.equal(abreviarNome('Thiago Kenji Watanabe'), 'Thiago K. Watanabe')
})

test('nome com uma ou duas palavras fica como está', () => {
  assert.equal(abreviarNome('Bia'), 'Bia')
  assert.equal(abreviarNome('Ana Clara'), 'Ana Clara')
  assert.equal(abreviarNome('  Carla   Souza '), 'Carla Souza')
  assert.equal(abreviarNome(''), '')
  assert.equal(abreviarNome(null), '')
})

test('partícula no meio some; colada no sobrenome final fica', () => {
  assert.equal(abreviarNome('Maria Eduarda Schneider de Albuquerque'), 'Maria E. S. de Albuquerque')
  assert.equal(abreviarNome('Rafael dos Santos Oliveira'), 'Rafael S. Oliveira')
  assert.equal(abreviarNome('Rafael dos Santos'), 'Rafael dos Santos')
  assert.equal(abreviarNome('Fernanda Aparecida da Silva'), 'Fernanda A. da Silva')
})

test('agnome fica inteiro junto do sobrenome', () => {
  assert.equal(abreviarNome('Luiz Henrique Vasconcellos Pereira Filho'), 'Luiz H. V. Pereira Filho')
  assert.equal(abreviarNome('Carlos Alberto Júnior'), 'Carlos Alberto Júnior')
  assert.equal(abreviarNome('José Maria dos Santos Neto'), 'José M. dos Santos Neto')
})

test('inicial acentuada e minúscula sai maiúscula', () => {
  assert.equal(abreviarNome('Ana érica Lima'), 'Ana É. Lima')
})
