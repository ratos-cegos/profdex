/**
 * Recalcula `metrics_hourly` do começo do evento até agora.
 *
 *   npm run metrics:rollup-full
 *
 * O rollup em produção só refaz as últimas 24h (ver `ROLLUP_WINDOW_HOURS`).
 * Isso basta no dia a dia, mas **não** quando um peso de interação muda: os
 * baldes mais antigos ficariam congelados na régua velha, e o gráfico do painel
 * ganharia um degrau no dia da mudança que não corresponde a evento nenhum.
 *
 * Rode este script UMA vez depois de qualquer mudança em
 * `INTERACTION_WEIGHTS`, em `INTERACTIONS_PER_BATTLE_TURN` ou nas consultas do
 * `RollupService`. Ele é idempotente (o `persist` é um upsert por
 * `bucket + metric`), então rodar duas vezes não faz mal.
 *
 * Roda contra o mesmo banco do `.env` — em produção, dentro do container.
 */

import { PrismaClient } from '@prisma/client';
import { RollupService } from '../src/metrics/rollup.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { requireDatabaseUrl } from './db-url';

const db = new PrismaClient({
  datasources: { db: { url: requireDatabaseUrl() } },
});

async function main() {
  // O evento inteiro é a janela: do evento mais antigo (ou da sessão mais
  // antiga, o que vier primeiro) até agora. Sem nada no banco, não há o que
  // recalcular — e dizer isso é mais útil que uma passada vazia em silêncio.
  const [primeiroEvento, primeiraSessao] = await Promise.all([
    db.appEvent.findFirst({
      orderBy: { occurredAt: 'asc' },
      select: { occurredAt: true },
    }),
    db.userSession.findFirst({
      orderBy: { startedAt: 'asc' },
      select: { startedAt: true },
    }),
  ]);

  const candidatos = [
    primeiroEvento?.occurredAt,
    primeiraSessao?.startedAt,
  ].filter((d): d is Date => !!d);

  if (!candidatos.length) {
    console.log('Nada a recalcular: sem eventos e sem sessões no banco.');
    return;
  }

  const desde = new Date(Math.min(...candidatos.map((d) => d.getTime())));
  desde.setMinutes(0, 0, 0);

  const horas = Math.ceil((Date.now() - desde.getTime()) / 3_600_000);
  console.log(
    `Recalculando ${horas}h de métricas, desde ${desde.toISOString()}...`,
  );

  // O serviço faz todo o trabalho: reimplementar as consultas aqui criaria uma
  // segunda régua que só se descobre divergente depois do evento.
  const rollup = new RollupService(db as unknown as PrismaService);
  await rollup.run(desde);

  const total = await db.metricHourly.count();
  console.log(`\n✓ Pronto. ${total} linha(s) em metrics_hourly.`);
}

main()
  .catch((e: Error) => {
    console.error(`\n✗ ${e.message}`);
    process.exitCode = 1;
  })
  .finally(() => void db.$disconnect());
