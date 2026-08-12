/**
 * Motor do teste de carga do PvP — usado pelo Artillery (pvp-load.yml).
 *
 * Por que um processor em vez do engine `socketio` do Artillery:
 * o fluxo aqui é dirigido pelo SERVIDOR (battle:start, battle:begin,
 * battle:round, battle:end chegam quando o servidor decide) e todo comando usa
 * ack callback. O engine embutido só sabe "emit e talvez casar um channel de
 * resposta", e não tem como parear dois usuários virtuais entre si. Aqui o
 * socket.io-client de verdade roda dentro da cena, e o Artillery continua
 * cuidando do que faz bem: fases de chegada, agregação de métricas e relatório.
 *
 * ── Sobre autenticação ──────────────────────────────────────────────────────
 * O harness NÃO passa por /auth/login de propósito. Mesmo com o bcrypt nativo,
 * cada login custa dezenas de ms de CPU no servidor; centenas deles no início
 * do teste fariam a medição refletir o custo de hash, não o do PvP. Como a
 * sessão é um JWT simples, assinamos o cookie localmente com o mesmo
 * JWT_SECRET — custo zero no servidor e o gateway valida igual. Para medir o
 * login de propósito, use o cenário `loginOnly` (ver README).
 *
 * ── Sobre as contas ─────────────────────────────────────────────────────────
 * Cada VU cria a própria conta direto no banco (INSERT, sem bcrypt no servidor)
 * junto das capturas que o `battle:pick` exige. Contas novas a cada execução
 * também evitam o cooldown de 12h por dupla, que senão bloquearia o segundo run
 * em diante. Limpeza: `npm run db:reset-ranking -- --yes --purge-test-users`.
 */
const path = require('node:path');
const crypto = require('node:crypto');
const { io } = require('socket.io-client');
const jwt = require('jsonwebtoken');
const bcrypt = require('@node-rs/bcrypt');
const { PrismaClient } = require('@prisma/client');

require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const WS_URL = process.env.LOAD_WS_URL || 'http://localhost:3000';
const JWT_SECRET = process.env.JWT_SECRET;
const SESSION_COOKIE = 'profdex_session';

// Quanto um "idler" fica parado no lobby. A concorrência de lobby que o teste
// alcança é ~ arrivalRate * LOBBY_HOLD_S — é esse número que estressa o fanout.
const LOBBY_HOLD_S = Number(process.env.LOAD_LOBBY_HOLD_S || 60);

// Fração dos usuários parados que abre a lista de jogadores. Só eles recebem
// eventos de presença — 0.2 modela "a maioria está com a tela fechada".
const LOBBY_SUBSCRIBE_RATIO = Number(process.env.LOAD_LOBBY_SUBSCRIBE_RATIO || 0.2);
const MAX_TURNS = Number(process.env.LOAD_MAX_TURNS || 40);
const EVENT_TIMEOUT_MS = Number(process.env.LOAD_EVENT_TIMEOUT_MS || 20000);

if (!JWT_SECRET) {
  throw new Error(
    'JWT_SECRET não encontrado. Rode a partir de profdex-back/ com o .env preenchido.',
  );
}

const prisma = new PrismaClient();

// ── Preparo (uma vez por worker) ────────────────────────────────────────────

let ready = null;

/** Variantes disponíveis + um hash de senha reaproveitado por todas as contas. */
function prepare() {
  if (!ready) {
    ready = (async () => {
      const professors = await prisma.professorVariant.findMany({
        select: { id: true, professorId: true, typeKey: true },
        orderBy: { typeKey: 'asc' },
      });
      if (professors.length < 2) {
        throw new Error('Banco sem variantes — rode o seed antes (npm run db:seed).');
      }
      // Um único hash para todas as contas de teste: elas nunca fazem login
      // (o JWT é assinado aqui), então o valor só precisa existir na coluna.
      const passwordHash = await bcrypt.hash('carga-teste-1234', 10);
      return { professors, passwordHash };
    })();
  }
  return ready;
}

