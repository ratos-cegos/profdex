# Quiz de bancada

Um tablet fica aberto no estande do evento. O aluno chega, informa a matrícula,
escolhe um tema e responde **uma** pergunta em **60 segundos**, com um
administrador ao lado. Acertou, é mandado escanear o QR do professor daquele
tema; errou (ou estourou o tempo), volta em 10 minutos.

Tudo passa por rota administrativa: `/admin/quiz/*` no servidor,
`/admin/quiz/bancada` no app.

## Os quatro passos, do ponto de vista do aluno

É assim que o percurso é anunciado no app (tela inicial, "Como Funciona"):

1. **Encontre o estande ProfDex** — a mesa do time no evento. É onde a bancada
   fica aberta o dia inteiro.
2. **Rode o quiz com perguntas sobre o curso** — uma pergunta, respondida na
   bancada com um administrador ao lado. Acertou, ganhou.
3. **Receba o QR** — no acerto, um QR de captura é sorteado da pilha do estande.
4. **Capture!** — o aluno lê o QR no scanner do app, e a prova é validada pelo
   servidor antes de a captura valer.

Do lado de dentro, esses quatro passos correspondem às quatro etapas da tela da
bancada: **matrícula → tema → questão de 60s → resultado** (ver
`AdminQuizBoothView.vue`), com a matrícula pedida a cada rodada porque quem
responde muda o tempo todo.

> ⚠️ **Divergência a resolver.** O passo 3 acima descreve o QR como **sorteado
> da pilha, podendo sair qualquer professor de qualquer tipo**. O servidor, no
> entanto, devolve em `POST /admin/quiz/answer` a lista `professores` **filtrada
> pelo tema da questão** (`professoresDoTema`), e o resto deste documento parte
> dessa premissa — inclusive a seção "Por que tema". As duas coisas não podem
> valer ao mesmo tempo: ou o QR é do tema, ou é sorteado. Enquanto a decisão de
> produto não for tomada, vale o que o operador faz na mesa — o gate é humano e
> o servidor não amarra a captura ao acerto de qualquer forma.

## Por que "tema"

Os temas do quiz **são** os tipos da roda de batalha
(`src/battle/engine/types.ts`): `logica`, `calculo`, `ia-ml`, `robotica`,
`arquitetura`, `npi`, `redes`, `banco`, `algoritmos`. Não é coincidência — quem
acerta uma questão de `banco` é mandado capturar um professor de `banco`, então
as duas listas precisam ser a mesma. A identidade visual (ícone, cor) vem de
`profdex-front/src/data/types.js`, que já era a dona desses metadados.

O banco de questões tem **20 por tema** (8 fáceis, 6 médias, 6 difíceis), em
`prisma/quiz-questions.ts`.

## Fluxo

```
GET  /api/admin/quiz/themes                 temas, nº de questões, professores
GET  /api/admin/quiz/aluno?matricula=…      nome, cooldowns em curso, histórico
POST /api/admin/quiz/start  { matricula, theme }
        → { sessionId, question: { prompt, options }, durationMs }
POST /api/admin/quiz/answer { sessionId, answerIndex? }
        → { correct, correctOption, expired, professores }
GET  /api/admin/quiz/attempts?theme=&matricula=&correct=&limit=&offset=
GET  /api/admin/quiz/stats
```

## As quatro decisões que sustentam o resto

**1. O gabarito nunca sai do servidor antes da hora.** A questão vai para o
tablet só com enunciado e alternativas. O tablet é um aparelho compartilhado,
aberto na frente de uma fila — o DevTools está a dois toques de distância.

**2. As alternativas são embaralhadas a cada aplicação.** A mesma questão
aparece várias vezes ao longo do dia; sem embaralhar, "é a segunda" resolveria
o quiz sem saber o conteúdo. O índice correto é recalculado para a ordem
exibida e guardado só na sessão em memória.

