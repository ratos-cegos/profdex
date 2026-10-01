import assert from 'node:assert/strict'
import test from 'node:test'
import {
  aplicarEvento,
  chaveDoOcupante,
  ocupanteDoServidor,
} from '../src/composables/battleOcupante.js'

const eron = { id: 'p-eron', slug: 'eron', name: 'Eron' }
const mario = { id: 'p-mario', slug: 'mario', name: 'Mário' }

function inicio() {
  return {
    player: ocupanteDoServidor({ professor: eron, types: ['ia'], hp: 30, maxHp: 120 }),
    enemy: ocupanteDoServidor({ professor: mario, types: ['algoritmos'], hp: 100, maxHp: 100 }),
  }
}

const aplicar = (estado, eventos) => eventos.reduce(aplicarEvento, estado)

test('queda de verdade marca só quem caiu', () => {
  const fim = aplicar(inicio(), [
    { type: 'damage', target: 'player', amount: 50 },
    { type: 'faint', target: 'player' },
  ])
  assert.equal(fim.player.hp, 0)
  assert.equal(fim.player.fainted, true)
  assert.equal(fim.enemy.fainted, false)
})

// O bug relatado: depois do nocaute, quem entra aparecia com a animação de
// queda de quem saiu.
test('troca depois de nocaute: quem entra chega de pé, com o próprio HP', () => {
  const caido = aplicar(inicio(), [{ type: 'faint', target: 'player' }])
  const gustavo = { id: 'p-gustavo', slug: 'gustavo', name: 'Gustavo' }
  const fim = aplicarEvento(caido, {
    type: 'switch',
    target: 'player',
    name: 'Gustavo',
    professor: gustavo,
    types: ['arquitetura'],
    hp: 90,
    maxHp: 110,
  })
  assert.equal(fim.player.professor, gustavo)
  assert.equal(fim.player.fainted, false)
  assert.equal(fim.player.hp, 90)
  assert.equal(fim.player.maxHp, 110)
  assert.notEqual(chaveDoOcupante(fim.player), chaveDoOcupante(caido.player))
})

// Troca voluntária de um professor com pouca vida: o golpe do rival na mesma
// rodada era descontado dos 30 de HP de quem SAIU e derrubava quem entrou.
test('troca voluntária seguida de dano: o dano vale para quem entrou', () => {
  const fim = aplicar(inicio(), [
    { type: 'switch', target: 'player', name: 'Mário', professor: mario, types: [], hp: 100, maxHp: 100 },
    { type: 'damage', target: 'player', amount: 40 },
  ])
  assert.equal(fim.player.professor, mario)
  assert.equal(fim.player.hp, 60)
  assert.equal(fim.player.fainted, false)
})

test('mesmo professor trocando de exemplar ganha chave nova', () => {
  const antes = inicio()
  const depois = aplicarEvento(antes, {
    type: 'switch', target: 'player', name: 'Eron', professor: eron, types: ['ia'], hp: 120, maxHp: 120,
  })
  assert.notEqual(chaveDoOcupante(depois.player), chaveDoOcupante(antes.player))
})

test('servidor antigo, sem dados de quem entra: ao menos desfaz a queda', () => {
  const caido = aplicar(inicio(), [{ type: 'faint', target: 'enemy' }])
  const fim = aplicarEvento(caido, { type: 'switch', target: 'enemy', name: 'Eron' })
  assert.equal(fim.enemy.fainted, false)
})

// A raid: o NDE entra como grupo (sem UM professor), mas com a barra dele.
test('grupo sem professor: a barra passa a ser a de quem entrou', () => {
  const fim = aplicarEvento(inicio(), {
    type: 'switch', target: 'enemy', name: 'NDE da Coordenação', types: ['gestao'], hp: 60, maxHp: 60,
  })
  assert.equal(fim.enemy.professor, mario) // a arte do grupo vem de `foe.professores`
  assert.equal(fim.enemy.hp, 60)
  assert.equal(fim.enemy.maxHp, 60)
  assert.deepEqual(fim.enemy.types, ['gestao'])
  assert.equal(fim.enemy.fainted, false)
})