/**
 * Cria uma conta descartável com um exemplar — pronta para `battle:pick`.
 *
 * O exemplar nasce sem deck: o servidor sorteia um no pick para exemplares sem
 * moveset gravado. Aqui interessa a vazão do PvP, não o resgate do QR (esse
 * caminho é o do pvp-smoke), e evita ter que traduzir moves.ts para JS.
 */
async function makeUser(label) {
  const { professors, passwordHash } = await prepare();
  const variant = professors[Math.floor(Math.random() * professors.length)];
  const suffix = `${Date.now().toString(36)}${crypto.randomBytes(4).toString('hex')}`;

  const user = await prisma.user.create({
    data: {
      matricula: `load${suffix}`,
      name: `Carga ${label} ${suffix.slice(-4)}`,
      password: passwordHash,
      captures: {
        create: { professorId: variant.professorId, variantId: variant.id },
      },
    },
    select: { id: true, matricula: true, name: true, captures: { select: { id: true } } },
  });

  const token = jwt.sign(
    { sub: user.id, matricula: user.matricula, name: user.name },
    JWT_SECRET,
    { expiresIn: '15m' },
  );
  return { ...user, captureId: user.captures[0].id, cookie: `${SESSION_COOKIE}=${token}` };
}

// ── Utilidades de socket ────────────────────────────────────────────────────

const connect = (cookie) =>
  io(`${WS_URL}/battle`, {
    path: '/api/socket.io',
    transports: ['websocket'], // sem polling: mede o WS puro, não o upgrade
    extraHeaders: { cookie },
    reconnection: false, // uma queda é uma falha do teste, não algo a esconder
  });

const waitEvent = (socket, event, ms = EVENT_TIMEOUT_MS) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`timeout esperando ${event}`)),
      ms,
    );
    socket.once(event, (data) => {
      clearTimeout(timer);
      resolve(data);
    });
  });

/** Espera o primeiro entre vários eventos — devolve { event, data }. */
const waitAny = (socket, events, ms = EVENT_TIMEOUT_MS) =>
  new Promise((resolve, reject) => {
    const handlers = {};
    const cleanup = () => {
      clearTimeout(timer);
      for (const [name, fn] of Object.entries(handlers)) socket.off(name, fn);
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`timeout esperando ${events.join('|')}`));
    }, ms);
    for (const name of events) {
      handlers[name] = (data) => {
        cleanup();
        resolve({ event: name, data });
      };
      socket.once(name, handlers[name]);
    }
  });

const command = (socket, event, payload) =>
  new Promise((resolve) => {
    const timer = setTimeout(
      () => resolve({ ok: false, message: 'ack timeout' }),
      EVENT_TIMEOUT_MS,
    );
    socket.emit(event, payload, (ack) => {
      clearTimeout(timer);
      resolve(ack ?? { ok: false, message: 'ack vazio' });
    });
  });

const attackOf = (moves) =>
  moves.find((m) => m.category === 'ataque' && m.power) ?? moves[0];

/** Conecta e cronometra até o lobby:count — a primeira coisa que o servidor manda. */
async function joinLobby(user, events) {
  const started = Date.now();
  const socket = connect(user.cookie);
  const { total } = await waitEvent(socket, 'lobby:count');
  events.emit('histogram', 'pvp.connect_ms', Date.now() - started);
  events.emit('histogram', 'pvp.online_total', total);
  return socket;
}

/**
 * Abre a lista de jogadores (o que a UI faz ao tocar em "Jogadores online").
 * Só quem faz isso passa a receber eventos de presença — é por aqui que se mede
 * se o fanout do lobby está contido.
 */
async function openPlayerList(socket, events) {
  const started = Date.now();
  const ack = await command(socket, 'lobby:subscribe');
  if (!ack.ok) {
    events.emit('counter', 'lobby.subscribe_failed', 1);
    return false;
  }
  events.emit('histogram', 'lobby.subscribe_ms', Date.now() - started);
  // Quantos usuários vêm numa página — deve ficar no teto do servidor (50),
  // não crescer com a população online.
  events.emit('histogram', 'lobby.page_users', ack.users.length);
  return true;
}

