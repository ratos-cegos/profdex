# Tarefa 12 — Captura por tipo (o QR deixa de ser de um professor)

**Prioridade:** alta — muda a logística de papel do evento
**Perfil:** back-end pesado + front (painel)
**Depende de:** 🔗 **tarefa 11** (os ids de tipo novos)
**Origem:** entrevista de design com o Gustavo em 19/09/2026. As decisões da
tabela "Decisões de produto" já foram fechadas — não reabrir sem alinhar.

---

## Contexto do projeto

O ProfDex é uma "Pokédex de professores" para a semana tecnológica da UNIFIL
(1000+ alunos). O aluno acerta uma questão de um tema na bancada, recebe uma
ficha de QR impressa, escaneia e captura um professor.

**Stack**

- `profdex-front/` — Vue 3 + Vite + Pinia + vue-router.
- `profdex-back/` — NestJS + Prisma + PostgreSQL + Socket.IO.
- Deploy: tudo numa EC2 única, pelo `docker-compose.yml` da raiz.

**Como rodar** (da raiz): `npm run dev`. No `profdex-back/`: `npm run db:up`,
`npm run db:migrate`, `npm run db:seed`, `npm test`.

**Documentos que você precisa ler antes de mexer**

| Documento | Por quê |
|---|---|
| `docs/BANCO.md` | Modelo de dados |
| `docs/QUIZ.md` | Tema, cooldown de 10 min, e por que tema = tipo |
| `.codex/CODE_STYLE.md` | DTO com allowlist, RNG injetado, **nunca logar token** |
| `docs/GIT-RULES.md` | Convenção de commits |

### Como funciona hoje

`CaptureToken.variantId` aponta para uma `ProfessorVariant` — professor **mais**
combinação de tipos. Quem imprime escolhe a variante; quem escaneia recebe
exatamente aquele professor. O painel `/admin/fichas` lista uma linha por
variante (dezenas delas) e a folha impressa traz o nome do professor.

### O que muda

A ficha passa a valer por **tipo**. O aluno acertou uma questão de Redes, recebe
uma ficha de Redes, escaneia, e o servidor sorteia **qual** professor de Redes
ele leva. A bancada deixa de escolher professor: escolhe tema, que é o que ela
já sabe (o tema da questão que o aluno acertou).

---

## Decisões de produto (fechadas)

| Decisão | Escolha |
|---|---|
| O que a ficha carrega | Um **tipo**, não um professor nem uma variante |
| Validade | Continua valendo **uma captura** e morrendo no primeiro scan |
| Fichas já impressas | Continuam válidas e entregando a variante original (`variantId` vira nullable, legado) |
| Quem entra no sorteio | Professores **ativos** cujos tipos possíveis incluem o tipo da ficha |
| Faixa 1 | Professores do tema de que o aluno **não tem nenhum exemplar**. Sorteia professor, depois sorteia entre as variantes **dele** que contêm o tipo — pode sair combinação dupla já na primeira |
| Faixa 2 | Quando o aluno já tem ≥1 exemplar de **todos** os professores do tema: sorteia entre as variantes do tema que ele **ainda não tem** |
| Faixa 3 | Quando já tem todas: sorteia **uniformemente entre todas** as variantes do tema (repetição, com IV e deck novos) |
| "Já tenho" | Conta por **professor** na faixa 1, por **variante** na faixa 2 |
| Tipo sem professor | **Erro claro e a ficha NÃO é consumida** |
| Painel | Estoque por **tipo** (9 linhas), com aviso de tipo sem professor |
| Cooldown | **Nenhum novo.** O que espaça as capturas é o cooldown de 10 min por tema do quiz, que já existe |

### O sorteio, por exemplo

Tema **IA**, com Prof A (IA), Prof B (IA + Arquitetura), Prof C (IA + Robótica).
As variantes que contêm IA são `A{IA}`, `B{IA}`, `B{IA+Arq}`, `C{IA}`,
`C{IA+Rob}`.

