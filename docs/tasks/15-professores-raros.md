# Tarefa 15 — Professores raros

**Prioridade:** alta — é conteúdo de evento e depende de papel impresso (tiragem
tem prazo)
**Perfil:** full-stack (Prisma + Nest + Vue), sem passo de infra
**Depende de:** 🔗 **tarefa 12** (ficha por tipo, sorteio) e 🔗 **tarefa 13**
(cadastro de professores no painel) — as duas já estão concluídas
**Origem:** entrevista de design com o Gustavo em 24/09/2026. As decisões da
tabela "Decisões de produto" estão **fechadas** — não reabrir sem alinhar.

---

## Contexto do projeto

O ProfDex é uma "Pokédex de professores" para a semana tecnológica da UNIFIL
(1000+ alunos). Professor é a entidade central: ele é capturado, colecionado e
batalha.

**Stack**

- `profdex-front/` — Vue 3 + Vite + Pinia + vue-router.
- `profdex-back/` — NestJS + Prisma + PostgreSQL + Socket.IO.
- Deploy: **tudo numa EC2 única**, pelo `docker-compose.yml` da raiz (serviços
  `db`, `app`, `frontend`, `landing`, `adminer`, `nginx`), por
  `profdex-back/scripts/deploy-aws.sh`.

**Documentos que você precisa ler antes de mexer**

| Documento | Por quê |
|---|---|
| `docs/QUIZ.md` | A bancada, o cooldown de 10 min e por que a tela fica virada para o aluno |
| `docs/BANCO.md` | Modelo de dados |
| `docs/tasks/12-captura-por-tipo.md` | O sorteio da captura e o estoque de fichas por tipo |
| `docs/tasks/13-admin-de-professores.md` | O cadastro de professores e a geração de variantes |
| `docs/METRICAS.md` | Eventos, pesos e a regra de "evento só do servidor" |
| `.codex/CODE_STYLE.md` | DTO com allowlist, controller fino, código de erro estável em vez de texto |
| `.codex/SECURITY_CHECKLIST.md` | Esta tarefa cria uma **superfície de vazamento nova** — ver seção própria |

### Como funciona hoje

**Captura.** A ficha de QR vale por **tipo** (`capture_tokens.type`), não por
professor. A bancada só sabe o tema da questão que o aluno acertou; quem ele
leva sai do sorteio no servidor (`captures/capture-lottery.ts`), em três faixas:
professor inédito do tema → variante inédita → repetição. Ficha é de uso único
(`updateMany` condicional em `redeemedAt: null`) e o banco guarda só
`sha256(token)`.

**Quiz de bancada.** Um tablet no estande, virado para o aluno. Matrícula →
tema → **uma** questão em 60s → resultado. Acertou, o operador manda escanear o
QR daquele tema; errou, **cooldown de 10 min naquele tema**. Toda tentativa vai
para `quiz_attempts` (é ela que sustenta o cooldown e o relatório).

**Profdex.** `GET /professors` devolve todos os `active: true` e o front conta
`store.professors.length` como total da coleção (`ProfdexView.vue:31-32`).

**Cadastro.** `/admin/professores` cria professor com nome, 1–2 tipos e três
arquivos de arte; a mesma transação materializa as **variantes** — uma por
combinação não-vazia dos tipos (2 tipos → 3 variantes).

### O que muda

Entra uma segunda via de aquisição, paralela e independente da captura comum:

> **Professor raro.** Não sai em ficha comum, não conta para completar a
> Profdex, e só é capturável por quem **acertar 5 questões em cada tema dele**
> no quiz de bancada. Capturável **uma vez por conta, para sempre**.

O aluno **não sabe em que tema existe raro** — ele descobre no instante em que
destrava, ganhando. A Profdex anuncia que raros **existem** (entradas
bloqueadas, estilo Pokédex), sem dizer quem nem de que tema.

---

## Decisões de produto (fechadas)