// ── Cenário 1: batalha completa ─────────────────────────────────────────────
//
// Um VU dirige OS DOIS lados (dois sockets). O servidor não distingue isso de
// dois clientes independentes — são dois websockets falando o protocolo real —
// e em troca some a necessidade de coordenar VUs entre si, que é o que quebra
// testes de carga de jogo. Contabilize 2 conexões por VU deste cenário.

async function runBattle(context, events, done) {
  const finish = () => (typeof done === 'function' ? done() : undefined);
  const sockets = [];
  const cleanup = async () => {
    for (const s of sockets) s.close();
  };

  try {
    const [a, b] = await Promise.all([makeUser('A'), makeUser('B')]);
    const sockA = await joinLobby(a, events);
    sockets.push(sockA);
    const sockB = await joinLobby(b, events);
    sockets.push(sockB);

    const battleStarted = Date.now();

    // ── Convite → sala aberta
    const inviteAt = Date.now();
    const received = waitEvent(sockB, 'invite:received');
    const startA = waitEvent(sockA, 'battle:start');
    const startB = waitEvent(sockB, 'battle:start');

    const sendAck = await command(sockA, 'invite:send', { toUserId: b.id });
    if (!sendAck.ok) {
      events.emit('counter', 'pvp.invite_rejected', 1);
      throw new Error(`invite:send recusado — ${sendAck.message}`);
    }
    const invite = await received;
    const acceptAck = await command(sockB, 'invite:accept', {
      inviteId: invite.inviteId,
    });
    if (!acceptAck.ok) throw new Error(`invite:accept — ${acceptAck.message}`);
    await Promise.all([startA, startB]);
    events.emit('histogram', 'pvp.invite_to_start_ms', Date.now() - inviteAt);

    // ── Pick às cegas → batalha ativa
    const pickAt = Date.now();
    const beginA = waitEvent(sockA, 'battle:begin');
    const beginB = waitEvent(sockB, 'battle:begin');
    const [pickAckA, pickAckB] = await Promise.all([
      command(sockA, 'battle:pick', { captureId: a.captureId }),
      command(sockB, 'battle:pick', { captureId: b.captureId }),
    ]);
    if (!pickAckA.ok) throw new Error(`battle:pick A — ${pickAckA.message}`);
    if (!pickAckB.ok) throw new Error(`battle:pick B — ${pickAckB.message}`);
    let stateA = await beginA;
    let stateB = await beginB;
    events.emit('histogram', 'pvp.pick_to_begin_ms', Date.now() - pickAt);

    // ── Turnos até o nocaute
    let turns = 0;
    let ended = null;
    while (!ended && turns < MAX_TURNS) {
      turns += 1;
      const roundAt = Date.now();
      const nextA = waitAny(sockA, ['battle:round', 'battle:end', 'battle:cancelled']);
      const nextB = waitAny(sockB, ['battle:round', 'battle:end', 'battle:cancelled']);

      await Promise.all([
        command(sockA, 'battle:move', { moveId: attackOf(stateA.you.moves).id }),
        command(sockB, 'battle:move', { moveId: attackOf(stateB.you.moves).id }),
      ]);

      const [resA, resB] = await Promise.all([nextA, nextB]);
      // Latência que o jogador sente: último move enviado → rodada resolvida.
      events.emit('histogram', 'pvp.move_to_round_ms', Date.now() - roundAt);

      if (resA.event === 'battle:cancelled' || resB.event === 'battle:cancelled') {
        throw new Error('batalha cancelada pelo servidor');
      }
      if (resA.event === 'battle:end') {
        ended = resA.data;
      } else {
        stateA = { you: { ...stateA.you, ...resA.data.you } };
        stateB = { you: { ...stateB.you, ...resB.data.you } };
      }
    }

    if (!ended) throw new Error(`não terminou em ${MAX_TURNS} turnos`);

    events.emit('histogram', 'pvp.turns', turns);
    events.emit('histogram', 'pvp.battle_total_ms', Date.now() - battleStarted);
    events.emit('counter', 'pvp.battles_completed', 1);
    // Elo aplicado (null em abandono duplo) — confirma que a transação rodou.
    if (ended.rating) events.emit('counter', 'pvp.rating_applied', 1);

    await cleanup();
    return finish();
  } catch (error) {
    events.emit('counter', 'pvp.battles_failed', 1);
    events.emit('counter', `pvp.error.${slug(error.message)}`, 1);
    await cleanup();
    // done(error) marcaria o VU como falho e o Artillery já contabiliza —
    // devolvemos sem erro para a fase continuar e a contagem acima ser a fonte.
    return finish();
  }
}

