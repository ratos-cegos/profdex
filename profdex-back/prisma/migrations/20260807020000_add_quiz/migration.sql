-- Quiz de bancada (ver docs/QUIZ.md)

CREATE TABLE "quiz_questions" (
    "id" TEXT NOT NULL,
    "theme" TEXT NOT NULL,
    "difficulty" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "options" JSONB NOT NULL,
    "answer" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quiz_questions_pkey" PRIMARY KEY ("id")
);

-- O enunciado é a chave natural: reexecutar o seed atualiza em vez de duplicar.
CREATE UNIQUE INDEX "quiz_questions_prompt_key" ON "quiz_questions"("prompt");
CREATE INDEX "quiz_questions_theme_difficulty_active_idx"
    ON "quiz_questions"("theme", "difficulty", "active");

CREATE TABLE "quiz_attempts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "question_id" TEXT NOT NULL,
    "theme" TEXT NOT NULL,
    "difficulty" TEXT NOT NULL,
    "correct" BOOLEAN NOT NULL,
    "answer_index" INTEGER,
    "elapsed_ms" INTEGER NOT NULL,
    "operator_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quiz_attempts_pkey" PRIMARY KEY ("id")
);

-- Cooldown de 10min: última tentativa do aluno naquele tema, sem varrer nada.
CREATE INDEX "quiz_attempts_user_id_theme_created_at_idx"
    ON "quiz_attempts"("user_id", "theme", "created_at" DESC);
CREATE INDEX "quiz_attempts_created_at_idx"
    ON "quiz_attempts"("created_at" DESC);
CREATE INDEX "quiz_attempts_theme_created_at_idx"
    ON "quiz_attempts"("theme", "created_at");

ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_operator_id_fkey"
    FOREIGN KEY ("operator_id") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_question_id_fkey"
    FOREIGN KEY ("question_id") REFERENCES "quiz_questions"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
