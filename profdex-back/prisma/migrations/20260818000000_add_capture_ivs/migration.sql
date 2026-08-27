ALTER TABLE "captures"
  ADD COLUMN "iv_hp" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "iv_rigor" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "iv_didatica" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "iv_raciocinio" INTEGER NOT NULL DEFAULT 0;

-- Capturas anteriores à virada recebem IVs estáveis derivados do id. O mesmo
-- algoritmo é repetido no script versionado de backfill para recuperação.
UPDATE "captures"
SET
  "iv_hp" = get_byte(decode(md5('profdex-ivs-v1:' || "id"), 'hex'), 0) % 16,
  "iv_rigor" = get_byte(decode(md5('profdex-ivs-v1:' || "id"), 'hex'), 1) % 16,
  "iv_didatica" = get_byte(decode(md5('profdex-ivs-v1:' || "id"), 'hex'), 2) % 16,
  "iv_raciocinio" = get_byte(decode(md5('profdex-ivs-v1:' || "id"), 'hex'), 3) % 16
WHERE "captured_at" < TIMESTAMPTZ '2026-08-18 00:00:00+00';

ALTER TABLE "captures"
  ADD CONSTRAINT "captures_iv_hp_range" CHECK ("iv_hp" BETWEEN 0 AND 15),
  ADD CONSTRAINT "captures_iv_rigor_range" CHECK ("iv_rigor" BETWEEN 0 AND 15),
  ADD CONSTRAINT "captures_iv_didatica_range" CHECK ("iv_didatica" BETWEEN 0 AND 15),
  ADD CONSTRAINT "captures_iv_raciocinio_range" CHECK ("iv_raciocinio" BETWEEN 0 AND 15);
