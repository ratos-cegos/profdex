/**
 * Adversário automatizado para testar a batalha em time à mão.
 *
 *   node scripts/bot-bia.js            # espera convite e joga sozinho
 *   node scripts/bot-bia.js --convidar # ele convida a Ana
 *
 * Existe porque validar a arena precisa de DOIS jogadores, e um navegador só
 * tem um cookie de sessão por domínio: com o bot de um lado, a tela do outro
 * pode ser observada de verdade.
 *
 * Loga o que recebe do servidor no formato que interessa para conferir contra a
 * tela — sobretudo o time e o `fainted` de cada exemplar em cada evento.
 */

const { io } = require('socket.io-client')

const API = process.env.API_URL || 'http://localhost:3000'
// O gateway vive no namespace /battle — sem ele o socket conecta no namespace
// padrão, nenhum handler responde e o ack nunca chega.
const WS = API.replace(/\/api$/, '') + '/battle'
const EU = { matricula: 'bia', senha: 'senha123' }
const RIVAL_MATRICULA = 'ana'
const convidar = process.argv.includes('--convidar')

const hora = () => new Date().toISOString().slice(11, 23)
const log = (...a) => console.log(`[${hora()}]`, ...a)

/** Time resumido, que é o que se compara com a HUD. */
const resumoTime = (lado) =>
  (lado?.team ?? [])
    .map((m) => `${m.professor.name}:${m.hp}/${m.maxHp}${m.fainted ? ' ☠' : ''}`)
    .join(' | ')

async function login() {
  const res = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ matricula: EU.matricula, password: EU.senha }),
  })
  if (res.status !== 200) throw new Error(`login: HTTP ${res.status}`)
  return (res.headers.get('set-cookie') || '').split(';')[0]
}

const command = (socket, event, payload) =>
  new Promise((resolve) => socket.emit(event, payload, resolve))

async function main() {
  const cookie = await login()
  const meusExemplares = await fetch(`${API}/api/captures`, {
    headers: { cookie },
  }).then((r) => r.json())
  const ids = meusExemplares.slice(0, 3).map((c) => c.id)
  log(`entrei como ${EU.matricula} com ${ids.length} exemplares`)

  const sock = io(WS, {
    path: '/api/socket.io',
    transports: ['websocket'],
    extraHeaders: { cookie },
  })

  let meusGolpes = []

  sock.on('connect_error', (e) => log('ERRO de conexão:', e.message))
  sock.on('error:unauthorized', () => log('ERRO: handshake recusado (sem sessão)'))
  sock.on('disconnect', (motivo) => log('desconectado:', motivo))

  sock.on('connect', async () => {
    log('conectado ao lobby')
    const sub = await command(sock, 'lobby:subscribe')
    log('subscribe:', JSON.stringify(sub))
    if (!convidar) return
    const lista = await command(sock, 'lobby:search', { term: 'ana' })
    log('busca no lobby:', JSON.stringify(lista))
    const alvo = (lista?.users ?? [])[0]
    if (!alvo) return log('rival não está online — abra o app com a outra conta')
    const r = await command(sock, 'invite:send', { toUserId: alvo.id })
    log('convite enviado:', JSON.stringify(r))
  })

  sock.on('invite:received', async ({ inviteId, from }) => {
    log(`convite de ${from?.name ?? '?'} — aceitando`)
    const r = await command(sock, 'invite:accept', { inviteId })
    if (!r.ok) log('não deu para aceitar:', r.message)
  })

  sock.on('battle:start', async () => {
    log('batalha começou — confirmando time de', ids.length)
    const r = await command(sock, 'battle:pick', { captureIds: ids })
    if (!r.ok) log('pick recusado:', r.message)
  })

  sock.on('battle:preview', async ({ you, foe }) => {
    log('PREVIEW  meu time:', resumoTime(you))
    log('PREVIEW  time do rival:', resumoTime(foe))
    // Um pouco de espera para dar tempo de olhar a tela do outro lado.
    setTimeout(async () => {
      const r = await command(sock, 'battle:lead', {
        captureId: you.team[0].captureId,
      })
      log('lead escolhido:', JSON.stringify(r))
    }, 3000)
  })

  sock.on('battle:begin', ({ turn, you, foe }) => {
    meusGolpes = you.moves ?? []
    log(`BEGIN t${turn} · em campo: ${you.professor.name} vs ${foe.professor.name}`)
    log('  meu time :', resumoTime(you))
    log('  time dele:', resumoTime(foe))
    jogar(sock, 'begin')
  })

  sock.on('battle:round', ({ turn, you, foe, events }) => {
    meusGolpes = you.moves ?? meusGolpes
    log(`ROUND t${turn} · ${you.professor.name}(${you.hp}) vs ${foe.professor.name}(${foe.hp})`)
    log('  eventos :', events.map((e) => e.type).join(','))
    log('  meu time :', resumoTime(you))
    log('  time dele:', resumoTime(foe))
    jogar(sock, 'round')
  })

  sock.on('battle:faint', async ({ youChoose, you, foe }) => {
    log(`FAINT · euEscolho=${youChoose}`)
    log('  meu time :', resumoTime(you))
    log('  time dele:', resumoTime(foe))
    if (!youChoose) return
    const vivo = (you.team ?? []).find((m) => !m.fainted)
    if (!vivo) return log('  sem reserva vivo')
    setTimeout(async () => {
      const r = await command(sock, 'battle:enter', { captureId: vivo.captureId })
      log(`  entrei com ${vivo.professor.name}:`, JSON.stringify(r))
    }, 2000)
  })

  sock.on('battle:end', ({ result, reason, you, foe }) => {
    log(`FIM · ${result} (${reason})`)
    log('  meu time :', resumoTime(you))
    log('  time dele:', resumoTime(foe))
    setTimeout(() => process.exit(0), 1500)
  })

  sock.on('battle:cancelled', ({ reason }) => {
    log('cancelada:', reason)
    process.exit(1)
  })

  function jogar(socket, origem) {
    const ataque =
      meusGolpes.find((m) => m.category === 'ataque' && m.power) ?? meusGolpes[0]
    if (!ataque) return log(`sem golpe para jogar (${origem})`)
    // Espera de propósito: dá tempo de a animação do outro lado terminar e de
    // olhar a tela antes da rodada seguinte.
    setTimeout(async () => {
      const r = await command(socket, 'battle:move', { moveId: ataque.id })
      if (!r.ok) log('golpe recusado:', r.message)
    }, 2500)
  }
}

main().catch((e) => {
  console.error('✗', e.message)
  process.exit(1)
})
