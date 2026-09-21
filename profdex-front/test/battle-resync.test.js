import assert from 'node:assert/strict'
import test from 'node:test'
import { applyResync, AVISO_SEM_SALA } from '../src/stores/battle-resync.js'

// Regressão do P1 de docs/BUG-BATALHA-TRAVANDO.md: o servidor passou a
// responder SEMPRE à reconexão, e `phase: 'idle'` é o "não há sala". Sem
// tratá-lo, o cliente ficava com a batalha antiga em memória (`youMoved: true`)
// e os botões da arena mortos até o F5.
test('phase idle limpa a batalha e volta ao lobby', () => {
  const atual = { battleId: 'b1', phase: 'active', youMoved: true, turn: 3 }

  const { pvp, rota, aviso } = applyResync({ phase: 'idle' }, atual)

  assert.equal(pvp, null)
  assert.equal(rota, 'batalha')
  assert.equal(aviso, AVISO_SEM_SALA)
})

test('idle durante a seleção também tira o jogador de lá', () => {
  const { pvp, rota } = applyResync({ phase: 'idle' }, { phase: 'picking' })

  assert.equal(pvp, null)
  assert.equal(rota, 'batalha')
})

// Quem está lendo o resultado não pode perdê-lo: a sala fechou no servidor de
// propósito, e é isso que `done` significa.
test('idle não apaga a tela de resultado', () => {
  const resultado = { phase: 'done', result: { result: 'win' } }

  const { pvp, rota, aviso } = applyResync({ phase: 'idle' }, resultado)

  assert.deepEqual(pvp, resultado)
  assert.equal(rota, null)
  assert.equal(aviso, null)
})

// Caso comum depois de o socket passar a abrir no login: todo aluno logado
// recebe um resync `idle` ao conectar, sem nunca ter entrado numa batalha.
test('idle sem batalha nenhuma não avisa nem navega', () => {
  const { pvp, rota, aviso } = applyResync({ phase: 'idle' }, null)

  assert.equal(pvp, null)
  assert.equal(rota, null)
  assert.equal(aviso, null)
})

test('snapshot de batalha em andamento reconstrói o estado e vai para a arena', () => {
  const snap = {
    battleId: 'b1',
    phase: 'active',
    opponent: { id: 'u2', name: 'Bia' },
    deadline: 123,
    turn: 4,
    youMoved: true,
    foeMoved: false,
    you: { hp: 10 },
    foe: { hp: 20 },
  }

  const { pvp, rota, aviso } = applyResync(snap, null)

  assert.equal(rota, 'pvp-arena')
  assert.equal(aviso, null)
  assert.equal(pvp.turn, 4)
  assert.equal(pvp.youMoved, true)
  assert.deepEqual(pvp.pendingEvents, [], 'o snapshot não traz fila para animar')
  assert.ok(pvp.syncedAt, 'a arena realinha as barras por este marcador')
})

test('snapshot de seleção leva à tela de escolha', () => {
  const snap = {
    battleId: 'b1',
    phase: 'preview',
    opponent: { id: 'u2', name: 'Bia' },
    deadline: 9,
    youPicked: true,
    foePicked: false,
    you: { team: [] },
    foe: { name: 'Bia', team: [] },
  }

  const { pvp, rota } = applyResync(snap, null)

  assert.equal(rota, 'pvp-pick')
  assert.equal(pvp.pickDeadline, 9)
  assert.equal(pvp.youPicked, true)
})

// Servidor mais novo que o app: melhor cair no lobby do que fingir que a
// batalha continua com uma fase que a tela não sabe desenhar.
test('fase desconhecida não deixa o jogador preso', () => {
  const { pvp, rota } = applyResync({ phase: 'seila' }, { phase: 'active' })

  assert.equal(pvp, null)
  assert.equal(rota, 'batalha')
})