// A sequência vista numa raid real: o chefe apanha, o NDE entra, cai, e o
// chefe volta. Sprites, nome e barra têm de trocar JUNTOS, no ponto da fila —
// antes o grupo aparecia com a vida do chefe, e o chefe "caía" no lugar do NDE.
test('raid: NDE entra, cai e o chefe volta, cada um com o próprio nome e barra', () => {
  const chefe = { id: 'p-tania', slug: 'tania', name: 'Tânia' }
  const nde = [eron, mario, { id: 'p-s', slug: 's', name: 'Simone' }, { id: 'p-t', slug: 't', name: 'Tânia P.' }]
  let estado = {
    player: ocupanteDoServidor({ professor: eron, hp: 80, maxHp: 120 }),
    enemy: ocupanteDoServidor({ professor: chefe, nomeEmCampo: 'Tânia', hp: 98, maxHp: 240 }),
  }

  estado = aplicar(estado, [
    { type: 'damage', target: 'enemy', amount: 20 }, // ainda no chefe
    { type: 'switch', target: 'enemy', name: 'NDE da Coordenação', professores: nde, types: ['humanas'], hp: 100, maxHp: 100 },
  ])
  assert.equal(estado.enemy.nome, 'NDE da Coordenação')
  assert.equal(estado.enemy.grupo, nde)
  assert.equal(estado.enemy.hp, 100)
  assert.equal(estado.enemy.maxHp, 100)

  estado = aplicar(estado, [
    { type: 'damage', target: 'enemy', amount: 100 },
    { type: 'faint', target: 'enemy' },
  ])
  // Quem cai é o NDE: nome e sprites ainda são dele.
  assert.equal(estado.enemy.nome, 'NDE da Coordenação')
  assert.equal(estado.enemy.fainted, true)

  const antes = chaveDoOcupante(estado.enemy)
  estado = aplicarEvento(estado, {
    type: 'switch', target: 'enemy', name: 'Tânia', professor: chefe, types: ['robotica'], hp: 92, maxHp: 240,
  })
  assert.equal(estado.enemy.grupo, null)
  assert.equal(estado.enemy.nome, null)
  assert.equal(estado.enemy.professor, chefe)
  assert.equal(estado.enemy.hp, 92)
  assert.equal(estado.enemy.maxHp, 240)
  assert.equal(estado.enemy.fainted, false)
  assert.notEqual(chaveDoOcupante(estado.enemy), antes)
})

test('ocupante do servidor traz grupo e nome em campo da raid', () => {
  const o = ocupanteDoServidor({ professor: eron, professores: [eron, mario], nomeEmCampo: 'NDE', hp: 10, maxHp: 100 })
  assert.deepEqual(o.grupo, [eron, mario])
  assert.equal(o.nome, 'NDE')
  assert.equal(ocupanteDoServidor({ professor: eron, hp: 1, maxHp: 1 }).grupo, null)
})

test('cura não passa do máximo; eventos sem alvo não mudam nada', () => {
  const estado = inicio()
  const curado = aplicarEvento(estado, { type: 'heal', target: 'player', amount: 500 })
  assert.equal(curado.player.hp, 120)
  assert.equal(aplicarEvento(estado, { type: 'message', text: 'oi' }), estado)
  assert.equal(aplicarEvento(estado, { type: 'effectiveness', level: 'super' }), estado)
})

test('ocupante do servidor: sem lado não é caído', () => {
  assert.equal(ocupanteDoServidor(null).fainted, false)
  assert.equal(ocupanteDoServidor({ hp: 0, maxHp: 10 }).fainted, true)
})

// ── A virada de estágio da raid ──────────────────────────────────────────────
// O chefe não sai do assento: só troca de corpo. Por isso a virada chega num
// `roteiro` com `target` e `estagio`, e não num `switch`.
test('o roteiro de virada troca o estágio sem mexer em mais nada', () => {
  const antes = {
    player: ocupanteDoServidor({ hp: 100, maxHp: 120 }),
    enemy: ocupanteDoServidor({
      professor: { id: 'tanaka' },
      hp: 300,
      maxHp: 480,
      estagio: 1,
    }),
  }

  const depois = aplicarEvento(antes, {
    type: 'roteiro',
    target: 'enemy',
    estagio: 2,
    linhas: ['…'],
  })

  assert.equal(depois.enemy.estagio, 2)
  // Nem vida, nem `entrada`: quem muda é a arte, e o resto da luta continua.
  assert.equal(depois.enemy.hp, 300)
  assert.equal(depois.enemy.entrada, antes.enemy.entrada)
  assert.equal(depois.player, antes.player)
})

// O NDE e o Ricardo também são `roteiro`, mas não trazem `estagio` — e o do NDE
// não traz `target`. Nenhum dos dois pode mexer no estágio do chefe.
test('roteiro sem estágio não muda o ocupante', () => {
  const antes = {
    player: ocupanteDoServidor({ hp: 100, maxHp: 120 }),
    enemy: ocupanteDoServidor({ hp: 300, maxHp: 480, estagio: 3 }),
  }

  const semEstagio = aplicarEvento(antes, {
    type: 'roteiro',
    target: 'enemy',
    linhas: ['O NDE caiu!'],
  })
  const semTarget = aplicarEvento(antes, { type: 'roteiro', linhas: ['…'] })

  assert.equal(semEstagio, antes)
  assert.equal(semTarget, antes)
})