| # | Decisão | Escolha | Por quê |
|---|---|---|---|
| 1 | Onde mora a raridade | **No professor** (`professors.rare`), linha própria, com **variante única** | A Profdex lista professor, não variante; o raro ganha **arte própria** (é o que faz o aluno querer) e o filtro fica em 3 lugares em vez de atravessar toda consulta de variante |
| 2 | Tema exigido | **São os tipos do professor.** Sem coluna nova | O tipo faz dois trabalhos: gate do quiz e tipo de batalha — ver decisão 12 |
| 3 | Quantos acertos | **5 por tema**, constante em código (`RARE_UNLOCK_CORRECT_ANSWERS`) | Não é configurável por professor: um raro que exige 7 e outro 5 é regra que ninguém explica na fila |
| 4 | Raro de 2 tipos | **E, não OU** — 5 em cada tema (10 acertos, ~100 min de calendário) | Se fosse OU, marcar 2 tipos *facilitaria* o raro. Com E, o número de temas é o **dial de dificuldade** |
| 5 | Contagem dos 5 | **Retroativa e com repetidas** — contagem crua de `quiz_attempts` (`correct`, `annulled: false`) por tema | "Seu acerto de manhã não vale" e "essa questão já tinha caído" são regras que o operador tem que explicar de pé, na fila, para quem acabou de acertar |
| 6 | Efeito dos 5 acertos | **Destrava o TEMA, permanente** (`rare_unlocks`, único por aluno+tema) | O limite de escassez já é "1 captura por raro" + papel impresso. Direito consumível criaria o diálogo "acertei 7, por que não libera?" |
| 7 | Limite por conta | **1 captura por raro, por conta, para sempre.** Com N raros, um aluno pode ter os N | — |
| 8 | Quantos raros | **No máximo 1 raro por tema** — validado no cadastro | Um raro por tema mantém a pilha de papel e a instrução da mesa sem ambiguidade |
| 9 | Quem é o porteiro | **O servidor.** Ficha rara sem destravamento é recusada **sem consumir o papel** | Em gate humano, uma ficha rara fotografada e mandada no grupo do WhatsApp entrega raro para quem nunca respondeu nada |
| 10 | Raro no sorteio comum | **Nunca.** Excluído do sorteio, do estoque por tipo e da lista de "vá capturar X" da bancada | Sem o filtro ele cairia na **Faixa 1** do sorteio (professor inédito), que é a preferencial — o raro seria o resultado *mais provável* de uma ficha comum |
| 11 | Ficha rara | **Uma pilha por raro**, rotulada com o nome dele; tecnicamente aponta para a variante única (`capture_tokens.variantId`) | Com gate de 2 temas, "✦ RARO — MATEMÁTICA" é ambíguo. A folha diz o nome, e a mesa não precisa decidir nada |
| 12 | Acoplamento tipo↔gate | **Aceito.** Raro de gate difícil (2 temas) é obrigatoriamente dual-type na arena; gate fácil é mono-type | Decisão consciente, não efeito colateral. Separar `rareThemes` de `types` foi avaliado e descartado |
| 13 | Batalha | **Exemplar igual aos outros** — variante, deck e IVs 0–31 pelo sorteio normal. Diferença só cosmética (selo `✦`) | O PvP é ranqueado por Elo: raro estatisticamente superior faria o ranking medir quem respondeu quiz, não quem joga melhor |
| 14 | Profdex | Raro **fora** do `X/Y`. Seção `✦ Raros` com **N entradas bloqueadas** e contador próprio (`0/3`) | "Existe raro" muda comportamento; "existe um número desconhecido de raros" não muda nada |
| 15 | Progresso para o aluno | **Não existe.** Nem no app, nem na bancada, nem parcial | A bancada fica **virada para o aluno**: um "4/5 rumo ao raro" revelaria o tema para a fila inteira |
| 16 | Progresso para o operador | **Só no painel** (`/admin/metrics`), que não fica virado para ninguém | É a mitigação de 15 — quem administra vê "3 alunos a um acerto do raro de Matemática" e avisa a mesa |
| 17 | Métricas | `rare_unlocked` + `rare_captured`; seção `Raros ✦` **dentro** de `/admin/metrics` com (a) quem capturou e (b) destravaram vs capturaram por raro | Volume pequeno por natureza (1 raro/tema, 1 captura/conta): aba própria seria tela vazia a maior parte do evento |
| 18 | Engajamento | Raro vale **3×** uma captura comum inédita | 50 min de bancada por raro é objetivamente mais engajamento. Diferente da batalha, premiar aqui não desequilibra nada |

---

## Modelo de dados

