-- Professores raros (tarefa 15).
--
-- Aditiva e sem backfill: nenhum professor existente é raro, e `rare` nasce
-- `false` para todo mundo. `rare_professor_id` nulo significa tiragem comum,
-- que é o que toda tiragem já feita é.

-- AlterTable
ALTER TABLE "professors" ADD COLUMN "rare" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "qr_batches" ADD COLUMN "rare_professor_id" TEXT;

-- CreateTable
CREATE TABLE "rare_unlocks" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "theme" TEXT NOT NULL,
    "attempt_id" TEXT,
    "unlocked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rare_unlocks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "rare_unlocks_user_id_theme_key" ON "rare_unlocks"("user_id", "theme");

-- CreateIndex
CREATE INDEX "rare_unlocks_theme_unlocked_at_idx" ON "rare_unlocks"("theme", "unlocked_at");

-- AddForeignKey
ALTER TABLE "rare_unlocks" ADD CONSTRAINT "rare_unlocks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
