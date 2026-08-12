/**
 * Define (ou remove) o papel de administrador de uma conta.
 *
 * Administrador só ganha acesso de LEITURA ao painel de métricas — nenhuma ação
 * a mais que um aluno comum. Ver docs/METRICAS.md.
 *
 * Quando o login com Google entrar, o papel passará a ser derivado do domínio
 * do e-mail (@unifil.br = admin, @edu.unifil.br = aluno) e este script vira
 * apenas a saída de emergência.
 *
 * Uso (na pasta profdex-back):
 *   node scripts/set-admin.js                       # lista os admins atuais
 *   node scripts/set-admin.js 202312345             # promove
 *   node scripts/set-admin.js 202312345 --remover   # rebaixa para aluno
 */
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const args = process.argv.slice(2);
const remover = args.includes('--remover');
const matricula = args.find((a) => !a.startsWith('--'));

async function main() {
  if (!matricula) {
    const admins = await prisma.user.findMany({
      where: { role: 'admin' },
      select: { matricula: true, name: true },
      orderBy: { name: 'asc' },
    });
    if (!admins.length) {
      console.log('Nenhum administrador definido.');
    } else {
      console.log(`Administradores (${admins.length}):`);
      for (const a of admins) console.log(`  · ${a.matricula} — ${a.name}`);
    }
    console.log('\nUso: node scripts/set-admin.js <matricula> [--remover]');
    return;
  }

  const user = await prisma.user.findUnique({
    where: { matricula },
    select: { id: true, name: true, role: true },
  });
  if (!user) {
    console.error(`Matrícula "${matricula}" não encontrada.`);
    process.exitCode = 1;
    return;
  }

  const novoPapel = remover ? 'aluno' : 'admin';
  if (user.role === novoPapel) {
    console.log(`${user.name} já é "${novoPapel}". Nada a fazer.`);
    return;
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { role: novoPapel },
  });
  console.log(`✅ ${user.name} (${matricula}): ${user.role} → ${novoPapel}`);
  console.log(
    'A conta precisa entrar de novo para o app mostrar/esconder o painel — o\n' +
      'papel viaja no cookie de sessão, que dura 15min.',
  );
}

main()
  .catch((e) => {
    console.error('Erro:', e.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
