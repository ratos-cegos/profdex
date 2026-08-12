import assert from 'node:assert/strict'
import test from 'node:test'
import { applyMoveAck } from '../src/stores/battle-move.js'

// Regressão do travamento relatado no evento: o jogador que move em SEGUNDO
// recebe `battle:round` antes do ack do próprio golpe, porque o servidor
// resolve a rodada dentro da mesma chamada. Ver docs/BUG-BATALHA-TRAVANDO.md.
test('ack que chega depois da rodada virar não remarca youMoved', () => {
  // O `battle:round` já chegou e abriu o turno 2 com os botões liberados.
  const pvp = { turn: 2, youMoved: false }

  applyMoveAck(pvp, { ack: { ok: true, turn: 1 }, turnAtSend: 1 })

  assert.equal(pvp.youMoved, false, 'o jogador continua podendo escolher golpe')
  assert.equal(pvp.turn, 2)
})

test('ack do turno corrente confirma que o golpe foi registrado', () => {
  const pvp = { turn: 1, youMoved: true } // marcado otimista no clique

  applyMoveAck(pvp, { ack: { ok: true, turn: 1 }, turnAtSend: 1 })

  assert.equal(pvp.youMoved, true)
})

test('falha no mesmo turno devolve o botão ao jogador', () => {
  const pvp = { turn: 1, youMoved: true }

  applyMoveAck(pvp, { ack: { ok: false, message: 'Sem conexão.' }, turnAtSend: 1 })

  assert.equal(pvp.youMoved, false)
})

test('falha de um turno que já passou não mexe no turno novo', () => {
  const pvp = { turn: 2, youMoved: true } // já jogou o turno 2

  applyMoveAck(pvp, { ack: { ok: false, message: 'O servidor não respondeu.' }, turnAtSend: 1 })

  assert.equal(pvp.youMoved, true)
})

test('servidor sem `turn` no ack cai no turno de envio', () => {
  const pvp = { turn: 1, youMoved: true }

  applyMoveAck(pvp, { ack: { ok: true }, turnAtSend: 1 })

  assert.equal(pvp.youMoved, true)
})

test('sem batalha em andamento não explode', () => {
  assert.doesNotThrow(() => applyMoveAck(null, { ack: { ok: true, turn: 1 }, turnAtSend: 1 }))
})
