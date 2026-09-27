/**
 * Smoke test da RAID contra um servidor de DEV rodando (npm run start:dev).
 *
 * Percorre pela rede o fluxo inteiro: conta nova → captura de TODOS os
 * professores comuns → `/raid/status` destravando sozinho → `raid:start` →
 * seleção de time → lead → turnos até alguém cair → `battle:end` → e, se
 * venceu, a captura do lendário e a linha da fila do prêmio no banco.
 *
 * Uso (na pasta profdex-back, com o backend no ar):
 *   npm run raid:smoke
 *
 * Pré-requisito: um professor LENDÁRIO ativo cadastrado. Sem ele o teste
 * para na primeira asserção e diz o que fazer — é o mesmo estado em que a
 * Profdex de um aluno estaria, e é bom que ele falhe alto aqui.
 *
 * Cria uma conta descartável (raidsmoke-*) e imprime fichas só para ela.
 */
const { io } = require('socket.io-client')
const { createHash, randomBytes } = require('node:crypto')
const { PrismaClient } = require('@prisma/client')
const bcrypt = require('@node-rs/bcrypt')
const { requireDatabaseUrl } = require('./db-url')

const API = process.env.SMOKE_API || 'http://localhost:3000/api'
const WS =
  (process.env.SMOKE_API || 'http://localhost:3000').replace(/\/api$/, '') +
  '/battle'

const fail = (msg) => {
  console.error('FALHOU:', msg)
  process.exit(1)
}
const ok = (msg) => console.log('OK:', msg)

const prisma = new PrismaClient({
  datasources: { db: { url: requireDatabaseUrl() } },
})

const SMOKE_PASSWORD = 'senha123456789'

const connect = (cookie) =>
  io(WS, {
    path: '/api/socket.io',
    transports: ['websocket'],
    extraHeaders: { cookie },
  })

const waitEvent = (socket, event, ms = 15000) =>
  new Promise((resolve, reject) => {
    const t = setTimeout(
      () => reject(new Error(`timeout esperando ${event}`)),
      ms,
    )
    socket.once(event, (data) => {
      clearTimeout(t)
      resolve(data)
    })
  })

const command = (socket, event, payload) =>
  new Promise((resolve) => socket.emit(event, payload, resolve))

const attackOf = (moves) =>
  moves.find((m) => m.category === 'ataque' && m.power) ?? moves[0]

async function criarConta(name) {
  const matricula = `raidsmoke${Date.now()}${Math.floor(Math.random() * 1000)}`
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
  if (res.status !== 200) fail(`login: HTTP ${res.status}`)
  return { cookie: (res.headers.get('set-cookie') || '').split(';')[0], user }
}

