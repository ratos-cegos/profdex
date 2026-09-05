-- Sistema de errata: contestação de questão na bancada + voucher de captura.
-- Ver docs/QUIZ.md, seção "Errata".
--
-- Três coisas nascem aqui:
--   1. "quiz_questions"."code" — 4 dígitos, impresso ao lado da questão. É o
--      que o aluno dita para contestar, então é PÚBLICO e sorteado (nunca
--      derivado do id ou do gabarito).
--   2. "quiz_errata" — a contestação, aberta pelo operador e julgada no painel.
--   3. "capture_vouchers" — o que a errata procedente entrega: uma ficha de QR
--      sem responder pergunta.
--
-- E "quiz_attempts"."annulled": errata procedente tira a tentativa do cooldown
-- e das estatísticas sem apagar a linha (ela é histórico e o voucher a
-- referencia).

-- ── Código de 4 dígitos ─────────────────────────────────────────────────────
-- Nasce nulo, é preenchido com uma permutação sorteada de 1000..9999 e só
-- então vira NOT NULL + UNIQUE. Fazer em três passos é o que permite rodar
-- isto num banco que já tem questões cadastradas.
ALTER TABLE "quiz_questions" ADD COLUMN "code" TEXT;

WITH sorteio AS (
    SELECT
        q."id",
        -- Sorteia sem repetir: numera as questões em ordem aleatória e casa
        -- cada número com um código também embaralhado.
        row_number() OVER (ORDER BY random()) AS pos
    FROM "quiz_questions" q
    WHERE q."code" IS NULL
),
codigos AS (
    SELECT
        n AS code,
        row_number() OVER (ORDER BY random()) AS pos
    FROM generate_series(1000, 9999) AS n
)
UPDATE "quiz_questions" q
SET "code" = c.code::text
FROM sorteio s
JOIN codigos c ON c.pos = s.pos
WHERE q."id" = s."id";

ALTER TABLE "quiz_questions" ALTER COLUMN "code" SET NOT NULL;
CREATE UNIQUE INDEX "quiz_questions_code_key" ON "quiz_questions"("code");

-- ── Tentativa anulada ───────────────────────────────────────────────────────
ALTER TABLE "quiz_attempts"
    ADD COLUMN "annulled" BOOLEAN NOT NULL DEFAULT false;

-- ── Errata ──────────────────────────────────────────────────────────────────
CREATE TABLE "quiz_errata" (
    "id" TEXT NOT NULL,
    "question_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "attempt_id" TEXT,
    "opened_by_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'aberta',
    "notes" TEXT,
    "resolved_by_id" TEXT,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quiz_errata_pkey" PRIMARY KEY ("id")
);

-- Fila de revisão do painel: as abertas, mais antigas primeiro.
CREATE INDEX "quiz_errata_status_created_at_idx"
    ON "quiz_errata"("status", "created_at");
CREATE INDEX "quiz_errata_question_id_idx" ON "quiz_errata"("question_id");

ALTER TABLE "quiz_errata" ADD CONSTRAINT "quiz_errata_question_id_fkey"
    FOREIGN KEY ("question_id") REFERENCES "quiz_questions"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "quiz_errata" ADD CONSTRAINT "quiz_errata_student_id_fkey"
    FOREIGN KEY ("student_id") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "quiz_errata" ADD CONSTRAINT "quiz_errata_opened_by_id_fkey"
    FOREIGN KEY ("opened_by_id") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "quiz_errata" ADD CONSTRAINT "quiz_errata_resolved_by_id_fkey"
    FOREIGN KEY ("resolved_by_id") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "quiz_errata" ADD CONSTRAINT "quiz_errata_attempt_id_fkey"
    FOREIGN KEY ("attempt_id") REFERENCES "quiz_attempts"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- ── Voucher de captura ──────────────────────────────────────────────────────
CREATE TABLE "capture_vouchers" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "erratum_id" TEXT,
    "theme" TEXT,
    "reason" TEXT NOT NULL DEFAULT 'errata',
    "status" TEXT NOT NULL DEFAULT 'disponivel',
    "issued_by_id" TEXT NOT NULL,
    "redeemed_by_id" TEXT,
    "redeemed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "capture_vouchers_pkey" PRIMARY KEY ("id")
);

-- O sino do aluno pergunta exatamente isto: os disponíveis dele.
CREATE INDEX "capture_vouchers_user_id_status_idx"
    ON "capture_vouchers"("user_id", "status");

ALTER TABLE "capture_vouchers" ADD CONSTRAINT "capture_vouchers_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "capture_vouchers" ADD CONSTRAINT "capture_vouchers_issued_by_id_fkey"
    FOREIGN KEY ("issued_by_id") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "capture_vouchers" ADD CONSTRAINT "capture_vouchers_redeemed_by_id_fkey"
    FOREIGN KEY ("redeemed_by_id") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "capture_vouchers" ADD CONSTRAINT "capture_vouchers_erratum_id_fkey"
    FOREIGN KEY ("erratum_id") REFERENCES "quiz_errata"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
