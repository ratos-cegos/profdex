/**
 * Smoke test da RAID contra um servidor de DEV rodando (npm run start:dev).
 *
 * Percorre pela rede o fluxo inteiro: conta nova → recusa FORA DE HORA → captura
 * de TODOS os professores comuns → `/raid/status` destravando sozinho →
 * `raid:start` → seleção de time → lead → turnos até alguém cair → `battle:end`
 * → e, se venceu, a captura do lendário e a linha da fila do prêmio no banco.
 *
 * Ele MEXE em `raid.opens_at` (a hora de abrir a raid), porque com o padrão do
 * evento a raid está fechada e nada começaria. O valor volta ao que estava por
 * qualquer caminho de saída — inclusive quando o smoke falha no meio.
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
const { io } = require('socket.io-client');
const { createHash, randomBytes } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('@node-rs/bcrypt');
const { requireDatabaseUrl } = require('./db-url');

const API = process.env.SMOKE_API || 'http://localhost:3000/api';
const WS =
  (process.env.SMOKE_API || 'http://localhost:3000').replace(/\/api$/, '') +
  '/battle';

/**
 * Encerra o smoke, e NUNCA sem desfazer o que ele mexeu.
 *
 * `fail` encerra o processo na hora, então um `finally` no `main` não bastaria:
 * uma falha no turno 3 deixaria a abertura da raid no valor que o smoke
 * escreveu — o lendário liberado para o evento inteiro por causa de um teste.
 * Por isso a saída passa toda por aqui (ver `restaurarAbertura`).
 */
const encerrar = (codigo) => {
  void restaurarAbertura()
    .catch((e) =>
      console.error(
        `ATENÇÃO: não foi possível restaurar ${CHAVE_ABERTURA}. ` +
          `Confira em /admin/configuracoes. (${e.message})`,
      ),
    )
    .then(() => prisma.$disconnect())
    .catch(() => {})
    .then(() => process.exit(codigo));
};

const fail = (msg) => {
  console.error('FALHOU:', msg);
  encerrar(1);
};
const ok = (msg) => console.log('OK:', msg);

const prisma = new PrismaClient({
  datasources: { db: { url: requireDatabaseUrl() } },
});

const SMOKE_PASSWORD = 'senha123456789';

const connect = (cookie) =>
  io(WS, {
    path: '/api/socket.io',
    transports: ['websocket'],
    extraHeaders: { cookie },
  });

const waitEvent = (socket, event, ms = 15000) =>
  new Promise((resolve, reject) => {
    const t = setTimeout(
      () => reject(new Error(`timeout esperando ${event}`)),
      ms,
    );
    socket.once(event, (data) => {
      clearTimeout(t);
      resolve(data);
    });
  });

const command = (socket, event, payload) =>
  new Promise((resolve) => socket.emit(event, payload, resolve));

const attackOf = (moves) =>
  moves.find((m) => m.category === 'ataque' && m.power) ?? moves[0];

async function criarConta(name) {
  const matricula = `raidsmoke${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const user = await prisma.user.create({
    data: {
      matricula,
      name,
      password: await bcrypt.hash(SMOKE_PASSWORD, 10),
      email: `${matricula}@edu.unifil.br`,
      emailVerified: true,
    },
    select: { id: true, matricula: true, name: true },
  });

  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ matricula, password: SMOKE_PASSWORD }),
  });
  if (res.status !== 200) fail(`login: HTTP ${res.status}`);
  return { cookie: (res.headers.get('set-cookie') || '').split(';')[0], user };
}

/** Imprime uma ficha só para esta conta e a resgata pela rota real. */
async function capturar(conta, variantId) {
  const token = randomBytes(32).toString('base64url');
  await prisma.captureToken.create({
    data: {
      variantId,
      tokenHash: createHash('sha256').update(token, 'utf8').digest('hex'),
      batch: 'raid-smoke',
    },
  });
  const res = await fetch(`${API}/captures/by-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie: conta.cookie },
    body: JSON.stringify({ token }),
  });
  if (res.status !== 201 && res.status !== 200) {
    fail(`captura: HTTP ${res.status}`);
  }
  return res.json();
}

