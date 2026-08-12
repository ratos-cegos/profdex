/**
 * Gera as fichas de QR de captura.
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
 *   node scripts/generate-capture-qr.js                          # simulação: só mostra o plano
 *   node scripts/generate-capture-qr.js --copies=3 --yes         # 3 fichas de cada combinação
 *   node scripts/generate-capture-qr.js --only=eron --yes        # só um professor
 *   node scripts/generate-capture-qr.js --revoke-unredeemed --yes
 *
 * Cada execução é uma TIRAGEM NOVA e não invalida as fichas anteriores que
 * ainda não foram resgatadas — imprimir mais não pode inutilizar o que já está
 * na mão dos alunos. Use --revoke-unredeemed quando quiser mesmo recomeçar.
 *
 * O token em texto puro só existe dentro do QR e do `tokens.txt` da tiragem.
 * No banco fica apenas `sha256(token)` — ver src/captures/capture-token.ts.
 */

const fs = require('node:fs')
const path = require('node:path')
const { createHash, randomBytes } = require('node:crypto')
const QRCode = require('qrcode')
const { PrismaClient } = require('@prisma/client')
const { requireDatabaseUrl } = require('./db-url')

const db = new PrismaClient({
  datasources: { db: { url: requireDatabaseUrl() } },
})

const args = process.argv.slice(2)
const commit = args.includes('--yes')
const revoke = args.includes('--revoke-unredeemed')

function flag(name, fallback = null) {
  const hit = args.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : fallback
}

const ROOT_DIR = path.resolve(__dirname, '..', flag('out', 'qr-out'))
const onlyArg = flag('only')
const only = onlyArg ? onlyArg.split(',').map((s) => s.trim()).filter(Boolean) : null

const copies = Number(flag('copies', '1'))
if (!Number.isInteger(copies) || copies < 1 || copies > 200) {
  console.error('✗ --copies precisa ser um inteiro entre 1 e 200')
  process.exit(1)
}

// Rótulo só para a folha impressa. Os ids canônicos (e a roda de vantagens)
// estão em src/battle/engine/types.ts; aqui é apresentação.
const TYPE_LABEL = {
  logica: 'Lógica',
  calculo: 'Cálculo',
  'ia-ml': 'IA/ML',
  robotica: 'Robótica',
  arquitetura: 'Arquitetura',
  npi: 'NPI',
  redes: 'Redes',
  banco: 'Banco',
  algoritmos: 'Algoritmos',
}

const labelFor = (types) => types.map((t) => TYPE_LABEL[t] ?? t).join(' + ')

// 32 bytes em base64url = 43 caracteres [A-Za-z0-9_-], dentro das regras de
// CaptureByTokenDto (mín. 32, máx. 256, sem caracteres fora do conjunto).
function generateToken() {
  return randomBytes(32).toString('base64url')
}

