import assert from 'node:assert/strict'
import test from 'node:test'
import { classificarAviso } from '../src/services/battle-avisos.js'
import { ICONES } from '../src/data/pixelIcons.js'

// Frases que o servidor manda HOJE (battle.gateway.ts, invite.service.ts,
// raid-room.service.ts) e store (battle.js). Se o texto mudar lá, o aviso cai
// no tipo genérico "erro" — este teste é o alarme.
const CASOS = {
  espera: [
    'Vocês já batalharam nas últimas 12h — liberado em 3h 12min.',
    'Muitos convites em pouco tempo. Aguarde um instante.',
    'Aguarde 12 min para tentar de novo.',
  ],
  bloqueado: [
    'Você ainda não capturou nenhum professor — capture um para batalhar.',
    'Bia ainda não tem professores para batalhar.',
    'Você já tem um convite pendente.',
    'Já existe um convite entre vocês — confira os desafios recebidos.',
    'Termine a batalha atual primeiro.',
    'Você já está em batalha.',
    'Você já está numa raid.',
    'Você não pode desafiar a si.',
  ],
  info: [
    'Bia recusou o desafio.',
    'Bia cancelou o desafio.',
    'O rival saiu da seleção.',
    'Bia está em batalha.',
    'Esse jogador não está mais online.',
    'Quem convidou não está mais disponível.',
    'Esse convite não existe mais.',
    'A seleção expirou — batalha cancelada.',
    'A preparação expirou — a tentativa não contou.',
    'O servidor reiniciou — a batalha foi anulada.',
  ],
  erro: ['Sem conexão com o lobby.', 'O servidor não respondeu.', 'Convite inválido.'],
}

for (const [tipo, frases] of Object.entries(CASOS)) {
  test(`mensagens de ${tipo}`, () => {
    for (const frase of frases) assert.equal(classificarAviso(frase).tipo, tipo, frase)
  })
}

// "Você já está em batalha" é bloqueio seu; "Bia está em batalha" é do outro.
test('a frase sobre você vence a frase sobre o rival', () => {
  assert.equal(classificarAviso('Você já está em batalha.').tipo, 'bloqueado')
  assert.equal(classificarAviso('Bia está em batalha.').tipo, 'info')
})

test('o code da raid decide mesmo com texto desconhecido', () => {
  assert.equal(classificarAviso('texto novo', 'RAID_EM_COOLDOWN').tipo, 'espera')
  assert.equal(classificarAviso('texto novo', 'RAID_BLOQUEADA').tipo, 'bloqueado')
  assert.equal(classificarAviso('texto novo', 'RAID_JA_CAPTURADO').tipo, 'bloqueado')
})

test('todo tipo aponta para um ícone pixel que existe', () => {
  for (const tipo of Object.keys(CASOS)) {
    const { icone, titulo } = classificarAviso(CASOS[tipo][0])
    assert.ok(ICONES[icone], `${tipo}: ícone ${icone}`)
    assert.ok(titulo)
  }
})

test('mensagem vazia não quebra', () => {
  assert.equal(classificarAviso(undefined).tipo, 'erro')
})
