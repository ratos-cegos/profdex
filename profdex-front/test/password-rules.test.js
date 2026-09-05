import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  MIN_PASSWORD_LENGTH,
  SENHA_CURTA_MSG,
  SENHA_PLACEHOLDER,
  senhaTemTamanhoMinimo,
} from '../src/services/password-rules.js'

test('aceita a partir do mínimo e recusa abaixo dele', () => {
  assert.equal(senhaTemTamanhoMinimo('a'.repeat(MIN_PASSWORD_LENGTH)), true)
  assert.equal(senhaTemTamanhoMinimo('a'.repeat(MIN_PASSWORD_LENGTH - 1)), false)
  assert.equal(senhaTemTamanhoMinimo(''), false)
  assert.equal(senhaTemTamanhoMinimo(undefined), false)
})

test('a mensagem e o placeholder citam o mesmo número da regra', () => {
  // Eles eram literais soltos em três telas; se voltarem a divergir, o aluno lê
  // um número na dica e esbarra em outro na validação.
  assert.match(SENHA_CURTA_MSG, new RegExp(`\\b${MIN_PASSWORD_LENGTH}\\b`))
  assert.match(SENHA_PLACEHOLDER, new RegExp(`\\b${MIN_PASSWORD_LENGTH}\\b`))
})

test('não diverge do mínimo que o backend realmente exige', () => {
  // Quem recusa de verdade é a API. Com os dois números fora de sincronia, a
  // tela aceitaria uma senha que o servidor rejeita com um erro genérico —
  // então a fonte de verdade do back é lida aqui, não copiada.
  const constantesDoBack = readFileSync(
    new URL('../../profdex-back/src/auth/password.constants.ts', import.meta.url),
    'utf8',
  )
  const encontrado = constantesDoBack.match(
    /MIN_PASSWORD_LENGTH\s*=\s*(\d+)/,
  )

  assert.ok(encontrado, 'MIN_PASSWORD_LENGTH não encontrado no backend')
  assert.equal(Number(encontrado[1]), MIN_PASSWORD_LENGTH)
})
