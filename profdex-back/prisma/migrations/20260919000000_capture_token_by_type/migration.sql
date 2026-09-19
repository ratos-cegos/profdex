-- A ficha de QR passa a valer por TIPO (ver docs/tasks/12-captura-por-tipo.md).
--
-- Antes, quem imprimia escolhia a variante — professor MAIS combinação de tipos
-- — e quem escaneava recebia exatamente aquele professor. Agora a bancada
-- escolhe o tema da questão que o aluno acertou, que é a única coisa que ela
-- sabe, e o servidor sorteia qual professor daquele tipo sai.
--
-- "variant_id" NÃO é apagada: as fichas impressas antes desta migração
-- continuam válidas e continuam entregando a variante original, sem sorteio.
-- Papel que já está no bolso de aluno virando lixo silencioso é o pior desfecho
-- possível no meio do evento.
--
-- Exatamente UMA das duas colunas é preenchida em cada linha. Isso é regra de
-- aplicação, não constraint: um CHECK aqui não seria visível no schema.prisma
-- nem sobreviveria ao próximo `prisma migrate`.

ALTER TABLE "capture_tokens" ADD COLUMN "type" TEXT;
ALTER TABLE "capture_tokens" ALTER COLUMN "variant_id" DROP NOT NULL;

-- É este índice que sustenta a contagem de estoque do painel, que deixou de
-- agrupar por variante e passou a agrupar por tipo. Sem ele, cada abertura da
-- tela varre "capture_tokens" inteira — dezenas de milhares de linhas durante
-- o evento.
CREATE INDEX "capture_tokens_type_redeemed_at_idx" ON "capture_tokens"("type", "redeemed_at");

-- Quem entra no sorteio é professor ATIVO. A coluna nasce aqui, e não na tarefa
-- 13 (o painel que a liga e desliga), porque é o sorteio que precisa dela: sem
-- isso não há como tirar um professor de circulação no meio do evento sem
-- apagá-lo — e apagar levaria junto os exemplares de quem já o capturou.
ALTER TABLE "professors" ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true;

-- A tiragem passa a registrar os tipos que entraram nela. O banco é limpo nesta
-- virada (ver deploy.md), então não há tiragem antiga para converter: a coluna
-- velha sai inteira em vez de virar dado morto que ninguém sabe ler depois.
ALTER TABLE "qr_batches" DROP COLUMN "variant_ids";
ALTER TABLE "qr_batches" ADD COLUMN "types" TEXT[];
