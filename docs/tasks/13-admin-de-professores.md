# Tarefa 13 — Cadastro de professores pelo painel

**Prioridade:** alta — sem ela, professor novo exige commit e deploy
**Perfil:** full-stack + um passo de infra (volume e nginx)
**Depende de:** 🔗 **tarefa 11** (os ids de tipo novos)
**Origem:** entrevista de design com o Gustavo em 19/09/2026. As decisões da
tabela "Decisões de produto" já foram fechadas — não reabrir sem alinhar.

---

## Contexto do projeto

O ProfDex é uma "Pokédex de professores" para a semana tecnológica da UNIFIL
(1000+ alunos). Professor é a entidade central: ele é capturado, colecionado e
batalha.

**Stack**

- `profdex-front/` — Vue 3 + Vite + Pinia + vue-router.
- `profdex-back/` — NestJS + Prisma + PostgreSQL + Socket.IO.
- Deploy: **tudo numa EC2 única**, pelo `docker-compose.yml` da raiz (serviços
  `db`, `app`, `frontend`, `landing`, `adminer`, `nginx`). Deploy por
  `scripts/deploy-aws.sh` (git pull + `docker compose up -d --build`).

**Documentos que você precisa ler antes de mexer**

| Documento | Por quê |
|---|---|
| `docs/BANCO.md` | Modelo de dados |
| `docs/CENARIO-3D-E-AR.md` | Como o `.glb` é usado na tela de AR |
| `.codex/CODE_STYLE.md` | DTO com allowlist, controller fino, nunca retornar hash |
| `.codex/SECURITY_CHECKLIST.md` | Upload é superfície de ataque — ler antes |

### Como funciona hoje

Professor só existe pelo **seed**. Três no banco (Mário, Eron, Gustavo). O que o
app sabe sobre eles está espalhado em **quatro** lugares, três deles arquivos
hardcoded indexados por slug:

| Onde | O quê |
|---|---|
| `professors` (banco) | `name`, `slug`, `modelUrl`, `marker1Index`, `marker2Index` |
| `profdex-back/src/battle/engine/professor-types.ts` | Mapa de tipos por professor (16 chaves para 14 pessoas) |
| `profdex-front/src/data/professorTypes.js` | A mesma coisa, de novo |
| `profdex-front/src/data/professorSprites.js` e `professorModels.js` | Caminhos de arte, por slug |

E a arte em si são arquivos estáticos em `profdex-front/public/professors/` e
`public/models/`, com nomes por convenção (`<slug>-frente.png`,
`<slug>-cartoon.png`, `<slug>-face.png`, `<slug>-costas.png`,
`modelo-<slug>.glb`).

Resultado: cadastrar um professor é editar 4 arquivos, commitar arte e fazer
deploy.

### O que muda

Professor passa a ser cadastrado pelo painel: **nome, tipos possíveis, sprite de
frente, sprite de costas e modelo 3D**. Os quatro mapas hardcoded morrem.

---

## Decisões de produto (fechadas)

| Decisão | Escolha |
|---|---|
| Campos | Nome, **tipos possíveis**, sprite de frente, sprite de costas, modelo `.glb` |
| Obrigatórios | **Frente, costas e `.glb`** — os três |
| Rosto e cartoon | **Caem para a sprite de frente.** Não são campos do formulário |
| Teto de tipos | **2 por professor.** Três tipos quebram a escala de dano (até 8×) e explodem a tiragem de variantes |
| Operações | **Criar, editar e desativar** |
| "Remover" | É **desativar**: some do sorteio de captura, da tiragem de fichas e da Profdex, mas quem já capturou **mantém o exemplar** e o histórico de batalha fica íntegro. Nunca apagar de verdade |
| Onde os arquivos ficam | Volume Docker `profdex-uploads`, montado no serviço `app` |
| Quem serve | **nginx**, direto do volume (`location /uploads/`), sem passar pelo Node |
| Tetos | PNG ≤ 2 MB, GLB ≤ 5 MB (os modelos novos têm ~1,5 MB / 30k polígonos) |
| Acesso | `AdminGuard` — o mesmo que já protege errata e fichas |
| Seed | Continua com os **3 que têm arte**. O resto do elenco entra pelo painel |

> **Operação.** Os 3 professores do seed cobrem 3 tipos. Com 9 tipos na roda,
> **6 ficam sem professor** até alguém cadastrar — e ficha desses tipos não
> entrega nada (ver tarefa 12.3). O Gustavo vai preencher pelo painel depois de
> subir; o painel de fichas avisa quais tipos estão vazios.

