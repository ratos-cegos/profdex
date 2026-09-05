# Tarefa 10 — Batalha em time (até 3 professores) e painel de fichas

**Prioridade:** alta (F1 serve à operação do evento; F2 muda o formato ranqueado)
**Perfil:** full-stack (F1), back-end pesado + front (F2), front (F3)
**Origem:** entrevista de design com o Gustavo em 05/09/2026. As decisões da
tabela "Decisões de produto" já foram fechadas — não reabrir sem alinhar.

---

## Contexto do projeto

O ProfDex é uma "Pokédex de professores" para a semana tecnológica da UNIFIL
(1000+ alunos). O aluno escaneia QR codes impressos pelo campus para capturar
professores, e usa os exemplares capturados numa batalha PvP ranqueada por Elo.

**Stack**

- `profdex-front/` — Vue 3 + Vite + Pinia + vue-router. Deploy na Vercel.
- `profdex-back/` — NestJS + Prisma + PostgreSQL + Socket.IO. Deploy em servidor
  próprio AWS/UNIFIL (`back-profedex.unifil.tech`). **Railway está descontinuado.**
- `profdex-landing/` — build público separado. Não é tocado por esta tarefa.

**Como rodar** (da raiz): `npm run dev` sobe front (5173) + back (3000).
No `profdex-back/`: `npm run db:up` (Postgres local via Docker), `npm run
db:migrate`, `npm run db:seed`, `npm test` (Jest), `npm run pvp:smoke`
(integração do fluxo PvP pela rede).

**Documentos que você precisa ler antes de mexer**

| Documento | Por quê |
|---|---|
| `docs/BATALHA-PVP.md` | O sistema PvP inteiro: fluxo, contratos WS, Elo, tiers, regras de borda |
| `docs/BATALHA.md` | O motor de combate (tipos, movesets, eventos) |
| `.codex/CODE_STYLE.md` | Convenções obrigatórias (DTO com allowlist, RNG injetado, controller fino, nunca logar token) |
| `docs/GIT-RULES.md` | Convenção de commits |

**Convenções que esta tarefa precisa respeitar**

- Rotas de API em inglês (`/api/captures`, `/api/rankings/battle`); telas e
  textos de UI em português.
- Nunca retornar hash, senha ou **token de captura** em resposta de API.
- Toda operação composta em transação.
- O motor tem **duas cópias** (`profdex-back/src/battle/engine/engine.ts` e
  `profdex-front/src/composables/battleEngine.js`) que precisam continuar
  idênticas nas regras de combate. Esta tarefa **não** mexe no motor: tudo o que
  ela adiciona vive na camada de sala (`BattleRoomService`).

---

## Decisões de produto (fechadas)

### Batalha em time

| Decisão | Escolha |
|---|---|
| Formato | O time de até 3 **substitui** o 1v1 ranqueado. Não há dois modos |
| Tamanho | **Até 3** exemplares; os times podem ter tamanhos diferentes (1v3, 2v3…) |
| Assimetria | **Nenhuma compensação** — nem de Elo, nem de atributo. Quem leva menos, perde mais. É o incentivo para capturar |
| Ação do turno | **Golpe OU troca**, uma por turno |
| Prioridade | **Troca resolve antes de qualquer golpe.** Quem entra come o ataque do adversário. Os dois trocando = ninguém ataca |
| Após nocaute | O lado que perdeu **escolhe** quem entra, numa fase própria. Fallback = próximo do time pela ordem de seleção |
| Ao sair de campo | **Zera** `stages`, `shields`, `timedBuffs`, `regen`, `debuffImmuneTurns`, `forceMiss`, `usage`, `lastAttackId` e **confusão**. **Mantém** `hp`, paralisia e queimadura |
| Informação | **Team preview** depois de os dois confirmarem: professor + combinação de tipos dos 3. **Sem IVs, sem golpes** |
| Lead | Escolhido **depois** do preview, às cegas dos dois lados. Fallback = primeiro da ordem de seleção |
| Lobby | **Não** mostra tamanho de coleção. `lobby:snapshot` fica como está |
| Repetição | Trava por **`captureId`**: o mesmo exemplar não entra duas vezes. Dois exemplares do mesmo professor, sim — inclusive da mesma combinação de tipos |
| Timers | **60s em todas as fases** — pick, preview/lead, entrada pós-nocaute, turno. Uma constante só |
| Timeout do pick | Vale o que estiver selecionado (**≥1 exemplar**). Só cancela quem não escolheu nenhum. Exige botão "Confirmar time" |
| Abandono | **Contador único** por jogador. Expirar qualquer fase soma 1; **3** acumuladas = derrota por abandono; qualquer ação válida zera |
| Partida infinita | **Teto de 40 turnos** → vence quem tiver mais HP somado (caídos contam 0); igual = empate |
| HUD | Reservas aparecem com **foto + barra de HP** |
| Persistência | Tabela **`battle_slots`**; `professorAId`/`professorBId` saem do `Battle` |
| Elo | **Zerado** na virada, junto com a limpeza de `battles`. Precedente: mesma decisão foi tomada quando os IVs entraram |
| Treino (bot) | **Continua 1v1.** `ArenaView` e `battleEngine.js` não mudam |