**3. O relógio que vale é o do servidor.** O cronômetro da tela é conforto
visual. Na hora de conferir, o servidor compara com a janela que ele abriu —
com **3 segundos de folga**, porque entre o clique e o request existem rede e
renderização, e marcar "tempo esgotado" por causa de 200ms de latência é
impossível de explicar para o aluno parado na bancada.

**4. A tentativa é persistida; a sessão não.** A questão em andamento vive em
memória (um restart custa refazer a pergunta). Já a tentativa vai para
`quiz_attempts` — é ela que sustenta o cooldown e o relatório. O cooldown é
lido do **banco**, justamente para sobreviver a um restart no meio do evento:
em memória, a fila descobriria que basta esperar o servidor reiniciar.

## Sorteio da questão

O aluno **nunca recebe uma questão que já respondeu naquele tema enquanto
houver inédita disponível**. O filtro é sobre todo o histórico dele no tema, não
sobre uma janela das últimas N — a versão anterior evitava só as 5 mais
recentes, e com 10 questões por tema quem passava o dia no estande reencontrava
a primeira já na 6ª tentativa.

Três regras montam o pool:

1. **Já respondidas saem.** As questões vistas vêm de um `groupBy` em
   `quiz_attempts` por `(userId, theme)`, que devolve também *quando* cada uma
   foi vista pela última vez.
2. **Questão aberta e abandonada conta como vista.** A tentativa só é gravada em
   `answer`; sem isso, o aluno que desistiu (ou o tablet que travou) reencontra
   a mesma pergunta na tentativa seguinte. O descarte fica **em memória**, num
   mapa por aluno com TTL igual ao cooldown do tema — gravar uma `QuizAttempt`
   de desistência seria mais durável, mas inflaria o relatório do painel e
   puniria o aluno com 10min de espera por uma questão que ele nem leu. O
   restart apaga os descartes, e a pior consequência é ver uma repetida.
3. **Esgotado o banco, repete a mais antiga.** Recusar a tentativa seria pior.
   As candidatas são ordenadas pela última vez que foram vistas e o sorteio cai
   no **terço mais antigo**, nunca na que o aluno acabou de responder.

A **dificuldade é sorteada antes da questão**, pelos pesos 4:3:3 do seed
(`QUIZ_DIFFICULTY_MIX`), renormalizados entre as faixas que ainda têm questão no
pool. Sortear uniformemente sobre o pool daria outra coisa: quem já respondeu as
fáceis do tema cairia num pool quase só de difíceis, e o quiz endureceria
sozinho justo para quem mais participou.

O RNG é injetado (`QUIZ_RNG`), tanto no sorteio quanto no embaralhamento das
alternativas — sem isso o comportamento acima não é testável.

## Cooldown

10 minutos por **aluno + tema**. Enquanto corre, aquele tema aparece bloqueado
na tela com o tempo restante, e `start` responde **429** com
`retryAfterSeconds` — a checagem do servidor é a que vale, a da tela é só para
o operador não tentar à toa.

Os outros 8 temas continuam liberados: o cooldown limita a repetição, não a
participação.

## Errata: quando a questão é que está errada

Toda questão tem um **código de 4 dígitos** (`quiz_questions.code`), exibido na
bancada ao lado do enunciado e repetido na tela de resultado — é lá que o aluno
descobre que discorda do gabarito. O código é **público** e sorteado: não deriva
do id nem da resposta, e mostrá-lo não entrega nada.

O fluxo tem quatro atos e três atores:

1. **Bancada.** O aluno contesta na hora. O operador abre `/admin/errata`,
   digita o código e a matrícula, e marca a questão como questionada. O servidor
   localiza a última tentativa daquele aluno naquela questão.
2. **Painel.** Um admin abre a fila de revisão, vê enunciado, alternativas e
   gabarito, corrige o que estiver errado e julga: **procedente** ou
   **improcedente**.
