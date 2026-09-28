/**
 * Zera o evento: ranking, Elo, capturas e Profdex — mantendo as contas de
 * administração @unifil.br que já estão no banco.
 *
 * É o comando da véspera. Diferente do `db:reset`, que derruba o banco inteiro
 * e o reconstrói do seed, aqui o CONTEÚDO fica de pé: os professores (com a
 * arte e as variantes), o banco de questões, os ajustes do painel e as contas
 * de quem opera a mesa. O que some é tudo que os alunos produziram.
 *
 * Uso (na pasta profdex-back):
 *   npm run db:limpar-evento              # só mostra o que faria
 *   npm run db:limpar-evento -- --yes     # aplica
 *
 * Quem fica:
 *   · contas com papel `admin` E e-mail @unifil.br (o domínio dos servidores —
 *     ver src/auth/institutional-domains.ts);
 *   · a conta local `admin` do seed, que não tem e-mail e é a única porta para
 *     o painel quando o login do Google não está configurado. Apagá-la
 *     trancaria a bancada no dia do evento.
 *
 * Quem sai: todo o resto das contas, junto de tudo que elas produziram.
 *
 * As fichas de PAPEL voltam a valer: um token resgatado por uma captura que
 * acabou de ser apagada ficaria morto no bolso do aluno, e a tiragem impressa é
 * física — reimprimir custa papel e tempo. As fichas geradas NA TELA somem com
 * o dono (são dele e de mais ninguém). Use `--manter-fichas` para não mexer nos
 * tokens, quando a limpeza for no meio do evento e a pilha já estiver separada.
 *
 * NÃO tem volta. O dry-run é o padrão justamente por isso.
 */
const { PrismaClient } = require('@prisma/client');
const { requireDatabaseUrl } = require('./db-url');

/** Domínio dos servidores — o mesmo de src/auth/institutional-domains.ts. */
const ADMIN_DOMAIN = 'unifil.br';

/**
 * Contas de operação sem e-mail institucional que sobrevivem à limpeza.
 *
 * Só a `admin` do seed. A lista existe para o motivo ficar escrito ao lado do
 * valor, e não para crescer: conta de pessoa de verdade entra pelo Google e
 * chega aqui com o e-mail @unifil.br.
 */
const MATRICULAS_DE_OPERACAO = ['admin'];

const aplicar = process.argv.includes('--yes');
const manterFichas = process.argv.includes('--manter-fichas');

const prisma = new PrismaClient({
  datasources: { db: { url: requireDatabaseUrl() } },
});

/**
 * Esta conta sobrevive?
 *
 * O domínio é comparado por igualdade sobre o que vem depois da arroba, nunca
 * por sufixo: `edu.unifil.br` (aluno) e `unifil.br.invasor.com` também contêm
 * "unifil.br", e os dois precisam cair fora. Mesma regra de
 * institutional-domains.ts, que é quem decide isso no login.
 */
function ehConservada(user) {
  if (user.role !== 'admin') return false;

  const email = (user.email ?? '').trim().toLowerCase();
  const arroba = email.indexOf('@');
  const dominio =
    arroba > 0 && arroba === email.lastIndexOf('@') ? email.slice(arroba + 1) : '';
  if (dominio === ADMIN_DOMAIN) return true;

  return MATRICULAS_DE_OPERACAO.includes(user.matricula);
}

