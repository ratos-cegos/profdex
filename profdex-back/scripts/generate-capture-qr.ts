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
 * de cada tipo.
 *
 * A ficha vale por TIPO, não por professor: a bancada entrega a ficha do tema
 * da questão que o aluno acertou, e QUAL professor daquele tipo ele leva sai no
 * sorteio do servidor, no momento do scan (src/captures/capture-lottery.ts).
 *
 * Uso:
 *   npx ts-node scripts/generate-capture-qr.ts                     # simulação
 *   npx ts-node scripts/generate-capture-qr.ts --copies=3 --yes
 *   npx ts-node scripts/generate-capture-qr.ts --only=redes,ia --yes
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
import { TYPE_CYCLE } from '../src/battle/engine/types';
import {
  buildSheetEntries,
  labelFor,
  MAX_COPIES_CLI,
  newBatchId,
  QR_OPTIONS,
  renderSheet,
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
  // Id fora da roda viraria ficha que o sorteio nunca resolve — papel impresso
  // que só devolve erro para o aluno.
  if (only) {
    const desconhecidos = only.filter(
      (t) => !(TYPE_CYCLE as readonly string[]).includes(t),
    );
    if (desconhecidos.length) {
      throw new Error(
        `Tipo fora da roda: ${desconhecidos.join(', ')}\n` +
          `  Tipos válidos: ${TYPE_CYCLE.join(', ')}`,
      );
    }
  }
  const types = only
    ? TYPE_CYCLE.filter((t) => only.includes(t))
    : [...TYPE_CYCLE];

  // Quantos professores ATIVOS cada tipo tem. Zero significa ficha que não
  // captura nada, e a CLI avisa antes de gastar papel.
  const variantes = await db.professorVariant.findMany({
    where: { professor: { active: true } },
    select: { professorId: true, types: true },
  });
  const professoresPorTipo = new Map<string, Set<string>>();
  for (const v of variantes) {
    for (const type of v.types) {
      const set = professoresPorTipo.get(type) ?? new Set<string>();
      set.add(v.professorId);
      professoresPorTipo.set(type, set);
    }
  }

  const author = await resolveAuthor();

  console.log(`Banco : ${describeDatabase()}`);
  console.log(`Autor : ${author ? author.label : '(CLI, sem --by)'}`);
  console.log(`Plano : ${copies} ficha(s) por tipo\n`);

  const vazios: string[] = [];
  for (const type of types) {
    const professores = professoresPorTipo.get(type)?.size ?? 0;
    if (professores === 0) vazios.push(type);
    const aviso = professores === 0 ? '  ← SEM PROFESSOR ATIVO' : '';
    console.log(
      `  ${labelFor([type]).padEnd(20)} ×${copies}` +
        `  (${professores} professor(es))${aviso}`,
    );
  }
  console.log(`\nTotal : ${types.length * copies} QR Codes`);

  if (vazios.length) {
    console.log(
      `\n⚠ ${vazios.length} tipo(s) sem professor ativo. A ficha é aceita, mas ` +
        'o scan devolve erro e NÃO consome o papel — o aluno volta para a fila.',
    );
  }

  if (revoke) {
    const alvo = { type: { in: types }, redeemedAt: null };
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
  const entries = buildSheetEntries(types, copies);

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
        where: { type: { in: types }, redeemedAt: null },
      });
    }
    await tx.captureToken.createMany({
      data: entries.map((e) => ({
        type: e.type,
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
        types,
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
