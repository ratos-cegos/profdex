/**
 * Dá capturas de professores ESCOLHIDOS a uma conta, pela lógica real do jogo.
 *
 *   MATRICULA=201041039 SLUGS=eron,mario npm run db:dar-capturas
 *
 * Existe porque um `INSERT` direto em `captures` não serve: o deck sai de
 * `buildMoveset(variant.types)`, que é código com sorteio e não existe no
 * banco. O exemplar inserido à mão aparece na Profdex e entra em batalha SEM
 * GOLPES — o mesmo motivo pelo qual `seed-dex-completa` monta as capturas pelo
 * caminho real em vez de escrever linhas.
 *
 * Diferente do `seed-dex-completa`, este não cria conta nem ficha: ele opera
 * sobre uma matrícula que já existe e serve para montar um cenário de teste
 * específico ("quero esta conta com exatamente estes três").
 *
 * NÃO é idempotente de propósito: rodar duas vezes dá dois exemplares do mesmo
 * professor, que é exatamente o que o jogo permite (uma ficha, um exemplar).
 * Se você quer trocar a coleção, apague as capturas da conta antes.
 */

import { PrismaClient } from '@prisma/client';
import { buildMoveset } from '../src/battle/engine/moves';
import { typeKeyOf } from '../src/battle/engine/types';

const db = new PrismaClient();

const MATRICULA = process.env.MATRICULA ?? '';
const SLUGS = (process.env.SLUGS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

/** IV sorteado como no resgate real (0–15 por atributo). */
const iv = () => Math.floor(Math.random() * 16);

async function main() {
  const user = await db.user.findUnique({
    where: { matricula: MATRICULA },
    select: { id: true, name: true },
  });
  if (!user) throw new Error(`Matrícula "${MATRICULA}" não encontrada.`);
  if (!SLUGS.length) throw new Error('Informe SLUGS separados por vírgula.');

  const professores = await db.professor.findMany({
    where: { slug: { in: SLUGS } },
    select: {
      id: true,
      name: true,
      slug: true,
      types: true,
      variants: { select: { id: true, typeKey: true, types: true } },
    },
  });

  // Valida TUDO antes de gravar: um slug errado no meio da lista deixaria a
  // conta com metade do cenário montado, e aí não dá para repetir o comando
  // sem duplicar o que já entrou.
  const achados = new Set(professores.map((p) => p.slug));
  const faltando = SLUGS.filter((s) => !achados.has(s));
  if (faltando.length) {
    throw new Error(`Slug inexistente: ${faltando.join(', ')}`);
  }

  for (const p of professores) {
    // A variante da combinação COMPLETA — a mesma escolha do backfill de
    // capturas antigas, e a leitura fiel de "o professor inteiro".
    const variant =
      p.variants.find((v) => v.typeKey === typeKeyOf(p.types)) ?? p.variants[0];
    if (!variant) {
      console.log(`! ${p.name}: sem variante materializada, pulado`);
      continue;
    }

    await db.capture.create({
      data: {
        userId: user.id,
        professorId: p.id,
        variantId: variant.id,
        moves: buildMoveset(variant.types).map((m) => m.id),
        ivHp: iv(),
        ivRigor: iv(),
        ivDidatica: iv(),
        ivRaciocinio: iv(),
      },
    });

    // Sem a descoberta, a Profdex mostra o professor como nunca visto mesmo
    // com o exemplar na mão — as duas telas leem tabelas diferentes.
    await db.discovery.upsert({
      where: { userId_professorId: { userId: user.id, professorId: p.id } },
      update: {},
      create: { userId: user.id, professorId: p.id },
    });

    console.log(`+ ${p.name} (${variant.typeKey})`);
  }

  console.log(`\n${professores.length} captura(s) para ${user.name}.`);
}

main()
  .catch((erro: Error) => {
    console.error(erro.message);
    process.exitCode = 1;
  })
  .finally(() => void db.$disconnect());
