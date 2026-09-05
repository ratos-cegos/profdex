-- Batalha em time (ver docs/tasks/10-batalha-em-time-e-painel-qr.md).
--
-- O PvP ranqueado passa de 1 contra 1 para time de ATÉ 3 exemplares. Com uma
-- coluna de professor por lado não havia onde registrar um time, e sem uma
-- linha por slot morre a pergunta que o painel do evento faz: "qual professor
-- mais jogou, qual mais venceu".
--
-- As batalhas existentes são apagadas de propósito. Elas são de OUTRO jogo:
-- formato diferente, e o Elo é zerado nesta mesma virada (o mesmo foi feito
-- quando os IVs entraram — ver docs/BATALHA-PVP.md). Além disso o DELETE não é
-- opcional: "professor_a_id"/"professor_b_id" são NOT NULL com FK, e as linhas
-- antigas não têm para onde migrar.

DELETE FROM "battles";

ALTER TABLE "battles" DROP CONSTRAINT "battles_professor_a_id_fkey";
ALTER TABLE "battles" DROP CONSTRAINT "battles_professor_b_id_fkey";
ALTER TABLE "battles" DROP COLUMN "professor_a_id";
ALTER TABLE "battles" DROP COLUMN "professor_b_id";

-- Guarda o capture_id, não só o professor: é o exemplar que carrega a
-- combinação de tipos, o deck e os IVs. Dois Erons do mesmo aluno são
-- personagens diferentes em combate.
CREATE TABLE "battle_slots" (
    "id" TEXT NOT NULL,
    "battle_id" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "slot" INTEGER NOT NULL,
    "capture_id" TEXT NOT NULL,
    "professor_id" TEXT NOT NULL,
    "lead" BOOLEAN NOT NULL DEFAULT false,
    "fainted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "battle_slots_pkey" PRIMARY KEY ("id")
);

-- Um exemplar por posição de cada lado: é o que impede gravar duas vezes o
-- mesmo slot se uma reconexão reenviar o time.
CREATE UNIQUE INDEX "battle_slots_battle_id_side_slot_key"
    ON "battle_slots"("battle_id", "side", "slot");

-- "Qual professor mais apareceu em batalha" — a consulta do painel do evento.
CREATE INDEX "battle_slots_professor_id_idx" ON "battle_slots"("professor_id");

-- Cascade só a partir da batalha. Apagar uma captura por causa de batalha
-- seria apagar a coleção do aluno, então ali a FK é restritiva.
ALTER TABLE "battle_slots"
    ADD CONSTRAINT "battle_slots_battle_id_fkey"
    FOREIGN KEY ("battle_id") REFERENCES "battles"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "battle_slots"
    ADD CONSTRAINT "battle_slots_capture_id_fkey"
    FOREIGN KEY ("capture_id") REFERENCES "captures"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "battle_slots"
    ADD CONSTRAINT "battle_slots_professor_id_fkey"
    FOREIGN KEY ("professor_id") REFERENCES "professors"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- O Elo é zerado junto: partidas de 1v1 e de 3v3 medem jogos diferentes, e
-- somar as duas no mesmo ranking é somar réguas distintas.
UPDATE "users" SET
    "battle_rating" = 1000,
    "battle_wins" = 0,
    "battle_losses" = 0,
    "battle_draws" = 0;
