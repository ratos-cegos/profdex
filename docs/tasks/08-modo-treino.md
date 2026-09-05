# Tarefa 8 — Modo treino: quiz sem valer nada + batalha contra bot

**Prioridade:** média
**Perfil:** full-stack (Nest + Vue) + curadoria de conteúdo
**Depende de:** 6.7 (mapa de navegação) — o hub de treino é uma aba dentro de
`/batalha` na estrutura proposta.

---

## Contexto do projeto

ProfDex é um app web mobile-first estilo Pokédex da Semana Tecnológica da UNIFIL.
O aluno responde uma questão **na bancada do estande, com um operador ao lado**,
num tablet compartilhado; se acerta, recebe um QR impresso, escaneia no app e
captura o professor. Depois batalha por turnos (PvE e PvP ranqueado por Elo).

- **Front:** `profdex-front/` — Vue 3 (`<script setup>`), Vite, Pinia, vue-router.
- **Back:** `profdex-back/` — NestJS + Prisma + PostgreSQL, sessão por cookie.
- **Quiz oficial:** `profdex-back/src/quiz/` + `docs/QUIZ.md`. Duas regras
  moldam o desenho atual: **o gabarito nunca sai do servidor antes da hora** (o
  tablet é compartilhado e fica aberto na frente de uma fila) e **o relógio que
  vale é o do servidor** (janela de 60 s, cooldown de 10 min por tema).
- **Bateria de questões:** `profdex-back/prisma/quiz-questions.ts` (9 temas × 10),
  semeada em `quiz_questions`.

---

## Por que existe esta tarefa

Hoje o aluno só encontra uma questão quando está na fila da bancada, e só descobre
como a batalha funciona quando entra numa partida ranqueada. As duas coisas
poderiam ser treinadas antes, no próprio celular, sem consequência — e as duas
já existem "quase prontas", só que escondidas.

---

## 8.1 — Quiz de treino (questões geradas com IA, sem valer nada)

### Diferença fundamental para o quiz oficial

| | Oficial (bancada) | Treino |
|---|---|---|
| Onde | Tablet do estande, operador ao lado | Celular do aluno, sozinho |
| Vale | QR de captura | Nada |
| Cooldown | 10 min por tema | Nenhum |
| Gabarito | **Só no servidor** | **Pode ir para o cliente** |
| Registro | `QuizAttempt` (relatório e auditoria) | Não persiste (ou persiste separado) |

A terceira linha é a que simplifica tudo: **sem prêmio, não há por que esconder a
resposta**. O treino pode ser um `GET` que devolve N questões já com o gabarito e
corrigir no cliente — nada de sessão em memória, nada de janela de tempo do
servidor, nada de estado.

⚠️ **Mas isso só é seguro se os dois bancos forem separados de verdade.** Se uma
questão oficial vazar pela rota de treino, o quiz da bancada acaba.

### Modelo de dados

Adicionar em `QuizQuestion` (`profdex-back/prisma/schema.prisma`):

```prisma
origin String @default("oficial")  // oficial | treino
@@index([origin, theme, active])
```

E então, **obrigatoriamente**:

- toda consulta do quiz oficial (`QuizService.themes`, `sortearQuestao`) filtra
  `origin: 'oficial'`;
- a rota de treino filtra `origin: 'treino'`;
- escreva um teste que falha se a rota de treino devolver qualquer questão
  `oficial`. É o teste mais importante desta tarefa.

Alternativa igualmente válida e ainda mais à prova de erro: **tabela separada**
(`TrainingQuestion`), sem relação com `QuizAttempt`. Custa uma tabela e elimina a
classe inteira de bug. Recomendada se o time preferir segurança a reaproveitamento.

### Backend

| Rota | Guard | O que faz |
|---|---|---|
| `GET /treino/quiz/temas` | Aluno | Temas disponíveis com contagem. |
| `GET /treino/quiz?theme=&n=10` | Aluno | N questões embaralhadas do tema, **com** `answer`. |

Sem gravação de tentativa. Se quiserem estatística de treino, gravem numa tabela
própria (`TrainingAttempt`) — **nunca** em `QuizAttempt`, que sustenta o cooldown
e o relatório do evento.

### Frontend

Nova rota `/treino/quiz` (`meta: { auth: true }`), tela
`src/views/TreinoQuizView.vue`:

- escolher tema (ou "aleatório") e quantidade;
- uma questão por vez, com as alternativas embaralhadas **no cliente**;
- feedback imediato: certo/errado + qual era a correta + explicação;
- placar ao fim, com opção de refazer só as que errou;
- avisos claros de que **não vale QR nem pontos**, para ninguém achar que
  perdeu uma captura;
- cronômetro opcional de 60 s, para simular a bancada — desligável.

Aproveite a estética da bancada (`src/views/AdminQuizBoothView.vue`) como
referência visual, mas **não reutilize o componente**: aquela tela é de quiosque,
com fluxo de operador embutido.

### Geração das questões com IA

1. Script `profdex-back/scripts/gerar-questoes-treino.ts` chamando a API da
   Anthropic (o time já usa Claude Code; `claude-sonnet-5` dá conta e é barato
   para isso) e escrevendo `prisma/quiz-questions-treino.ts` no mesmo formato do
   arquivo oficial (`QuizSeedQuestion`).
