-- Variantes de professor + fichas de QR de uso único.
--
-- ATENÇÃO: derruba `professors.capture_token_hash`, então TODO QR já impresso
-- deixa de valer. Reimprima com `npm run qr:generate -- --copies=N --yes`.
--
-- `captures.variant_id`/`token_id`/`moves` entram como opcionais porque já há
-- capturas gravadas: `prisma/seed.ts` preenche as antigas com a variante de
-- todos os tipos do professor e um moveset sorteado.

-- DropIndex
DROP INDEX "captures_user_id_professor_id_key";

-- DropIndex
DROP INDEX "professors_capture_token_hash_key";

-- AlterTable
ALTER TABLE "captures" ADD COLUMN     "moves" TEXT[],
ADD COLUMN     "token_id" TEXT,
ADD COLUMN     "variant_id" TEXT;

-- AlterTable
ALTER TABLE "professors" DROP COLUMN "capture_token_hash";

-- CreateTable
CREATE TABLE "professor_variants" (
    "id" TEXT NOT NULL,
    "professor_id" TEXT NOT NULL,
    "type_key" TEXT NOT NULL,
    "types" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "professor_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "capture_tokens" (
    "id" TEXT NOT NULL,
    "variant_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "batch" TEXT,
    "redeemed_at" TIMESTAMP(3),
    "redeemed_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "capture_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "professor_variants_professor_id_type_key_key" ON "professor_variants"("professor_id", "type_key");

-- CreateIndex
CREATE UNIQUE INDEX "capture_tokens_token_hash_key" ON "capture_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "capture_tokens_variant_id_redeemed_at_idx" ON "capture_tokens"("variant_id", "redeemed_at");

-- CreateIndex
CREATE UNIQUE INDEX "captures_token_id_key" ON "captures"("token_id");

-- CreateIndex
CREATE INDEX "captures_user_id_professor_id_idx" ON "captures"("user_id", "professor_id");

-- AddForeignKey
ALTER TABLE "professor_variants" ADD CONSTRAINT "professor_variants_professor_id_fkey" FOREIGN KEY ("professor_id") REFERENCES "professors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capture_tokens" ADD CONSTRAINT "capture_tokens_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "professor_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "captures" ADD CONSTRAINT "captures_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "professor_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "captures" ADD CONSTRAINT "captures_token_id_fkey" FOREIGN KEY ("token_id") REFERENCES "capture_tokens"("id") ON DELETE SET NULL ON UPDATE CASCADE;