// ── Cenário 2: espectador de lobby ──────────────────────────────────────────
//
// Conecta e fica parado, como o aluno que abriu a tela de batalha e está
// esperando alguém chamar. É este cenário que cria a concorrência de verdade e
// mede o custo do broadcast: cada join/leave/mudança de status de QUALQUER
// pessoa gera uma mensagem para TODO mundo. `lobby.events_per_user` é o número
// que cresce quadraticamente se nada for feito.

async function idleInLobby(context, events, done) {
  const finish = () => (typeof done === 'function' ? done() : undefined);
  let socket = null;
  try {
    const user = await makeUser('Lobby');
    socket = await joinLobby(user, events);

    // Só uma fração abre a lista de jogadores — é o comportamento real, e é o
    // que a correção do fanout explora. Compare `lobby.events_per_user` entre
    // os dois grupos: quem não abriu deve ficar em zero.
    const abriuLista = Math.random() < LOBBY_SUBSCRIBE_RATIO;
    if (abriuLista) await openPlayerList(socket, events);

    let updates = 0;
    let bytes = 0;
    socket.on('lobby:update', (payload) => {
      updates += 1;
      bytes += Buffer.byteLength(JSON.stringify(payload));
    });

    const disconnected = new Promise((resolve) =>
      socket.once('disconnect', (reason) => {
        events.emit('counter', `lobby.disconnect.${slug(reason)}`, 1);
        resolve();
      }),
    );
    await Promise.race([sleep(LOBBY_HOLD_S * 1000), disconnected]);

    // Separado por grupo: sem isso a média mistura quem abriu a lista com quem
    // não abriu e esconde justamente o efeito que se quer medir.
    const grupo = abriuLista ? 'com_lista' : 'sem_lista';
    events.emit('histogram', `lobby.events_per_user.${grupo}`, updates);
    events.emit('histogram', `lobby.update_bytes_per_user.${grupo}`, bytes);
    events.emit('counter', 'lobby.sessions_completed', 1);
  } catch (error) {
    events.emit('counter', 'lobby.sessions_failed', 1);
    events.emit('counter', `lobby.error.${slug(error.message)}`, 1);
  } finally {
    if (socket) socket.close();
  }
  return finish();
}

// ── Cenário 3: login real (opcional, isolado) ───────────────────────────────
//
// Separado de propósito: hash de senha custa CPU e misturá-lo com o PvP
// contamina a medição de latência. Rode sozinho para descobrir quantos
// logins/s o servidor aguenta antes de os websockets começarem a sofrer.

async function loginOnly(context, events, done) {
  const finish = () => (typeof done === 'function' ? done() : undefined);
  try {
    const { passwordHash } = await prepare();
    const suffix = `${Date.now().toString(36)}${crypto.randomBytes(4).toString('hex')}`;
    const matricula = `load${suffix}`;
    await prisma.user.create({
      data: { matricula, name: `Carga Login ${suffix.slice(-4)}`, password: passwordHash },
    });

    const started = Date.now();
    const res = await fetch(`${WS_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ matricula, password: 'carga-teste-1234' }),
    });
    events.emit('histogram', 'auth.login_ms', Date.now() - started);
    events.emit('counter', `auth.login_status.${res.status}`, 1);
  } catch (error) {
    events.emit('counter', `auth.error.${slug(error.message)}`, 1);
  }
  return finish();
}

// ── Auxiliares ──────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Mensagens viram nomes de métrica legíveis e estáveis. */
const slug = (text) =>
  String(text)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // tira acentos separados pelo NFD
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 48) || 'desconhecido';

async function closePrisma(context, events, done) {
  await prisma.$disconnect().catch(() => {});
  return typeof done === 'function' ? done() : undefined;
}

module.exports = {
  runBattle,
  idleInLobby,
  loginOnly,
  closePrisma,
};