2. Template de prompt (guarde no próprio script):

   > Gere N questões de múltipla escolha sobre **{tema}** para alunos de
   > graduação em Computação, em português do Brasil. Dificuldade: {facil|media|dificil}.
   > Cada questão: um enunciado objetivo (máx. 220 caracteres), 4 alternativas
   > mutuamente exclusivas, exatamente uma correta, e uma explicação de uma frase.
   > Nada de "todas as anteriores", nada de pegadinha de redação, nada que dependa
   > de bibliografia específica. Responda em JSON:
   > `[{ "prompt": "...", "options": ["..."], "answer": 0, "explanation": "..." }]`

3. Validar o JSON no script (4 alternativas, `answer` no intervalo, enunciado
   único) e **revisar por amostragem** antes de semear: questão errada gerada por
   IA é exatamente o caso que o sistema de errata (tarefa 1.5) existe para
   remediar — melhor não criar o problema.
4. Semear com um script próprio (`db:seed-quiz-treino`), sem tocar no banco
   oficial.

> Aproveite a mesma rodada para ampliar o banco **oficial** de 10 para 20 questões
> por tema (tarefa 1.1) — mas ali a revisão humana é **obrigatória, questão por
> questão**, porque vale captura.

### Aceite

- `/treino/quiz` funciona sem operador, sem cooldown e sem conceder nada.
- Nenhuma questão `origin: 'oficial'` sai pela rota de treino (teste automatizado).
- O relatório de `/admin/quiz` e o cooldown não são afetados pelo treino.
- Banco de treino com pelo menos 15 questões por tema, revisadas por amostragem.

---

## 8.2 — Batalha de treino contra bot

### O que já existe (e por que ninguém acha)

A batalha PvE **existe**: é a rota `/arena/:id` (`src/views/ArenaView.vue`), com o
motor completo em `src/composables/battleEngine.js` + `useBattle.js`. Só que:

- ela é alcançada por um botão dentro da própria tela de batalha ranqueada
  (`goToArena` em `BatalhaView.vue`), misturada ao fluxo de PvP;
- **o oponente está fixo no Gustavo**: `const ENEMY_KEY = 'gustavo'` no
  `ArenaView.vue`, com comentário explicando que é por ele ser o único com sprite
  de frente e de costas. O professor da URL é ignorado;
- a RA está desligada nessa tela (`arEnabled = ref(false)`), e o combate acontece
  dentro do túnel binário;
- nada na interface diz que aquilo **não vale ranking**.

### O que fazer

1. **Criar o hub de treino** — rota `/treino`, tela `src/views/TreinoView.vue`,
   com dois cartões grandes: **Quiz de treino** (8.1) e **Batalha de treino**,
   mais um link para o guia que já existe (`/batalha/guia`).
2. **Colocar o hub no lugar certo:** aba "Treino" dentro de `/batalha`, ao lado de
   "Jogar" e "Ranking" (ver o mapa em 6.7, `TopTabs.vue`). Tirar o botão de arena
   do meio do fluxo de PvP.
3. **Deixar explícito que não vale nada:** selo "TREINO — não vale ranking" no
   cartão, no cabeçalho da arena e na tela de resultado. Hoje um aluno pode passar
   a tarde na arena achando que está subindo de Elo.
4. **Escolher o oponente.** Assim que a tarefa 2 entregar sprites dos demais,
   remover o `ENEMY_KEY` fixo e deixar o aluno escolher contra quem treinar —
   preferencialmente com **prévia de tipos e fraquezas** (6.6), que é o que
   transforma o treino em aprendizado da roda de tipos.
5. **Escolher o próprio exemplar.** Hoje a arena monta o jogador com um moveset
   derivado dos tipos; deixe usar um exemplar real da coleção (o
   `PvpPickView.vue` já resolve esse problema para o PvP — reaproveite o
   componente de seleção).
6. **Dificuldade do bot.** A IA do oponente hoje é simples. Três níveis resolvem:
   *fácil* (golpe aleatório), *médio* (prefere golpe de dano com vantagem de
   tipo), *difícil* (considera efeito ativo, HP e status). A lógica é pura e vive
   bem em `src/composables/battleEngine.js` — implemente como função testável e
   escreva testes em `profdex-front/test/`.

### Aceite

- `/treino` alcançável em no máximo dois toques a partir da tela inicial.
- A batalha de treino identifica-se como treino em todas as telas.
- Dá para escolher oponente e exemplar próprio.
- Nenhuma partida de treino escreve em `Battle`, `battleRating` ou nas estatísticas
  de vitória/derrota — **teste cobrindo isso**.
- Os três níveis de bot são distinguíveis na prática (taxa de vitória do jogador
  medida em partidas de teste).

### Cuidados

- O motor tem duas cópias: `profdex-front/src/composables/battleEngine.js` (PvE) e
  `profdex-back/src/battle/engine/engine.ts` (PvP, port TS). Mudança de regra no
  treino que vaze para o motor compartilhado desequilibra o ranqueado. Mantenha a
  IA do bot **fora** do motor — ela decide *qual* golpe usar, não *como* o golpe
  resolve.
- A tarefa 6.6 (IVs por exemplar) muda o cálculo de HP e atributos nos dois lados.
  Se as duas forem em paralelo, combinem a ordem de merge.