3. **Voucher.** Procedente emite um `capture_vouchers` para o aluno — vale um QR
   sem responder outra pergunta — e **anula a tentativa**
   (`quiz_attempts.annulled`), tirando-o do cooldown daquele tema. As duas
   coisas na mesma transação: voucher sem anulação deixaria o aluno esperando
   10min, anulação sem voucher o deixaria sem a compensação.
4. **Check.** O aluno abre o sino na ProfDex, mostra o card, e o operador dá o
   check em `/admin/errata` → Vouchers. O voucher vira `usado`, some da tela do
   aluno, e a ficha de QR é entregue na mão.

```
POST   /api/admin/errata            { code, matricula, notes? }   Admin
GET    /api/admin/errata?status=    fila de revisão (com gabarito) Admin
PATCH  /api/admin/errata/:id        { status, notes? }             Admin
PATCH  /api/admin/quiz/questions/:id  corrige enunciado/gabarito   Admin
GET    /api/vouchers/me             os do próprio aluno            Aluno
GET    /api/vouchers?matricula=     busca para o check             Admin
POST   /api/vouchers/:id/redeem     dá o check (2ª vez → 409)      Admin
```

**Corrigir o gabarito não reprocessa tentativas antigas.** A compensação é
individual e é o voucher. Reprocessar mudaria a pontuação de gente que já foi
embora do estande, e ninguém estaria lá para explicar por quê.

**Tentativa anulada some do cooldown E do relatório.** `assertForaDoCooldown`,
o cartão do aluno, `attempts()` e `stats()` filtram `annulled: false` — manter
a linha nas estatísticas distorceria a taxa de acerto com um erro que o próprio
painel já reconheceu como não sendo do aluno.

**Três campos de autoria, nunca vindos do cliente.** `openedById`,
`resolvedById` e `redeemedById` saem sempre do principal da sessão. A pergunta
depois do evento é "quem liberou isso?", e uma resposta que o cliente escolheu
não vale nada.

⚠️ **A errata mostra gabarito.** A tela vive dentro do `AdminLayout` e a bancada
(`/admin/quiz/bancada`, virada para o aluno) **não pode ganhar link para ela**.
É a mesma razão pela qual a bancada fica fora do layout do painel.

Esta é também a **primeira escrita administrativa** do painel — até aqui o
admin só lia (ver [METRICAS.md](./METRICAS.md)). O `AdminGuard` confere o papel
**no banco**, não num claim do token, então revogar um administrador vale na
hora.

## Sessão de quiz ≠ sessão do aluno

Quem está autenticado é o **administrador**. O aluno é identificado pela
matrícula digitada, e ela é pedida a cada rodada — na bancada, quem responde
muda o tempo todo, e uma "sessão do aluno" aberta seria a próxima pessoa da
fila respondendo no nome de quem saiu.

Cada tentativa grava também o `operatorId`: sem isso não há como auditar nada
depois.

Isso não contradiz "administrador só acompanha métricas". O quiz é operação
presencial de evento e **não dá poder sobre a conta do aluno**: não captura
professor por ele, não altera pontuação, não muda cadastro. O que o acerto
produz é uma instrução falada — "vá escanear aquele QR" —, e a captura continua
exigindo que o aluno vá até o marcador com o app dele.

## Métricas

Responder gera `quiz_answered` (10 pontos de engajamento, 10 interações) e,
acertando, `quiz_correct` (+25 pontos). Ambos são **registrados pelo
servidor** — estão na lista de eventos que a ingestão do app recusa, ver
[METRICAS.md](./METRICAS.md).

## Quiz Treino: dois bancos, separados de propósito

O aluno também pode praticar sozinho no celular, em `/quiz/treino`. O treino
**não pontua, não captura e não entra no cooldown** — e é justamente por isso
que ele pode devolver o gabarito junto com a pergunta, corrigindo no aparelho
sem ida ao servidor.

Isso só é seguro porque os dois bancos são **tabelas fisicamente separadas**:

