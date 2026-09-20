# Tarefa 11 — Roda de tipos nova (9 tipos)

**Prioridade:** alta — **bloqueia as tarefas 12 e 13**, que usam os ids novos
**Perfil:** full-stack + conteúdo (banco de questões, golpes, arte vetorial)
**Origem:** entrevista de design com o Gustavo em 19/09/2026. As decisões da
tabela "Decisões de produto" já foram fechadas — não reabrir sem alinhar.

---

## Contexto do projeto

O ProfDex é uma "Pokédex de professores" para a semana tecnológica da UNIFIL
(1000+ alunos). O aluno acerta uma questão na bancada, recebe uma ficha de QR
impressa, escaneia e captura um professor; os exemplares capturados batalham num
PvP ranqueado por Elo.

**Stack**

- `profdex-front/` — Vue 3 + Vite + Pinia + vue-router.
- `profdex-back/` — NestJS + Prisma + PostgreSQL + Socket.IO.
- `profdex-landing/` — build público separado, com **cópias literais** de
  `data/types.js` e `components/TypeIcon.vue`.
- Deploy: **tudo numa EC2 única**, pelo `docker-compose.yml` da raiz (serviços
  `db`, `app`, `frontend`, `landing`, `adminer`, `nginx`). O `INDEX.md` ainda
  diz "Vercel (front)" — está desatualizado; corrija na passagem.

**Como rodar** (da raiz): `npm run dev` sobe front (5173) + back (3000).
No `profdex-back/`: `npm run db:up`, `npm run db:migrate`, `npm run db:seed`,
`npm test` (Jest).

**Documentos que você precisa ler antes de mexer**

| Documento | Por quê |
|---|---|
| `docs/GUIA-TIPOS.md` | Como a roda funciona hoje e por que a ordem do array **é** a roda |
| `docs/BATALHA.md` | O motor de combate (tipos, movesets, eventos) |
| `docs/QUIZ.md` | Temas, cooldown, mix de dificuldade |
| `.codex/CODE_STYLE.md` | Convenções obrigatórias |
| `docs/GIT-RULES.md` | Convenção de commits |

**Convenção que esta tarefa não pode quebrar:** o motor tem **duas cópias**
(`profdex-back/src/battle/engine/` e `profdex-front/src/composables/` +
`src/data/`) que precisam continuar idênticas nas regras. Toda mudança de tipo
ou de golpe é feita **nos dois lados, no mesmo commit**.

---

## Decisões de produto (fechadas)

| Decisão | Escolha |
|---|---|
| Quantidade | Continuam **9 tipos** — a roda não muda de tamanho |
| Ordem | Cada tipo sobrevivente **fica na posição que já ocupa hoje**; os dois novos entram nas vagas de Lógica e NPI |
| Ids | Renomeados **de verdade** (`calculo`→`matematica`, `ia-ml`→`ia`). Id que não bate com o rótulo é origem de bug |
| Saem da roda | **Lógica** e **NPI** |
| Entram | **Humanas** e **Engenharia de Software** |
| Questões de Lógica | Viram **Algoritmos** (tema fica com 40 oficiais / 30 de treino — desbalanceio de pool não afeta o jogador) |
| Questões de NPI | **Descartadas inteiras.** Eng. de Software é reescrita do zero |
| Matemática | Mantém as 20 de cálculo e **ganha ~10 de estatística** por cima |
| Humanas | **35 questões novas** (20 oficiais + 15 de treino) |
| Golpes | 8 por tipo. Os 16 de Lógica e NPI são **descartados**; 16 novos escritos para Humanas e Eng. de Software |
| Ícones | Dois SVG novos, no estilo dos outros 9 (traço 2px, viewBox 24, coordenadas inteiras) |
| Cores | Humanas herda `#6C4DE0` (vaga da Lógica); Eng. de Software herda `#495057` (vaga do NPI) |
| Landing | Continua com **cópia manual** dos arquivos, não lê da API. Atualizada no mesmo commit |
| Banco de produção | **Está vazio e pode ser limpo.** Não escrever migração de preservação de dados |

