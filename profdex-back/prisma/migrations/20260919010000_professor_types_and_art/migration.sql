-- O professor passa a se descrever sozinho (ver docs/tasks/13-admin-de-professores.md).
--
-- Antes, tipos e arte viviam em QUATRO arquivos hardcoded indexados por slug
-- (dois no back, dois no front) e cadastrar alguém exigia commit e deploy.
-- Depois desta migração, tudo que o app sabe sobre um professor está na linha
-- dele — é o que torna possível cadastrar pelo painel.

ALTER TABLE "professors" ADD COLUMN "types" TEXT[];
ALTER TABLE "professors" ADD COLUMN "sprite_front_url" TEXT;
ALTER TABLE "professors" ADD COLUMN "sprite_back_url" TEXT;
ALTER TABLE "professors" ADD COLUMN "pixel_art" BOOLEAN NOT NULL DEFAULT false;

-- Colunas do AR por marcador, que o front nunca leu. Ganham default para não
-- travarem o cadastro pelo painel, que não as pergunta. Se a AR voltar a
-- usá-las, é tarefa própria — não um campo escondido no formulário.
ALTER TABLE "professors" ALTER COLUMN "marker1_index" SET DEFAULT 0;
ALTER TABLE "professors" ALTER COLUMN "marker2_index" SET DEFAULT 0;

-- Backfill dos três que existem hoje, com os tipos que estavam em
-- PROFESSOR_TYPES e a arte que já está publicada no build do front.
--
-- Roda aqui, e não só no seed, porque a migration é o que o deploy executa
-- sozinho: um professor sem tipo some do sorteio de captura, e descobrir isso
-- durante o evento seria caro. O `cardinality(...) = 0` mantém a operação
-- idempotente e impede que um re-run sobrescreva edição feita pelo painel.
UPDATE "professors"
   SET "types" = ARRAY['algoritmos'],
       "sprite_front_url" = COALESCE("sprite_front_url", '/professors/mario-cartoon.png'),
       "model_url" = COALESCE("model_url", '/models/modelo-mario.glb')
 WHERE "slug" = 'mario' AND ("types" IS NULL OR cardinality("types") = 0);

UPDATE "professors"
   SET "types" = ARRAY['arquitetura', 'ia'],
       "sprite_front_url" = COALESCE("sprite_front_url", '/professors/eron-cartoon.png'),
       "model_url" = COALESCE("model_url", '/models/modelo-eron.glb')
 WHERE "slug" = 'eron' AND ("types" IS NULL OR cardinality("types") = 0);

-- O Gustavo é o único com pixel art de verdade e com sprite de costas — é ele
-- que o jogador controla na arena de treino.
UPDATE "professors"
   SET "types" = ARRAY['arquitetura'],
       "sprite_front_url" = COALESCE("sprite_front_url", '/professors/gustavo-frente.png'),
       "sprite_back_url" = COALESCE("sprite_back_url", '/professors/gustavo-costas.png'),
       "model_url" = COALESCE("model_url", '/models/modelo-gustavo.glb'),
       "pixel_art" = true
 WHERE "slug" = 'gustavo' AND ("types" IS NULL OR cardinality("types") = 0);

-- Qualquer professor fora dos três acima (não existe hoje, mas o banco de
-- alguém pode divergir) sai daqui com array vazio em vez de NULL: o Prisma
-- modela `String[]` como NOT NULL com default '{}', e uma linha NULL faria o
-- client estourar na leitura.
UPDATE "professors" SET "types" = '{}' WHERE "types" IS NULL;
ALTER TABLE "professors" ALTER COLUMN "types" SET NOT NULL;
ALTER TABLE "professors" ALTER COLUMN "types" SET DEFAULT '{}';