| | Bancada (oficial) | Treino |
|---|---|---|
| Tabela | `quiz_questions` | `training_questions` |
| Arquivo-fonte | `prisma/quiz-questions.ts` | `prisma/training-questions.ts` |
| Seed | `npm run db:seed-quiz` | `npm run db:seed-quiz-treino` |
| Gabarito sai do servidor? | **Nunca** antes da hora | Sim, junto com a questão |
| Registra tentativa | `quiz_attempts` | Nada |
| Revisão do conteúdo | Humana, questão por questão | Por amostragem |

⚠️ **A separação é a única coisa que protege o quiz do evento.** Se uma questão
oficial saísse pela rota de treino, qualquer aluno logado baixaria o gabarito
inteiro em 9 requisições e acertaria tudo na bancada sem saber o conteúdo — que
é exatamente o que o embaralhamento das alternativas já tenta evitar.

Por isso não existe coluna `origin` numa tabela só: um `where` esquecido em
qualquer consulta futura reabriria o buraco. Com tabelas distintas, não há
questão oficial ao alcance da rota de treino para vazar.

Três testes guardam isso, e não devem ser afrouxados:

- `quiz-practice.service.spec.ts` — a rota de treino nunca toca `quizQuestion`,
  e um tema sem questões de treino dá 404 em vez de cair no banco oficial;
- `quiz.service.spec.ts` — a bancada nunca sorteia de `trainingQuestion`;
- `training-questions.spec.ts` — nenhum enunciado do banco de treino coincide
  com um do oficial (a unicidade do Prisma é por tabela, então essa colisão
  passaria em silêncio no seed).

Para ampliar o banco de treino:

```bash
ANTHROPIC_API_KEY=... npm run gen:quiz-treino               # todos os temas
ANTHROPIC_API_KEY=... npm run gen:quiz-treino -- --tema=redes --quantidade=20
```

O script (`scripts/gerar-questoes-treino.ts`) valida formato, recusa duplicatas
e escreve `prisma/training-questions.ts`. Revise por amostragem antes de semear.

## Operação

```bash
npm run db:seed-quiz            # popula/atualiza as 180 questões oficiais (idempotente)
npm run db:seed-quiz-treino     # popula/atualiza as 135 questões de treino
npm run db:set-admin -- <matricula>   # quem pode abrir a bancada
```

O seed é idempotente: o enunciado é a chave única, então rodar de novo atualiza
alternativas e dificuldade em vez de duplicar. Questão retirada do arquivo é
**desativada**, nunca apagada — apagar quebraria a foreign key das tentativas
já registradas.

Na tela, "Abrir bancada" abre em aba nova de propósito: o tablet do estande
fica nela o dia inteiro, e quem administra continua com o painel do outro lado.

## Limitações conhecidas

- **A migration do quiz nunca foi validada contra banco** — a
  `20260807020000_add_quiz` foi escrita à mão e não foi aplicada (sem Postgres
  local no ar na época). A da errata
  (`20260904000000_add_errata_and_vouchers`) **foi**: aplicada num Postgres 16
  descartável junto com todas as anteriores, com o backfill dos códigos
  conferido sobre 180 questões pré-existentes (180 códigos distintos, todos em
  1000–9999) e o `prisma migrate diff` acusando zero divergência para o schema.
  O que está coberto além disso são os testes de unidade do serviço
  (gabarito não vaza, embaralhamento, tempo esgotado, uso único da sessão,
  cooldown antes e depois da janela, matrícula inexistente) mais os do sorteio,
  que rodam com RNG fixo: nunca repetir enquanto houver inédita, repetir a mais
  antiga quando o banco esgota, não devolver a questão abandonada e respeitar a
  proporção de dificuldade.
- A sessão em andamento é de processo único, como o resto do PvP. Escalar para
  mais de uma instância exige tirá-la da memória.
- O acerto não libera tecnicamente a captura — o gate é humano, o administrador
  manda o aluno escanear. Amarrar uma coisa na outra é uma decisão de produto
  que ainda não foi tomada.
