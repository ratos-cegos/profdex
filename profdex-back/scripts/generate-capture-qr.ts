/**
 * Gera as fichas de QR de captura pela linha de comando.
 *
 * O formato do token e o layout da folha vivem em
 * `src/captures/capture-sheet.ts`, compartilhados com a tela `/admin/fichas` —
 * duas cópias divergiriam, e a divergência só apareceria em papel impresso.
 * Aqui fica o que é específico da CLI: os arquivos em disco e o `tokens.txt`.
 *
 * Uma ficha vale UMA captura: quem escanear primeiro leva o exemplar e o papel
 * morre. Por isso a tiragem tem quantidade — `--copies=3` imprime três fichas
 * de cada combinação de tipos.
 *
 * O professor não tem um QR só: tem um por combinação dos tipos dele. Eron
 * (Arquitetura + IA/ML) rende três — só Arquitetura, só IA/ML, e as duas — de
 * modo que existe "o Eron de IA/ML" como exemplar distinto na coleção.
 * As combinações vêm da tabela `professor_variants`, populada pelo seed a
 * partir de PROFESSOR_TYPES (ver src/battle/engine/professor-types.ts).
 *
 * Uso:
 *   npx ts-node scripts/generate-capture-qr.ts                     # simulação
 *   npx ts-node scripts/generate-capture-qr.ts --copies=3 --yes
 *   npx ts-node scripts/generate-capture-qr.ts --only=eron --yes
 *   npx ts-node scripts/generate-capture-qr.ts --yes --by=12345    # autoria
 *   npx ts-node scripts/generate-capture-qr.ts --revoke-unredeemed --yes
 *
 * Cada execução é uma TIRAGEM NOVA e não invalida as fichas anteriores que
 * ainda não foram resgatadas — imprimir mais não pode inutilizar o que já está
 * na mão dos alunos. Use --revoke-unredeemed quando quiser mesmo recomeçar.
 *
 * O token em texto puro só existe dentro do QR e do `tokens.txt` da tiragem.
 * No banco fica apenas `sha256(token)` — ver src/captures/capture-token.ts.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as QRCode from 'qrcode';
import { PrismaClient } from '@prisma/client';
import {
  buildSheetEntries,
  labelFor,
  MAX_COPIES_CLI,
  newBatchId,
  QR_OPTIONS,
  renderSheet,
  SheetVariant,
} from '../src/captures/capture-sheet';
import { requireDatabaseUrl } from './db-url';

const db = new PrismaClient({
  datasources: { db: { url: requireDatabaseUrl() } },
});

const args = process.argv.slice(2);
const commit = args.includes('--yes');
const revoke = args.includes('--revoke-unredeemed');

function flag(name: string, fallback: string | null = null): string | null {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

const ROOT_DIR = path.resolve(__dirname, '..', flag('out', 'qr-out')!);
const onlyArg = flag('only');
const only = onlyArg
  ? onlyArg
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  : null;

const copies = Number(flag('copies', '1'));
if (!Number.isInteger(copies) || copies < 1 || copies > MAX_COPIES_CLI) {
  console.error(`✗ --copies precisa ser um inteiro entre 1 e ${MAX_COPIES_CLI}`);
  process.exit(1);
}

function describeDatabase(): string {
  const url = process.env.DATABASE_URL || '';
  try {
    const { host, pathname } = new URL(url);
    return `${host}${pathname}`;
  } catch {
    // URL malformada só afeta esta linha de log; o Prisma já validou a conexão.
    return '(DATABASE_URL não reconhecida)';
  }
}

/**
 * Quem mandou gerar. A tiragem pelo painel sempre tem autor; a da CLI só tem se
 * `--by` vier. Sem isso a linha de auditoria seria uma tiragem órfã, então a
 * origem fica registrada explicitamente em vez de ficar em branco.
 */
async function resolveAuthor(): Promise<{ id: string; label: string } | null> {
  const by = flag('by');
  if (!by) return null;
  const user = await db.user.findFirst({
    where: { OR: [{ matricula: by }, { email: by }] },
    select: { id: true, name: true },
  });
  if (!user) throw new Error(`Nenhum usuário com matrícula ou e-mail "${by}"`);
  return { id: user.id, label: user.name };
}

