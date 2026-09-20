/**
 * ⚠️ APOSENTADO — não popula mais nada. Use `npm run db:seed`.
 *
 * Este script inseria três professores para o `schema.local.prisma` (SQLite),
 * que o próprio arquivo marca como desatualizado há várias features.
 *
 * Ele era uma QUARTA cópia da lista de professores, e desde a tarefa 13 essa
 * cópia é perigosa: o professor passou a guardar `types` e as URLs de arte, e
 * uma linha criada sem isso não entra no sorteio de captura — fica invisível,
 * sem nada na tela dizendo o motivo. A lista canônica vive em
 * `src/professors/seed-professors.ts` e é usada pelo seed e pelo bootstrap.
 *
 * O arquivo continua existindo, e não foi só apagado, porque ele é citado no
 * cabeçalho de `prisma/schema.local.prisma` e em atalhos antigos: quem o rodar
 * precisa ler POR QUE ele parou, não um "command not found".
 */

console.error(
  [
    'Este script foi aposentado (ver o comentário no topo do arquivo).',
    '',
    'Para popular o banco local, use o Postgres do docker-compose:',
    '',
    '  npm run db:up && npm run db:migrate && npm run db:seed',
    '',
    'É o mesmo provider do deploy, e o seed grava os tipos e a arte que o',
    'professor passou a precisar desde a tarefa 13.',
  ].join('\n'),
);
process.exit(1);