const status = async (conta) => {
  const res = await fetch(`${API}/raid/status`, {
    headers: { cookie: conta.cookie },
  });
  if (res.status !== 200) fail(`/raid/status: HTTP ${res.status}`);
  return res.json();
};

// ── A trava de horário (`raid.opens_at`) ─────────────────────────────────────
// O padrão do ajuste é 01/10 às 19h, então num dia qualquer a raid está FECHADA
// e o smoke não passaria do `raid:start`. Ele abre a porta, roda o fluxo e
// **devolve o ajuste ao que estava** — deixar a raid aberta por descuido é
// justamente o acidente que a trava existe para evitar.
const CHAVE_ABERTURA = 'raid.opens_at';

const lerAbertura = async () => {
  const linha = await prisma.appSetting.findUnique({
    where: { key: CHAVE_ABERTURA },
    select: { value: true },
  });
  return linha ? linha.value : null;
};

const gravarAbertura = (valor) =>
  prisma.appSetting.upsert({
    where: { key: CHAVE_ABERTURA },
    update: { value: valor },
    create: { key: CHAVE_ABERTURA, value: valor },
  });

/**
 * O que `raid.opens_at` valia antes do smoke, e se ele chegou a mexer.
 *
 * O par existe porque `null` é ambíguo sozinho: "não havia linha" e "ainda não
 * li" pareceriam iguais, e restaurar no segundo caso APAGARIA a configuração do
 * evento — que é o oposto do que este cuidado todo quer.
 */
let aberturaOriginal = null;
let mexeuNaAbertura = false;

/** Grava e espera o servidor esquecer o valor antigo. */
const definirAbertura = async (valor) => {
  await gravarAbertura(valor);
  mexeuNaAbertura = true;
  // O servidor guarda os ajustes num cache de 10s (`SettingsService`) e este
  // script escreve direto no banco, sem passar pela invalidação. Esperar é o
  // preço de não precisar de uma conta admin só para o smoke.
  console.log('   (aguardando o cache de ajustes do servidor, ~11s)');
  await new Promise((resolve) => setTimeout(resolve, 11_000));
};

/** Sem espera: aqui o script está indo embora, e quem ficar relê do banco. */
const restaurarAbertura = async () => {
  if (!mexeuNaAbertura) return;
  if (aberturaOriginal === null) {
    await prisma.appSetting
      .delete({ where: { key: CHAVE_ABERTURA } })
      // Já não existir é o resultado desejado: não há o que consertar.
      .catch(() => {});
  } else {
    await gravarAbertura(aberturaOriginal);
  }
  console.log('OK: abertura da raid restaurada');
};

