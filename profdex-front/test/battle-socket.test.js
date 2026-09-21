import assert from 'node:assert/strict'
import test from 'node:test'
import { checarSocketVivo, ensureSocket } from '../src/stores/battle-socket.js'

/** Socket de mentira: registra as chamadas de ciclo de vida e os emits. */
function fakeSocket({ connected = true, responde = true } = {}) {
  return {
    connected,
    conectou: 0,
    desconectou: 0,
    emitidos: [],
    connect() {
      this.conectou += 1
      this.connected = true
    },
    disconnect() {
      this.desconectou += 1
      this.connected = false
    },
    emit(event, payload, ack) {
      this.emitidos.push(event)
      if (responde && ack) ack({ ok: true })
    },
  }
}

// Regressão do P4: `connect()` era `if (socket) return`, e as três telas de
// batalha chamam `connect()` no `onMounted` contando com a reconexão.
test('ensureSocket reconecta o socket desconectado em vez de ignorá-lo', () => {
  const socket = fakeSocket({ connected: false })

  const devolvido = ensureSocket(socket, () => {
    throw new Error('não pode criar um socket novo quando já existe um')
  })

  assert.equal(devolvido, socket)
  assert.equal(socket.conectou, 1)
})

test('ensureSocket não mexe no socket conectado (é chamado em todo onMounted)', () => {
  const socket = fakeSocket({ connected: true })

  ensureSocket(socket, () => {
    throw new Error('não pode criar um socket novo quando já existe um')
  })

  assert.equal(socket.conectou, 0)
  assert.equal(socket.desconectou, 0)
})

test('ensureSocket cria o socket quando ainda não há nenhum', () => {
  const novo = fakeSocket()

  assert.equal(
    ensureSocket(null, () => novo),
    novo,
  )
})

// P2: com a aba congelada pelo sistema, `connected` mente por até ~45s. Quem
// não responde ao ack curto é dado como morto e reerguido.
test('socket que não responde ao ack é derrubado e reconectado', async () => {
  const socket = fakeSocket({ connected: true, responde: false })

  checarSocketVivo(socket, { timeoutMs: 5 })
  await new Promise((resolve) => setTimeout(resolve, 20))

  assert.deepEqual(socket.emitidos, ['battle:resync'])
  assert.equal(socket.desconectou, 1)
  assert.equal(socket.conectou, 1)
})

test('socket que responde a tempo é deixado em paz', async () => {
  const socket = fakeSocket({ connected: true, responde: true })

  checarSocketVivo(socket, { timeoutMs: 5 })
  await new Promise((resolve) => setTimeout(resolve, 20))

  assert.equal(socket.desconectou, 0, 'derrubar um socket vivo custa uma reconexão à toa')
  assert.equal(socket.conectou, 0)
})

test('socket já desconectado só reconecta, sem ack nenhum', () => {
  const socket = fakeSocket({ connected: false })

  checarSocketVivo(socket, { timeoutMs: 5 })

  assert.deepEqual(socket.emitidos, [])
  assert.equal(socket.conectou, 1)
})

test('sem socket em mãos, nada acontece', () => {
  assert.doesNotThrow(() => checarSocketVivo(null))
})