### A roda nova

Ordem (sentido horário) — **a ordem do array é a roda**:

```
Humanas → Matemática → IA → Robótica → Arquitetura →
Eng. Software → Redes → Banco → Algoritmos → (volta a Humanas)
```

Regra inalterada: super-eficaz (2×) contra os **2 seguintes**, fraco (0,5×)
contra os **2 anteriores**, neutro contra o resto.

| Posição | id | label | cor | emoji legado |
|---|---|---|---|---|
| 0 | `humanas` | Humanas | `#6C4DE0` | 📚 |
| 1 | `matematica` | Matemática | `#F03E3E` | 📐 |
| 2 | `ia` | IA | `#12B886` | 🧠 |
| 3 | `robotica` | Robótica | `#0CA5B8` | 🤖 |
| 4 | `arquitetura` | Arquitetura | `#F5A623` | 🖥️ |
| 5 | `engenharia-software` | Engenharia de Software | `#495057` | 📋 |
| 6 | `redes` | Redes | `#3B5BDB` | 🌐 |
| 7 | `banco` | Banco de Dados | `#E64980` | 🗄️ |
| 8 | `algoritmos` | Algoritmos | `#66BB2E` | 🔀 |

Descrições sugeridas para os dois novos (mesmo tom das existentes):

- **Humanas** — "Ética, impacto social e o lado humano da tecnologia."
- **Engenharia de Software** — "Requisitos, modelagem e processo de entrega."

E a de Matemática muda para cobrir estatística: "Cálculo, estatística e
otimização."

> **Nota sobre os rótulos.** O Gustavo listou os tipos como "Banco" e
> "Algoritimo"; ficam os rótulos que o app já usa (**Banco de Dados**,
> **Algoritmos**), que são os mesmos conceitos escritos por extenso e corretos.

---

## 11.1 — A roda em si

**Problema.** A roda vive em três arquivos que precisam concordar: o motor do
back, o do front e a cópia da landing. Divergência entre eles significa dano
calculado diferente em cada lado.

**O que fazer.** Reescrever `TYPE_CYCLE` nos três com a ordem e os ids da
tabela acima. As funções derivadas (`effectiveness`, `typeMultiplier`,
`strongAgainst`, `weakAgainst`, `fraquezasDe`, `typeIdFromSeed`, `shiftType`)
**não mudam** — elas leem a posição no array, que é justamente o ponto do
desenho atual.

**Onde mexer**

| Arquivo | O que muda |
|---|---|
| `profdex-back/src/battle/engine/types.ts` | `TYPE_CYCLE` (só ids — o back não guarda cor nem rótulo) |
| `profdex-front/src/data/types.js` | `TYPE_CYCLE` completo (id, label, icon, color, description) |
| `profdex-landing/src/data/types.js` | Cópia literal do de cima, mantendo o aviso de proveniência no topo |
| `profdex-back/src/captures/capture-sheet.ts` | `TYPE_LABEL` — os rótulos da folha impressa |

**Critérios de aceite**

- `TYPE_CYCLE` tem 9 entradas, na ordem da tabela, nos três arquivos.
- Nenhuma ocorrência de `logica`, `npi`, `calculo` ou `ia-ml` sobra no
  repositório (fora de `docs/` histórico e de CHANGELOG).
- `effectiveness('humanas', 'matematica') === 2` e
  `effectiveness('algoritmos', 'humanas') === 2`.

**Cuidados**

- `TYPE_LABEL` em `capture-sheet.ts` é **apresentação**, não fonte da verdade —
  mas se ficar desatualizado a ficha impressa sai com o nome errado, em papel.
