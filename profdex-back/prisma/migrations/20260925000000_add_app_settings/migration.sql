-- Ajustes de operação editáveis pelo painel (cooldowns).
--
-- Aditiva e sem backfill: a tabela nasce VAZIA de propósito. Chave ausente
-- significa "usa o padrão do código", então o comportamento antes de qualquer
-- edição é exatamente o de hoje — 10 min de tema, 12 h de dupla.

-- CreateTable
CREATE TABLE "app_settings" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("key")
);
