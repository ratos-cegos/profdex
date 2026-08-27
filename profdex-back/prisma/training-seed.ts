// Popula o banco de questões do Quiz TREINO.
//
//   npm run db:seed-quiz-treino
//
// Escreve SÓ em `training_questions`. O banco oficial (`quiz_questions`) e as
// tentativas da bancada não são tocados — é essa separação que permite o
// treino devolver o gabarito ao aluno sem entregar o do evento (docs/QUIZ.md).
//
// Idempotente, igual ao seed oficial: o enunciado é a chave única, então rodar
// de novo atualiza em vez de duplicar. Questões que saíram do arquivo são
// desativadas (`active = false`) em vez de apagadas, para o caso de alguém
// estar com uma rodada aberta no celular.
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { TRAINING_QUESTIONS } from './training-questions';

export async function seedTrainingQuiz(prisma: PrismaClient) {
  for (const q of TRAINING_QUESTIONS) {
    await prisma.trainingQuestion.upsert({
      where: { prompt: q.prompt },
      update: {
        theme: q.theme,
        difficulty: q.difficulty,
        options: q.options,
        answer: q.answer,
        explanation: q.explanation,
        active: true,
      },
      create: {
        theme: q.theme,
        difficulty: q.difficulty,
        prompt: q.prompt,
        options: q.options,
        answer: q.answer,
        explanation: q.explanation,
      },
    });
  }

  const desativadas = await prisma.trainingQuestion.updateMany({
    where: { prompt: { notIn: TRAINING_QUESTIONS.map((q) => q.prompt) } },
    data: { active: false },
  });

  const porTema = new Map<string, number>();
  for (const q of TRAINING_QUESTIONS) {
    porTema.set(q.theme, (porTema.get(q.theme) ?? 0) + 1);
  }

  console.log(
    `Quiz Treino: ${TRAINING_QUESTIONS.length} questões em ${porTema.size} temas ` +
      `(${[...porTema].map(([t, n]) => `${t}=${n}`).join(', ')})`,
  );
  if (desativadas.count) {
    console.log(`${desativadas.count} questão(ões) fora do arquivo desativadas`);
  }
}

// Só executa quando chamado direto; importar o módulo não escreve nada.
if (require.main === module) {
  const prisma = new PrismaClient();
  seedTrainingQuiz(prisma)
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