- O campo `icon` (emoji) é legado e continua existindo de propósito: ele degrada
  um `{{ t.icon }}` esquecido em vez de deixar buraco. Preencher os dois novos.

---

## 11.2 — Ícones dos dois tipos novos

**Problema.** `TypeIcon.vue` tem arte vetorial desenhada à mão para os 9 ids
atuais, num mapa `ICONS` de descritores `[tagSVG, atributos]`. `humanas` e
`engenharia-software` não têm entrada — e o componente é **duplicado** no front
e na landing.

**O que fazer.** Desenhar dois ícones no mesmo estilo (monocromático, herda
`currentColor`, traço 2px, viewBox 24, coordenadas inteiras):

- **Humanas** — livro aberto.
- **Engenharia de Software** — blocos ligados por setas (lê como UML/BPMN).

Remover as entradas `logica` e `npi`, renomear `calculo`→`matematica` e
`ia-ml`→`ia` (a arte dos dois continua servindo).

**Onde mexer**

- `profdex-front/src/components/TypeIcon.vue`
- `profdex-landing/src/components/TypeIcon.vue` (mesma edição, cópia)

**Critérios de aceite**

- `ICONS` tem exatamente as 9 chaves do `TYPE_CYCLE` novo, nos dois arquivos.
- Os dois arquivos são idênticos no mapa `ICONS`.
- Os ícones novos renderizam legíveis a 12px (o menor uso, nos badges de tipo).

**Cuidados**

- É vetor, **não** pixel art: nada de `image-rendering: pixelated`.
- Nada de `v-html` — o formato é descritor, e isso é deliberado (ver o
  comentário no topo do componente).
- Cinza `#495057` do Eng. de Software é a cor mais escura da paleta e só passa
  em contraste por causa do `legibleColor()` de `types.js`. Não renderizar esse
  ícone com a cor canônica direto sobre o fundo escuro.

---

## 11.3 — Movepool dos tipos novos

