import assert from 'node:assert/strict'
import test from 'node:test'
import { enquadramentoDe, LADO_ALVO } from '../src/composables/enquadrarModelo.js'

// A revelação da bancada mostrava o professor como um ponto no canto da tela
// porque cada GLB vem na escala do editor de quem o exportou. Estes testes
// fixam a conta que põe todos no mesmo lugar, do mesmo tamanho.

const caixa = (min, max) => ({
  min: { x: min[0], y: min[1], z: min[2] },
  max: { x: max[0], y: max[1], z: max[2] },
})

/** Onde um ponto do modelo vai parar depois do enquadramento. */
const aplicar = ({ escala, posicao }, [x, y, z]) => [
  x * escala + posicao[0],
  y * escala + posicao[1],
  z * escala + posicao[2],
]

test('um modelo alto é escalado pela altura', () => {
  // 10 de altura, base estreita: quem manda é o eixo Y.
  const { escala } = enquadramentoDe(caixa([-1, 0, -1], [1, 10, 1]))
  assert.equal(escala, LADO_ALVO / 10)
})

test('um modelo largo é escalado pela DIAGONAL da base, não pelo maior lado', () => {
  // 3 × 4 de base: girando, a câmera chega a ver os 5 da diagonal. Escalar pelo
  // maior lado (4) deixaria o professor saindo do quadro em parte da volta.
  const { escala } = enquadramentoDe(caixa([-1.5, 0, -2], [1.5, 1, 2]))
  assert.equal(escala, LADO_ALVO / 5)
})

test('o modelo fica centrado no eixo de giro e de pé no chão', () => {
  // Pivô deslocado, como saem os GLB de vários exportadores: o corpo está todo
  // em x positivo e começa acima do zero.
  const enquadramento = enquadramentoDe(caixa([4, 2, 10], [6, 12, 12]))
  const [minX, minY, minZ] = aplicar(enquadramento, [4, 2, 10])
  const [maxX, maxY, maxZ] = aplicar(enquadramento, [6, 12, 12])

  // Centrado em x/z: é o que faz o giro ser no próprio eixo.
  assert.ok(Math.abs(minX + maxX) < 1e-9)
  assert.ok(Math.abs(minZ + maxZ) < 1e-9)
  // Os pés no chão, e o topo dentro da caixa que a câmera enquadra.
  assert.equal(minY, 0)
  assert.ok(maxY <= LADO_ALVO + 1e-9)
})

test('o modelo inteiro cabe na caixa que a câmera enquadra', () => {
  for (const dimensoes of [
    [
      [-1, 0, -1],
      [1, 10, 1],
    ], // alto
    [
      [-1.5, 0, -2],
      [1.5, 1, 2],
    ], // largo e baixo
    [
      [0, 0, 0],
      [0.01, 0.02, 0.01],
    ], // minúsculo
  ]) {
    const original = caixa(...dimensoes)
    const enquadramento = enquadramentoDe(original)
    const [, minY] = aplicar(enquadramento, [original.min.x, original.min.y, original.min.z])
    const [maxX, maxY, maxZ] = aplicar(enquadramento, [
      original.max.x,
      original.max.y,
      original.max.z,
    ])
    assert.equal(minY, 0)
    assert.ok(maxY <= LADO_ALVO + 1e-9, `altura estourou: ${maxY}`)
    // Meia diagonal da base, que é o raio varrido pelo giro.
    assert.ok(Math.hypot(maxX, maxZ) <= LADO_ALVO / 2 + 1e-9)
  }
})

test('caixa vazia (GLB ainda carregando) não enquadra nada', () => {
  // É assim que o Three representa "ninguém mediu nada": Box3.makeEmpty().
  assert.equal(
    enquadramentoDe(caixa([Infinity, Infinity, Infinity], [-Infinity, -Infinity, -Infinity])),
    null,
  )
  assert.equal(enquadramentoDe(null), null)
})

test('geometria degenerada não vira escala infinita', () => {
  assert.equal(enquadramentoDe(caixa([0, 0, 0], [0, 0, 0])), null)
})
