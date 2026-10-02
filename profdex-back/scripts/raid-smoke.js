/**
 * Smoke test da RAID contra um servidor de DEV rodando (npm run start:dev).
 *
 * Percorre pela rede o fluxo inteiro: conta nova → recusa FORA DE HORA → captura
 * de TODOS os professores comuns → `/raid/status` destravando sozinho →
 * `raid:start` → seleção de time → lead → turnos até alguém cair → `battle:end`
 * → e, se venceu, a captura do lendário e a linha da fila do prêmio no banco.
 *
 * Ele MEXE em `raid.opens_at` (a hora de abrir a raid) e na janela diária
 * (`raid.daily_open_hour`/`raid.daily_close_hour`, das 18h às 22h), porque com
 * os padrões do evento a raid está fechada e nada começaria — fora da janela o
 * smoke falhava em qualquer horário que não fosse noite. Os três valores voltam
 * ao que estavam por qualquer caminho de saída, inclusive quando ele falha.
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
 * Por isso a saída passa toda por aqui (ver `restaurarAjustes`).
 */
const encerrar = (codigo) => {
  void restaurarAjustes()
    .catch((e) =>
      console.error(
        `ATENÇÃO: não foi possível restaurar ${CHAVES_DA_RAID.join(', ')}. ` +
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

// ── As travas de horário ────────────────────────────────────────────────────
// Duas travas decidem se a raid aceita entrada:
//   - `raid.opens_at`: a raid já existe? (padrão 01/10 às 19h);
//   - a janela diária, `raid.daily_open_hour`/`raid.daily_close_hour`: é hora
//     de raid agora? (padrão das 18h às 22h, hora do evento).
// Com os padrões, num horário qualquer a raid está FECHADA e o smoke não passa
// do `raid:start`. Ele abre as duas, roda o fluxo e **devolve tudo ao que
// estava** — deixar a raid aberta por descuido é justamente o acidente que as
// travas existem para evitar.
const CHAVE_ABERTURA = 'raid.opens_at';
const CHAVE_ABRE_AS = 'raid.daily_open_hour';
const CHAVE_FECHA_AS = 'raid.daily_close_hour';
const CHAVES_DA_RAID = [CHAVE_ABERTURA, CHAVE_ABRE_AS, CHAVE_FECHA_AS];

const lerAjuste = async (chave) => {
  const linha = await prisma.appSetting.findUnique({
    where: { key: chave },
    select: { value: true },
  });
  return linha ? linha.value : null;
};

const gravarAjuste = (chave, valor) =>
  prisma.appSetting.upsert({
    where: { key: chave },
    update: { value: valor },
    create: { key: chave, value: valor },
  });

/**
 * O que cada ajuste valia antes do smoke, e quais ele chegou a mexer.
 *
 * O par existe porque `null` é ambíguo sozinho: "não havia linha" e "ainda não
 * li" pareceriam iguais, e restaurar no segundo caso APAGARIA a configuração do
 * evento — que é o oposto do que este cuidado todo quer.
 */
const originais = new Map();
const mexidos = new Set();

/**
 * Grava um lote de ajustes e espera o servidor esquecer os antigos — uma espera
 * só por lote, mesmo mexendo em mais de uma chave.
 */
const definirAjustes = async (valores) => {
  for (const [chave, valor] of Object.entries(valores)) {
    await gravarAjuste(chave, valor);
    mexidos.add(chave);
  }
  // O servidor guarda os ajustes num cache de 10s (`SettingsService`) e este
  // script escreve direto no banco, sem passar pela invalidação. Esperar é o
  // preço de não precisar de uma conta admin só para o smoke.
  console.log('   (aguardando o cache de ajustes do servidor, ~11s)');
  await new Promise((resolve) => setTimeout(resolve, 11_000));
};

/** Sem espera: aqui o script está indo embora, e quem ficar relê do banco. */
const restaurarAjustes = async () => {
  if (!mexidos.size) return;
  for (const chave of mexidos) {
    const original = originais.get(chave) ?? null;
    if (original === null) {
      await prisma.appSetting
        .delete({ where: { key: chave } })
        // Já não existir é o resultado desejado: não há o que consertar.
        .catch(() => {});
    } else {
      await gravarAjuste(chave, original);
    }
  }
  console.log('OK: abertura e janela da raid restauradas');
};

async function main() {
  for (const chave of CHAVES_DA_RAID) originais.set(chave, await lerAjuste(chave));

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
  await definirAjustes({ [CHAVE_ABERTURA]: '2026-12-31T19:00:00-03:00' });
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

  // Abre a porta para o resto do smoke: a abertura no passado E a janela
  // diária o dia inteiro (abrir 0, fechar 24 — o interruptor previsto em
  // `raid-janela.ts`). Sem a janela, fora das 18h–22h a resposta seguinte
  // seria RAID_FECHADA e o smoke acusaria um bug que não existe. Os valores
  // originais voltam na saída (`restaurarAjustes`).
  await definirAjustes({
    [CHAVE_ABERTURA]: '2026-01-01T19:00:00-03:00',
    [CHAVE_ABRE_AS]: '0',
    [CHAVE_FECHA_AS]: '24',
  });

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
