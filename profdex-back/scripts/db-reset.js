/**
 * APAGA o banco inteiro e o reconstrói do zero.
 *
 * Derruba todas as tabelas, reaplica todas as migrations e roda o seed completo
 * (`prisma/seed.ts`): professores, as questões do quiz e a conta de
 * administração `admin` / `123456` (ou `ADMIN_PASSWORD`, quando definida).
 *
 * É o botão de "recomeçar" para quando o banco entrou num estado que não vale
 * investigação, ou na véspera do evento para começar com tudo limpo.
 *
 * Uso (na pasta profdex-back):
 *   npm run db:reset            # banco local: apaga e recria
 *   npm run db:reset -- --yes   # obrigatório quando o banco NÃO é local
 *
 * NÃO tem dry-run nem volta: o que estava no banco acabou. Os tokens de captura
 * dos professores também somem — os QR Codes impressos param de valer até
 * `scripts/set-capture-tokens.js` rodar de novo.
 *
 * No Windows, pare o `npm run start:dev` antes: o servidor mantém o
 * `query_engine-windows.dll.node` aberto e o `prisma generate` do meio do reset
 * falha com EPERM. O reset segue mesmo assim, mas o client fica velho — o que
 * só dá problema quando o motivo do reset foi uma mudança de schema.
 */
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { PrismaClient } = require('@prisma/client');
const { requireDatabaseUrl } = require('./db-url');

const BACKEND_DIR = path.resolve(__dirname, '..');
const LOCAL_HOSTS = ['localhost', '127.0.0.1', '::1', 'host.docker.internal'];

const confirmado = process.argv.includes('--yes');
const url = requireDatabaseUrl();

/**
 * Descreve o banco sem vazar a senha da string de conexão — este texto vai para
 * o terminal e, com frequência, para um print colado num chat.
 */
function describe(connectionUrl) {
  try {
    const parsed = new URL(connectionUrl);
    return {
      host: parsed.hostname,
      label: `${parsed.hostname}:${parsed.port || 5432}${parsed.pathname}`,
    };
  } catch {
    return { host: '', label: '(string de conexão ilegível)' };
  }
}

/** Só para o usuário ver o que está prestes a perder. Falha aqui não é fatal. */
async function summarize() {
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  try {
    const [users, professors, questions, battles] = await Promise.all([
      prisma.user.count(),
      prisma.professor.count(),
      prisma.quizQuestion.count(),
      prisma.battle.count(),
    ]);
    return (
      `${users} usuário(s), ${professors} professor(es), ` +
      `${questions} questão(ões), ${battles} batalha(s)`
    );
  } catch {
    return null;
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  const { host, label } = describe(url);
  const local = LOCAL_HOSTS.includes(host);

  console.log(`Banco alvo: ${label}`);
  const conteudo = await summarize();
  if (conteudo) console.log(`Conteúdo atual: ${conteudo}`);

  if (!local && !confirmado) {
    console.error(
      `\n⚠️  "${host}" não é um banco local — pode ser o do evento ou o de produção.\n` +
        'Este comando APAGA TUDO e não tem volta.\n\n' +
        'Se é isso mesmo, rode:  npm run db:reset -- --yes',
    );
    process.exitCode = 1;
    return;
  }

  console.log('\nApagando tudo, reaplicando as migrations e semeando...\n');

  // `migrate reset` já roda o seed configurado em package.json ("prisma.seed"),
  // que é o seed completo — por isso não há um segundo comando aqui. Ele também
  // regenera o client entre as migrations e o seed, o que importa quando o
  // motivo do reset foi justamente uma mudança de schema.
  const reset = spawnSync('npx', ['prisma', 'migrate', 'reset', '--force'], {
    cwd: BACKEND_DIR,
    stdio: 'inherit',
    shell: true,
  });

  if (reset.status !== 0) {
    console.error('\n❌ O reset falhou. O banco pode ter ficado pela metade.');
    process.exitCode = reset.status || 1;
    return;
  }

  const senha = process.env.ADMIN_PASSWORD ? 'a de ADMIN_PASSWORD' : '"123456"';
  console.log(
    '\n✅ Banco recriado do zero.\n' +
      `   Login de administração: matrícula "admin", senha ${senha}.\n\n` +
      'ℹ️  Os professores voltaram SEM token de captura: os QR Codes antigos não\n' +
      '   funcionam mais. Para regerar:\n' +
      '     CAPTURE_TOKEN_MARIO=<token> CAPTURE_TOKEN_ERON=<token> \\\n' +
      '     CAPTURE_TOKEN_GUSTAVO=<token> node scripts/set-capture-tokens.js\n' +
      '     npm run qr:generate',
  );
}

main().catch((e) => {
  console.error('Erro:', e.message);
  process.exitCode = 1;
});