async function main(): Promise<void> {
  const variants: SheetVariant[] = await db.professorVariant.findMany({
    where: only ? { professor: { slug: { in: only } } } : {},
    select: {
      id: true,
      typeKey: true,
      types: true,
      professor: { select: { name: true, slug: true } },
    },
    orderBy: [{ professor: { slug: 'asc' } }, { typeKey: 'asc' }],
  });

  if (variants.length === 0) {
    throw new Error(
      only
        ? `Nenhuma variante para: ${only.join(', ')}`
        : 'Nenhuma variante no banco — rode `npm run db:seed` primeiro',
    );
  }

  if (only) {
    const achados = new Set(variants.map((v) => v.professor.slug));
    const faltando = only.filter((slug) => !achados.has(slug));
    if (faltando.length)
      throw new Error(`Slug sem variante: ${faltando.join(', ')}`);
  }

  const author = await resolveAuthor();

  console.log(`Banco : ${describeDatabase()}`);
  console.log(`Autor : ${author ? author.label : '(CLI, sem --by)'}`);
  console.log(`Plano : ${copies} ficha(s) por combinação\n`);

  let slugAtual: string | null = null;
  for (const v of variants) {
    if (v.professor.slug !== slugAtual) {
      slugAtual = v.professor.slug;
      console.log(`  ${v.professor.name} (${slugAtual})`);
    }
    console.log(`    ${labelFor(v.types).padEnd(28)} ×${copies}`);
  }
  console.log(`\nTotal : ${variants.length * copies} QR Codes`);

  if (revoke) {
    const alvo = { variantId: { in: variants.map((v) => v.id) }, redeemedAt: null };
    const pendentes = await db.captureToken.count({ where: alvo });
    console.log(`Revoga: ${pendentes} ficha(s) ainda não resgatada(s)`);
  }

  if (!commit) {
    console.log('\nSimulação — nada foi gravado e nenhum arquivo foi criado.');
    console.log('Rode de novo com --yes para gerar de verdade.');
    return;
  }

  const batch = newBatchId();
  const outDir = path.join(ROOT_DIR, batch);
  const entries = buildSheetEntries(variants, copies);

  // Arquivos primeiro: se o banco falhar, ninguém fica com QR impresso sem par.
  fs.mkdirSync(outDir, { recursive: true });

  for (const entry of entries) {
    await QRCode.toFile(path.join(outDir, `${entry.file}.png`), entry.payload, {
      ...QR_OPTIONS,
    });
    await QRCode.toFile(path.join(outDir, `${entry.file}.svg`), entry.payload, {
      ...QR_OPTIONS,
      type: 'svg',
    });
  }

  fs.writeFileSync(
    path.join(outDir, 'tokens.txt'),
    [
      '# SEGREDO — não versionar, não compartilhar.',
      `# Tiragem ${batch}`,
      '',
      ...entries.map((e) => `${e.file}\t${e.token}`),
      '',
    ].join('\n'),
    'utf8',
  );

  fs.writeFileSync(
    path.join(outDir, 'index.html'),
    // A folha da CLI aponta para os PNGs vizinhos; a do painel embute data-URI.
    renderSheet(entries, { batch, copies, srcFor: (e) => `${e.file}.png` }),
    'utf8',
  );

  // Ou a tiragem inteira entra no banco, ou nenhuma ficha dela vale — senão
  // sobra papel impresso que o app não reconhece.
  await db.$transaction(async (tx) => {
    if (revoke) {
      await tx.captureToken.deleteMany({
        where: { variantId: { in: variants.map((v) => v.id) }, redeemedAt: null },
      });
    }
    await tx.captureToken.createMany({
      data: entries.map((e) => ({
        variantId: e.variantId,
        tokenHash: e.tokenHash,
        batch,
      })),
    });
    await tx.qrBatch.create({
      data: {
        batch,
        createdById: author?.id ?? null,
        source: 'cli',
        copies,
        total: entries.length,
        variantIds: variants.map((v) => v.id),
      },
    });
  });

  console.log(`\n✓ ${entries.length} fichas gravadas`);
  console.log(`Arquivos em: ${outDir}`);
  console.log('Folha de impressão: index.html');
  console.log('Tokens em texto puro: tokens.txt (guarde em local seguro e apague daqui)');
}

main()
  .catch((e: Error) => {
    console.error(`\n✗ ${e.message}`);
    process.exitCode = 1;
  })
  .finally(() => void db.$disconnect());