### Painel e fichas

| Decisão | Escolha |
|---|---|
| Entrada do painel | Sai da `BatalhaView`, vira seção **ADMINISTRAÇÃO** na `PerfilView` |
| Seção "APP" do perfil | Removida inteira (título + parágrafo). `BotaoInstalar` fica solto |
| Rota / aba | **`/admin/fichas`** — rótulo **"Fichas de Captura"** |
| O que a tela mostra | **Última tiragem** em destaque + **coluna de total vivo** por variante |
| Gerar | **Dois passos** (simulação → confirmar). **Sem revogação** na tela |
| Filtro | **Por variante** (caixa por linha); nada marcado = todas |
| Teto | **20 cópias** por tiragem na tela; o script mantém 200 |
| Quem pode | **Qualquer `role = 'admin'`**, pelo `AdminGuard` existente |
| Auditoria | Tabela **`qr_batches`** com o autor |
| Disco | A tela **não grava nada** no servidor — sem `tokens.txt`, sem `qr-out/` |
| Folha | O **back** devolve o HTML pronto (QRs como data-URI); POST → Blob URL → aba nova |

---

# FASE 1 — Painel

Não encosta em nada que a F2 mexe. Deployável sozinha e já vale para a operação:
a bancada precisa de ficha antes de precisar de 3v3.

## 10.1 — Painel administrativo acessado pelo perfil

**Problema.** O acesso ao painel é um botão no meio da lista de opções da tela
de Batalha (`BatalhaView.vue:248`), entre "Instruções de Batalha" e o lobby.
Isso sugere que o painel é parte do fluxo de batalha, que é justamente o que ele
não é.

**O que fazer.** Mover a entrada para a `PerfilView`, como uma seção
`ADMINISTRAÇÃO` no mesmo padrão visual das seções existentes ("CONTA"), com o
mesmo destino (`{ name: 'admin-metricas' }`) e a mesma condição
(`v-if="auth.user?.role === 'admin'"`). Remover o botão da `BatalhaView`,
junto com a regra `.battle-option--admin` (`BatalhaView.vue:753`) se ela não
for usada por mais nada.

**Onde mexer**

- `profdex-front/src/views/BatalhaView.vue` — remover o bloco do botão e o CSS.
- `profdex-front/src/views/PerfilView.vue` — seção nova, entre "APP" (que sai na
  10.2) e "CONTA".

**Critérios de aceite**

- Conta com `role = 'admin'` vê a entrada no Perfil e **não** vê na Batalha.
- Conta de aluno não vê em lugar nenhum.
- O clique cai em `/admin/metricas` como antes.

**Cuidados**

- O `v-if` é conveniência de navegação, **não** segurança — quem barra é o
  `AdminGuard` no servidor, que consulta o `role` no banco a cada request. Não
  remover nem enfraquecer nada do lado do back por causa desta mudança.
- O router guard `to.meta.admin` continua como está.

## 10.2 — Seção "APP" do perfil

