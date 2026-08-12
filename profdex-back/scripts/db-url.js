/**
 * Resolve a DATABASE_URL para os scripts avulsos.
 *
 * O `@prisma/client` não lê o `.env` sozinho (só o CLI do Prisma lê), então
 * cada script precisa carregá-lo na mão. Até aqui havia um fallback para
 * `file:prisma/dev.db`, morto desde a migração para PostgreSQL: com
 * `provider = "postgresql"` no schema, uma URL `file:` só rende um P1012
 * obscuro no meio da execução. Melhor falhar na primeira linha, explicando.
 */
const path = require('node:path')

require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') })

function requireDatabaseUrl() {
  const url = process.env.DATABASE_URL

  if (!url) {
    console.error(
      'DATABASE_URL não definida.\n' +
        'Preencha o .env do profdex-back (veja .env.example) ou suba um ' +
        'Postgres local com `npm run db:up`.',
    )
    process.exit(1)
  }

  if (url.startsWith('file:')) {
    console.error(
      `DATABASE_URL aponta para SQLite (${url}), mas o schema é PostgreSQL.\n` +
        'Use uma URL postgresql:// — `npm run db:up` sobe uma local.',
    )
    process.exit(1)
  }

  return url
}

module.exports = { requireDatabaseUrl }