- Aluno sem nada: faixa 1 → sorteia entre A, B e C; escolhido o B, sorteia entre
  `B{IA}` e `B{IA+Arq}`. **As duas são resultados válidos** — o que importa é
  que o professor seja do tema, mesmo combinado com outro.
- Aluno com A e B, sem C: faixa 1 → sai C, obrigatoriamente.
- Aluno com A, B e C: faixa 2 → sorteia entre as variantes que ainda faltam.
- Aluno com as cinco: faixa 3 → qualquer uma, repetida.

---

## 12.1 — Schema: a ficha aponta para um tipo

**Problema.** `CaptureToken.variantId` é obrigatório e é uma FK para
`professor_variants`. Não há onde guardar "esta ficha é de Redes".

**O que fazer**

```prisma
model CaptureToken {
  id         String            @id @default(uuid())
  type       String?                              // tipo da roda — fichas novas
  variantId  String?           @map("variant_id") // legado: fichas já impressas
  tokenHash  String            @unique @map("token_hash")
  // … resto inalterado
  variant    ProfessorVariant? @relation(fields: [variantId], references: [id], onDelete: Cascade)

  @@index([type, redeemedAt])
  @@index([variantId, redeemedAt])
}
```

Os dois campos são opcionais no schema mas **exatamente um** é preenchido —
regra de aplicação, comentada no modelo. `QrBatch.variantIds` vira
`types String[]`, e o campo antigo sai (o banco será limpo).

**Onde mexer**

- `profdex-back/prisma/schema.prisma` + migration
- `profdex-back/prisma/schema.local.prisma` (a variante SQLite de dev)

**Critérios de aceite**

- Migration aplica num banco limpo sem erro.
- O índice `[type, redeemedAt]` existe — é ele que sustenta a contagem de
  estoque do painel, que hoje roda em `[variantId, redeemedAt]`.

**Cuidados**

- Não apagar `variantId`: ficha impressa que virasse lixo silencioso é o pior
  desfecho no meio do evento.
- Continua valendo que o banco guarda **só** `sha256(token)`. Ficha gerada não
  pode ser reimpressa, e isso não muda.

---

## 12.2 — O sorteio

**Problema.** `captureByToken()` hoje lê `ficha.variant` e cria a captura
direto. Com a ficha de tipo, o professor precisa ser escolhido no servidor.

**O que fazer.** Extrair o sorteio para um módulo próprio e puro — ele é a
regra mais delicada desta tarefa e precisa ser testável sem banco:

```ts
// captures/capture-lottery.ts
export function sortearVariante(
  candidatas: { id: string; professorId: string; types: string[] }[],
  jaTem: { professorId: string; variantId: string }[],
  random: RandomSource,
): { id: string; professorId: string } | null
```

Dentro de `captureByToken`, com a ficha de tipo:

1. `updateMany` condicional em `redeemedAt: null` continua sendo o que decide
   quem escaneou primeiro — **não mexer nisso**.
2. Buscar as variantes que contêm o tipo, de professores **ativos**.
3. Buscar as capturas do aluno para saber o que ele já tem.
4. Sortear pelas três faixas.
5. Criar a captura com `professorId`/`variantId` sorteados, `moves` de
   `buildMoveset(variant.types)` e os IVs de `rollCaptureIvs`.

O RNG vem do `CAPTURE_RNG` já injetado no serviço — **não** chamar `Math.random`
direto, senão o teste não consegue fixar o sorteio.

Ficha legada (com `variantId`) segue o caminho atual, sem sorteio.

**Onde mexer**

- `profdex-back/src/captures/capture-lottery.ts` (**novo**)
- `profdex-back/src/captures/captures.service.ts`

**Critérios de aceite**

- Com 3 professores do tema e nenhum exemplar, 3 capturas seguidas devolvem os
  **3 professores distintos**, em qualquer ordem.
- A 4ª captura devolve uma variante ainda não possuída (faixa 2), e só depois
  começam as repetições (faixa 3).
- Um professor de dois tipos pode sair com a combinação dupla já na 1ª captura.
- Professor **inativo** nunca é sorteado.
- Com RNG fixo, o resultado é determinístico.