```prisma
model Professor {
  // ...
  /// Professor raro: não sai em ficha comum, não conta para completar a
  /// Profdex e só é capturável por quem destravou TODOS os tipos dele no quiz
  /// (5 acertos em cada). Os `types` fazem dois trabalhos no raro: gate e tipo
  /// de batalha — ver tarefa 15, decisão 12.
  ///
  /// Definido na CRIAÇÃO e imutável: virar raro depois tiraria o professor da
  /// contagem da dex de todo mundo e deixaria as 3 variantes dele órfãs.
  rare Boolean @default(false)
}

/// Um tema destravado por um aluno: 5 acertos, e vale para sempre.
///
/// Gravado no momento do 5º acerto e NUNCA recalculado na hora do resgate. Uma
/// errata que anule uma tentativa depois não tira o raro de quem já destravou —
/// o mesmo princípio de "corrigir gabarito não reprocessa tentativa antiga".
model RareUnlock {
  id         String   @id @default(uuid())
  userId     String   @map("user_id")
  theme      String
  /// A tentativa que fechou os 5. Auditoria: responde "quando e com o quê?".
  attemptId  String?  @map("attempt_id")
  unlockedAt DateTime @default(now()) @map("unlocked_at")

  user User @relation(fields: [userId], references: [id])

  @@unique([userId, theme])
  @@index([theme, unlockedAt])
  @@map("rare_unlocks")
}

model QrBatch {
  // ...
  /// Tiragem de ficha RARA: o raro daquela pilha. `types` fica vazio nela, e
  /// nulo aqui significa tiragem comum. Sem FK pelo mesmo motivo de
  /// `createdById`: o registro de que a tiragem existiu não pode desaparecer.
  rareProfessorId String? @map("rare_professor_id")
}
```

`User` ganha `rareUnlocks RareUnlock[]`.

**`capture_tokens` não ganha coluna.** A ficha rara reusa `variantId` (o caminho
legado, que entrega exatamente aquela variante sem sorteio) e a raridade é
**derivada** de `variant.professor.rare`. Uma flag denormalizada aqui poderia
divergir do professor; derivada, não existe estado inconsistente possível. O
custo é o estoque filtrar por relação (`where: { variant: { professor: { rare:
true } } }`), que o índice `[variantId, redeemedAt]` já cobre.

**Migração.** Uma só, aditiva: duas colunas com default + uma tabela. Não há
backfill — nenhum professor existente é raro. O banco de produção está vazio e
pode ser limpo (ver `INDEX.md`), mas **esta migração não precisa disso**.
Aplique num Postgres 16 descartável e confira com `prisma migrate diff` antes de
subir, como foi feito na `20260904000000_add_errata_and_vouchers`.

---

## 15.1 — Cadastrar um raro no painel

**Problema.** Hoje todo professor cadastrado entra no sorteio comum e na
contagem da dex. Não há como cadastrar um que só exista pela via do quiz.

**O que fazer.**

1. `ProfessorFormDto` ganha `rare?: boolean` (mesmo `@Transform` de `pixelArt`,
   porque multipart entrega `"false"` como string não vazia). **`UpdateProfessorDto`
   NÃO ganha o campo** — `rare` é imutável (decisão residual 1 no fim do doc).
2. `AdminProfessorsService.create`: com `rare: true`, validar antes de gravar —
   **409** se algum dos tipos escolhidos já pertencer a um raro **ativo**
   (decisão 8). Mensagem com código estável: `TEMA_JA_TEM_RARO`.
3. **Variante única.** `variantsForProfessor` hoje devolve todas as combinações.
   Para raro, devolver **só** a combinação completa (`typeKeyOf(types)`). O
   mesmo cuidado em `ensureProfessorVariants` (o bootstrap/seed varre o elenco
   inteiro e, sem isso, daria 3 variantes ao raro na primeira execução).
4. Formulário (`AdminProfessoresView.vue`): caixa **`✦ Professor raro`** com
   texto de apoio explicando as três consequências em uma linha — *"não sai em
   ficha comum, não conta na Profdex, e exige 5 acertos em CADA tipo marcado"*.
   Com a caixa marcada, o rótulo do campo de tipos passa a `Tipos (= temas
   exigidos)`. A lista do painel mostra o selo `✦` e a coluna de tipos rotulada
   como gate.
5. `ADMIN_PROFESSOR_SELECT` passa a expor `rare`.

**Onde mexer.** `profdex-back/prisma/schema.prisma` ·
`src/professors/dto/professor-form.dto.ts` · `src/professors/admin-professors.service.ts` ·
`src/professors/professor-variants.ts` · `profdex-front/src/views/AdminProfessoresView.vue`

**Critérios de aceite.**

- Cadastrar raro de 1 tipo cria **1** variante; de 2 tipos, **1** variante (a
  dupla) — não 3.
- Cadastrar um segundo raro que use um tema já ocupado por raro ativo → 409
  `TEMA_JA_TEM_RARO`, nada gravado, nenhum arquivo de arte escrito.
