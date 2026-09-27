-- Raid do professor lendário (tarefa 18).
--
-- Aditiva e sem backfill: nenhum professor existente é lendário, e `legendary`
-- nasce `false` para todo mundo. As três tabelas novas nascem vazias.
--
-- Nada de `captures`, `capture_tokens` ou `discoveries` é tocado — a coleção
-- dos alunos e as fichas já impressas seguem exatamente como estão. Diferente
-- das viradas de formato do PvP, esta migration NÃO zera o Elo: a raid é PvE e
-- não pontua no ranqueado, então as partidas de antes e depois continuam
-- medindo o mesmo jogo.

-- AlterTable
ALTER TABLE "professors" ADD COLUMN "legendary" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "raid_unlocks" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "dex_size" INTEGER NOT NULL,
    "unlocked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "raid_unlocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "raid_attempts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "professor_id" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP(3),
    "result" TEXT,
    "turns" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "raid_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "raid_clears" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "professor_id" TEXT NOT NULL,
    "capture_id" TEXT,
    "attempt_id" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "cleared_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "raid_clears_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "raid_unlocks_user_id_key" ON "raid_unlocks"("user_id");

-- CreateIndex
CREATE INDEX "raid_unlocks_unlocked_at_idx" ON "raid_unlocks"("unlocked_at");

-- CreateIndex
-- O cooldown lê exatamente isto: a última tentativa encerrada de um aluno.
CREATE INDEX "raid_attempts_user_id_ended_at_idx" ON "raid_attempts"("user_id", "ended_at" DESC);

-- CreateIndex
CREATE INDEX "raid_attempts_result_ended_at_idx" ON "raid_attempts"("result", "ended_at");

-- CreateIndex
-- Uma captura de lendário por conta, para sempre. É este unique que resolve
-- duas vitórias simultâneas em duas abas: a segunda colide e não cria exemplar.
CREATE UNIQUE INDEX "raid_clears_user_id_key" ON "raid_clears"("user_id");

-- CreateIndex
-- A fila do prêmio: quem venceu primeiro, em ordem.
CREATE INDEX "raid_clears_cleared_at_idx" ON "raid_clears"("cleared_at");

-- AddForeignKey
ALTER TABLE "raid_unlocks" ADD CONSTRAINT "raid_unlocks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raid_attempts" ADD CONSTRAINT "raid_attempts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raid_clears" ADD CONSTRAINT "raid_clears_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raid_clears" ADD CONSTRAINT "raid_clears_professor_id_fkey" FOREIGN KEY ("professor_id") REFERENCES "professors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