**Cuidados**

- Tudo continua dentro da transação que já existe. A captura, a `Discovery` e a
  baixa da ficha são um bloco só.
- `Discovery` é por professor e já distingue "descobriu agora" de "já tinha" —
  esse cuidado (não pontuar duas vezes) continua valendo e o sorteio não pode
  quebrá-lo.
- A métrica é registrada no servidor, fora da transação, e **nunca** pode
  derrubar a captura. O `try/catch` silencioso de hoje fica.

---

## 12.3 — Tipo sem professor: erro sem consumir a ficha

**Problema.** Um tipo novo pode não ter nenhum professor cadastrado. Se a ficha
for consumida e não entregar nada, o aluno perde o papel e o direito.

**O que fazer.** O sorteio devolve `null`; o serviço lança
`NotFoundException` com mensagem de bancada ("Nenhum professor deste tipo
disponível — procure a bancada"). Como tudo roda **dentro da transação**, a
exceção desfaz o `updateMany` e a ficha continua valendo.

**Onde mexer**

- `profdex-back/src/captures/captures.service.ts`
- `profdex-front/src/views/ScanView.vue` — mostrar a mensagem sem parecer que a
  ficha morreu

**Critérios de aceite**

- Escanear ficha de tipo vazio devolve erro e **`redeemedAt` continua `null`**
  (teste de integração, não só unitário).
- A mesma ficha funciona depois que um professor daquele tipo é cadastrado.

**Cuidados**

- É o único caminho em que a baixa da ficha é revertida. Se alguém tirar o
  `throw` de dentro da transação um dia, o bug volta silencioso — vale um
  comentário no código dizendo por que ele precisa estar ali.

---

## 12.4 — A folha impressa passa a dizer o tipo

**Problema.** `capture-sheet.ts` monta a ficha com `professorName` e
`professorSlug`. Numa ficha de tipo não existe professor.

**O que fazer.** `SheetVariant`/`SheetEntry` passam a carregar **tipo**: o card
mostra o rótulo do tipo em destaque (com a cor, se der) e a legenda "Vale uma
captura de um professor deste tipo". O nome do arquivo da tiragem em disco vira
`<tipo>--<copia>`.

**Onde mexer**

- `profdex-back/src/captures/capture-sheet.ts`
- `profdex-back/scripts/generate-capture-qr.ts` (a tiragem pela CLI)

**Critérios de aceite**

- A folha do painel e a da CLI saem do **mesmo** módulo (é o ponto do arquivo) e
  com o mesmo layout.
- O QR continua codificando `capture:<token>`, inalterado — o ScanView não muda
  de formato.

**Cuidados**

- `escapeHtml` continua obrigatório em tudo que vem do banco.
- Os QRs continuam SVG na folha do painel (PNG de 800px custa ~7s por ficha em
  JS puro e estoura o request).

---

## 12.5 — Painel de fichas por tipo

**Problema.** `/admin/fichas` lista uma linha por variante e deixa gerar
tiragem por variante. Com a ficha de tipo, isso vira 9 linhas.

**O que fazer**

- `inventory()` agrupa por `type`: 9 linhas com estoque vivo, resgatado e os
  números da última tiragem. As contagens continuam sendo feitas **no banco**
  (`groupBy`), nunca trazendo `capture_tokens` para a memória.
- Cada linha mostra **quantos professores ativos** existem daquele tipo, e
  **avisa em destaque quando é zero** — gerar tiragem de tipo vazio é imprimir
  papel que não captura nada.
- `preview()` e `generate()` passam a receber `types[]` em vez de `variantIds[]`.
- A tela lista os 9 tipos com o `TypeIcon` e a cor do tipo.

**Onde mexer**

- `profdex-back/src/captures/admin-capture-tokens.service.ts`
- `profdex-back/src/captures/admin-capture-tokens.controller.ts`
- `profdex-back/src/captures/dto/generate-sheet.dto.ts` (allowlist de tipos:
  `@IsIn(TYPE_CYCLE)`)
- `profdex-front/src/views/AdminFichasView.vue`

**Critérios de aceite**

- A tela lista exatamente 9 linhas, uma por tipo da roda.
- Tipo com 0 professores ativos aparece marcado e a tiragem dele pede
  confirmação extra (ou é bloqueada — decida na implementação, mas não pode
  passar em silêncio).
- Gerar tiragem continua sendo transação: ou entra inteira, ou nenhuma ficha
  vale.
- A auditoria (`QrBatch` + log) continua registrando quem gerou, quando e
  quanto. **Nunca logar token.**

**Cuidados**

- `MAX_COPIES_PANEL = 20` existe porque a geração é síncrona dentro do request.
  Com 9 tipos em vez de dezenas de variantes o volume cai — pode subir o teto,
  mas meça antes.
- O `AdminGuard` já protege a rota. Não afrouxar.

---

## 12.6 — Conserto: estrelas travadas em 5 na Profdex

**Problema.** Na ficha do professor, todo exemplar aparece com 5 estrelas,
enquanto a mesma informação na seleção de batalha mostra o valor real.

**Causa (já diagnosticada).** `ProfessorExemplares.vue:167` tem:

```css
.copy__head > span { color: var(--unifil-gold); font-size: 7px; }
```

O elemento raiz do `StarRating` **é** um `<span>` filho direto de `.copy__head`,
e no Vue o nó raiz de um componente filho recebe também o atributo de escopo do
pai — então a regra casa, com especificidade maior que o
`.stars { color: var(--surface-border) }` do próprio componente. As estrelas
**vazias são pintadas de dourado**, iguais às cheias. Na `PvpPickView` a classe
aplicada só tem `margin-left: auto`, sem cor — por isso lá o valor real aparece.

**O que fazer.** Restringir a regra ao rótulo (`.copy__head > span.pixel`) em
vez de atingir qualquer filho.

**Onde mexer**

- `profdex-front/src/components/ProfessorExemplares.vue`

**Critérios de aceite**

- Um exemplar com IVs baixos mostra menos de 5 estrelas na ficha do professor.
- Ficha e seleção de batalha mostram **o mesmo** número de estrelas para o mesmo
  exemplar.
- Teste travando a regressão.

**Cuidados**

- Não "consertar" pelo `StarRating` com `!important`: o defeito é o pai pintar o
  filho, e o mesmo erro reapareceria no próximo componente que usar estrelas.

---

## Testes exigidos

1. `capture-lottery.spec.ts` — as três faixas, com RNG fixo: professores
   distintos primeiro; variantes faltantes depois; repetição por último.
   Incluir o caso de professor de dois tipos saindo duplo na primeira.
2. `captures.service.spec.ts` — ficha de tipo vazio **não** consome o token
   (checar `redeemedAt` depois do erro); ficha legada com `variantId` continua
   funcionando; duas capturas simultâneas da mesma ficha → uma ganha, outra 409.
3. `admin-capture-tokens.service.spec.ts` — inventário agrupa por tipo; tiragem
   grava `QrBatch` com `types`; tipo inexistente é rejeitado pelo DTO.
4. Front — regressão das estrelas.

---

## Ordem de execução e riscos

1. **12.1** (schema) — abre o caminho.
2. **12.2** + **12.3** juntos: o sorteio e o caso vazio são a mesma regra vista
   de dois lados.
3. **12.4** e **12.5** (papel e painel).
4. **12.6** é independente e pode ir a qualquer momento — inclusive primeiro,
   como conserto isolado.

**Risco principal:** a baixa da ficha e o sorteio saírem da mesma transação. Se
isso acontecer, existe um caminho em que o aluno perde a ficha sem receber
professor — e no meio do evento isso é irrecuperável.

**Risco secundário:** o sorteio ficar caro. São três consultas por captura
(variantes do tipo, capturas do aluno, criação). Com 1000+ alunos e picos na
bancada, confirmar que as duas leituras usam índice — em especial
`captures[userId, professorId]`, que já existe.