- `PATCH /admin/professors/:id` com `rare` no corpo **não** altera o campo.
- Rodar o bootstrap de variantes duas vezes não cria variante extra para o raro.

**Cuidados.**

- A arte continua obrigatória nos três campos (frente, costas, `.glb`). O raro
  aparece em batalha e em AR como qualquer outro.
- "Remover" continua sendo desativar. Raro inativo: ver decisão residual 2.

---

## 15.2 — Destravar o tema (5 acertos)

**Problema.** Nada no servidor sabe que um aluno acertou 5 de um tema.

**O que fazer.**

1. `quiz.constants.ts`: `export const RARE_UNLOCK_CORRECT_ANSWERS = 5;`
2. Em `QuizService.answer`, **depois** de gravar a `QuizAttempt` e **só quando
   acertou**: contar `quizAttempt.count({ userId, theme, correct: true,
   annulled: false })`. Se `>= 5`, `rareUnlock.upsert` por `(userId, theme)` —
   idempotente, e o `update` vazio faz da segunda vez um no-op.
3. Descobrir se **este** acerto completou o gate de um raro:
   - buscar o raro **ativo** cujos `types` contenham o tema (no máximo um, por
     decisão 8);
   - ele está inteiramente destravado (`rare_unlocks` cobre **todos** os
     `types`) e o aluno **não** tem captura dele?
   - **e o upsert acabou de criar a linha** deste tema (ou seja, foi este acerto
     que virou a chave).
   → então a resposta carrega `raroLiberado: { name, temas }`.
4. Caso o gate já estivesse completo e o aluno ainda não tenha capturado,
   devolver `raroPendente: { name }` (tarja, não cena cheia — ver 15.3).
5. Métrica `rare_unlocked` (server-only, 0 ponto — o esforço já foi pago pelos 5
   `quiz_correct`).

**Onde mexer.** `src/quiz/quiz.constants.ts` · `src/quiz/quiz.service.ts` ·
`src/metrics/engagement.ts`

**Critérios de aceite.**

- 4 acertos no tema: nenhuma linha em `rare_unlocks`, resposta sem nada de raro.
- 5º acerto com raro mono-type: `rare_unlocks` tem a linha e a resposta traz
  `raroLiberado`.
- Raro de 2 temas: completar o **primeiro** tema devolve resposta **sem nenhuma
  menção a raro** (decisão 15). Só o 5º acerto do **segundo** tema traz
  `raroLiberado`.
- 6º, 7º acerto no tema: `raroPendente` enquanto não capturou; nada depois de
  capturar.
- Tema sem raro cadastrado: grava `rare_unlocks` (o destravamento é do tema, não
  do raro) e não devolve nada na resposta.
- Quiz **treino** não influencia: ele não grava `quiz_attempts`. Escreva o teste
  que fixa isso — é a primeira coisa que alguém vai tentar.

**Cuidados.**

- A contagem é `count`, não `groupBy` — uma consulta por acerto, coberta pelo
  índice `[userId, theme, createdAt]`. Não traga tentativas para memória.
- O `upsert` vem **depois** do `create` da tentativa e **dentro** do mesmo
  caminho: um destravamento sem a tentativa que o justifica é impossível de
  auditar.

---

## 15.3 — A bancada: a hora de entregar o raro

**Problema.** O operador precisa saber, no instante do acerto, que aquele aluno
ganhou a ficha rara — e o aluno **não pode** descobrir antes disso em que tema
existe raro. A tela é a mesma para os dois: ela fica virada para o aluno.

**O que fazer.**

1. **Antes do gate completo: nada.** A tela de acerto é exatamente a de hoje.
   Nenhuma barra, nenhum "falta 1", nenhum selo.
2. **No acerto que completa o gate:** a cena troca inteira — fundo dourado,
   `✦ FICHA RARA` em corpo grande, nome do raro, e a instrução em imperativo
   **para o operador**: `ENTREGUE A FICHA ✦ <NOME>`. Tem que ser legível de
   relance, de lado, com fila andando: é o único aviso que o operador recebe.
3. **Depois, enquanto não escaneou:** tarja persistente `✦ ficha rara pendente
   — <nome>` na tela de resultado e **no cartão do aluno**, logo após digitar a
   matrícula (`QuizService.aluno`). Quem destravou às 10h e voltou às 15h não
   pode depender da memória do operador.
