import type { PrismaClient } from '@prisma/client';
import { buildMoveset } from '../battle/engine/moves';
import {
  typeCombinations,
  typeKeyOf,
  typesForProfessor,
} from '../battle/engine/professor-types';

type ProfessorIdentidade = {
  id: string;
  slug?: string | null;
  name?: string | null;
};

/** Cliente mínimo — serve tanto para o PrismaService quanto para o seed. */
type Db = Pick<PrismaClient, 'professor' | 'professorVariant' | 'capture'>;

/**
 * As variantes que um professor deve ter: uma por combinação não-vazia dos
 * tipos declarados em PROFESSOR_TYPES. Dois tipos → três variantes.
 */
export function variantsForProfessor(
  professor: ProfessorIdentidade,
): { typeKey: string; types: string[] }[] {
  return typeCombinations(typesForProfessor(professor)).map((types) => ({
    typeKey: typeKeyOf(types),
    types,
  }));
}

/**
 * Materializa no banco as variantes que faltam. É idempotente e só cria — nunca
 * apaga uma variante existente, porque pode haver ficha impressa ou exemplar
 * capturado apontando para ela.
 */
export async function ensureProfessorVariants(db: Db): Promise<number> {
  const professors = await db.professor.findMany({
    select: { id: true, slug: true, name: true },
  });

  let criadas = 0;
  for (const professor of professors) {
    for (const variant of variantsForProfessor(professor)) {
      const { count } = await db.professorVariant.createMany({
        data: { professorId: professor.id, ...variant },
        skipDuplicates: true,
      });
      criadas += count;
    }
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
      professor: { select: { id: true, slug: true, name: true } },
    },
  });

  let corrigidas = 0;
  for (const capture of pendentes) {
    const types = typesForProfessor(capture.professor);
    const variant = await db.professorVariant.findUnique({
      where: {
        professorId_typeKey: {
          professorId: capture.professor.id,
          typeKey: typeKeyOf(types),
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
