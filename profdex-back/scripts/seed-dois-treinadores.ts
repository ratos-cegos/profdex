/**
 * Cria duas contas de teste com 3 exemplares cada, para validar a batalha em
 * time à mão (dois navegadores, ou um navegador e o smoke).
 *
 *   npx ts-node scripts/seed-dois-treinadores.ts
 *
 * As capturas nascem de fichas de verdade, gravadas com o mesmo hash que a
 * tiragem usa — assim os exemplares têm variante, deck e IVs como teriam depois
 * de um QR escaneado no estande. Inserir a captura direto no banco pularia
 * justamente a parte que dá identidade ao exemplar.
 *
 * Idempotente: reexecutar apaga as capturas destas duas contas e cria de novo.
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
const CONTAS = [
  { matricula: 'ana', name: 'Ana Treinadora' },
  { matricula: 'bia', name: 'Bia Treinadora' },
];

/** IV sorteado no resgate, igual ao fluxo real (0–15 por atributo). */
const iv = () => Math.floor(Math.random() * 16);

async function main() {
  const variants = await db.professorVariant.findMany({
    select: {
      id: true,
      types: true,
      professor: { select: { id: true, name: true, slug: true } },
    },
    orderBy: [{ professor: { slug: 'asc' } }, { typeKey: 'asc' }],
  });
  if (variants.length < 3) {
    throw new Error('Menos de 3 variantes no banco — rode `npm run db:seed`.');
  }

  const senha = await bcrypt.hash(SENHA, 10);

  for (const [i, conta] of CONTAS.entries()) {
    const user = await db.user.upsert({
      where: { matricula: conta.matricula },
      update: { name: conta.name, password: senha },
      create: {
        matricula: conta.matricula,
        name: conta.name,
        password: senha,
        email: `${conta.matricula}@edu.unifil.br`,
        emailVerified: true,
      },
      select: { id: true, name: true, matricula: true },
    });

    // Recomeça limpo: sem isso, reexecutar acumula exemplares e a tela de
    // seleção deixa de refletir o cenário que se quer testar.
    await db.battleSlot.deleteMany({ where: { capture: { userId: user.id } } });
    await db.capture.deleteMany({ where: { userId: user.id } });

    // Três variantes DIFERENTES por conta, deslocadas entre as duas, para o
    // confronto ter tipos variados dos dois lados.
    const escolhidas = [0, 1, 2].map(
      (n) => variants[(i * 3 + n) % variants.length],
    );

    for (const variant of escolhidas) {
      const token = generateCaptureToken();
      const ficha = await db.captureToken.create({
        data: {
          variantId: variant.id,
          tokenHash: hashCaptureToken(token),
          batch: 'seed-dois-treinadores',
          redeemedAt: new Date(),
          redeemedBy: user.id,
        },
      });
      await db.capture.create({
        data: {
          userId: user.id,
          professorId: variant.professor.id,
          variantId: variant.id,
          tokenId: ficha.id,
          moves: buildMoveset(variant.types).map((m) => m.id),
          ivHp: iv(),
          ivRigor: iv(),
          ivDidatica: iv(),
          ivRaciocinio: iv(),
        },
      });
    }

    const lista = escolhidas
      .map((v) => `${v.professor.name} (${v.types.join('+')})`)
      .join(', ');
    console.log(`${user.name} [${user.matricula} / ${SENHA}] → ${lista}`);
  }

  console.log('\n✓ Duas contas prontas, 3 exemplares cada.');
}

main()
  .catch((e: Error) => {
    console.error(`\n✗ ${e.message}`);
    process.exitCode = 1;
  })
  .finally(() => void db.$disconnect());