4. **Antivazamento (obrigatório):** `PROFESSOR_DO_TEMA_SELECT` passa a filtrar
   `rare: false`. Ele alimenta `themes()` **e** `answer()`; sem o filtro, o nome
   do raro apareceria na lista "vá capturar X ou Y" e na tela de escolha de
   tema — entregando de graça qual tema tem raro, para todo mundo, o dia
   inteiro.

**Onde mexer.** `src/quiz/quiz.service.ts` (`PROFESSOR_DO_TEMA_SELECT`,
`answer`, `aluno`) · `profdex-front/src/views/AdminQuizBoothView.vue` (etapa
`resultado`, cena `cena--acerto`, cartão do aluno)

**Critérios de aceite.**

- `GET /admin/quiz/themes` nunca inclui professor raro em `professores`.
- `POST /admin/quiz/answer` só menciona raro quando o gate ficou completo (ou
  está completo e pendente).
- A cena de ficha rara é visualmente distinta da cena de acerto comum (cor de
  fundo, tamanho de fonte) — e não some sozinha: fica até o operador tocar em
  "próximo aluno".
- Cartão do aluno mostra a pendência antes de a rodada começar.

**Cuidados.**

- **Consequência aceita, registre no código:** o operador não tem aviso prévio.
  Ele descobre junto com o aluno. A mitigação é o painel (15.7), não a bancada.
- A bancada continua **sem link** para qualquer tela do `AdminLayout` (ela é
  virada para o aluno — a mesma razão pela qual a errata não pode ser alcançada
  de lá).

---

## 15.4 — A ficha rara: tiragem e papel

**Problema.** `/admin/fichas` só gera fichas por tipo. Não há como imprimir a
pilha de um raro, nem como ver quanto sobrou dela.

**O que fazer.**

1. `SheetEntry` vira união discriminada: `{ kind: 'type', type }` ou
   `{ kind: 'rare', variantId, professorName, themes }`. `buildRareSheetEntries(
   variant, copies)` gera tokens apontando para a variante única do raro.
   O payload do QR **não muda** (`capture:<token>`) — o scanner do app não
   precisa saber o que vai receber, e a ficha não anuncia nada a quem a achar.
2. `renderSheet`: card do raro com moldura própria e o rótulo
   **`✦ RARO — <NOME>`** mais a linha `exige: Matemática + IA`. Quem está na
   mesa com duas pilhas na mão precisa distinguir de longe.
3. `POST /admin/capture-tokens/rare-batch { professorId, copies }` — DTO com
   allowlist, teto `MAX_COPIES_PANEL` (a geração é síncrona no request), 404 se
   o professor não é raro ou está inativo. Grava `QrBatch` com
   `rareProfessorId` e `types: []`.
4. `inventory()` ganha `rares: [{ professorId, name, themes, alive,
   redeemedTotal }]`, contando por `variantId` com
   `where: { variant: { professor: { rare: true } } }`.