async function main() {
  aberturaOriginal = await lerAbertura();

  const lendario = await prisma.professor.findFirst({
    where: { legendary: true, active: true },
    select: { id: true, name: true, slug: true },
  });
  if (!lendario) {
    fail(
      'nenhum professor LENDÁRIO ativo no banco. Cadastre um em ' +
        '/admin/professores marcando "⚡ Professor lendário" e rode de novo.',
    );
  }
  ok(`lendário cadastrado: ${lendario.name}`);

  // O mesmo filtro do gate (`RaidService.dexProgress`) — comuns E raros.
  // Divergir aqui faria o smoke capturar um conjunto que o servidor não
  // considera completo.
  const naDex = await prisma.professor.findMany({
    where: { legendary: false, active: true },
    select: {
      id: true,
      slug: true,
      rare: true,
      types: true,
      variants: { select: { id: true }, take: 1 },
    },
    orderBy: { slug: 'asc' },
  });
  if (!naDex.length) fail('nenhum professor ativo — rode o seed');

  const conta = await criarConta('Raid Smoke');

  // ── A raid é RECUSADA antes de a dex fechar ───────────────────────────────
  const antes = await status(conta);
  if (antes.unlocked) fail('conta nova já nasceu com a raid destravada');
  ok(`dex 0/${naDex.length} → raid bloqueada, como deve`);

  const socket = connect(conta.cookie);
  await waitEvent(socket, 'connect');

  // ── A raid é RECUSADA antes da HORA de abrir ──────────────────────────────
  // Com a dex vazia, as duas travas valeriam: a resposta tem de ser a do
  // HORÁRIO, que é global. O contrário mandaria quem já fechou a coleção
  // procurar um professor que não falta.
  await definirAbertura('2026-12-31T19:00:00-03:00');
  const fechada = await status(conta);
  if (fechada.open) fail('/raid/status disse aberta com a abertura no futuro');
  if (!fechada.opensAtLabel) {
    fail('/raid/status não disse a HORA de abrir — o card não tem o que mostrar');
  }
  ok(`raid fechada até ${fechada.opensAtLabel} (label vindo do servidor)`);

  const foraDeHora = await command(socket, 'raid:start');
  if (foraDeHora.ok) fail('o servidor abriu a raid antes da hora marcada');
  if (foraDeHora.code !== 'RAID_FECHADA') {
    fail(`recusa antes da hora veio como ${foraDeHora.code}, não RAID_FECHADA`);
  }
  ok(`raid:start fora de hora recusado: "${foraDeHora.message}"`);

  // Abre a porta para o resto do smoke. O valor original volta no `finally`.
  await definirAbertura('2026-01-01T19:00:00-03:00');

  const recusa = await command(socket, 'raid:start');
  if (recusa.ok) fail('o servidor abriu a raid para quem não fechou a Profdex');
  if (recusa.code !== 'RAID_BLOQUEADA') {
    fail(`com a raid aberta e a dex vazia, esperava RAID_BLOQUEADA`);
  }
  ok(`raid:start recusado: "${recusa.message}"`);

  // ── Fecha a dex ───────────────────────────────────────────────────────────
  for (const professor of naDex) {
    if (!professor.variants[0]) fail(`${professor.slug} não tem variante`);
    // O raro passa pelo MESMO endpoint, e lá ele bate no gate de `rare_unlocks`
    // (todos os temas dele destravados na bancada). Destravar aqui é o que
    // mantém o smoke no caminho real: sem as linhas, a captura volta 403 e o
    // teste passaria a provar só que o gate do raro existe.
    if (professor.rare) {
      await prisma.rareUnlock.createMany({
        data: professor.types.map((theme) => ({
          userId: conta.user.id,
          theme,
        })),
        skipDuplicates: true,
      });
    }
    await capturar(conta, professor.variants[0].id);
  }
  const depois = await status(conta);
  if (!depois.unlocked) {
    fail(`dex ${depois.dex.captured}/${depois.dex.total} mas raid travada`);
  }
  if (depois.captured) fail('a conta nasceu com o lendário já capturado');
  if (depois.legendary) {
    fail('o servidor vazou o lendário ANTES da captura — o card deve ser ???');
  }
  ok(`dex ${depois.dex.captured}/${depois.dex.total} → raid destravada`);

  // ── A raid ────────────────────────────────────────────────────────────────
  const inicio = waitEvent(socket, 'battle:start');
  const ack = await command(socket, 'raid:start');
  if (!ack.ok) fail(`raid:start: ${ack.message}`);
  const start = await inicio;
  if (start.mode !== 'raid') fail(`battle:start sem mode raid: ${start.mode}`);
  ok(`raid aberta contra ${start.opponent.name}`);

  const capturas = await prisma.capture.findMany({
    where: { userId: conta.user.id },
    select: { id: true },
    take: 3,
  });

  const previewPromise = waitEvent(socket, 'battle:preview');
  const pick = await command(socket, 'battle:pick', {
    captureIds: capturas.map((c) => c.id),
  });
  if (!pick.ok) fail(`battle:pick: ${pick.message}`);
  const preview = await previewPromise;
  if (preview.foe.team.length !== 1) {
    fail(`o chefe veio com ${preview.foe.team.length} exemplares`);
  }
  ok('preview: um chefe só, e o time do aluno confirmado');

  const beginPromise = waitEvent(socket, 'battle:begin');
  await command(socket, 'battle:lead', {
    captureId: preview.you.team[0].captureId,
  });
  const begin = await beginPromise;

  // O corpo inflado é a razão de a raid ser difícil: confere que o
  // multiplicador chegou mesmo ao combatente.
  if (begin.foe.maxHp <= 120) {
    fail(
      `o chefe nasceu com ${begin.foe.maxHp} de vida — multiplicador não aplicou`,
    );
  }
  ok(`batalha começou: chefe com ${begin.foe.maxHp} de vida`);

  // ── Turnos ────────────────────────────────────────────────────────────────
  let estado = begin;
  let fim = null;
  for (let turno = 0; turno < 80 && !fim; turno += 1) {
    const proximo = Promise.race([
      waitEvent(socket, 'battle:round').then((d) => ({ tipo: 'round', d })),
      waitEvent(socket, 'battle:faint').then((d) => ({ tipo: 'faint', d })),
      waitEvent(socket, 'battle:end').then((d) => ({ tipo: 'end', d })),
    ]);

    if (estado.youChoose) {
      const vivo = estado.you.team.find(
        (m) => !m.fainted && m.captureId !== estado.you.activeCaptureId,
      );
      if (!vivo) break;
      await command(socket, 'battle:enter', { captureId: vivo.captureId });
    } else {
      await command(socket, 'battle:move', {
        moveId: attackOf(estado.you.moves).id,
      });
    }

    const evento = await proximo;
    if (evento.tipo === 'end') fim = evento.d;
    else estado = { ...evento.d, you: evento.d.you, foe: evento.d.foe };
  }

  if (!fim) fail('a raid não terminou em 80 turnos');
  ok(
    `raid encerrada: ${fim.result} (${fim.reason}) em ${fim.turns ?? '?'} turnos`,
  );

  // ── O que o banco registrou ───────────────────────────────────────────────
  const tentativa = await prisma.raidAttempt.findFirst({
    where: { userId: conta.user.id },
    orderBy: { startedAt: 'desc' },
  });
  if (!tentativa) fail('nenhuma linha em raid_attempts');
  if (!tentativa.endedAt) fail('a tentativa ficou aberta depois do fim');
  ok(`raid_attempts gravada: result=${tentativa.result}`);

  const clear = await prisma.raidClear.findUnique({
    where: { userId: conta.user.id },
  });

  if (fim.result === 'win') {
    if (!fim.captured) fail('venceu mas `captured` veio false');
    if (!clear)
      fail('venceu mas não há linha em raid_clears — sem fila do prêmio');

    const exemplar = await prisma.capture.findFirst({
      where: { userId: conta.user.id, professorId: lendario.id },
    });
    if (!exemplar) fail('venceu mas o exemplar do lendário não foi criado');
    if (exemplar.ivHp !== 15 || exemplar.ivRigor !== 15) {
      fail(
        `o lendário nasceu com IV ${exemplar.ivHp}/${exemplar.ivRigor}, não 15`,
      );
    }
    ok('lendário capturado com IV 15 e fila do prêmio registrada');

    const final = await status(conta);
    if (!final.captured) fail('/raid/status não reflete a captura');
    if (!final.legendary)
      fail('/raid/status não devolveu o lendário após captura');
    ok(
      `/raid/status agora entrega ${final.legendary.name} — card deixa de ser ???`,
    );

    // Segunda raid tem que ser recusada: uma captura por conta, para sempre.
    const repetida = await command(socket, 'raid:start');
    if (repetida.ok)
      fail('o servidor abriu uma segunda raid para quem já capturou');
    ok(`segunda raid recusada: "${repetida.message}"`);
  } else {
    if (clear) fail('perdeu mas ganhou linha em raid_clears');
    if (fim.captured) fail('perdeu mas `captured` veio true');
    if (!fim.retryAt) fail('perdeu e o servidor não disse quando libera');
    ok('derrota: sem captura, com cooldown informado');

    // Em cooldown, a próxima tentativa tem que ser recusada.
    const cedo = await command(socket, 'raid:start');
    if (cedo.ok) fail('o cooldown não bloqueou a tentativa seguinte');
    ok(`cooldown bloqueando: "${cedo.message}"`);
  }

  socket.close();
  console.log('\n✓ Smoke da raid passou.');
}

main().then(
  () => encerrar(0),
  (e) => fail(e.message),
);