function hash(token) {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

function describeDatabase() {
  const url = process.env.DATABASE_URL || ''
  try {
    const { host, pathname } = new URL(url)
    return `${host}${pathname}`
  } catch {
    return '(DATABASE_URL não reconhecida)'
  }
}

function printSheet(entries, batch) {
  const cards = entries
    .map(
      (e) => `    <figure class="card">
      <img src="${e.file}.png" alt="QR Code de captura: ${e.professorName} de ${labelFor(e.types)}" />
      <figcaption>
        <strong>Prof. ${e.professorName}</strong>
        <span class="types">${labelFor(e.types)}</span>
        <span class="hint">Ficha ${e.copy}/${copies} — vale uma captura</span>
      </figcaption>
    </figure>`,
    )
    .join('\n')

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>ProfDex — fichas de captura (${batch})</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; padding: 24px; font-family: system-ui, sans-serif; background: #fff; color: #111; }
    h1 { font-size: 20px; margin: 0 0 4px; }
    p.sub { margin: 0 0 24px; color: #555; font-size: 14px; }
    .grid { display: flex; flex-wrap: wrap; gap: 24px; }
    .card { margin: 0; width: 320px; padding: 16px; border: 2px solid #111; border-radius: 12px; text-align: center; break-inside: avoid; }
    .card img { width: 100%; height: auto; display: block; }
    figcaption { margin-top: 12px; display: flex; flex-direction: column; gap: 4px; }
    figcaption strong { font-size: 18px; }
    .types { font-size: 14px; font-weight: 600; color: #111; }
    .hint { font-size: 12px; color: #555; }
    @media print { body { padding: 0; } p.sub, h1 { display: none; } }
  </style>
</head>
<body>
  <h1>ProfDex — fichas de captura</h1>
  <p class="sub">Tiragem ${batch} — ${entries.length} fichas, ${copies} por combinação de tipos. Cada ficha vale uma única captura.</p>
  <div class="grid">
${cards}
  </div>
</body>
</html>
`
}

async function main() {
  const variants = await db.professorVariant.findMany({
    where: only ? { professor: { slug: { in: only } } } : {},
    select: {
      id: true,
      typeKey: true,
      types: true,
      professor: { select: { name: true, slug: true } },
    },
    orderBy: [{ professor: { slug: 'asc' } }, { typeKey: 'asc' }],
  })

  if (variants.length === 0) {
    throw new Error(
      only
        ? `Nenhuma variante para: ${only.join(', ')}`
        : 'Nenhuma variante no banco — rode `npm run db:seed` primeiro',
    )
  }

  if (only) {
    const achados = new Set(variants.map((v) => v.professor.slug))
    const faltando = only.filter((slug) => !achados.has(slug))
    if (faltando.length) throw new Error(`Slug sem variante: ${faltando.join(', ')}`)
  }

  console.log(`Banco : ${describeDatabase()}`)
  console.log(`Plano : ${copies} ficha(s) por combinação\n`)

  let slugAtual = null
  for (const v of variants) {
    if (v.professor.slug !== slugAtual) {
      slugAtual = v.professor.slug
      console.log(`  ${v.professor.name} (${slugAtual})`)
    }
    console.log(`    ${labelFor(v.types).padEnd(28)} ×${copies}`)
  }
  console.log(`\nTotal : ${variants.length * copies} QR Codes`)

  if (revoke) {
    const alvo = { variantId: { in: variants.map((v) => v.id) }, redeemedAt: null }
    const pendentes = await db.captureToken.count({ where: alvo })
    console.log(`Revoga: ${pendentes} ficha(s) ainda não resgatada(s)`)
  }

  if (!commit) {
    console.log('\nSimulação — nada foi gravado e nenhum arquivo foi criado.')
    console.log('Rode de novo com --yes para gerar de verdade.')
    return
  }

  const batch = new Date().toISOString().replace(/[:.]/g, '-')
  const outDir = path.join(ROOT_DIR, batch)

  const entries = []
  for (const v of variants) {
    for (let copy = 1; copy <= copies; copy++) {
      const token = generateToken()
      entries.push({
        variantId: v.id,
        professorName: v.professor.name,
        professorSlug: v.professor.slug,
        types: v.types,
        copy,
        file: `${v.professor.slug}--${v.typeKey}--${copy}`,
        token,
        tokenHash: hash(token),
        payload: `capture:${token}`,
      })
    }
  }

  // Arquivos primeiro: se o banco falhar, ninguém fica com QR impresso sem par.
  fs.mkdirSync(outDir, { recursive: true })

  for (const entry of entries) {
    await QRCode.toFile(path.join(outDir, `${entry.file}.png`), entry.payload, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 800,
    })
    await QRCode.toFile(path.join(outDir, `${entry.file}.svg`), entry.payload, {
      errorCorrectionLevel: 'M',
      margin: 2,
      type: 'svg',
    })
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
  )

  fs.writeFileSync(path.join(outDir, 'index.html'), printSheet(entries, batch), 'utf8')

  // Ou a tiragem inteira entra no banco, ou nenhuma ficha dela vale — senão
  // sobra papel impresso que o app não reconhece.
  await db.$transaction(async (tx) => {
    if (revoke) {
      await tx.captureToken.deleteMany({
        where: { variantId: { in: variants.map((v) => v.id) }, redeemedAt: null },
      })
    }
    await tx.captureToken.createMany({
      data: entries.map((e) => ({
        variantId: e.variantId,
        tokenHash: e.tokenHash,
        batch,
      })),
    })
  })

  console.log(`\n✓ ${entries.length} fichas gravadas`)
  console.log(`Arquivos em: ${outDir}`)
  console.log('Folha de impressão: index.html')
  console.log('Tokens em texto puro: tokens.txt (guarde em local seguro e apague daqui)')
}

main()
  .catch((e) => { console.error(`\n✗ ${e.message}`); process.exitCode = 1 })
  .finally(() => db.$disconnect())
