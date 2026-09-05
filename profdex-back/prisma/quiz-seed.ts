// Popula o banco de questões do quiz de bancada.
//
//   npm run db:seed-quiz
//
// Também é chamado por `prisma/seed.ts` (o seed completo), por isso a lógica
// mora numa função exportada em vez de solta no corpo do arquivo: importar
// este módulo não pode disparar a escrita nem abrir um segundo PrismaClient.
//
// Idempotente: o enunciado é a chave única, então rodar de novo atualiza as
// alternativas/dificuldade em vez de duplicar. Questões que saíram deste
// arquivo NÃO são apagadas — são apenas desativadas (`active = false`), para
// não quebrar a foreign key das tentativas já registradas.
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { QUIZ_QUESTIONS } from './quiz-questions';

/**
 * Sorteia códigos de 4 dígitos livres, um por questão nova.
 *
 * O `update` do upsert NÃO toca no código: ele está impresso na bancada e
 * ditado pelo aluno na hora de contestar. Reexecutar o seed não pode
 * renumerar a folha que já está na mesa.
 *
 * São 9000 códigos para um banco de ~180 questões — a rejeição por colisão
 * praticamente não acontece, mas o teto existe para o seed falhar alto em vez
 * de girar para sempre se um dia o banco encostar no limite.
 */
function criarSorteadorDeCodigos(usados: Set<string>) {
  const PRIMEIRO = 1000;
  const ULTIMO = 9999;
  const TENTATIVAS = 200;

  return function proximoCodigo(): string {
    for (let i = 0; i < TENTATIVAS; i++) {
      const n = PRIMEIRO + Math.floor(Math.random() * (ULTIMO - PRIMEIRO + 1));
      const codigo = String(n);
      if (usados.has(codigo)) continue;
      usados.add(codigo);
      return codigo;
    }
    throw new Error(
      'Sem código de 4 dígitos livre para a questão nova. ' +
        'O banco encostou no limite de 9000 questões?',
    );
  };
}

export async function seedQuiz(prisma: PrismaClient) {
  const existentes = await prisma.quizQuestion.findMany({
    select: { code: true },
  });
  const proximoCodigo = criarSorteadorDeCodigos(
    new Set(existentes.map((q) => q.code)),
  );

  for (const q of QUIZ_QUESTIONS) {
    await prisma.quizQuestion.upsert({
      where: { prompt: q.prompt },
      update: {
        theme: q.theme,
        difficulty: q.difficulty,
        options: q.options,
        answer: q.answer,
        active: true,
      },
      create: {
        theme: q.theme,
        difficulty: q.difficulty,
        prompt: q.prompt,
        options: q.options,
        answer: q.answer,
        code: proximoCodigo(),
      },
    });
  }

  const desativadas = await prisma.quizQuestion.updateMany({
    where: { prompt: { notIn: QUIZ_QUESTIONS.map((q) => q.prompt) } },
    data: { active: false },
  });

  const porTema = new Map<string, number>();
  for (const q of QUIZ_QUESTIONS) {
    porTema.set(q.theme, (porTema.get(q.theme) ?? 0) + 1);
  }

  console.log(
    `Quiz: ${QUIZ_QUESTIONS.length} questões em ${porTema.size} temas ` +
      `(${[...porTema].map(([t, n]) => `${t}=${n}`).join(', ')})`,
  );
  if (desativadas.count) {
    console.log(
      `${desativadas.count} questão(ões) fora do arquivo desativadas`,
    );
  }
}

// Só executa quando chamado direto (`npm run db:seed-quiz`); quando o seed
// completo importa a função, este bloco fica quieto.
if (require.main === module) {
  const prisma = new PrismaClient();
  seedQuiz(prisma)
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