/** Imprime uma ficha só para esta conta e a resgata pela rota real. */
async function capturar(conta, variantId) {
  const token = randomBytes(32).toString('base64url')
  await prisma.captureToken.create({
    data: {
      variantId,
      tokenHash: createHash('sha256').update(token, 'utf8').digest('hex'),
      batch: 'raid-smoke',
    },
  })
  const res = await fetch(`${API}/captures/by-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie: conta.cookie },
    body: JSON.stringify({ token }),
  })
  if (res.status !== 201 && res.status !== 200) {
    fail(`captura: HTTP ${res.status}`)
  }
  return res.json()
}

const status = async (conta) => {
  const res = await fetch(`${API}/raid/status`, { headers: { cookie: conta.cookie } })
  if (res.status !== 200) fail(`/raid/status: HTTP ${res.status}`)
  return res.json()
}

async function main() {
  const lendario = await prisma.professor.findFirst({
    where: { legendary: true, active: true },
    select: { id: true, name: true, slug: true },
  })
  if (!lendario) {
    fail(
      'nenhum professor LENDÁRIO ativo no banco. Cadastre um em ' +
        '/admin/professores marcando "⚡ Professor lendário" e rode de novo.',
    )
  }
  ok(`lendário cadastrado: ${lendario.name}`)

  // O mesmo filtro do gate (`RaidService.dexProgress`). Divergir aqui faria o
  // smoke capturar um conjunto que o servidor não considera completo.
  const comuns = await prisma.professor.findMany({
    where: { rare: false, legendary: false, active: true },
    select: { id: true, slug: true, variants: { select: { id: true }, take: 1 } },
    orderBy: { slug: 'asc' },
  })
  if (!comuns.length) fail('nenhum professor comum ativo — rode o seed')

  const conta = await criarConta('Raid Smoke')

  // ── A raid é RECUSADA antes de a dex fechar ───────────────────────────────
  const antes = await status(conta)
  if (antes.unlocked) fail('conta nova já nasceu com a raid destravada')
  ok(`dex 0/${comuns.length} → raid bloqueada, como deve`)

  const socket = connect(conta.cookie)
  await waitEvent(socket, 'connect')
  const recusa = await command(socket, 'raid:start')
  if (recusa.ok) fail('o servidor abriu a raid para quem não fechou a Profdex')
  ok(`raid:start recusado: "${recusa.message}"`)

  // ── Fecha a dex ───────────────────────────────────────────────────────────
  for (const professor of comuns) {
    if (!professor.variants[0]) fail(`${professor.slug} não tem variante`)
    await capturar(conta, professor.variants[0].id)
  }
  const depois = await status(conta)
  if (!depois.unlocked) {
    fail(`dex ${depois.dex.captured}/${depois.dex.total} mas raid travada`)
  }
  if (depois.captured) fail('a conta nasceu com o lendário já capturado')
  if (depois.legendary) {
    fail('o servidor vazou o lendário ANTES da captura — o card deve ser ???')
  }
  ok(`dex ${depois.dex.captured}/${depois.dex.total} → raid destravada`)

  // ── A raid ────────────────────────────────────────────────────────────────
  const inicio = waitEvent(socket, 'battle:start')
  const ack = await command(socket, 'raid:start')
  if (!ack.ok) fail(`raid:start: ${ack.message}`)
  const start = await inicio
  if (start.mode !== 'raid') fail(`battle:start sem mode raid: ${start.mode}`)
  ok(`raid aberta contra ${start.opponent.name}`)

  const capturas = await prisma.capture.findMany({
    where: { userId: conta.user.id },
    select: { id: true },
    take: 3,
  })

  const previewPromise = waitEvent(socket, 'battle:preview')
  const pick = await command(socket, 'battle:pick', {
    captureIds: capturas.map((c) => c.id),
  })
  if (!pick.ok) fail(`battle:pick: ${pick.message}`)
  const preview = await previewPromise
  if (preview.foe.team.length !== 1) {
    fail(`o chefe veio com ${preview.foe.team.length} exemplares`)
  }
  ok('preview: um chefe só, e o time do aluno confirmado')

  const beginPromise = waitEvent(socket, 'battle:begin')
  await command(socket, 'battle:lead', { captureId: preview.you.team[0].captureId })
  const begin = await beginPromise

  // O corpo inflado é a razão de a raid ser difícil: confere que o
  // multiplicador chegou mesmo ao combatente.
  if (begin.foe.maxHp <= 120) {
    fail(`o chefe nasceu com ${begin.foe.maxHp} de vida — multiplicador não aplicou`)
  }
  ok(`batalha começou: chefe com ${begin.foe.maxHp} de vida`)

  // ── Turnos ────────────────────────────────────────────────────────────────
  let estado = begin
  let fim = null
  for (let turno = 0; turno < 80 && !fim; turno += 1) {
    const proximo = Promise.race([
      waitEvent(socket, 'battle:round').then((d) => ({ tipo: 'round', d })),
      waitEvent(socket, 'battle:faint').then((d) => ({ tipo: 'faint', d })),
      waitEvent(socket, 'battle:end').then((d) => ({ tipo: 'end', d })),
    ])

    if (estado.youChoose) {
      const vivo = estado.you.team.find(
        (m) => !m.fainted && m.captureId !== estado.you.activeCaptureId,
      )
      if (!vivo) break
      await command(socket, 'battle:enter', { captureId: vivo.captureId })
    } else {
      await command(socket, 'battle:move', {
        moveId: attackOf(estado.you.moves).id,
      })
    }

    const evento = await proximo
    if (evento.tipo === 'end') fim = evento.d
    else estado = { ...evento.d, you: evento.d.you, foe: evento.d.foe }
  }

  if (!fim) fail('a raid não terminou em 80 turnos')
  ok(`raid encerrada: ${fim.result} (${fim.reason}) em ${fim.turns ?? '?'} turnos`)

  // ── O que o banco registrou ───────────────────────────────────────────────
  const tentativa = await prisma.raidAttempt.findFirst({
    where: { userId: conta.user.id },
    orderBy: { startedAt: 'desc' },
  })
  if (!tentativa) fail('nenhuma linha em raid_attempts')
  if (!tentativa.endedAt) fail('a tentativa ficou aberta depois do fim')
  ok(`raid_attempts gravada: result=${tentativa.result}`)

  const clear = await prisma.raidClear.findUnique({
    where: { userId: conta.user.id },
  })

  if (fim.result === 'win') {
    if (!fim.captured) fail('venceu mas `captured` veio false')
    if (!clear) fail('venceu mas não há linha em raid_clears — sem fila do prêmio')

    const exemplar = await prisma.capture.findFirst({
      where: { userId: conta.user.id, professorId: lendario.id },
    })
    if (!exemplar) fail('venceu mas o exemplar do lendário não foi criado')
    if (exemplar.ivHp !== 15 || exemplar.ivRigor !== 15) {
      fail(`o lendário nasceu com IV ${exemplar.ivHp}/${exemplar.ivRigor}, não 15`)
    }
    ok('lendário capturado com IV 15 e fila do prêmio registrada')

    const final = await status(conta)
    if (!final.captured) fail('/raid/status não reflete a captura')
    if (!final.legendary) fail('/raid/status não devolveu o lendário após captura')
    ok(`/raid/status agora entrega ${final.legendary.name} — card deixa de ser ???`)

    // Segunda raid tem que ser recusada: uma captura por conta, para sempre.
    const repetida = await command(socket, 'raid:start')
    if (repetida.ok) fail('o servidor abriu uma segunda raid para quem já capturou')
    ok(`segunda raid recusada: "${repetida.message}"`)
  } else {
    if (clear) fail('perdeu mas ganhou linha em raid_clears')
    if (fim.captured) fail('perdeu mas `captured` veio true')
    if (!fim.retryAt) fail('perdeu e o servidor não disse quando libera')
    ok('derrota: sem captura, com cooldown informado')

    // Em cooldown, a próxima tentativa tem que ser recusada.
    const cedo = await command(socket, 'raid:start')
    if (cedo.ok) fail('o cooldown não bloqueou a tentativa seguinte')
    ok(`cooldown bloqueando: "${cedo.message}"`)
  }

  socket.close()
  console.log('\n✓ Smoke da raid passou.')
}

main()
  .catch((e) => fail(e.message))
  .finally(() => void prisma.$disconnect())
