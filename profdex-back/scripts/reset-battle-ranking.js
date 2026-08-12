/**
 * Zera o ranking de batalha: apaga o histórico de batalhas e devolve todo mundo
 * para 1000 pontos / 0-0-0.
 *
 * Serve para dois momentos:
 *  - limpar resultados de teste durante o desenvolvimento;
 *  - zerar o ladder na véspera do evento, para a semana tecnológica começar
 *    com todos empatados.
 *
 * Uso (na pasta profdex-back):
 *   node scripts/reset-battle-ranking.js                  # só mostra o que faria
 *   node scripts/reset-battle-ranking.js --yes            # aplica
 *   node scripts/reset-battle-ranking.js --yes --purge-test-users
 *
 * `--purge-test-users` remove também as CONTAS criadas pelos scripts de teste
 * (matrículas com os prefixos abaixo), junto das capturas e descobertas delas.
 * Contas de gente de verdade nunca são apagadas — só têm os pontos zerados.
 */
const { PrismaClient } = require('@prisma/client');
const { requireDatabaseUrl } = require('./db-url');

// Prefixos gerados pelos scripts de smoke/dev — nenhuma matrícula real começa
// assim (as reais são numéricas).
const TEST_MATRICULA_PREFIXES = ['smoke', 'bat', 'inv', 'proxy', 'dbg', 'load'];

const apply = process.argv.includes('--yes');
const purge = process.argv.includes('--purge-test-users');

const prisma = new PrismaClient({
  datasources: { db: { url: requireDatabaseUrl() } },
});

async function main() {
  const testUsers = await prisma.user.findMany({
    where: { OR: TEST_MATRICULA_PREFIXES.map((p) => ({ matricula: { startsWith: p } })) },
    select: { id: true, matricula: true, name: true },
  });

  const battles = await prisma.battle.count();
  const ranked = await prisma.user.count({
    where: {
      OR: [
        { battleWins: { gt: 0 } },
        { battleLosses: { gt: 0 } },
        { battleDraws: { gt: 0 } },
      ],
    },
  });

  console.log(`Batalhas registradas: ${battles}`);
  console.log(`Usuários com pontuação (aparecem no ranking): ${ranked}`);
  console.log(`Contas de teste encontradas: ${testUsers.length}`);
  for (const u of testUsers) console.log(`  · ${u.matricula} — ${u.name}`);

  if (!apply) {
    console.log('\nNada foi alterado. Rode com --yes para aplicar.');
    return;
  }

  // Ordem importa: as FKs são RESTRICT, então dependentes saem primeiro.
  const ids = testUsers.map((u) => u.id);
  await prisma.$transaction(async (tx) => {
    await tx.battle.deleteMany({});

    if (purge && ids.length) {
      await tx.capture.deleteMany({ where: { userId: { in: ids } } });
      await tx.discovery.deleteMany({ where: { userId: { in: ids } } });
      // Métricas antes das sessões, e ambas antes dos usuários: app_events
      // referencia as duas, e as FKs são RESTRICT.
      await tx.appEvent.deleteMany({ where: { userId: { in: ids } } });
      await tx.userSession.deleteMany({ where: { userId: { in: ids } } });
      await tx.passwordResetToken.deleteMany({ where: { userId: { in: ids } } });
      await tx.user.deleteMany({ where: { id: { in: ids } } });
    }

    await tx.user.updateMany({
      data: {
        battleRating: 1000,
        battleWins: 0,
        battleLosses: 0,
        battleDraws: 0,
        // O placar de engajamento vem das batalhas e capturas; zerar o ranking
        // sem zerar ele deixaria os dois contando histórias diferentes.
        engagementScore: 0,
      },
    });
  });

  console.log(`\n✅ ${battles} batalha(s) apagada(s) e pontuação zerada.`);
  if (purge) console.log(`✅ ${ids.length} conta(s) de teste removida(s).`);
  else if (testUsers.length) {
    console.log(
      `ℹ️  ${testUsers.length} conta(s) de teste mantida(s) (use --purge-test-users para remover).`,
    );
  }
}

main()
  .catch((e) => {
    console.error('Erro:', e.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
