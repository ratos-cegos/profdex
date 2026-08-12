/**
 * Smoke test do PvP contra um servidor de DEV rodando (npm run start:dev).
 *
 * Percorre o fluxo inteiro de verdade, pela rede: login → lobby → convite →
 * aceite → pick às cegas → turnos até o nocaute → Elo aplicado → ranking →
 * cooldown de 12h bloqueando o rematch.
 *
 * Uso (na pasta profdex-back, com o backend no ar):
 *   npm run pvp:smoke
 *
 * Cria usuários descartáveis (smoke-*) e resgata fichas de QR para eles.
 */
const { io } = require('socket.io-client')
const { createHash, randomBytes } = require('node:crypto')
const { PrismaClient } = require('@prisma/client')
const bcrypt = require('@node-rs/bcrypt')
const { requireDatabaseUrl } = require('./db-url')

const API = process.env.SMOKE_API || 'http://localhost:3000/api'
const WS = (process.env.SMOKE_API || 'http://localhost:3000').replace(/\/api$/, '') + '/battle'
const DB_URL = requireDatabaseUrl()

const fail = (msg) => { console.error('FALHOU:', msg); process.exit(1) }
const ok = (msg) => console.log('OK:', msg)

const prisma = new PrismaClient({ datasources: { db: { url: DB_URL } } })

const SMOKE_PASSWORD = 'senha123456789'

/**
 * Cria a conta direto no banco e entra por /auth/login.
 *
 * Não existe rota de cadastro: toda conta nasce do login com Google, que o
 * smoke não tem como percorrer sozinho. O que interessa aqui é a sessão — daí
 * a conta ser semeada no banco e só o login passar pela rede.
 */
async function criarConta(name) {
  const matricula = `smoke${Date.now()}${Math.floor(Math.random() * 1000)}`
  const user = await prisma.user.create({
    data: {
      matricula,
      name,
      password: await bcrypt.hash(SMOKE_PASSWORD, 10),
      email: `${matricula}@edu.unifil.br`,
      emailVerified: true,
    },
    select: { id: true, matricula: true, name: true },
  })

  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ matricula, password: SMOKE_PASSWORD }),
  })
  if (res.status !== 200) fail(`login ${name}: HTTP ${res.status}`)
  const cookie = (res.headers.get('set-cookie') || '').split(';')[0]
  return { cookie, user }
}

const connect = (cookie) =>
  io(WS, { path: '/api/socket.io', transports: ['websocket'], extraHeaders: { cookie } })

