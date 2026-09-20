import type { PrismaClient } from '@prisma/client';
import { buildMoveset } from '../battle/engine/moves';
import { typeCombinations, typeKeyOf } from '../battle/engine/types';

/** Cliente mínimo — serve para o PrismaService, o seed e uma transação. */
type Db = Pick<PrismaClient, 'professor' | 'professorVariant' | 'capture'>;

/**
 * As variantes que um professor deve ter: uma por combinação não-vazia dos
 * tipos dele. Dois tipos → três variantes.
 *
 * Os tipos vêm do BANCO (`professors.types`) desde a tarefa 13. Antes saíam de
 * um mapa por slug no código, e professor cadastrado pelo painel nasceria sem
 * variante nenhuma — ou seja, fora do sorteio de captura, sem nada indicando o
 * motivo.
 */
export function variantsForProfessor(professor: {
  types: string[];
}): { typeKey: string; types: string[] }[] {
  return typeCombinations(professor.types).map((types) => ({
    typeKey: typeKeyOf(types),
    types,
  }));
}

/**
 * Materializa as variantes que faltam para UM professor.
 *
 * Idempotente e só CRIA — nunca apaga uma variante existente, porque pode haver
 * ficha impressa ou exemplar capturado apontando para ela. Por isso reduzir um
 * professor de dois tipos para um não faz a variante dupla desaparecer: ela só
 * deixa de ser sorteada, já que o sorteio filtra pelos tipos atuais.
 *
 * Recebe `db` para poder rodar DENTRO da transação que cria o professor: o
 * cadastro e as variantes dele são uma operação só.
 */
export async function ensureVariantsForProfessor(
  db: Pick<Db, 'professorVariant'>,
  professorId: string,
  types: string[],
): Promise<number> {
  let criadas = 0;
  for (const variant of variantsForProfessor({ types })) {
    const { count } = await db.professorVariant.createMany({
      data: { professorId, ...variant },
      skipDuplicates: true,
    });
    criadas += count;
  }
  return criadas;
}

/** O mesmo, para o elenco inteiro. É o que o seed e o bootstrap chamam. */
export async function ensureProfessorVariants(db: Db): Promise<number> {
  const professors = await db.professor.findMany({
    select: { id: true, types: true },
  });

  let criadas = 0;
  for (const professor of professors) {
    criadas += await ensureVariantsForProfessor(
      db,
      professor.id,
      professor.types,
    );
  }

  return criadas;
}

/**
 * Dá variante e moveset às capturas anteriores a este modelo. A variante
 * escolhida é a de TODOS os tipos do professor — antes o exemplar não tinha
 * combinação própria, então a completa é a leitura fiel do que o aluno tinha.
 */
export async function backfillCaptureVariants(db: Db): Promise<number> {
  const pendentes = await db.capture.findMany({
    where: { OR: [{ variantId: null }, { moves: { isEmpty: true } }] },
    select: {
      id: true,
      variantId: true,
      professor: { select: { id: true, types: true } },
    },
  });

  let corrigidas = 0;
  for (const capture of pendentes) {
    // Professor sem tipo não tem variante para apontar. Acontece só num banco
    // anterior à migração da tarefa 13 e cujo seed ainda não rodou — pular é
    // melhor do que inventar um tipo e gravar isso no bolso do aluno.
    if (capture.professor.types.length === 0) continue;

    const variant = await db.professorVariant.findUnique({
      where: {
        professorId_typeKey: {
          professorId: capture.professor.id,
          typeKey: typeKeyOf(capture.professor.types),
        },
      },
      select: { id: true, types: true },
    });
    if (!variant) continue;

    await db.capture.update({
      where: { id: capture.id },
      data: {
        variantId: capture.variantId ?? variant.id,
        moves: buildMoveset(variant.types).map((m) => m.id),
      },
    });
    corrigidas += 1;
  }

  return corrigidas;
}
