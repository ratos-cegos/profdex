-- Banco do Quiz Treino, separado do oficial (ver docs/QUIZ.md).
--
-- Tabela à parte e não uma coluna em "quiz_questions": a rota de treino
-- devolve o gabarito junto com a pergunta, então misturar os dois bancos faria
-- de qualquer consulta sem filtro um vazamento do gabarito da bancada.
-- Sem FK para "quiz_attempts": treinar não gera tentativa nem cooldown.

CREATE TABLE "training_questions" (
    "id" TEXT NOT NULL,
    "theme" TEXT NOT NULL,
    "difficulty" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "options" JSONB NOT NULL,
    "answer" INTEGER NOT NULL,
    "explanation" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "training_questions_pkey" PRIMARY KEY ("id")
);

-- Mesma chave natural do banco oficial: reexecutar o seed atualiza, não duplica.
CREATE UNIQUE INDEX "training_questions_prompt_key"
    ON "training_questions"("prompt");

-- O sorteio da rodada filtra por tema e por ativo.
CREATE INDEX "training_questions_theme_active_idx"
    ON "training_questions"("theme", "active");