**Problema.** A seção "APP" tem um parágrafo explicativo ("Instalado, o ProfDex
abre em tela cheia — mais espaço para a câmera do scanner e da arena — e não
pede login de novo a cada visita") que o Gustavo quer fora. Sem ele, sobra um
cabeçalho de seção para um único botão auto-explicativo — e quando o app já está
instalado, a seção fica com título e nada dentro.

**O que fazer.** Remover a `<section class="profile__app">` inteira: título,
parágrafo e wrapper. Deixar o `<BotaoInstalar />` solto, antes da seção "CONTA".
O componente já decide sozinho se aparece
(`visivel = !estaInstalado() && (podeInstalar || iosSemInstalar)`) e já traz o
próprio rótulo e a instrução do iPhone.

**Onde mexer**

- `profdex-front/src/views/PerfilView.vue` — template e o CSS de `.profile__app`.

**Critérios de aceite**

- Dispositivo compatível e app não instalado → botão "⬇ Instalar o ProfDex"
  aparece, sem título de seção e sem parágrafo.
- App já instalado (ou navegador sem suporte e fora do iOS) → nada aparece no
  lugar, sem espaço vazio ou cabeçalho órfão.
- No iPhone o botão continua abrindo a instrução de "Adicionar à Tela de Início".

## 10.3 — Aba "Fichas de Captura" no painel

**Problema.** As fichas de QR só existem pelo script
`profdex-back/scripts/generate-capture-qr.js`, que precisa de acesso ao servidor
e à `DATABASE_URL` de produção. Durante o evento, quem opera o estande não tem
como saber quanta ficha ainda vale nem imprimir mais sem chamar um dev.

**Contexto técnico que restringe o desenho.** O token em texto puro **só existe
dentro do QR impresso e do `tokens.txt` da tiragem**; o banco guarda apenas
`sha256(token)` (`CaptureToken.tokenHash`, ver `src/captures/capture-token.ts`).
Isso é deliberado: com o token no banco, um vazamento de leitura vira captura
infinita. **Consequência: é impossível reimprimir uma ficha já gerada.** A tela
só consegue mostrar contagens e gerar tiragens novas — e a tiragem nova é a
única oportunidade de ver aqueles QRs.

**O que fazer.**

### 10.3.1 — Extrair o gerador de fichas para o `src`

Hoje toda a lógica (token, hash, QR, folha HTML) vive dentro do script em
CommonJS. Duplicá-la no service criaria duas folhas de impressão que divergem na
primeira mudança.

Criar `profdex-back/src/captures/capture-sheet.ts` exportando:

- `generateToken()` — 32 bytes em `base64url` (43 chars), como o script faz
  hoje; precisa continuar dentro das regras do `CaptureByTokenDto` (mín. 32,
  máx. 256, só `[A-Za-z0-9_-]`).
- Para o hash, **usar `hashCaptureToken` de `src/captures/capture-token.ts`**,
  que já existe. Não escrever um segundo `createHash('sha256')` — hoje o script
  tem a sua própria cópia, e é ela que deve morrer nesta extração.
- `TYPE_LABEL` e `labelFor(types)` (rótulo de apresentação; os ids canônicos
  continuam em `src/battle/engine/types.ts`).
- `renderSheet(entries, batch, copies): string` — o HTML da folha, incluindo o
  `@media print`. Os QRs entram como **data-URI** (`QRCode.toDataURL`) em vez de
  `<img src="arquivo.png">`, porque a tela não grava arquivo.

Converter `scripts/generate-capture-qr.js` → `generate-capture-qr.ts` importando
esse módulo, mantendo **todo** o comportamento atual de CLI (`--copies`,
`--only`, `--yes`, `--revoke-unredeemed`, `--out`, simulação por padrão, teto de
200, gravação de PNG/SVG/`index.html`/`tokens.txt`). Atualizar o script
`qr:generate` do `package.json` para `ts-node`, como já fazem `db:seed` e
`gen:quiz-treino`.

Mover `qrcode` de `devDependencies` para `dependencies` — passa a rodar em
produção.

### 10.3.2 — Auditoria da tiragem

Migration + modelo:

```prisma
model QrBatch {
  batch       String   @id                       // timestamp ISO, o mesmo de CaptureToken.batch
  createdById String   @map("created_by_id")
  createdAt   DateTime @default(now()) @map("created_at")
  copies      Int
  total       Int                                // fichas geradas na tiragem
  variantIds  String[] @map("variant_ids")       // quais variantes entraram
  createdBy   User     @relation("QrBatchAutor", fields: [createdById], references: [id])

  @@index([createdAt(sort: Desc)])
  @@map("qr_batches")
}
```

`User` ganha `qrBatches QrBatch[] @relation("QrBatchAutor")`.

Sem FK entre `CaptureToken.batch` e `QrBatch.batch` de propósito: tokens
anteriores a este modelo têm `batch` nulo ou de tiragem feita pelo script antes
da tabela existir, e uma FK impediria o próprio backfill de existir. O `batch`
é a chave de junção lógica, como `Battle.winnerId` já é para `User`.

> O script da 10.3.1 **também** grava `QrBatch`, com `createdById` do usuário
> passado por uma flag nova `--by=<matricula|email>` — sem isso, tiragem de
> script vira buraco na auditoria. Se a flag não vier, gravar `QrBatch` com um
> marcador explícito de origem CLI em vez de deixar sem linha.

### 10.3.3 — API

Controller novo `profdex-back/src/captures/admin-capture-tokens.controller.ts`,
`@UseGuards(JwtAuthGuard, AdminGuard)`, no padrão de
`src/metrics/admin-metrics.controller.ts` (controller fino, regra no service).

| Rota | O que faz |
|---|---|
| `GET /api/admin/capture-tokens` | Estoque. Devolve `{ lastBatch, variants[] }` |
| `POST /api/admin/capture-tokens/preview` | Simulação. Body `{ copies, variantIds[] }` → o plano, sem gravar nada |
| `POST /api/admin/capture-tokens/batch` | Gera. Body `{ copies, variantIds[] }` → **`text/html`** da folha |

`lastBatch`: `{ batch, createdAt, createdBy: { name }, copies, total }` ou
`null` se nunca houve tiragem.

`variants[]`, uma linha por `ProfessorVariant`:
`{ variantId, professor: { name, slug }, typeKey, types, lastBatch: { total,
redeemed }, alive, redeemedTotal }` — onde `alive` é a contagem de **todas** as
fichas não resgatadas da variante, somando todas as tiragens. A consulta usa o
índice que já existe: `@@index([variantId, redeemedAt])`.

DTO de entrada com allowlist e validação: `copies` inteiro de **1 a 20**;
`variantIds` array opcional de uuids existentes (vazio/ausente = todas).

O `POST .../batch` faz, em transação: gerar tokens → gravar `CaptureToken` com o
`batch` → gravar `QrBatch`. Se qualquer parte falhar, nada entra — senão sobra
papel impresso que o app não reconhece. A resposta HTML é montada **depois** do
commit.

### 10.3.4 — Tela

Rota filha de `/admin` (dentro do `AdminLayout`), `path: 'fichas'`,
`name: 'admin-fichas'`, e a aba nova em `AdminLayout.vue` no array `abas`, com
o rótulo **"Fichas de Captura"**.

`AdminFichasView.vue`:

- Cabeçalho da **última tiragem**: data, quem gerou, cópias, total de fichas.
  Se nunca houve: estado vazio explicando que nenhuma tiragem foi feita ainda.
- Tabela por variante: professor, combinação de tipos, `nesta tiragem`
  (`total` / `resgatadas`), **`vivas no total`**, e uma caixa de seleção.
- Rodapé de geração: campo de cópias (1–20), botão **"Simular"** → mostra o
  plano ("3 fichas × 7 variantes = 21 fichas") → botão **"Gerar e imprimir"**.
- Gerar faz o POST via `api`, recebe o HTML, cria um `Blob` e abre em aba nova
  (`window.open(URL.createObjectURL(blob))`). Revogar a object URL depois.
- Aviso fixo em texto: **"Uma ficha gerada não pode ser reimpressa. Imprima
  agora — o QR só existe nesta folha."** e **"Tiragens anteriores continuam
  valendo"** (é o que a coluna `vivas no total` mostra).

**Onde mexer**

- `profdex-back/prisma/schema.prisma` + migration nova.
- `profdex-back/src/captures/capture-sheet.ts` (novo).
- `profdex-back/src/captures/admin-capture-tokens.controller.ts` + service (novos).
- `profdex-back/src/captures/captures.module.ts`, `package.json`.
- `profdex-back/scripts/generate-capture-qr.js` → `.ts`.
- `profdex-front/src/views/AdminFichasView.vue` (novo).
- `profdex-front/src/views/AdminLayout.vue`, `profdex-front/src/router/index.js`.

**Critérios de aceite**

- Aluno logado recebe **403** nas três rotas; admin passa.
- `GET` devolve a última tiragem com o nome de quem gerou, e as contagens batem
  com o banco (conferir com `npm run db:studio`).
- `preview` com `copies: 3` e 2 variantes marcadas devolve total 6 e **não cria
  nenhum `CaptureToken`**.
- `batch` com os mesmos parâmetros cria exatamente 6 tokens, 1 `QrBatch`, e a
  folha abre com 6 QRs legíveis.
- Um QR da folha, escaneado pelo app, captura o professor da variante certa e
  a segunda leitura da mesma ficha é recusada.
- `copies: 21` é recusado com 400. `copies: 0` também.
- Nenhuma resposta contém token em texto puro fora do `<img src="data:...">`
  do QR — conferir o JSON do `GET` e do `preview`.
- O script CLI continua funcionando igual, incluindo `--revoke-unredeemed`.

**Cuidados**

- **Não** expor `tokens.txt` nem equivalente pela API, e **não** logar token
  (o `CODE_STYLE` proíbe explicitamente logar QR token). O log de auditoria é a
  linha do `QrBatch`, não o conteúdo das fichas.
- A geração é síncrona e proporcional a `variantes × copies`; o teto de 20 é o
  que mantém a resposta em segundos. Não relaxar sem tornar a rota assíncrona.
- A revogação (`--revoke-unredeemed`) **não** entra na tela. Ela invalida papel
  que já está no bolso de aluno; é operação de bastidor.
- `qr-out/` já está ignorado em `profdex-back/.gitignore:62` (`/qr-out`, com o
  comentário explicando que carrega token em texto puro). Se a extração mudar o
  diretório de saída do script, essa linha tem de mudar junto.

---

# FASE 2 — Batalha em time

Carrega migration destrutiva e reset de Elo. **Deployar em janela calma**: o
shutdown hook anula batalhas ativas (`annulled`), como o `BATALHA-PVP.md` avisa.

## 10.4 — Schema: `battle_slots` e reset

**Problema.** `Battle` guarda **um** professor por lado (`professorAId` /
`professorBId`, NOT NULL com FK e relações `BattleProfessorA`/`BattleProfessorB`).
Não há onde registrar um time.

**O que fazer.**

```prisma
model BattleSlot {
  id          String   @id @default(uuid())
  battleId    String   @map("battle_id")
  side        String                                  // "a" | "b"
  slot        Int                                     // 0..2, ordem de seleção (fallback do lead)
  captureId   String   @map("capture_id")
  professorId String   @map("professor_id")
  lead        Boolean  @default(false)                // entrou primeiro
  fainted     Boolean  @default(false)                // caiu durante a batalha

  battle    Battle    @relation(fields: [battleId], references: [id], onDelete: Cascade)
  capture   Capture   @relation(fields: [captureId], references: [id])
  professor Professor @relation(fields: [professorId], references: [id])

  @@unique([battleId, side, slot])
  @@index([professorId])                              // "qual professor mais jogou"
  @@map("battle_slots")
}
```

`Battle` perde `professorAId`, `professorBId` e as duas relações; ganha
`slots BattleSlot[]`. `Professor` perde `battlesAsA`/`battlesAsB` e ganha
`battleSlots BattleSlot[]`. `Capture` ganha `battleSlots BattleSlot[]`.

Na migration, **nesta ordem**: `DELETE FROM battles` → dropar as colunas e
constraints → criar `battle_slots`. As batalhas antigas são de outro jogo e
ficariam meio-registradas de qualquer forma; e o delete não é opcional, porque
`professorAId`/`professorBId` são NOT NULL com FK.

Zerar o Elo com o script que já existe: `npm run db:reset-ranking`
(`scripts/reset-battle-ranking.js`). Ele **já** faz `battle.deleteMany({})` e
põe `battleRating: 1000` com wins/losses/draws em 0, e é simulação por padrão
(aplica só com `--yes`) — então rodá-lo **antes** da migration deixa a tabela
vazia e o passo de `DELETE` vira no-op. Não usar `--purge-test-users` a menos
que seja essa a intenção: essa flag apaga `capture`, `discovery` e o próprio
usuário dos ids selecionados.

**Critérios de aceite**

- `npm run db:migrate` roda limpo num banco com dados; `npm run db:seed` idem.
- Nenhuma referência a `professorAId`/`professorBId` sobra no código
  (`rankings.service.ts`, `battle-room.service.ts`, métricas, testes).
- Depois do reset, todos os usuários estão em 1000 com 0/0/0.

**Cuidados**

- `onDelete: Cascade` só em `battle → slots`. Um `Capture` **nunca** pode ser
  apagado por causa de batalha.
- A tabela é escrita no `begin()` (time completo, com o lead marcado) e
  atualizada no `finish()` (`fainted`). Não escrever slot antes de a batalha
  existir oficialmente — o `Battle` só é criado quando os dois confirmam.

## 10.5 — Seleção: time de até 3, preview e lead

**Problema.** `BattleRoomService.pick(userId, captureId)` aceita **um**
exemplar e vai direto para `begin()`. Não há preview nem escolha de lead.

**O que fazer.** A máquina de estados da sala passa de
`picking → active → done` para:

```
picking ──▶ preview ──▶ active ⇄ switching ──▶ done
```

### `picking`

`battle:pick` passa a receber **`{ captureIds: string[] }`** (1 a 3).
Validação no servidor, sempre:

- 1 ≤ `captureIds.length` ≤ 3;
- ids **distintos** entre si (é a trava de repetição — por `captureId`, não por
  professor);
- todos pertencem ao usuário: uma consulta `findMany({ where: { id: { in },
  userId } })` e conferir que voltaram todos.

Resolver tipos, deck e IVs de cada exemplar exatamente como o `pick` faz hoje
(`capture.variant.types` com fallback em `typesForProfessor`, `capture.moves`
com fallback em `buildMoveset`). Guardar o time no slot do jogador, **na ordem
recebida** — é ela que vira o fallback do lead e o `slot` no banco.

O adversário continua recebendo `battle:pick:opponent` sem conteúdo: ele sabe
QUE você confirmou, nunca O QUÊ.

**Timeout do pick:** vale o que foi confirmado. Se os dois têm ≥1 exemplar, a
sala avança para `preview`. Só cancela (`battle:cancelled`, sem pontos e sem
cooldown) se algum lado tiver **zero**.

### `preview`

Quando os dois confirmam (ou no timeout com os dois ≥1), emitir para cada lado:

```
battle:preview  S→C
{
  battleId, deadline,
  you: { team: [{ captureId, professor: { id, slug, name }, types }] },
  foe: { team: [{ professor: { id, slug, name }, types }] }
}
```

O time do adversário vai **sem `captureId`, sem IVs e sem `moves`**. O seu vai
com `captureId` porque você precisa dele para escolher o lead.

`battle:lead` C→S `{ captureId }` — valida que o id está no **seu** time.
O adversário recebe `battle:lead:opponent` (vazio). Quando os dois escolhem,
ou no timeout, `begin()`. Fallback do timeout: o exemplar de `slot` 0.

### `begin()`

Monta `BattleState` com os **leads** dos dois lados, exatamente como hoje
(`createCombatant` com nome, tipos, moves e ivs). Cria o `Battle` e os
`BattleSlot` (time inteiro, `lead: true` em quem entrou). O `battle:begin`
ganha o time nos dois lados, no mesmo formato do preview, mais o HP de cada
reserva — que no começo é o máximo.

**Onde mexer**

- `profdex-back/src/battle/battle-room.service.ts` — o grosso.
- `profdex-back/src/battle/battle.gateway.ts` — `battle:pick` (payload novo) e
  `battle:lead` (novo `@SubscribeMessage`).
- `profdex-back/src/battle/battle-room.service.spec.ts`.

**Critérios de aceite**

- `battle:pick` com id de exemplar de outra pessoa → recusa, mensagem amigável.
- `battle:pick` com id repetido na lista → recusa.
- `battle:pick` com 4 ids → recusa. Com 0 → recusa.
- Confirmar 2 exemplares funciona e a batalha começa 2 contra o que o outro levou.
- O `battle:preview` do adversário **não** contém `captureId`, `moves` nem
  campos de IV — conferir no payload cru.
- Timeout do lead entra com o `slot` 0.
- Timeout do pick com um lado em 2 e o outro em 0 → cancelada, sem cooldown.

**Cuidados**

- `RoomPlayer` deixa de ter `professor/captureId/types/moves/ivs` soltos e passa
  a ter `team: TeamMember[]` + `activeIndex`. Manter `CombatantKey`
  (`'player'`/`'enemy'`) como está — é o que mantém o port do motor auditável.
- O `resync` precisa cobrir as fases novas (`preview` com os times e quem já
  escolheu o lead; `switching` com quem está escolhendo).

## 10.6 — Combate: troca, revezamento, teto de turnos

**Problema.** `resolveRound` assume um combatente por lado e trata HP zerado
como fim de batalha.

**O que fazer.**

### Troca voluntária

`battle:switch` C→S `{ captureId }` — alternativa a `battle:move` no mesmo
turno. Validar: está no seu time, **não** é o ativo, **não** está caído.
O adversário recebe `battle:move:opponent` (o mesmo evento de hoje — ele sabe
que você agiu, não o quê; revelar "ele vai trocar" mataria a leitura).

`room.pending[key]` passa a guardar uma **ação** (`{ kind: 'move', moveId }` ou
`{ kind: 'switch', captureId }`) em vez de uma string.

### Ordem da rodada

Em `resolveRound`, **antes** de qualquer `turnOrder`/`upkeep`:

1. Aplicar todas as trocas pendentes. Quem entra vira o ativo; emitir um evento
   `switch` por troca.
2. Se os dois trocaram, a rodada acaba aí (ninguém ataca).
3. Seguir com `turnOrder` + `upkeep` + `performMove` como hoje, para quem
   escolheu golpe.

Quem acabou de entrar **é alvo normal** do golpe do adversário — é o custo da
troca.

### Ao sair de campo

Ao substituir o ativo (por troca **ou** por nocaute), o exemplar que sai guarda
`hp` e `status`, e tem zerados: `stages` (para o base), `shields`, `timedBuffs`,
`regen`, `debuffImmuneTurns`, `forceMiss`, `usage`, `lastAttackId`,
`hpAtTurnStart`. **Confusão sai junto**; paralisia e queimadura ficam.

Isso é responsabilidade da **sala**, não do motor — implementar como uma função
pura no `battle-room.service.ts` (ou módulo próprio), testável isolada. Não
mexer em `engine.ts`, senão a paridade com o front quebra.

### Nocaute e fase `switching`

Quando o ativo de um lado chega a 0:

- Se **ainda há reserva vivo**: `room.phase = 'switching'`, timer de 60s,
  emitir `battle:faint` para o lado atingido pedindo a entrada. O outro lado
  recebe o mesmo evento sem pedido de ação (para a UI mostrar "adversário está
  escolhendo"). `battle:enter` C→S `{ captureId }` valida time/vivo/não-ativo.
  Timeout → entra o próximo vivo pela ordem de `slot`.
- Se **não há reserva vivo**: aquele lado perdeu. `finish()` com
  `status: 'finished'`.
- **Duplo nocaute na mesma rodada**: os dois lados que ainda têm reserva
  escolhem (a fase espera os dois). Quem ficou sem reserva perde ali; se os dois
  ficaram sem, é empate.

Ao entrar, emitir `battle:round` com o estado novo e rearmar o turno.

### Teto de turnos

`MAX_TURNS = 40`. Ao passar, `finish()` com `status: 'finished'` e vencedor por
**HP somado** de todos os exemplares do time (caídos contam 0). Empate se igual
— cai na regra de empate que já existe (`S = 0.5`, `battleDraws`).

### Abandono

`MAX_MISSED_TURNS = 3` continua, mas com **contador único** por jogador:
expirar o turno, o lead **ou** a entrada pós-nocaute soma 1; qualquer ação
válida (golpe, troca, lead, entrada) zera. Chegando a 3, derrota por abandono
com a regra de Elo atual (abandono unilateral pontua; duplo não).

**Onde mexer**

- `profdex-back/src/battle/battle-room.service.ts`.
- `profdex-back/src/battle/battle.gateway.ts` — `battle:switch`, `battle:enter`.
- `profdex-back/src/battle/engine/engine.ts` — **só** o tipo `BattleEvent`,
  para acomodar `{ type: 'switch'; target: CombatantKey; name: string }`.
  Nenhuma regra de combate muda.
- `profdex-front/src/composables/battleEngine.js` — o mesmo acréscimo de tipo,
  para as cópias não divergirem.

**Critérios de aceite**

- Trocar faz o exemplar novo tomar o golpe do adversário no mesmo turno.
- Os dois trocando no mesmo turno = nenhum dano, mensagem coerente para os dois.
- Sair e voltar **não** devolve buffs, escudos nem confusão; devolve o mesmo HP
  e mantém paralisia/queimadura.
- Nocaute com reserva vivo abre a escolha; sem reserva, encerra.
- Timeout da entrada põe o próximo da ordem em campo e soma 1 no contador.
- 3 expirações em qualquer combinação de fases = derrota por abandono.
- Batalha que chega ao turno 41 termina por HP somado; empate com HP igual.
- Time de 1 contra time de 3 funciona e **não** recebe nenhum ajuste de Elo.

**Cuidados**

- O ack de `battle:move` já carrega o `turn` em que a ação foi aceita, por causa
  da emissão síncrona de `battle:round` (ver o comentário em `move()`).
  `battle:switch` precisa do mesmo tratamento.
- Limpar `room.pending` ao entrar em `switching` — ação pendente de antes do
  nocaute não pode vazar para a rodada seguinte.
- Timers: uma constante só (`PHASE_TIMEOUT_MS = 60_000`) usada por pick,
  preview/lead, switching e turno. Não multiplicar constantes.
- `onModuleDestroy` precisa cobrir as fases novas (anular `preview` e
  `switching` igual a `active`).

## 10.7 — Front: seleção, preview e HUD

**Problema.** `PvpPickView` escolhe **um** exemplar e vai direto para a arena;
`PvpArenaView` mostra um combatente por lado.

**O que fazer.**

### `PvpPickView` — faixa de slots

Manter a navegação de dois níveis que já existe (grid de professores →
exemplares daquele professor, via `captures.groupedByVariant`). Adicionar:

- **Faixa de 3 slots** no topo: cada exemplar escolhido preenche o próximo slot
  vazio; tocar num slot preenchido remove; a ordem dos slots é a ordem de
  seleção (e é o fallback do lead).
- Botão **"Confirmar time"**, habilitado com ≥1 slot preenchido, que emite
  `battle:pick` com os `captureIds` na ordem dos slots.
- Um exemplar já escolhido aparece desabilitado na lista (trava por `captureId`;
  outro exemplar do mesmo professor continua disponível).
- Depois de confirmar: "aguardando oponente…", como hoje.

### Tela de preview + lead (nova)

Pode ser uma fase dentro da `PvpPickView` (mais simples: o estado já está no
store) ou uma view própria. Mostra os dois times lado a lado com foto do
professor e badges de tipo — **sem estrelas de IV e sem golpes do adversário** —
e pede o lead entre os **seus**. Cronômetro visível.

### `PvpArenaView` — HUD do time

- Sob cada barra de HP, os reservas daquele lado: **foto do professor + barra de
  HP**, com o caído em cinza/riscado.
- Painel de comandos ganha **"Trocar"** ao lado dos golpes, abrindo a lista de
  reservas vivos → `battle:switch`.
- Quando o ativo cai e há reserva: modal/painel de escolha de entrada com
  cronômetro; do outro lado, "adversário está escolhendo…".
- Animar o evento `switch` como uma mensagem na fila, no mesmo esquema que
  `useBattle.js` já usa para os outros eventos.

### `stores/battle.js`

- `pickCapture(id)` → `pickTeam(captureIds)`.
- Novos handlers: `battle:preview`, `battle:lead:opponent`, `battle:faint`.
- Novos comandos: `chooseLead(captureId)`, `switchTo(captureId)`,
  `enterWith(captureId)`.
- `pvp` passa a guardar `you.team` / `foe.team` e o índice do ativo.
- O `battle:resync` precisa levar de volta à tela certa nas fases novas.

**Onde mexer**

- `profdex-front/src/views/PvpPickView.vue`, `PvpArenaView.vue`.
- `profdex-front/src/stores/battle.js`.
- `profdex-front/src/router/index.js` se a tela de preview virar rota.
- Possivelmente um componente novo para o card de exemplar, reaproveitado entre
  pick, preview e HUD.

**Critérios de aceite**

- Dá para escolher 1, 2 ou 3 exemplares e confirmar em qualquer momento.
- O mesmo exemplar não entra duas vezes; dois exemplares do mesmo professor, sim.
- O preview mostra os 3 do adversário com tipos, e **nenhuma** estrela de IV ou
  golpe — conferir também o payload no DevTools, não só a tela.
- Trocar em campo funciona pelo painel de comandos e a arena reflete o modelo/
  nome novo.
- F5 no meio de cada fase (pick, preview, arena, switching) cai de volta na tela
  certa via `battle:resync`.
- `PvpPickView` e `PvpArenaView` não passam de 400 linhas com uma
  responsabilidade só (`CODE_STYLE`); extrair componente se passar.

**Cuidados**

- O modelo 3D de cada lado é resolvido por `modelUrlForProfessor`; a troca
  precisa trocar o `src` do `<model-viewer>` sem recriar o elemento a cada
  frame. Professor sem GLB próprio cai no modelo padrão — não pedir arquivo
  inexistente.
- Não fixar `field-of-view` no `<model-viewer>`: quebra o auto-enquadramento
  (ver `docs/BATALHA.md`).
- Nada de lógica de autorização em route guard — é só UX.

---

# FASE 3 — Acabamento

## 10.8 — Animação da troca e documentação

**O que fazer.**

- Animação de saída/entrada do modelo na arena (a troca hoje seria um corte
  seco), no mesmo ritmo das outras animações da fila de eventos.
- Atualizar `docs/BATALHA-PVP.md`: o fluxo passa a ser
  `lobby → pick (até 3) → preview + lead → turnos com troca → fim`; a tabela de
  eventos WS ganha `battle:preview`, `battle:lead`, `battle:lead:opponent`,
  `battle:switch`, `battle:faint`, `battle:enter`; a seção "Regras de borda"
  ganha teto de turnos, contador único de abandono e times de tamanhos
  diferentes; registrar o **segundo** reset de Elo com a data e o motivo.
- Atualizar `docs/BATALHA.md` na parte que descreve a arena, e o
  `docs/tasks/INDEX.md` com a linha da tarefa 10.

**Critérios de aceite**

- Um dev que só leia `docs/BATALHA-PVP.md` consegue descrever o formato novo
  sem abrir código.
- Nenhum documento em `docs/` continua descrevendo o PvP como 1 contra 1.

---

## Testes exigidos

Espelham o padrão que o PvP já tem (91 testes + `pvp:smoke`). Sem isso, um
buraco na máquina de estados vira sala travada em produção com dois alunos
presos dentro.

**Unit (`profdex-back`, Jest)**

- `battle-room.service.spec.ts`: pick de time (tamanhos 1/2/3, id repetido, id
  de terceiro, 4 ids); timeout de pick com time parcial; preview não vaza
  `captureId`/`moves`/IV do adversário; lead com fallback; troca voluntária
  (entra tomando o golpe); troca dupla (nenhum dano); reset de campo ao sair
  (buff/escudo/confusão zeram, HP/paralisia/queimadura ficam); nocaute com e sem
  reserva; duplo nocaute; teto de 40 turnos e desempate por HP somado; contador
  único de abandono nas três fases.
- Rota de tiragem: `preview` não grava; `batch` grava N tokens + 1 `QrBatch`
  numa transação; `copies` fora de 1–20 recusado; aluno recebe 403.
- `elo.spec.ts` e `rating.service.spec.ts` continuam passando sem alteração — a
  regra de pontos **não** muda.

**Integração**

- `scripts/pvp-smoke.js` atualizado para o fluxo novo: registro → lobby →
  convite → aceite → **pick de 3** → **preview** → **lead** → turnos com pelo
  menos uma troca → nocaute → **entrada** → fim → Elo → ranking → cooldown.

**Manual antes do deploy**

- Dois celulares, uma batalha 3v3 completa e uma 1v3.
- Uma tiragem de 3 cópias impressa de verdade e um QR dela escaneado no app.

---

## Ordem de execução e riscos

1. **F1** primeiro, deployável sozinha. Não encosta em batalha.
2. **F2** em janela calma: migration destrutiva (`DELETE FROM battles`) + reset
   de Elo + deploy que anula batalhas ativas. Avisar antes se houver gente
   jogando.
3. **F3** pode escorregar sem travar ninguém.

**Riscos assumidos conscientemente**

- **Fichas não são reimprimíveis.** É consequência de guardar só o hash, e a
  alternativa (token no banco) transforma leitura do banco em captura infinita.
  A tela avisa em texto.
- **Time menor perde mais, e perde Elo por isso.** É deliberado: ter mais
  exemplares precisa valer vantagem, senão o incentivo de capturar some. O piso
  de 1000 no Elo evita a espiral negativa.
- **O treino continua 1v1** e passa a ensinar um formato diferente do ranqueado.
  Aceito para esta entrega; a tela de treino deve deixar isso explícito.
- **Elo zerado pela segunda vez.** Mesmo argumento do reset dos IVs: partidas de
  antes e depois medem jogos diferentes.