const waitEvent = (socket, event, ms = 10000) =>
  new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout esperando ${event}`)), ms)
    socket.once(event, (data) => { clearTimeout(t); resolve(data) })
  })

const command = (socket, event, payload) =>
  new Promise((resolve) => socket.emit(event, payload, resolve))

const attackOf = (moves) => moves.find((m) => m.category === 'ataque' && m.power) ?? moves[0]

/**
 * Imprime uma ficha de QR só para esta conta e a resgata pela rota real. Vale
 * mais do que inserir a captura direto no banco: passa pelo resgate de uso
 * único e recebe de volta o exemplar com o deck que o servidor sorteou.
 */
async function capturar(conta, variant) {
  const token = randomBytes(32).toString('base64url')
  await prisma.captureToken.create({
    data: {
      variantId: variant.id,
      tokenHash: createHash('sha256').update(token, 'utf8').digest('hex'),
      batch: 'pvp-smoke',
    },
  })

  const res = await fetch(`${API}/captures/by-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie: conta.cookie },
    body: JSON.stringify({ token }),
  })
  if (res.status !== 201 && res.status !== 200) {
    fail(`captura ${conta.user.name}: HTTP ${res.status}`)
  }
  const capture = await res.json()
  if (!capture.moves || capture.moves.length !== 4) {
    fail(`captura ${conta.user.name}: deck com ${capture.moves?.length} golpes`)
  }

  // A ficha vale uma vez só: o segundo resgate tem que bater em 409.
  const repetido = await fetch(`${API}/captures/by-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie: conta.cookie },
    body: JSON.stringify({ token }),
  })
  if (repetido.status !== 409) {
    fail(`ficha reutilizável: segundo resgate devolveu HTTP ${repetido.status}`)
  }

  return capture
}

async function main() {
  const variants = await prisma.professorVariant.findMany({
    orderBy: [{ professor: { slug: 'asc' } }, { typeKey: 'asc' }],
    include: { professor: { select: { slug: true } } },
  })
  if (variants.length < 2) fail('banco sem variantes — rode o seed antes')
  // Variantes de professores diferentes, para a batalha não ser espelhada.
  const varA = variants[0]
  const varB = variants.find((v) => v.professor.slug !== varA.professor.slug)
  if (!varB) fail('banco com um professor só — rode o seed antes')

  const a = await criarConta('Smoke Ana')
  const b = await criarConta('Smoke Bia')
  const capA = await capturar(a, varA)
  const capB = await capturar(b, varB)
  ok(
    `capturas: Ana→${varA.professor.slug} (${varA.typeKey}), ` +
      `Bia→${varB.professor.slug} (${varB.typeKey}); ficha única confirmada`,
  )

  const sockA = connect(a.cookie)
  const sockB = connect(b.cookie)
  // A conexão entrega só a contagem; a lista em si exige lobby:subscribe.
  await waitEvent(sockA, 'lobby:count')
  await waitEvent(sockB, 'lobby:count')
  ok('lobby conectado para os dois')

  const recv = waitEvent(sockB, 'invite:received')
  const startA = waitEvent(sockA, 'battle:start')
  const startB = waitEvent(sockB, 'battle:start')
  let ack = await command(sockA, 'invite:send', { toUserId: b.user.id })
  if (!ack.ok) fail('convite: ' + ack.message)
  ack = await command(sockB, 'invite:accept', { inviteId: (await recv).inviteId })
  if (!ack.ok) fail('aceite: ' + ack.message)
  await Promise.all([startA, startB])
  ok('convite aceito, seleção aberta')

  const beginA = waitEvent(sockA, 'battle:begin')
  const beginB = waitEvent(sockB, 'battle:begin')
  ack = await command(sockA, 'battle:pick', { captureId: capA.id })
  if (!ack.ok) fail('pick A: ' + ack.message)
  ack = await command(sockB, 'battle:pick', { captureId: capB.id })
  if (!ack.ok) fail('pick B: ' + ack.message)
  let stateA = await beginA
  let stateB = await beginB

  // A arena tem que receber o deck e os tipos gravados no exemplar, não um
  // sorteio novo — é essa a diferença que o resgate por ficha introduziu.
  const idsA = stateA.you.moves.map((m) => m.id).join(',')
  if (idsA !== capA.moves.map((m) => m.id).join(',')) {
    fail('deck da arena diferente do gravado na captura')
  }
  if (stateA.you.types.join(',') !== varA.types.join(',')) {
    fail('tipos da arena diferentes dos da variante capturada')
  }
  ok(`batalha: ${stateA.you.professor.name} vs ${stateA.foe.professor.name} (deck e tipos do exemplar)`)

  let finished = null
  for (let round = 1; round <= 60 && !finished; round++) {
    const nextA = Promise.race([
      waitEvent(sockA, 'battle:round', 15000).then((p) => ({ kind: 'round', p })),
      waitEvent(sockA, 'battle:end', 15000).then((p) => ({ kind: 'end', p })),
    ])
    const nextB = Promise.race([
      waitEvent(sockB, 'battle:round', 15000).then((p) => ({ kind: 'round', p })),
      waitEvent(sockB, 'battle:end', 15000).then((p) => ({ kind: 'end', p })),
    ])
    await command(sockA, 'battle:move', { moveId: attackOf(stateA.you.moves).id })
    await command(sockB, 'battle:move', { moveId: attackOf(stateB.you.moves).id })
    const [rA, rB] = await Promise.all([nextA, nextB])
    if (rA.kind === 'end') finished = { a: rA.p, b: rB.p }
    else {
      stateA = { you: { ...stateA.you, ...rA.p.you }, foe: rA.p.foe }
      stateB = { you: { ...stateB.you, ...rB.p.you }, foe: rB.p.foe }
    }
  }
  if (!finished) fail('não terminou em 60 rodadas')
  ok(`fim: Ana=${finished.a.result} Bia=${finished.b.result} (${finished.a.reason})`)

  const winSide = finished.a.result === 'win' ? finished.a : finished.b
  if (finished.a.result !== 'draw' && (!winSide.rating || winSide.rating.delta <= 0)) {
    fail('vencedor sem delta de Elo positivo: ' + JSON.stringify(winSide.rating))
  }
  ok(`Elo aplicado: vencedor ${winSide.rating ? `+${winSide.rating.delta} → ${winSide.rating.rating} (${winSide.rating.tier})` : 'empate'}`)

  // Confere pelo `me` (posição própria), não pela primeira página: num banco
  // com histórico, 25 linhas não alcançam quem acabou de entrar no ladder — e
  // `me` é justamente o que a tela mostra para o jogador.
  const rank = await fetch(`${API}/rankings/battle`, { headers: { cookie: a.cookie } }).then((r) => r.json())
  if (rank.me?.id !== a.user.id || !rank.me.played || rank.me.position < 1) {
    fail(`ranking não reconheceu o jogador: ${JSON.stringify(rank.me)}`)
  }
  ok(`ranking respondendo (${rank.total} no ladder, Ana em ${rank.me.position}º)`)

  ack = await command(sockA, 'invite:send', { toUserId: b.user.id })
  if (ack.ok) fail('cooldown não bloqueou o rematch')
  ok('cooldown de 12h ativo: ' + ack.message)

  sockA.close(); sockB.close()
  await prisma.$disconnect()
  console.log('\nPVP SMOKE PASSOU ✅')
  process.exit(0)
}

main().catch((e) => fail(e.stack || e.message))
