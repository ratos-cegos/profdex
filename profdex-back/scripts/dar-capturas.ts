/**
 * Dá capturas de professores a uma conta, pela lógica real do jogo.
 *
 *   MATRICULA=201041039 SLUGS=eron,mario npm run db:dar-capturas
 *   MATRICULA=201041039 SLUGS=todos      npm run db:dar-capturas
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
 * ## Os dois modos
 *
 * **Lista de slugs** — NÃO é idempotente, de propósito: rodar duas vezes dá
 * dois exemplares do mesmo professor, que é exatamente o que o jogo permite
 * (uma ficha, um exemplar). Para trocar a coleção, apague as capturas antes.
 *
 * **`SLUGS=todos`** — o elenco ATIVO inteiro, inclusive os raros e o lendário,
 * e aí a regra se inverte: quem a conta já tem é PULADO. "Quero todos" é um
 * estado desejado, não um lote a somar, e repetir o comando depois de cadastrar
 * um professor novo precisa completar a coleção em vez de duplicar as outras 20.
 *
 * Raro e lendário entram aqui e não no `seed-dex-completa` porque os dois
 * scripts respondem a perguntas diferentes: lá se testa o gate da raid, que
 * exige uma dex de comuns exatamente como a do aluno; aqui se monta a conta de
 * quem ORGANIZA, que precisa conseguir abrir qualquer tela do app.
 *
 * ⚠️ A conta que recebe tudo isto deve ser `admin` — é o papel que o
 * `RankingsService` usa para manter o organizador fora dos ladders de coleção.
 * Numa conta de aluno, estas capturas iriam direto para o topo do ranking. O
 * script avisa quando a matrícula não é de administrador.
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

/** O elenco inteiro, e não uma lista de slugs. */
const TODOS = SLUGS.length === 1 && ['todos', '*'].includes(SLUGS[0]);

const SELECT_PROFESSOR = {
  id: true,
  name: true,
  slug: true,
  types: true,
  rare: true,
  legendary: true,
  variants: { select: { id: true, typeKey: true, types: true } },
} as const;

async function main() {
  const user = await db.user.findUnique({
    where: { matricula: MATRICULA },
    select: { id: true, name: true, role: true },
  });
  if (!user) throw new Error(`Matrícula "${MATRICULA}" não encontrada.`);
  if (!SLUGS.length) {
    throw new Error('Informe SLUGS separados por vírgula, ou SLUGS=todos.');
  }

  let professores = await db.professor.findMany({
    // `todos` respeita o `active`: professor desativado saiu do evento, e
    // ressuscitá-lo numa coleção seria reintroduzi-lo pela porta dos fundos.
    where: TODOS ? { active: true } : { slug: { in: SLUGS } },
    orderBy: { name: 'asc' },
    select: SELECT_PROFESSOR,
  });

  if (!TODOS) {
    // Valida TUDO antes de gravar: um slug errado no meio da lista deixaria a
    // conta com metade do cenário montado, e aí não dá para repetir o comando
    // sem duplicar o que já entrou.
    const achados = new Set(professores.map((p) => p.slug));
    const faltando = SLUGS.filter((s) => !achados.has(s));
    if (faltando.length) {
      throw new Error(`Slug inexistente: ${faltando.join(', ')}`);
    }
  } else {
    // Modo "quero todos": o que a conta já tem não entra de novo.
    const jaTem = await db.capture.findMany({
      where: { userId: user.id },
      select: { professorId: true },
      distinct: ['professorId'],
    });
    const possuidos = new Set(jaTem.map((c) => c.professorId));
    const antes = professores.length;
    professores = professores.filter((p) => !possuidos.has(p.id));

    const comuns = professores.filter((p) => !p.rare && !p.legendary).length;
    const raros = professores.filter((p) => p.rare).length;
    const lendarios = professores.filter((p) => p.legendary).length;

    console.log(`Elenco ativo: ${antes} professor(es).`);
    console.log(`Já na conta: ${antes - professores.length}, pulado(s).`);
    console.log(
      `A capturar: ${comuns} comum(ns), ${raros} raro(s), ${lendarios} lendário(s).\n`,
    );

    if (!professores.length) {
      console.log(`${user.name} já tem o elenco inteiro. Nada a fazer.`);
      return;
    }
  }

  if (user.role !== 'admin') {
    console.log(
      `⚠️  "${user.name}" tem papel "${user.role}", não "admin".\n` +
        '   Estas capturas VÃO contar nos rankings de coleção e de dex.\n' +
        '   Para deixar a conta fora dos ladders: npm run db:set-admin ' +
        `${MATRICULA}\n`,
    );
  }

  let criadas = 0;

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

    criadas += 1;
    const selo = p.legendary ? ' ⚡lendário' : p.rare ? ' ✦raro' : '';
    console.log(`+ ${p.name} (${variant.typeKey})${selo}`);
  }

  console.log(`\n${criadas} captura(s) para ${user.name}.`);
  if (TODOS && user.role === 'admin') {
    console.log(
      'A conta é admin, então ela NÃO aparece nos rankings de coleção,\n' +
        'dex e batalha — por mais capturas que receba.',
    );
  }
}

main()
  .catch((erro: Error) => {
    console.error(erro.message);
    process.exitCode = 1;
  })
  .finally(() => void db.$disconnect());