5. **Estoque por tipo exclui raro**: `inventory()` conta "professores ativos que
   podem sair numa ficha deste tipo" a partir de `professorVariant.findMany({
   where: { professor: { active: true } } })` → acrescentar `rare: false`. Sem
   isso, o painel diria que Matemática tem 4 professores quando 3 são
   alcançáveis por ficha comum.
6. `/admin/fichas` (front): seção `Raros ✦` separada, com uma linha por raro,
   estoque vivo e botão de tiragem daquele raro. **Nunca** no mesmo formulário
   da tiragem por tipo: misturar as duas pilhas no mesmo papel acaba com o raro
   nos primeiros 10 minutos de evento.

**Onde mexer.** `src/captures/capture-sheet.ts` ·
`src/captures/admin-capture-tokens.service.ts` ·
`src/captures/admin-capture-tokens.controller.ts` ·
`src/captures/dto/generate-sheet.dto.ts` (ou DTO novo) ·
`profdex-front/src/views/AdminFichasView.vue`

**Critérios de aceite.**

- Tiragem rara de 5 cópias cria 5 tokens com `variantId` do raro e `type: null`,
  e um `qr_batches` com `rareProfessorId` preenchido.
- A folha impressa identifica o raro pelo nome e lista os temas exigidos.
- O estoque por tipo não muda ao cadastrar um raro daquele tipo.
- Ficha rara **não pode ser reimpressa** — a regra do repositório não muda: o
  banco guarda só `sha256(token)`, e a folha devolvida pelo `POST` é a única
  oportunidade de ver aqueles QRs.

---

## 15.5 — Resgate: o servidor é o porteiro

**Problema.** Hoje `captureByToken` dá baixa na ficha e sorteia. Uma ficha rara
capturaria para qualquer um que escaneasse primeiro.

**O que fazer.** Em `CapturesService.captureByToken`, **dentro da transação**,
depois do `updateMany` que dá baixa e antes de criar a captura: se a ficha tem
`variantId` e `variant.professor.rare`, checar em ordem e **lançar** (o `throw`
desfaz a baixa — a ficha continua valendo):

| Situação | Status | `code` |
|---|---|---|
| Raro inativo | 404 | `RARO_INDISPONIVEL` |
| Aluno não destravou todos os temas | 403 | `RARO_BLOQUEADO` |
| Aluno já tem esse raro | 409 | `RARO_JA_CAPTURADO` |

Passadas as três, o fluxo segue **idêntico** ao comum: `discovery` (o raro é
descoberta nova de verdade), `capture` com moveset e IVs sorteados da variante.

E o filtro que sustenta a decisão 10: `sortearPorTipo` passa a exigir
`professor: { active: true, rare: false }` nas candidatas.

No front (`ScanView.vue`), tratar os três códigos com mensagem própria — o
`TIPO_SEM_PROFESSOR` já estabeleceu o padrão de ler `e.response.data.code`. O
texto do `RARO_BLOQUEADO` **não diz qual tema falta** (é a mesma regra de
vazamento): *"Esta ficha é de um professor raro e ainda não está liberada para
você — procure a bancada."*

**Onde mexer.** `src/captures/captures.service.ts` ·
`src/captures/capture-lottery.ts` (só o comentário do contrato; o filtro é na
consulta) · `profdex-front/src/views/ScanView.vue`

**Critérios de aceite.**

- Ficha rara escaneada por quem não destravou: 403, e a ficha **continua
  `redeemedAt: null`** (escreva o teste conferindo o banco depois do erro — é o
  invariante mais importante desta sub-tarefa).
- Escaneada duas vezes por quem destravou: primeira captura, segunda 409
  `RARO_JA_CAPTURADO` (a trava de "1 por conta" vem do `capture` existente, não
  do token).
- Duas fichas raras do mesmo raro, mesmo aluno: a segunda dá 409 sem consumir.
- Ficha **comum** nunca entrega raro, nem quando o raro é o único professor
  inédito do tema daquele aluno.
- Raro aparece em `GET /captures` do dono com variante, golpes e IVs normais, e
  pode ser levado para PvP como qualquer exemplar.

**Cuidados.**

- A checagem **tem** de ficar dentro da transação. Fora dela, o pior desfecho
  possível acontece em silêncio: o aluno perde o papel **e** não recebe nada, no
  meio do evento, sem jeito de reverter.
- Não recalcule o gate a partir de `quiz_attempts` no resgate. A fonte é
  `rare_unlocks` (decisão 5 / schema).

---

## 15.6 — A Profdex: anunciar sem entregar

**Problema.** `GET /professors` devolve todo professor ativo; um raro ali entra
na contagem `X/Y` e revela nome, tipos e arte — ou seja, o tema dele.

**O que fazer.**

1. `ProfessorsService.findAll` passa a filtrar `rare: false`. É isso que tira o
   raro do `X/Y` sem tocar no front.
2. Rota nova `GET /professors/rares` → `{ total, owned: [PublicProfessor...] }`,
   onde `total` é a contagem de raros **ativos** e `owned` traz **somente** os
   que o aluno capturou. Um raro não capturado **não atravessa a fronteira** —
   nem nome, nem tipo, nem URL de arte. Esconder no CSS não é esconder: o
   DevTools do celular está a dois toques.
3. `ProfessorsService.findOne` (`GET /professors/:id`) recusa raro que o
   requisitante não possui (404). O id é UUID e não é adivinhável, mas allowlist
   é allowlist.
4. `ProfdexView.vue`: seção **`✦ Raros`** abaixo da coleção — `total - owned`
   cards bloqueados (silhueta genérica, sem nome, sem tipo), contador próprio
   `owned/total`, e uma linha fixa: *"Professores raros existem. Eles não
   contam para completar a Profdex e não saem em ficha comum."* Capturado, o
   card abre inteiro (nome, arte, tipos) com selo `✦` — e aí sim mostra os temas
   que o destravaram.
5. **Consistência da palavra "dex"** — os dois outros lugares que contam coleção
   precisam do mesmo filtro, senão "100% da dex" fica inalcançável:
   - `RankingsService.dexLeaderboard`: `professor.count()` e o `groupBy` de
     capturas → excluir raros;
   - `CapturesService.registrarMetricas`: o `professor.count()` que decide
     `collection_completed` → excluir raros.

**Onde mexer.** `src/professors/professors.service.ts` ·
`src/professors/professors.controller.ts` · `src/battle/rankings.service.ts` ·
`src/captures/captures.service.ts` · `profdex-front/src/stores/professors.js` ·
`profdex-front/src/views/ProfdexView.vue` · `components/ProfCard.vue` (selo)

**Critérios de aceite.**

- Com 1 raro cadastrado e 14 comuns, a Profdex mostra `X/14` e `Raros 0/1`.
- A resposta de `GET /professors/rares` de quem não tem nada é literalmente
  `{ total: 1, owned: [] }` — nada mais.
- Capturar o único raro faz o card abrir e o contador ir para `1/1`, sem mexer
  no `X/14`.
- `collection_completed` dispara ao completar os **comuns**, sem exigir raro.
- O ranking de Dex nunca passa de 100%.

**Cuidados.**

- **Achado de passagem, não corrigir aqui:** o `professor.count()` do
  `collection_completed` também **não filtra `active`**, então desativar um
  professor hoje já torna a coleção incompletável. É bug pré-existente e
  independente desta tarefa — abra item separado; mexer nele no mesmo commit
  confunde a revisão.

---

## 15.7 — Métricas

**O que fazer.**

1. `engagement.ts`: dois eventos novos em `EVENT_TYPES`, ambos **server-only**
   (entram em `SERVER_ONLY_EVENTS`):

   | Evento | Pontos | Interações | Rótulo |
   |---|---|---|---|
   | `rare_unlocked` | **0** | 0 | Temas destravados |
   | `rare_captured` | **140** | 0 | Professores raros capturados |

   A aritmética do 140: uma captura comum inédita vale 70 (`professor_discovered`
   20 + `professor_captured` 50). O raro grava os mesmos dois **mais**
   `rare_captured`, totalizando 210 = **3×**. Interações ficam em 0 porque as 15
   do `professor_captured` já contaram o gesto (mesma lógica de `battle_won` e
   `quiz_correct`).
2. `GET /admin/metrics/rares`:
   - **quem capturou** — `[{ matricula, name, professor, capturedAt }]`, mais
     recentes primeiro;
   - **por raro** — `{ name, themes, destravaram, capturaram, estoqueVivo }`,
     onde `destravaram` conta alunos com unlock em **todos** os temas do raro (o
     gate real, não o parcial);
   - **a um acerto** — alunos com exatamente 4 acertos num tema que tem raro. É
     a mitigação da decisão 15: o painel avisa a mesa. `groupBy` por
     `(userId, theme)` restrito aos temas com raro e filtrado em memória — a
     mesma ordem de grandeza que `dexLeaderboard` já paga hoje.
3. `AdminMetricsView.vue`: bloco `Raros ✦` com a tabela de capturas e o resumo
   por raro. `destravaram` vs `capturaram` lado a lado é o número que diz,
   **durante** o evento, se 5 está calibrado: 30 destravaram e 2 capturaram
   significa que faltou papel ou faltou o operador entender o aviso.

**Onde mexer.** `src/metrics/engagement.ts` ·
`src/metrics/admin-metrics.service.ts` · `src/metrics/admin-metrics.controller.ts` ·
`profdex-front/src/views/AdminMetricsView.vue`

**Critérios de aceite.**

- `POST /metrics/events` com `rare_captured` no corpo é **recusado** (é
  server-only).
- Capturar raro soma 210 ao `engagement_score` e 15 interações.
- A seção do painel abre sem raro cadastrado (estado vazio), sem erro.

---

## 15.8 — Documentação

- `docs/QUIZ.md` — seção "Professor raro": os 5 acertos, o E de dois temas, a
  cena de ficha rara e **por que não existe progresso na tela** (a bancada é
  virada para o aluno). Some a limitação "o acerto não libera tecnicamente a
  captura"? **Não** — ela continua verdadeira para a captura comum; acrescente
  que no raro o gate passou a ser do servidor.
- `docs/BANCO.md` — `rare_unlocks`, `professors.rare`, `qr_batches.rare_professor_id`.
- `docs/METRICAS.md` — os dois eventos e os pesos.
- `docs/tasks/INDEX.md` — linha da tarefa 15 e a decisão fechada no bloco
  "Decisões já tomadas".
- `CHANGELOG.md` — na entrega.

---

## Fluxo de ponta a ponta

```
PAINEL     cadastra "Eron ✦" raro, tipos [matematica, ia]  → 1 variante, gate = os 2 temas
PAINEL     /admin/fichas → Raros ✦ → tiragem de 10 fichas "✦ RARO — ERON"  (pilha própria)

