-- QR de captura gerado na TELA da bancada, vinculado ao aluno que acertou
-- (tarefa 17.6).
--
-- Aditiva e sem backfill: toda ficha já existente é de PAPEL, e papel é
-- anônimo — quem escanear primeiro leva. `assigned_to_id` nulo é exatamente
-- isso, então a coluna nasce com o significado certo para o estoque inteiro e
-- nenhum papel no bolso de aluno perde a validade.
--
-- ON DELETE CASCADE: uma ficha de tela só vale para uma conta. Apagado o dono,
-- ela não é resgatável por ninguém e só inflaria o estoque.

-- AlterTable
ALTER TABLE "capture_tokens" ADD COLUMN "assigned_to_id" TEXT;

-- CreateIndex
-- Lido a cada acerto no modo `tela`, para matar o QR anterior do mesmo aluno
-- antes de emitir o novo.
CREATE INDEX "capture_tokens_assigned_to_id_redeemed_at_idx" ON "capture_tokens"("assigned_to_id", "redeemed_at");

-- AddForeignKey
ALTER TABLE "capture_tokens" ADD CONSTRAINT "capture_tokens_assigned_to_id_fkey" FOREIGN KEY ("assigned_to_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