---

## 13.1 — Schema: o professor passa a se descrever sozinho

**Problema.** `professors` não guarda tipos nem caminho de arte, e
`marker1Index`/`marker2Index` são colunas **obrigatórias que o front nunca lê**
(confirmado: nenhuma referência em `profdex-front/src`).

**O que fazer**

```prisma
model Professor {
  id             String   @id @default(uuid())
  name           String
  slug           String   @unique
  types          String[]                              // 1 a 2 ids da roda
  spriteFrontUrl String?  @map("sprite_front_url")
  spriteBackUrl  String?  @map("sprite_back_url")
  modelUrl       String?  @map("model_url")
  pixelArt       Boolean  @default(false) @map("pixel_art")
  active         Boolean  @default(true)
  marker1Index   Int      @default(0) @map("marker1_index")  // legado, não usado
  marker2Index   Int      @default(0) @map("marker2_index")  // legado, não usado
  // … relações inalteradas
}
```

`pixelArt` existe porque a arte atual é mista: o Gustavo é pixel art de verdade
(e recebe `image-rendering: pixelated`), os outros dois são cartoon suave — e
aplicar o filtro errado serrilha um ou borra o outro. É um checkbox no
formulário, com padrão `false`.

**Onde mexer**

- `profdex-back/prisma/schema.prisma` + migration
- `profdex-back/prisma/schema.local.prisma`
- `profdex-back/src/professors/public-professor.select.ts` — expor `types`,
  `spriteFrontUrl`, `spriteBackUrl`, `modelUrl`, `pixelArt`, `active`
- `profdex-back/prisma/seed.ts` — os 3 ganham `types` e as URLs da arte atual

**Critérios de aceite**

- Migration aplica num banco limpo.
- `GET /professors` devolve os tipos e as URLs de arte.
- Os 3 do seed continuam com a arte que já têm.

**Cuidados**

- `marker1Index`/`marker2Index` ficam com default para não quebrar migration nem
  seed, e **fora do formulário**. Se um dia a AR voltar a usá-los, é tarefa
  própria.

---

## 13.2 — Upload: volume, nginx e endpoint

**Problema.** Não existe upload em lugar nenhum do backend. O front é build
estático — não dá para gravar em `public/` em runtime.

**O que fazer**

**Infra.** Volume nomeado novo no `docker-compose.yml`:

```yaml
services:
  app:
    volumes:
      - profdex-uploads:/app/uploads
  nginx:
    volumes:
      - profdex-uploads:/var/www/uploads:ro

volumes:
  profdex-uploads:
```

E no template do nginx, `location /uploads/ { alias /var/www/uploads/; }` —
arquivo estático não tem por que atravessar o Node.

**Endpoint.** `POST /admin/professors/:id/assets` (ou upload junto do create),
com `AdminGuard`, `FileInterceptor`/`diskStorage` do Multer gravando em
`/app/uploads` com nome derivado do slug: `<slug>-frente.png`,
`<slug>-costas.png`, `<slug>.glb`.

Validação **obrigatória** (ver `.codex/SECURITY_CHECKLIST.md`):

- Extensão **e** mime aceitos: `image/png` para as sprites, `model/gltf-binary`
  (ou `application/octet-stream` com extensão `.glb`) para o modelo.
- Teto: 2 MB para PNG, 5 MB para GLB.
- Nome do arquivo **nunca** vem do cliente — é derivado do slug, que é
  normalizado pelo servidor. Sem isso, `../` no nome vira escrita fora do
  volume.

**Onde mexer**

- `docker-compose.yml`, `nginx/templates/*`
- `profdex-back/src/professors/admin-professors.controller.ts` (**novo**)
- `profdex-back/package.json` — dependência do Multer/`@nestjs/platform-express`

**Critérios de aceite**

- Upload de PNG de 3 MB é rejeitado com mensagem clara.
- Upload de `.exe` renomeado para `.png` é rejeitado.
- O arquivo aparece em `https://<host>/uploads/<slug>-frente.png` sem
  autenticação (é arte pública) e **sobrevive a `docker compose up --build`**.
- Nenhum caminho do cliente chega ao filesystem.

**Cuidados**

- Volume é estado fora do Postgres: entra na rotina de backup, ou a arte se
  perde num recreate da instância. Documentar no `deploy.md`.