BANCADA    aluno acerta 5ª de matemática   → rare_unlocks(matematica). Tela: NADA de raro.
BANCADA    aluno acerta 5ª de IA           → rare_unlocks(ia) e gate completo
                                            → TELA DOURADA: "ENTREGUE A FICHA ✦ ERON"
MESA       operador pega a pilha do Eron e entrega uma ficha

APP        aluno escaneia → servidor: raro ativo? destravou os 2 temas? já tem?
                          → captura com variante dupla, IVs e deck sorteados
APP        Profdex: X/14 inalterado · Raros 1/1 · card aberto com selo ✦
PAINEL     Raros ✦: 1 capturado (matrícula, hora) · Eron: destravaram 3 / capturaram 1
```

E os desvios que **não** podem consumir papel: raro inativo (404), gate
incompleto (403), já capturado (409) — nos três a ficha volta à pilha.

---

## Superfícies de vazamento (checklist de revisão)

O segredo desta tarefa é **em que tema existe raro**. Ele vaza por seis lugares,
e cinco são fáceis de esquecer:

- [ ] `GET /professors` — filtra `rare: false`
- [ ] `GET /professors/:id` — recusa raro não possuído
- [ ] `GET /professors/rares` — só `total` e os possuídos; **nunca** nome ou arte de raro não capturado
- [ ] `GET /admin/quiz/themes` — `professores` sem raro (tela de escolha de tema, virada para o aluno)
- [ ] `POST /admin/quiz/answer` — lista "vá capturar X" sem raro; nada de raro antes do gate completo
- [ ] `/admin/fichas` e `/admin/metrics` — podem mostrar tudo: vivem no `AdminLayout`, que não fica virado para aluno

Regra geral do repositório, que vale aqui inteira: **o que o front não recebe é
o que o aluno não descobre.** Esconder na tela não esconde.

---

## Testes exigidos

| Arquivo | O que fixa |
|---|---|
| `professor-variants.spec.ts` | Raro de 2 tipos gera **1** variante; bootstrap repetido não cria extras |
| `admin-professors.service.spec.ts` | 409 `TEMA_JA_TEM_RARO`; `rare` imutável no update |
| `quiz.service.spec.ts` | 4 acertos não destravam; o 5º destrava; gate de 2 temas só avisa no segundo; treino não conta; `themes()`/`answer()` sem raro na lista |
| `captures.service.spec.ts` | As três recusas **sem consumir a ficha** (conferindo `redeemedAt` no banco); ficha comum nunca entrega raro |
| `capture-lottery.spec.ts` | Contrato do sorteio: candidatas já vêm sem raro |
| `professors.service.spec.ts` | `findAll` sem raro; `rares` não vaza não-possuído |
| `rankings.service.spec.ts` | Dex não passa de 100% com raro no banco |
| `engagement.spec.ts` | `rare_captured` recusado na ingestão do cliente |

---

## Decisões residuais (tomadas nesta redação — conteste se discordar)

1. **`rare` é imutável depois do cadastro.** Virar raro um professor que já tem
   exemplares em circulação o tiraria da contagem da dex de todo mundo e
   deixaria as 3 variantes dele órfãs (raro tem 1). Se precisar corrigir, o
   caminho é desativar e cadastrar de novo.
2. **Raro inativo:** sai do `total` da seção Raros, sai das tiragens novas, e
   ficha dele passa a dar 404 `RARO_INDISPONIVEL` — mas **quem já capturou
   continua com o exemplar**, como qualquer professor desativado.
3. **O limite de 1 raro por tema é validado contra raros ativos**, não contra o
   histórico. Isso permite retirar um raro e cadastrar outro no mesmo tema
   durante o evento; os `rare_unlocks` daquele tema continuam valendo e passam a
   habilitar o novo.
4. **Os 5 acertos são constante de código**, não campo do cadastro.

---

## Fora de escopo (explicitamente)

- **Modo desafio** (5 questões seguidas sem cooldown) — avaliado e descartado
  nesta rodada; cabe depois sem desfazer nada daqui.
- **Ranking de raros** — a métrica responde "quem pegou"; ladder novo é
  superfície de UI e mais uma coisa para explicar na mesa.
- **Progresso visível ao aluno**, em qualquer forma, inclusive "você está perto
  de algo".
- **Raro mecanicamente mais forte** em batalha.
- **Segundo raro no mesmo tema.**
