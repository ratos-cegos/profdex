import { test } from 'node:test'
import assert from 'node:assert/strict'
import { efeitosDe } from '../src/data/battle-efeitos.js'

/**
 * O motor rastreia estágios de atributo, escudos e status desde sempre, e nada
 * disso atravessava a fronteira: o jogador via um ▲ passar numa mensagem de
 * 850ms e depois tinha de DECORAR que o ataque dele estava em +2.
 *
 * O servidor manda o estado cru (`efeitos-visiveis.ts`); quem escreve o rótulo é
 * o módulo que estes testes cobrem.
 */

const semEfeito = {
  statusKind: null,
  statusTurns: null,
  stages: { rigor: 0, didatica: 0, raciocinio: 0 },
  escudo: null,
}

test('lado limpo não gera pílula nenhuma', () => {
  assert.deepEqual(efeitosDe(semEfeito), [])
})

test('lado ausente não explode', () => {
  assert.deepEqual(efeitosDe(null), [])
  assert.deepEqual(efeitosDe(undefined), [])
  assert.deepEqual(efeitosDe({}), [])
})

test('status vira pílula com nome e duração que o jogador lê', () => {
  for (const [kind, rotulo] of [
    ['paralisia', 'Travado'],
    ['confusao', 'Confuso'],
    ['queimadura', 'Queimando'],
  ]) {
    const [pilula] = efeitosDe({ ...semEfeito, statusKind: kind, statusTurns: 3 })
    assert.equal(pilula.rotulo, `${rotulo} · 3t`)
    assert.equal(pilula.tom, 'ruim')
  }
})

test('estágio positivo é bom, negativo é ruim, e o sinal aparece', () => {
  const subiu = efeitosDe({ ...semEfeito, stages: { rigor: 2, didatica: 0, raciocinio: 0 } })
  assert.deepEqual(subiu, [{ id: 'rigor', rotulo: '▲2 ATK', tom: 'bom' }])

  const caiu = efeitosDe({ ...semEfeito, stages: { rigor: 0, didatica: 0, raciocinio: -3 } })
  assert.deepEqual(caiu, [{ id: 'raciocinio', rotulo: '▼3 VEL', tom: 'ruim' }])
})

// O chip do treino era vermelho fixo: um buff de ataque e uma paralisia saíam da
// mesma cor, e o jogador tinha de ler o texto para saber de que lado estava.
test('buff e debuff não têm o mesmo tom', () => {
  const [bom] = efeitosDe({ ...semEfeito, stages: { rigor: 1, didatica: 0, raciocinio: 0 } })
  const [ruim] = efeitosDe({ ...semEfeito, stages: { rigor: -1, didatica: 0, raciocinio: 0 } })

  assert.notEqual(bom.tom, ruim.tom)
})

test('cada modo de escudo tem o seu rótulo', () => {
  for (const [modo, rotulo] of [
    ['block', 'Bloqueio · próximo golpe'],
    ['evade', 'Esquiva · próximo golpe'],
    ['reflect', 'Reflexo · próximo golpe'],
    ['reduce', 'Meio dano · próximo golpe'],
  ]) {
    const [pilula] = efeitosDe({ ...semEfeito, escudo: modo })
    assert.equal(pilula.id, 'escudo')
    assert.equal(pilula.rotulo, rotulo)
    assert.equal(pilula.tom, 'bom')
  }
})

test('golpe acumulativo mostra o nome, usos e bônus armazenados', () => {
  const [golpe] = efeitosDe({
    ...semEfeito,
    movimentosAcumulados: [{
      moveId: 'gradiente',
      name: 'Gradiente descendente',
      usos: 2,
      bonusPoder: 30,
      bonusPrecisao: 16,
    }],
  })

  assert.deepEqual(golpe, {
    id: 'acumulado:gradiente',
    rotulo: 'POD +30 · PREC +16%',
    detalhe: 'Gradiente descendente · 2 usos acumulados',
    tom: 'bom',
  })
})

// A ordem não pode variar entre turnos: pílula que troca de lugar obriga o
// jogador a reler todas a cada rodada.
test('a ordem é sempre status, atributos, escudo', () => {
  const efeitos = efeitosDe({
    statusKind: 'queimadura',
    statusTurns: 2,
    stages: { rigor: 2, didatica: -1, raciocinio: 3 },
    escudo: 'block',
  })

  assert.deepEqual(
    efeitos.map((e) => e.id),
    ['status', 'rigor', 'didatica', 'raciocinio', 'escudo'],
  )
})

test('estágio zero não aparece, mesmo cercado de estágio', () => {
  const efeitos = efeitosDe({
    ...semEfeito,
    stages: { rigor: 1, didatica: 0, raciocinio: -2 },
  })

  assert.deepEqual(
    efeitos.map((e) => e.id),
    ['rigor', 'raciocinio'],
  )
})

// Status desconhecido (servidor novo, cliente antigo) não pode virar pílula em
// branco: cair no próprio id é feio e legível, sumir é mentira.
test('status e escudo desconhecidos caem num rótulo de fallback', () => {
  const [status] = efeitosDe({ ...semEfeito, statusKind: 'sono' })
  assert.equal(status.rotulo, 'sono')

  const [escudo] = efeitosDe({ ...semEfeito, escudo: 'barreira' })
  assert.equal(escudo.rotulo, 'Escudo · próximo golpe')
})