- Substituir a arte de um professor sobrescreve o arquivo com o mesmo nome — o
  navegador pode servir cache antigo. Usar query de versão
  (`?v=<updatedAt>`) na URL guardada, ou nome com hash.

---

## 13.3 — CRUD de professor

**Problema.** Não existe rota administrativa de professor.

**O que fazer.** Controller novo sob `AdminGuard`:

| Rota | O quê |
|---|---|
| `GET /admin/professors` | Lista completa, inclusive inativos, com contagem de exemplares capturados |
| `POST /admin/professors` | Cria: nome, tipos, arte |
| `PATCH /admin/professors/:id` | Edita nome, tipos, arte, `pixelArt` |
| `PATCH /admin/professors/:id/active` | Ativa / desativa |

DTO com allowlist: `name` (string, 2–60), `types` (array de 1 a 2 ids, cada um
`@IsIn(TYPE_CYCLE)`, sem repetição), `pixelArt` (boolean).

**Slug:** derivado do nome pelo servidor (`normalizeKey`), **imutável depois de
criado** — ele nomeia os arquivos de arte, e renomear em cascata é risco sem
retorno. Editar o nome não mexe no slug. Colisão de slug → 409 com mensagem.

**Onde mexer**

- `profdex-back/src/professors/admin-professors.controller.ts` (**novo**)
- `profdex-back/src/professors/admin-professors.service.ts` (**novo**)
- `profdex-back/src/professors/dto/` (**novo**)
- `profdex-back/src/professors/professors.service.ts` — `findAll` do aluno passa
  a filtrar `active: true`

**Critérios de aceite**

- Criar com 3 tipos é rejeitado pelo DTO.
- Criar com id de tipo que não existe na roda é rejeitado.
- Desativar remove o professor da Profdex do aluno e do sorteio de captura, mas
  **não** remove os exemplares já capturados nem as linhas de `battle_slots`.
- Usuário não-admin recebe 403 em todas as rotas.

**Cuidados**

- Nunca apagar professor. As FKs (`captures`, `discoveries`, `battle_slots`,
  `capture_tokens`, `professor_variants`) tornam o delete uma cascata que
  destrói coleção de aluno e histórico de ranking.
- Editar os **tipos** de um professor que já tem exemplares capturados não pode
  reescrever os exemplares: a variante é gravada na captura justamente para que
  mudar a tabela não mexa no que está no bolso do aluno.

---

## 13.4 — Variantes materializadas ao salvar

**Problema.** `ensureProfessorVariants()` roda no seed e cria as combinações de
tipo de cada professor. Professor cadastrado pelo painel nasceria sem variante —
e sem variante ele **nunca entra no sorteio de captura** (tarefa 12).

**O que fazer.** Chamar `ensureProfessorVariants()` (ou a versão dela para um
professor só) ao criar e ao editar tipos. A função já é idempotente e **só
cria** — nunca apaga, porque pode haver ficha impressa ou exemplar apontando
para a variante.

**Onde mexer**

- `profdex-back/src/professors/professor-variants.ts`
- `profdex-back/src/professors/admin-professors.service.ts`

**Critérios de aceite**

- Professor criado com 2 tipos ganha 3 variantes imediatamente.
- Editar de 1 para 2 tipos **acrescenta** as variantes que faltam sem tocar na
  existente.
- Editar de 2 para 1 tipo **não apaga** a variante dupla — ela só deixa de ser
  sorteada, porque o sorteio filtra por tipo do professor.

**Cuidados**

- A criação do professor e das variantes é uma operação composta: transação.

---

## 13.5 — A tela

**Problema.** O painel (`AdminLayout`) tem abas de errata, métricas, quiz e
fichas. Falta professores.

**O que fazer.** Aba nova `/admin/professores`:

- Lista com sprite (miniatura), nome, badges de tipo, contagem de exemplares
  capturados e estado (ativo/inativo).
- Formulário de criar/editar: nome, seletor de **até 2 tipos** (usando
  `TypeIcon` e a cor do tipo), três campos de arquivo com **preview**, checkbox
  de pixel art.
- Botão "Remover" que desativa, com confirmação explicando que exemplares já
  capturados continuam com os donos.

**Onde mexer**

- `profdex-front/src/views/AdminProfessoresView.vue` (**novo**)
- `profdex-front/src/router/index.js`
- `profdex-front/src/views/AdminLayout.vue`

**Critérios de aceite**

- Dá para cadastrar um professor de ponta a ponta pela tela e, em seguida,
  capturá-lo escaneando uma ficha do tipo dele.
