-- Auditoria das tiragens de ficha (ver docs/tasks/10-batalha-em-time-e-painel-qr.md).
--
-- Gerar ficha é criar direito de captura — a ação mais sensível do painel — e
-- "quem liberou isso?" precisa ser respondível pela própria tela, sem SSH no
-- servidor. Por isso é tabela e não linha de log.
--
-- Sem FK entre "qr_batches"."batch" e "capture_tokens"."batch" de propósito:
-- existem tokens anteriores a este modelo, com batch nulo ou de tiragem feita
-- antes da tabela existir, e uma FK impediria o backfill de existir.
--
-- "created_by_id" é nulo quando a tiragem veio da CLI sem --by; daí "source",
-- que separa "gerada pelo painel" de "gerada por script" sem ambiguidade.

CREATE TABLE "qr_batches" (
    "batch" TEXT NOT NULL,
    "created_by_id" TEXT,
    "source" TEXT NOT NULL DEFAULT 'panel',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "copies" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "variant_ids" TEXT[],

    CONSTRAINT "qr_batches_pkey" PRIMARY KEY ("batch")
);

-- A tela abre pela tiragem mais recente.
CREATE INDEX "qr_batches_created_at_idx" ON "qr_batches"("created_at" DESC);

-- ON DELETE SET NULL: apagar um admin não pode apagar o registro de que a
-- tiragem existiu — é justamente esse rastro que a tabela serve para guardar.
ALTER TABLE "qr_batches"
    ADD CONSTRAINT "qr_batches_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
