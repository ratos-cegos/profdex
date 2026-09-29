import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  desenharIcone,
  ICONES,
  PALETA,
  TAMANHO_GRADE,
  TIER_ICONE,
} from '../src/data/pixelIcons.js'

// Uma linha com um pixel a mais desalinha o ícone inteiro sem erro nenhum na
// tela — só fica "torto". O teste pega isso antes do olho.
test('toda grade é quadrada, do tamanho padrão', () => {
  for (const [nome, { grade }] of Object.entries(ICONES)) {
    assert.equal(grade.length, TAMANHO_GRADE, `${nome}: número de linhas`)
    grade.forEach((linha, i) => {
      assert.equal(linha.length, TAMANHO_GRADE, `${nome}: linha ${i} tem ${linha.length} pixels`)
    })
  }
})

// Letra fora da paleta vira `fill: undefined` — o pixel some em silêncio.
test('todo pixel resolve para uma cor da paleta', () => {
  for (const [nome, { grade, cores = {} }] of Object.entries(ICONES)) {
    for (const letra of new Set(grade.join(''))) {
      if (letra === '.') continue
      const chave = cores[letra] ?? letra
      assert.ok(PALETA[chave], `${nome}: a letra "${letra}" não tem cor`)
    }
  }
})

test('a paleta só usa tokens, nunca hex solto', () => {
  for (const [letra, cor] of Object.entries(PALETA)) {
    assert.match(cor, /^(var\(--[\w-]+\)|currentColor)$/, `letra "${letra}": ${cor}`)
  }
})

test('desenharIcone junta pixels vizinhos da mesma cor', () => {
  const icone = desenharIcone('fechar')
  assert.equal(icone.largura, 12)
  assert.equal(icone.altura, 12)
  // Só uma cor (currentColor), e a primeira linha pintada (".xx......xx.")
  // sai como dois retângulos de 2px, não quatro de 1px.
  assert.equal(icone.camadas.length, 1)
  assert.equal(icone.camadas[0].cor, 'currentColor')
  assert.ok(icone.camadas[0].d.startsWith('M1 1h2v1h-2zM9 1h2v1h-2z'))
})

test('nome desconhecido não desenha nada', () => {
  assert.equal(desenharIcone('nao-existe'), null)
})

// Os tiers nascem no servidor (`tierOf`). Um tier novo lá sem ícone aqui
// deixaria o ranking com um buraco ao lado do nome.
test('todo tier do servidor tem ícone', () => {
  const elo = readFileSync(new URL('../../profdex-back/src/battle/elo.ts', import.meta.url), 'utf8')
  const tiers = [...elo.matchAll(/name:\s*'([^']+)'/g)].map((m) => m[1])
  assert.ok(tiers.length >= 6, 'não achei a escada de tiers em elo.ts')
  for (const tier of tiers) {
    assert.ok(TIER_ICONE[tier], `tier "${tier}" sem ícone`)
    assert.ok(ICONES[TIER_ICONE[tier]], `ícone "${TIER_ICONE[tier]}" não existe`)
  }
})