async function main() {
  const usuarios = await prisma.user.findMany({
    select: { id: true, matricula: true, name: true, email: true, role: true },
    orderBy: { name: 'asc' },
  });

  const mantidos = usuarios.filter(ehConservada);
  const removidos = usuarios.filter((u) => !ehConservada(u));

  const [
    batalhas,
    capturas,
    descobertas,
    tentativas,
    errata,
    vouchers,
    raros,
    raidTentativas,
    raidVitorias,
    fichasResgatadasNoPapel,
    fichasDeTela,
  ] = await Promise.all([
    prisma.battle.count(),
    prisma.capture.count(),
    prisma.discovery.count(),
    prisma.quizAttempt.count(),
    prisma.quizErratum.count(),
    prisma.captureVoucher.count(),
    prisma.rareUnlock.count(),
    prisma.raidAttempt.count(),
    prisma.raidClear.count(),
    prisma.captureToken.count({
      where: { assignedToId: null, redeemedAt: { not: null } },
    }),
    prisma.captureToken.count({ where: { assignedToId: { not: null } } }),
  ]);

  console.log('O que será APAGADO:');
  console.log(`  · ${batalhas} batalha(s) e o Elo de todo mundo`);
  console.log(`  · ${capturas} captura(s) e ${descobertas} descoberta(s) da Profdex`);
  console.log(`  · ${tentativas} tentativa(s) de quiz, ${errata} errata(s), ${vouchers} voucher(s)`);
  console.log(`  · ${raros} tema(s) de raro destravado(s)`);
  console.log(`  · ${raidTentativas} tentativa(s) de raid e ${raidVitorias} vitória(s) sobre o lendário`);
  console.log(`  · ${removidos.length} conta(s) de aluno, com sessões e métricas`);

  console.log('\nO que FICA de pé:');
  console.log('  · professores (arte, tipos e variantes), questões e ajustes do painel');
  console.log(`  · ${mantidos.length} conta(s) de administração:`);
  for (const u of mantidos) {
    console.log(`      · ${u.matricula} — ${u.name} ${u.email ? `<${u.email}>` : '(conta local do seed)'}`);
  }

  if (!mantidos.length) {
    console.error(
      '\n⛔ Nenhuma conta sobreviveria — a limpeza deixaria o painel sem dono.\n' +
        `   Esperado: papel "admin" com e-mail ${ADMIN_DOMAIN}, ou a matrícula "admin" do seed.\n` +
        '   Rode `npm run db:set-admin` para conferir quem é administrador hoje.',
    );
    process.exitCode = 1;
    return;
  }

  console.log('\nFichas de captura:');
  if (manterFichas) {
    console.log('  · --manter-fichas: nenhum token é tocado.');
  } else {
    console.log(`  · ${fichasResgatadasNoPapel} ficha(s) de PAPEL voltam a valer`);
    console.log(`  · ${fichasDeTela} ficha(s) de TELA somem junto com o dono`);
  }

  if (!aplicar) {
    console.log('\nNada foi alterado. Rode com --yes para aplicar.');
    return;
  }

  const ids = removidos.map((u) => u.id);

  // A ordem é a das FKs, que são RESTRICT: dependente sai antes do referenciado.
  // Nada aqui é "por garantia" — cada linha destrava a seguinte.
  await prisma.$transaction(
    async (tx) => {
      // Vouchers antes das erratas (apontam para elas), erratas antes das
      // tentativas (apontam para elas).
      await tx.captureVoucher.deleteMany({});
      await tx.quizErratum.deleteMany({});
      await tx.quizAttempt.deleteMany({});

      // Batalhas antes das capturas: battle_slots referencia capture, e o
      // delete de battle cascateia nos slots.
      await tx.battle.deleteMany({});

      await tx.raidClear.deleteMany({});
      await tx.raidAttempt.deleteMany({});
      await tx.raidUnlock.deleteMany({});
      await tx.rareUnlock.deleteMany({});

      // Capturas antes dos tokens: capture.tokenId aponta para capture_tokens.
      await tx.capture.deleteMany({});
      await tx.discovery.deleteMany({});

      if (!manterFichas) {
        // A ficha de papel é anônima e vale uma captura. Sem a captura que a
        // consumiu, o "usado" dela não descreve mais nada.
        await tx.captureToken.updateMany({
          where: { assignedToId: null },
          data: { redeemedAt: null, redeemedBy: null },
        });
      }

      // Métricas antes das sessões, e ambas antes dos usuários: app_events
      // referencia as duas, e as FKs são RESTRICT.
      await tx.appEvent.deleteMany({});
      await tx.userSession.deleteMany({});
      await tx.metricHourly.deleteMany({});
      await tx.passwordResetToken.deleteMany({});

      if (ids.length) {
        // As fichas de tela do aluno saem por cascade (onDelete: Cascade em
        // capture_tokens.assigned_to_id), e `qr_batches.created_by_id` vira
        // nulo — o registro de que a tiragem existiu não pode sumir.
        await tx.user.deleteMany({ where: { id: { in: ids } } });
      }

      // Inclui os admins que ficaram: o ranking está sendo zerado, e um
      // operador com 1200 de Elo apareceria no topo de um ladder vazio.
      await tx.user.updateMany({
        data: {
          battleRating: 1000,
          battleWins: 0,
          battleLosses: 0,
          battleDraws: 0,
          engagementScore: 0,
        },
      });
    },
    // O padrão do Prisma é 5s, e apagar o evento inteiro passa disso num banco
    // com o movimento de um dia de feira.
    { timeout: 120_000 },
  );

  console.log('\n✅ Evento zerado.');
  console.log(`   ${mantidos.length} conta(s) de administração mantida(s), com Elo em 1000.`);
  if (!manterFichas && fichasResgatadasNoPapel) {
    console.log(`   ${fichasResgatadasNoPapel} ficha(s) de papel voltaram a valer.`);
  }
}

main()
  .catch((e) => {
    console.error('Erro:', e.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