**Problema.** Os golpes são organizados **por tipo**: `MOVE_SEEDS` no back e
`MOVES_BY_TYPE` no front, 8 golpes por tipo, 72 no total, e os dois arquivos
precisam ser idênticos nas regras. Os 8 de Lógica ("Modus Ponta-Pé", "Prova que
Dói"…) e os 8 de NPI ("Demo da Semana", "Deu Merge"…) somem com os tipos — sem
substituto, `buildMoveset()` devolve lista vazia e o exemplar entra na batalha
**sem nenhum golpe**.

**O que fazer.** Renomear as chaves `calculo`→`matematica` e `ia-ml`→`ia`
(golpes intactos), apagar os blocos `logica` e `npi`, e escrever **8 golpes de
Humanas + 8 de Engenharia de Software** seguindo a mesma receita dos existentes:

- Mistura de categorias: o bloco precisa ter ataques **e** utilitários —
  `buildMoveset()` sorteia `size - 1` ataques e 1 utilitário.
- Faixa de poder e precisão compatível com os outros tipos (70–100 nos ataques
  principais), efeitos reaproveitando os helpers já existentes (`paralyze`,
  `grow`, `comboBonus`…), sem inventar efeito novo.
- Nome com piada de corredor de faculdade e `description` explicando o conceito
  real — é o padrão de todos os 72 golpes atuais.

Sugestões de tema: **Humanas** — LGPD, comitê de ética, revisão por pares,
debate, viés algorítmico. **Eng. de Software** — levantamento de requisitos,
diagrama de classes, refatoração, sprint review, dívida técnica.

**Onde mexer**

- `profdex-back/src/battle/engine/moves.ts` (`MOVE_SEEDS`)
- `profdex-front/src/data/moves.js` (`MOVES_BY_TYPE`)

**Critérios de aceite**

- Os dois arquivos têm as mesmas 9 chaves, com os mesmos `id`, `power`,
  `accuracy`, `category` e `effects` em cada golpe.
- 8 golpes por tipo, todos com `id` único no repositório inteiro.
- `buildMoveset(['humanas'])` e `buildMoveset(['engenharia-software'])`
  devolvem 4 golpes, com pelo menos 1 não-ataque.

**Cuidados**

- `id` de golpe é **gravado na captura** (`Capture.moves`). Como o banco será
  limpo, não há exemplar apontando para golpe morto — mas se isso mudar, ids
  removidos precisam de tratamento em `getMoveById()` (que já devolve `null` e é
  filtrado em `captures.service.ts`).
- Os dois arquivos divergirem é o pior desfecho: o dano no PvP (back) deixaria
  de bater com o do treino (front).

---

## 11.4 — Banco de questões

**Problema.** Há 20 questões oficiais e 15 de treino **por tema**, com teste
que falha se algum tema ficar abaixo de 20 e outro que exige as três
dificuldades em todos os temas. Com a roda nova, `humanas` nasce com zero.

**O que fazer**

| Tema | Ação | Resultado |
|---|---|---|
| `logica` → `algoritmos` | Reetiquetar as 20 oficiais + 15 de treino | Algoritmos com **40 / 30** |
| `npi` | **Apagar** as 20 + 15 | — |
| `engenharia-software` | Escrever **20 oficiais + 15 de treino** do zero: UML, gerência de requisitos, BPMN, ciclo de vida, testes | 20 / 15 |
| `humanas` | Escrever **20 oficiais + 15 de treino** do zero: ética, LGPD, impacto social, metodologia científica | 20 / 15 |
| `calculo` → `matematica` | Reetiquetar e **somar ~10 oficiais + ~8 de treino** de estatística | ~30 / ~23 |
| demais | Só reetiquetar `ia-ml` → `ia` | 20 / 15 |

Respeitar o mix de dificuldade do seed (4 fáceis / 3 médias / 3 difíceis a cada
10 oficiais) e o campo `explanation`, que o treino mostra no feedback.

**Onde mexer**

- `profdex-back/prisma/quiz-questions.ts` (oficiais)
- `profdex-back/prisma/training-questions.ts` (treino)
- `profdex-back/src/quiz/quiz.constants.ts` — nada a fazer: `QUIZ_THEMES` já é
  `TYPE_CYCLE`, e é assim que tem de continuar

**Critérios de aceite**

- `quiz-questions.spec.ts` e `training-questions.spec.ts` passam sem afrouxar
  nenhum mínimo.
- Nenhuma questão com `theme` fora do `TYPE_CYCLE` novo.
- `prompt` continua único (há `@@unique([prompt])` em `training_questions`).

**Cuidados**

- Questão de Humanas **não é questão de português**: é humanas aplicada à
  computação. Uma pergunta sobre ética em IA cabe; uma sobre figura de
  linguagem, não.
- As de estatística entram em **Matemática**, não em IA — mesmo as de
  distribuição e amostragem.

---

## 11.5 — Migration e seed

**Problema.** As colunas que guardam id de tipo (`professor_variants.types`,
`quiz_questions.theme`, `training_questions.theme`, `quiz_attempts.theme`,
`capture_vouchers.theme`) têm valores antigos no banco de desenvolvimento.

**O que fazer.** O banco de produção está vazio e **pode ser limpo**: não
escrever migração de dados. Uma migration de schema (se houver mudança de
coluna vinda das tarefas 12 e 13) mais `npm run db:reset` + `npm run db:seed`
resolvem. Documentar isso no `deploy.md`, porque o passo é manual.

**Onde mexer**

- `profdex-back/prisma/seed.ts`, `prisma/quiz-seed.ts`, `prisma/training-seed.ts`
- `profdex-back/scripts/db-reset.js` (conferir que cobre as tabelas novas)
- `deploy.md`

**Critérios de aceite**

- `npm run db:reset && npm run db:seed` num banco limpo termina sem erro e deixa
  os 9 temas com questão.
- O seed continua criando os 3 professores com arte (Mário, Eron, Gustavo).

**Cuidados**

- `scripts/seed-dois-treinadores.ts` cria capturas para as contas de teste do
  PvP e depende de variantes existirem. Rodar depois do seed principal e
  conferir que ainda funciona com os tipos novos.

---

## 11.6 — Varredura: nenhum tipo antigo sobra na tela

**Problema.** A demanda é *substituir totalmente* as aparições dos tipos
antigos. Eles aparecem em lugares que não são a roda.

**O que fazer.** Passar por cada superfície e trocar:

| Superfície | Arquivo | O que tem lá |
|---|---|---|
| Guia de batalha | `profdex-front/src/views/BattleGuideView.vue` | A roda em SVG e os 9 cards de tipo — **derivados do `TYPE_CYCLE`**, então devem se ajustar sozinhos. Conferir, não reescrever |
| Roda da landing | `profdex-landing/src/sections/TypeWheelSection.vue` | Idem |
| Explicação de batalha | `profdex-landing/src/sections/BattleSection.vue` | Texto que pode citar tipo pelo nome |
| Elenco da landing | `profdex-landing/src/data/professors.js` | Tipos por professor, hardcoded |
| Badges | `TypeBadges.vue`, `TypeBadge.vue` | Leem do `types.js` |
| Tipos por professor | `profdex-back/src/battle/engine/professor-types.ts` e `profdex-front/src/data/professorTypes.js` | Mapa hardcoded com ids antigos — **a tarefa 13 apaga os dois**. Aqui, só atualizar os ids para não quebrar no meio do caminho |
| Docs | `docs/GUIA-TIPOS.md`, `docs/BATALHA.md`, `docs/QUIZ.md` | Listas de tipo escritas à mão |

**Critérios de aceite**

- `grep -rn "logica\|npi\|ia-ml\|calculo" profdex-*/src` não devolve nada.
- A roda do guia e a da landing desenham 9 nós com os rótulos novos, sem
  nenhuma coordenada hard-coded (elas já são calculadas por trigonometria).

**Cuidados**

- A landing é outro build: atualizar e **conferir no navegador**, porque ela não
  tem teste.

---

## Testes exigidos

1. `types.spec.ts` (back) — a roda tem 9 tipos; `effectiveness` devolve 2× para
   os 2 seguintes e 0,5× para os 2 anteriores em **todos** os 9; nenhum id
   antigo responde.
2. Teste novo travando a **paridade dos dois motores**: a lista de ids de
   `TYPE_CYCLE` e as chaves de movepool do back e do front são iguais. É a
   regressão mais cara de descobrir tarde.
3. `moves.spec.ts` — 8 golpes por tipo, ids únicos, `buildMoveset` devolve 4 com
   pelo menos 1 utilitário para os dois tipos novos.
4. `quiz-questions.spec.ts` / `training-questions.spec.ts` — passam sem mexer nos
   mínimos.
5. Front: teste de que `fraquezasDe()` de um tipo novo devolve os grupos certos.

---

## Ordem de execução e riscos

1. **11.1** (a roda) — tudo depende dela.
2. **11.3** (golpes) junto com 11.1: entre as duas, um exemplar de tipo novo
   ficaria sem golpe, e o teste de paridade acusa.
3. **11.2** (ícones) — independente, pode ir em paralelo.
4. **11.4** (questões) — o pedaço mais longo e o menos arriscado.
5. **11.5** e **11.6** fecham.

**Risco principal:** as duas cópias do motor divergirem. O teste de paridade
(item 2 acima) é o que impede, e ele precisa existir **antes** de 11.3.

**Risco secundário:** a landing ficar para trás. Ela tem cópia própria de
`types.js` e `TypeIcon.vue`, não tem teste, e sobe no mesmo compose — então um
esquecimento só aparece em produção.
