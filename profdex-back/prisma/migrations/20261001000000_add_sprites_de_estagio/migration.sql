-- Arte dos estágios 2 e 3 da raid do lendário.
--
-- O chefe troca de corpo a cada terço de vida (src/battle/raid-estagios.ts). O
-- estágio 1 reaproveita a arte normal do professor, que é a mesma que a ficha da
-- Profdex mostra — por isso só há par para o 2 e o 3.
--
-- Nullable, e isso é a razão de a migration ser segura em produção com o evento
-- em andamento: nenhuma linha existente precisa de backfill, nenhum professor
-- comum passa a ter pendência, e o Postgres adiciona coluna nullable sem
-- reescrever a tabela nem travar leitura. Quem exige os quatro é o CADASTRO, e
-- só quando `legendary = true`.
ALTER TABLE "professors" ADD COLUMN "sprite_front_e2_url" TEXT;
ALTER TABLE "professors" ADD COLUMN "sprite_back_e2_url" TEXT;
ALTER TABLE "professors" ADD COLUMN "sprite_front_e3_url" TEXT;
ALTER TABLE "professors" ADD COLUMN "sprite_back_e3_url" TEXT;