- Enviar arquivo acima do teto mostra erro antes de subir os bytes.
- A tela é usável no tablet da bancada (é onde o painel roda).

**Cuidados**

- Textos de UI em português; rotas de API em inglês. É a convenção do projeto.
- O upload pode demorar num Wi-Fi de evento: barra de progresso e botão travado
  durante o envio, para não criar professor duplicado no toque duplo.

---

## 13.6 — Matar os mapas hardcoded

**Problema.** Com tipos e arte no banco, os quatro arquivos por slug viram
mentira — e é a fonte mais provável de "o professor novo não aparece".

**O que fazer.** Apagar:

- `profdex-back/src/battle/engine/professor-types.ts` — o `PROFESSOR_TYPES` e o
  `typesForProfessor()`. Quem precisa de tipo passa a ler `professor.types`.
- `profdex-front/src/data/professorTypes.js`
- `profdex-front/src/data/professorSprites.js` e `professorModels.js`

E trocar os pontos que montavam caminho por convenção de slug para ler a URL do
professor, **com fallback para a sprite de frente**:

| Arquivo | Hoje | Passa a |
|---|---|---|
| `components/ProfCard.vue:18` | `/professors/<slug>-cartoon.png` | `professor.spriteFrontUrl` |
| `components/ProfessorFace.vue:21` | `/professors/<slug>-face.png` | `professor.spriteFrontUrl` |
| `views/ProfessorView.vue:125` | `/professors/<slug>-face.png` | `professor.spriteFrontUrl` |
| `views/ScanView.vue:256` | `/professors/<slug>-cartoon.png` | `professor.spriteFrontUrl` |
| `views/ArenaView.vue:200` | `/professors/<slug>-cartoon.png` | `professor.spriteFrontUrl` |

Os 3 professores do seed continuam apontando para os arquivos que já existem em
`public/professors/` — o seed grava essas URLs. Nada de arte precisa ser movido.

**Atenção ao back:** `typesForProfessor()` é usado em
`battle-room.service.ts`, `captures`, `quiz.service.ts` (professores do tema) e
`professor-variants.ts`. Todos passam a usar `professor.types` vindo do banco. O
fallback `typeIdFromSeed()` deixa de existir — professor **sempre** tem tipo,
porque o cadastro exige.

**Critérios de aceite**

- `grep -rn "professorTypes\|professorSprites\|professorModels\|PROFESSOR_TYPES" profdex-*/src`
  não devolve nada.
- Um professor cadastrado pelo painel aparece com sprite correta na Profdex, no
  scan, na arena e na seleção de batalha.
- O PvP monta o combatente com os tipos do banco.

**Cuidados**

- `professorSprites.js` também define `SPRITES_PIXEL_ART` — é isso que o
  `pixelArt` do schema substitui.
- A landing tem **cópia própria** desses dados (`profdex-landing/src/data/professors.js`)
  e, por decisão da tarefa 11, **continua manual**. Não ligá-la à API aqui.

---

## Testes exigidos

1. `admin-professors.service.spec.ts` — teto de 2 tipos; tipo fora da roda
   rejeitado; slug derivado e imutável; colisão de slug → 409; desativar não
   apaga captura.
2. `professor-variants.spec.ts` — variantes criadas ao cadastrar; editar tipos
   acrescenta sem apagar.
3. Upload — arquivo grande rejeitado; mime falso rejeitado; nome do cliente
   ignorado.
4. `professors.service.spec.ts` — `findAll` do aluno esconde inativos.
5. Integração: cadastrar professor → gerar ficha do tipo dele → escanear →
   captura sai com o professor certo. É o teste que amarra as tarefas 12 e 13.

---

## Ordem de execução e riscos

1. **13.1** (schema) e **13.2** (volume/nginx) — a infra primeiro, porque é a
   parte que depende de mexer na EC2.
2. **13.3** + **13.4** (API e variantes).
3. **13.5** (tela).
4. **13.6** por último: só dá para apagar os mapas quando o banco já responde
   por tudo que eles diziam.

**Risco principal:** o volume não estar montado em produção. O upload
"funciona", os arquivos somem no próximo deploy, e a descoberta acontece com a
arte já cadastrada. Validar o volume **antes** de liberar a tela.

**Risco secundário:** 13.6 quebrar o que já funciona. Os 3 professores atuais
atravessam Profdex, AR, arena PvE, arena PvP e seleção — testar os cinco à mão
depois de apagar os mapas.
