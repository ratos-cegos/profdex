/**
 * Cria uma conta com a Profdex INTEIRA capturada — a única forma de abrir a
 * tela da raid sem escanear uma ficha por professor cadastrado.
 *
 *   npm run db:seed-dex-completa
 *
 * Sem isto, testar a raid exige capturar todos os professores à mão, e o
 * `raid.hp_multiplier` (o dial que decide se a raid é justa) seria calibrado no
 * escuro, com o evento já aberto.
 *
 * As capturas nascem de fichas de verdade, com o mesmo hash da tiragem, como no
 * `seed-dois-treinadores`: um exemplar inserido direto no banco não teria
 * variante, deck nem IVs, e a raid começaria com um time sem golpes.
 *
 * Captura comuns E RAROS, porque fechar a dex exige os dois desde que o raro
 * passou a contar no gate. Sem os raros aqui, esta conta nasce incompleta aos
 * olhos do servidor e o card da raid não aparece — sem dizer por quê.
 *
 * O que ele NÃO faz, de propósito:
 * - não cria a linha de `raid_unlocks`. O destravamento acontece pelo caminho
 *   real, na primeira leitura de `GET /raid/status` — se ele estiver quebrado,
 *   o seed precisa expor isso, não escondê-lo;
 * - não cria `rare_unlocks`. Aquela tabela é o gate de RESGATE do raro (5
 *   acertos por tema na bancada), e este seed não passa pelo resgate: cria a
 *   captura direto, como faz com o comum. O gate da raid não a lê;
 * - não captura o lendário. Ele é justamente o que se vai testar.
 *
 * Idempotente: reexecutar apaga as capturas desta conta e cria de novo.
 */

import { PrismaClient } from '@prisma/client';
import * as bcrypt from '@node-rs/bcrypt';
import { buildMoveset } from '../src/battle/engine/moves';
import { hashCaptureToken } from '../src/captures/capture-token';
import { generateCaptureToken } from '../src/captures/capture-sheet';
import { requireDatabaseUrl } from './db-url';

const db = new PrismaClient({
  datasources: { db: { url: requireDatabaseUrl() } },
});

const SENHA = 'senha123';
const CONTA = { matricula: 'dex', name: 'Dex Completa' };

/** IV sorteado no resgate, igual ao fluxo real (0–15 por atributo). */
const iv = () => Math.floor(Math.random() * 16);

async function main() {
  // Exatamente o mesmo filtro do gate da raid (`RaidService.dexProgress`) —
  // comuns e raros. Se os dois divergirem, o seed cria uma conta que o servidor
  // considera incompleta — e o card não aparece, sem dizer por quê.
  const naDex = { legendary: false, active: true };

  const professores = await db.professor.findMany({
    where: naDex,
    select: {
      id: true,
      name: true,
      slug: true,
      rare: true,
      variants: {
        select: { id: true, types: true },
        orderBy: { typeKey: 'asc' },
      },
    },
    orderBy: { slug: 'asc' },
  });

  if (!professores.length) {
    throw new Error(
      'Nenhum professor ativo no banco — rode `npm run db:seed` ou ' +
        'cadastre professores em /admin/professores.',
    );
  }

  const semVariante = professores.filter((p) => !p.variants.length);
  if (semVariante.length) {
    throw new Error(
      `Sem variante: ${semVariante.map((p) => p.slug).join(', ')}. ` +
        'Professor sem variante não é capturável — rode `npm run db:seed`.',
    );
  }

  const senha = await bcrypt.hash(SENHA, 10);
  const user = await db.user.upsert({
    where: { matricula: CONTA.matricula },
    update: { name: CONTA.name, password: senha },
    create: {
      matricula: CONTA.matricula,
      name: CONTA.name,
      password: senha,
      email: `${CONTA.matricula}@edu.unifil.br`,
      emailVerified: true,
    },
    select: { id: true, name: true, matricula: true },
  });

  // Recomeça limpo. `raid_clears` e `raid_attempts` vão junto: reexecutar o
  // seed serve justamente para voltar ao estado "pode desafiar", e uma captura
  // antiga do lendário ou um cooldown pendente impediriam isso.
  await db.battleSlot.deleteMany({ where: { capture: { userId: user.id } } });
  await db.raidClear.deleteMany({ where: { userId: user.id } });
  await db.raidAttempt.deleteMany({ where: { userId: user.id } });
  await db.raidUnlock.deleteMany({ where: { userId: user.id } });
  await db.capture.deleteMany({ where: { userId: user.id } });
  await db.discovery.deleteMany({ where: { userId: user.id } });

  for (const professor of professores) {
    // A primeira variante de cada um basta: a dex conta professores DISTINTOS,
    // não combinações de tipos.
    const variant = professor.variants[0];
    const deck = buildMoveset(variant.types);
    if (!deck.length) {
      throw new Error(
        `A variante ${professor.name} (${variant.types.join('+')}) não tem ` +
          'golpes: tipo fora da roda atual. Rode `npm run db:reset`.',
      );
    }

    const token = generateCaptureToken();
    const ficha = await db.captureToken.create({
      data: {
        variantId: variant.id,
        tokenHash: hashCaptureToken(token),
        batch: 'seed-dex-completa',
        redeemedAt: new Date(),
        redeemedBy: user.id,
      },
    });
    // O raro nasce com 15 nos quatro atributos no fluxo real (5 estrelas
    // cheias, ver `rollCaptureIvs`). Sortear aqui daria ao time de teste um raro
    // mais fraco do que qualquer aluno vai levar para a raid.
    const atributo = professor.rare ? () => 15 : iv;
    await db.capture.create({
      data: {
        userId: user.id,
        professorId: professor.id,
        variantId: variant.id,
        tokenId: ficha.id,
        moves: deck.map((m) => m.id),
        ivHp: atributo(),
        ivRigor: atributo(),
        ivDidatica: atributo(),
        ivRaciocinio: atributo(),
      },
    });
    // A descoberta acompanha a captura no fluxo real; sem ela a Profdex
    // mostraria o card capturado mas nunca "descoberto".
    await db.discovery.create({
      data: { userId: user.id, professorId: professor.id },
    });
  }

  const lendario = await db.professor.findFirst({
    where: { legendary: true, active: true },
    select: { name: true },
  });

  const raros = professores.filter((p) => p.rare).length;
  console.log(
    `\n✓ ${user.name} [${user.matricula} / ${SENHA}] → ` +
      `${professores.length} professores capturados (dex completa), ` +
      `sendo ${raros} raro(s).`,
  );
  console.log(
    lendario
      ? `  Lendário cadastrado: ${lendario.name}. Abra /profdex e o card ⚡ ` +
          'deve estar lá, piscando.'
      : '  ⚠ Nenhum lendário ativo cadastrado: o card NÃO vai aparecer. ' +
          'Cadastre um em /admin/professores marcando "⚡ Professor lendário".',
  );
}

main()
  .catch((e: Error) => {
    console.error(`\n✗ ${e.message}`);
    process.exitCode = 1;
  })
  .finally(() => void db.$disconnect());
