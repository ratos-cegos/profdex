const { createHash } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const IV_ROLLOUT_AT = new Date('2026-08-18T00:00:00.000Z');

function ivsFromId(id) {
  const bytes = createHash('md5').update(`profdex-ivs-v1:${id}`).digest();
  return {
    ivHp: bytes[0] % 16,
    ivRigor: bytes[1] % 16,
    ivDidatica: bytes[2] % 16,
    ivRaciocinio: bytes[3] % 16,
  };
}

async function main() {
  const captures = await prisma.capture.findMany({
    where: { capturedAt: { lt: IV_ROLLOUT_AT } },
    select: { id: true },
  });
  for (const capture of captures) {
    await prisma.capture.update({ where: { id: capture.id }, data: ivsFromId(capture.id) });
  }
  console.log(`Backfill de IVs: ${captures.length} captura(s) atualizada(s).`);
}

main().finally(() => prisma.$disconnect());
