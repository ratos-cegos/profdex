import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  MATRICULA_LONGA_MSG,
  MATRICULA_MAX_DIGITOS,
  MATRICULA_SO_DIGITOS_MSG,
  MATRICULA_VAZIA_MSG,
  mensagemDaApi,
  normalizarMatricula,
  validarMatricula,
} from '../src/services/matricula-rules.js'

// Cada linha é um jeito real de a matrícula chegar errada pelo celular — e
// virar uma conta que a bancada do quiz, que só digita 0–9, não encontra.
const NORMALIZAM = [
  ['202312345', '202312345'],
  ['  202312345  ', '202312345'],
  ['2023 12345', '202312345'],
  ['2023.123-45', '202312345'],
  ['2023/12345', '202312345'],
  ['2023–12345', '202312345'],
  ['2023−12345', '202312345'],
  ['2023​12345', '202312345'],
  ['﻿202312345', '202312345'],
  ['2023 12345', '202312345'],
  ['２０２３１２３４５', '202312345'],
]

test('normaliza o que o celular põe no campo', () => {
  for (const [entrada, esperado] of NORMALIZAM) {
    assert.equal(normalizarMatricula(entrada), esperado, JSON.stringify(entrada))
    assert.equal(validarMatricula(normalizarMatricula(entrada)), '')
  }
})

test('recusa o e-mail do autofill e o que não é número', () => {
  assert.equal(
    validarMatricula(normalizarMatricula('ana.souza@edu.unifil.br')),
    MATRICULA_SO_DIGITOS_MSG,
  )
  assert.equal(validarMatricula(normalizarMatricula('RA2023')), MATRICULA_SO_DIGITOS_MSG)
  assert.equal(validarMatricula(normalizarMatricula(' - ')), MATRICULA_VAZIA_MSG)
  assert.equal(validarMatricula('1'.repeat(MATRICULA_MAX_DIGITOS + 1)), MATRICULA_LONGA_MSG)
  assert.equal(validarMatricula('1'.repeat(MATRICULA_MAX_DIGITOS)), '')
  assert.equal(normalizarMatricula(undefined), '')
})

test('mostra a mensagem da API, mesmo quando o Nest manda uma lista', () => {
  const lista = { response: { data: { message: [MATRICULA_SO_DIGITOS_MSG, 'outra'] } } }
  const texto = { response: { data: { message: 'Matrícula já cadastrada' } } }

  assert.equal(mensagemDaApi(lista, 'padrão'), MATRICULA_SO_DIGITOS_MSG)
  assert.equal(mensagemDaApi(texto, 'padrão'), 'Matrícula já cadastrada')
  assert.equal(mensagemDaApi({}, 'padrão'), 'padrão')
  assert.equal(mensagemDaApi({ response: { data: { message: [] } } }, 'padrão'), 'padrão')
})

test('não diverge da regra que o backend realmente aplica', () => {
  // Quem recusa de verdade é a API. Com as duas regras fora de sincronia, a
  // tela aceitaria um valor que o servidor recusa — ou normalizaria para um
  // que a bancada não acha. A fonte do back é lida aqui, não copiada.
  const back = readFileSync(
    new URL('../../profdex-back/src/users/matricula.ts', import.meta.url),
    'utf8',
  )
  const front = readFileSync(new URL('../src/services/matricula-rules.js', import.meta.url), 'utf8')

  const teto = back.match(/MATRICULA_MAX_DIGITOS\s*=\s*(\d+)/)
  assert.ok(teto, 'MATRICULA_MAX_DIGITOS não encontrado no backend')
  assert.equal(Number(teto[1]), MATRICULA_MAX_DIGITOS)

  const soDigitos = back.match(/MATRICULA_SO_DIGITOS_MSG\s*=\s*'([^']+)'/)
  assert.ok(soDigitos, 'MATRICULA_SO_DIGITOS_MSG não encontrada no backend')
  assert.equal(soDigitos[1], MATRICULA_SO_DIGITOS_MSG)

  const regexDe = (fonte) => fonte.match(/normalize\('NFKC'\)\.replace\((\/.+?\/[a-z]*),/)?.[1]
  assert.ok(regexDe(back), 'normalização não encontrada no backend')
  assert.equal(regexDe(front), regexDe(back))
})

test('a bancada usa o mesmo teto do cadastro', () => {
  const bancada = readFileSync(new URL('../src/views/AdminQuizBoothView.vue', import.meta.url), 'utf8')

  assert.match(bancada, /import \{ MATRICULA_MAX_DIGITOS \} from '..\/services\/matricula-rules'/)
  assert.doesNotMatch(bancada, /const MAX_DIGITOS\s*=/)
})
