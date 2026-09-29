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

A matrícula entra por um numpad de 0 a 9, e o servidor acha a conta pela busca
tolerante de `users/matricula.ts`: primeiro o valor exato, depois o
normalizado. Desde 2026-09-29 o cadastro só grava dígitos, então toda conta
nova é encontrável daqui. Conta antiga gravada com e-mail, ponto ou espaço
responde "não encontrada". A mensagem manda o operador pedir ao aluno que abra
o **Perfil**: é lá que ele vê a matrícula gravada e a corrige. O
`db:normalizar-matriculas` conserta de uma vez as que têm conserto (ver
[AUTENTICACAO.md](./AUTENTICACAO.md#formato-da-matrícula)).

> ✅ **Divergência resolvida (25/09/2026).** Este documento descrevia duas
> coisas incompatíveis: o QR como sorteado da pilha, e o servidor devolvendo em
> `POST /admin/quiz/answer` a lista `professores` daquele tema. Venceu o
> sorteio, que é como a captura funciona de verdade desde a tarefa 12 — quem o
> aluno leva sai no scan, a partir do que ele **já tem** (`capture-lottery.ts`).
>
> A lista saiu das duas rotas da bancada (`themes` e `answer`). Anunciar um nome
> ali era promessa que a captura não tinha como cumprir: o aluno podia ouvir
> "vá capturar o Eron" e receber outro professor. Agora a tela manda escanear o
> QR do tema, e pronto.

## Por que "tema"

Os temas do quiz **são** os tipos da roda de batalha
(`src/battle/engine/types.ts`): `humanas`, `matematica`, `ia`, `robotica`,
`arquitetura`, `engenharia-software`, `redes`, `banco`, `algoritmos`. Não é
coincidência — quem
acerta uma questão de `banco` é mandado capturar um professor de `banco`, então
as duas listas precisam ser a mesma. A identidade visual (ícone, cor) vem de
`profdex-front/src/data/types.js`, que já era a dona desses metadados.

O banco de questões tem **pelo menos 40 por tema** (16 fáceis, 12 médias, 12
difíceis), em `prisma/quiz-questions.ts` — 420 no total, porque `matematica`
tem 60 e `algoritmos`, 80, que absorveu o antigo tema Lógica.

## A resposta certa não pode ser a mais longa

Um banco de múltipla escolha escrito sem cuidado entrega a resposta pelo
tamanho: quem escreve capricha na alternativa certa e despacha as erradas em
três palavras. Foi o que aconteceu aqui — **em 51% das questões oficiais a
correta era a única mais longa** (o acaso é 25%), e em 41% ela passava de todas
as erradas por 6 caracteres ou mais. Dava para gabaritar `humanas` sem ler o
enunciado.

A regra vive em `src/quiz/option-balance.ts` e o CI a verifica nos dois bancos:

- **por questão**, a correta não pode passar da errada mais longa por mais de 8
  caracteres — menos de uma palavra curta, que ninguém mede no olho lendo
  quatro alternativas em 60 segundos;
- **no banco todo**, no máximo 15% das questões podem ter a correta
  visivelmente mais longa, e o tamanho médio da correta não pode passar de
  1,15× o dos distratores.

O conserto nunca é encurtar a resposta certa: é escrever distrator do mesmo
peso, que represente um erro plausível de quem não estudou. O gerador de treino
(`scripts/gerar-questoes-treino.ts`) pede isso no prompt e descarta a questão
que voltar fora da margem — é o vício mais comum do lote gerado por IA.

## Fluxo

```
GET    /api/admin/quiz/themes                 temas e nº de questões (sem professor)
GET    /api/admin/quiz/aluno?matricula=…      nome, cooldowns em curso, histórico
POST   /api/admin/quiz/start  { matricula, theme }
          → { sessionId, question: { prompt, options }, durationMs }
POST   /api/admin/quiz/answer { sessionId, answerIndex? }
          → { correct, correctOption, expired, cooldownMinutos, qr? }
GET    /api/admin/quiz/token/:id              o QR de tela já foi escaneado?
DELETE /api/admin/quiz/token/:id              mata o QR de tela
GET    /api/admin/quiz/attempts?theme=&matricula=&correct=&limit=&offset=
GET    /api/admin/quiz/stats
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

### A questão também não repete na fila

As três regras acima olham o histórico **do aluno**. A bancada, porém, é **uma
só**, e a fila assiste: quem está atrás lê o enunciado e as alternativas de quem
está respondendo, e podia receber a mesma questão minutos depois — respondendo
sem saber o conteúdo, que é exatamente o que o embaralhamento já tenta evitar.

Por isso existe uma **janela global**: uma questão fica fora do sorteio de
**todos** pelas últimas **K aplicações daquele tema**. K é o ajuste
`quiz.global_repeat_window` em `/admin/configuracoes` (padrão 10, de 0 a 50).

É janela por **contagem**, e não bloqueio absoluto. Bloquear de vez esgotaria um
tema de 40 questões em 40 aplicações, e daí o tema inteiro cairia no modo
"repete a mais antiga" — levando junto o filtro pessoal, que é o que realmente
protege o aluno.

A janela soma duas fontes, as mesmas do descarte pessoal:

- as últimas K linhas de `quiz_attempts` **daquele tema**, sem filtro de aluno
  (o índice `[theme, createdAt]` já cobre a consulta);
- as questões abertas e **abandonadas por qualquer aluno**, que não viram linha
  em `quiz_attempts`. O que a regra protege é o que a **fila viu**, e a fila lê
  o enunciado mesmo quando ninguém responde.

`annulled` **não** filtra aqui: a questão anulada por errata continua tendo sido
lida em voz alta na frente da fila.

**O filtro pessoal é regra; o global é preferência.** A ordem de escolha é:

1. inéditas para o aluno **e** fora da janela global — o caso comum;
2. inéditas para o aluno, mesmo dentro da janela global;
3. `maisAntigas(...)`, quando ele já viu todas do tema.

O passo 2 é o que impede a inversão: se o global eliminasse, o pool poderia
zerar e o aluno receberia justamente a questão que ele já respondeu. Um tema com
menos de K questões ativas não trava por isso.

**`K = 0` reproduz exatamente o comportamento anterior**, descarte global
incluído — é o interruptor de emergência para o banco esgotando no meio do
evento, resolvido na hora e sem deploy.

## Cooldown

**10 minutos** por **aluno + tema**, por padrão. Enquanto corre, aquele tema
aparece bloqueado na tela com o tempo restante, e `start` responde **429** com
`retryAfterSeconds` — a checagem do servidor é a que vale, a da tela é só para
o operador não tentar à toa.

Os outros 8 temas continuam liberados: o cooldown limita a repetição, não a
participação.

### É ajustável durante o evento

O valor vive em `app_settings` e é editável em **`/admin/configuracoes`**, de 1
a 120 minutos. Deixou de ser constante de código porque o número certo depende
do tamanho da fila, e isso ninguém sabe antes de abrir o estande: com fila
grande, encurtar acelera o giro; com fila pequena, alongar faz a tiragem de
fichas durar o dia.

Vale **na hora**, sem deploy nem restart — o servidor lê o valor a cada
`start`, `aluno` e `answer`, com cache de 10 segundos. Encurtar o cooldown
libera na mesma hora quem já estava esperando, porque a conta é sempre
"agora − última tentativa", nunca um prazo congelado no momento da resposta.

Sem nenhuma linha gravada, vale o padrão de 10 minutos — a tabela nasce vazia,
então uma instalação que nunca abriu a tela se comporta como antes.

## A entrega do QR tem dois modos

O ajuste `capture.qr_mode` em **`/admin/configuracoes`** escolhe como a ficha
chega ao aluno que acertou. É o primeiro ajuste **não-numérico** do painel:

| Modo | O que acontece no acerto |
|---|---|
| **`ficha`** (padrão) | Nada muda. A mesa entrega o papel sorteado da pilha, e o gate continua humano — é o comportamento histórico |
| **`tela`** | O servidor gera na hora um QR **vinculado ao aluno**, exibido na bancada. Ele escaneia ali mesmo |

A escolha é de operação — depende de quantas fichas foram impressas e de como a
fila está andando —, então não pode virar deploy. Vale em no máximo 10s, pelo
mesmo cache dos cooldowns.

**Papel já impresso continua valendo nos dois modos.** São tokens independentes
no banco, e o que está no bolso do aluno não pode virar lixo por causa de um
clique no painel.

### O QR de tela é de um aluno só

Todo token era anônimo: quem escanear primeiro leva. Isso é correto para papel
entregue na mão e **errado para um código exibido numa tela virada para a
fila** — quem fotografasse levaria.

`capture_tokens.assigned_to_id` fecha isso. Nulo é papel (anônimo); preenchido é
ficha de tela. Qualquer outra conta escaneando leva **403 `FICHA_DE_OUTRO_ALUNO`
sem consumir o token**, que continua valendo para o dono. A checagem acontece
**antes** do `updateMany` condicional — depois dele, a tentativa de quem não
podia usar a ficha já teria queimado a de quem podia. A recusa **não diz de quem
é a ficha**, pela mesma regra de vazamento das três recusas do raro.

O token nasce na **mesma transação da tentativa**: falhar ao gravá-lo não pode
deixar tentativa registrada sem QR (o aluno acertou e sai sem nada, com o
cooldown correndo) nem QR sem tentativa (ficha de graça).

**Um QR vivo por aluno.** Acertar de novo emite um novo e mata o anterior — a
mesma regra de "um aluno por vez" que `start` já aplica à sessão da questão, e é
ela que fecha o buraco do tablet que recarregou. Tocar em **PRÓXIMO ALUNO** ou
**OUTRO TEMA** também mata o QR. Sem TTL: a morte é um `DELETE`, porque uma
coluna de validade só teria dois estados e mentiria para quem lê o estoque.

**Quem não escaneou, perde.** O acerto comum não fica guardado em lugar nenhum.
No raro a perda é recuperável, e de graça: `raroPendenteDoAluno` é estado
**derivado** ("destravou tudo e não capturou"), então a pendência reaparece
sozinha no cartão do aluno.

### O sorteio continua no scan

No modo `tela` o QR sai **sem professor definido**. Antecipar o sorteio para o
acerto abriria **reroll infinito**: quem não gostasse do resultado não
escanearia, esperaria o cooldown e tentaria outro.

A consequência é a revelação: enquanto o QR está na tela, a bancada pergunta de
2 em 2 segundos se ele já foi resgatado (`GET /admin/quiz/token/:id`). Quando
for, o QR dá lugar ao professor — o modelo 3D **girando** ao lado do nome e dos
tipos. Polling e não socket: é um tablet só, a sessão do quiz já é de processo
único, e o socket de batalha é autenticado por aluno.

**O raro é a exceção**: a ficha rara grava `variantId` e **não passa pelo
sorteio**, então não há reroll para antecipar — o 3D dele aparece **junto** com o
QR, antes de qualquer scan. A arte vaza para a fila, e isso é aceito: quem a vê é
quem já está lendo `ENTREGUE A FICHA ✦ FULANO` em caixa alta, no mesmo segundo.

**Professor sem modelo 3D aparece pelo sprite dele, nunca pelo GLB de outro.**
`modeloDe()` cai no Gustavo quando falta modelo — fallback certo na tela de AR e
errado aqui, onde o 3D anuncia quem o aluno acabou de capturar. `/admin/professores`
lista quem está sem modelo, para a mesa saber o que falta antes do evento.

### Nome e matrícula grandes acima do QR

A tela do QR mostra o nome e a matrícula do aluno em destaque. É o **último
momento** em que um dígito trocado ainda é visível e o aluno está olhando a
tela. Sem diálogo de confirmação: "tem certeza?" por rodada é atrito no caminho
que sempre dá certo — e a matrícula errada agora tem conserto pelo próprio
aluno, no Perfil (ver [AUTENTICACAO.md](./AUTENTICACAO.md)).

### Contabilidade

Cada QR de tela entra numa **tiragem sintética diária**: `bancada-AAAA-MM-DD`,
`source: 'bancada'`, criada na primeira emissão do dia e incrementada a cada
ficha. Sem ela o estoque vivo de `/admin/fichas` mudaria sozinho, sem origem.

A tela separa as duas: **"última tiragem impressa"** ignora `source: 'bancada'`,
porque é ela que responde "preciso imprimir mais?", e a bancada criaria uma
tiragem nova todo dia de evento. O estoque por tipo continua somando as duas
origens.

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

## Professor raro

Um professor **raro** não sai em ficha comum e não conta para completar a
Profdex. A única via para capturá-lo é a bancada: **5 acertos em cada tema
dele**.

Os temas exigidos **são os tipos do professor** — não há coluna separada. Um
raro de dois tipos exige os 5 em **cada** um (10 acertos, e com o cooldown de
10 min isso dá ~100 minutos de bancada). É "E", não "OU": se fosse OU, marcar
dois tipos *facilitaria* o raro em vez de dificultá-lo, e o número de temas
deixaria de ser o dial de dificuldade.

A contagem é **crua e retroativa** — `quiz_attempts` com `correct: true` e
`annulled: false`, repetidas incluídas. "Seu acerto de manhã não vale" e "essa
questão já tinha caído" são regras que o operador teria de explicar de pé, na
fila, para quem acabou de acertar.

Fechados os 5, grava-se uma linha em `rare_unlocks (user_id, theme)`, que vale
**para sempre**. O destravamento é **do tema**, não do professor: retirar um
raro e cadastrar outro no mesmo tema durante o evento mantém válido o que os
alunos já conquistaram.

### Por que não existe progresso na tela

**A bancada fica virada para o aluno.** Um "4/5 rumo ao raro" na tela revelaria
para a fila inteira em que tema existe raro — e quem está atrás na fila não
precisou acertar nada para saber disso. Por isso:

- antes do gate fechado, a tela de acerto é **exatamente** a de sempre;
- com raro de dois temas, fechar o **primeiro** não mostra absolutamente nada;
- `GET /admin/quiz/themes` e `POST /admin/quiz/answer` **nunca** listam um raro
  na lista "vá capturar X", nem na tela de escolha de tema.

O único aviso é a **cena dourada** no acerto que fecha o gate: fundo inteiro,
nome do raro e a ordem em imperativo para o operador — `ENTREGUE A FICHA ✦
<NOME>`. Ela não some sozinha; fica até alguém tocar em "próximo aluno".

Consequência aceita: **o operador não tem aviso prévio**, ele descobre junto com
o aluno. A mitigação não é a bancada, é o painel — `/admin/metrics` → `Raros ✦`
mostra quem está **a um acerto** de destravar, e quem administra avisa a mesa.

Enquanto a ficha não vira captura, uma tarja `✦ ficha rara pendente — <nome>`
aparece no resultado **e no cartão do aluno**, logo depois da matrícula: quem
destravou às 10h e voltou às 15h não pode depender da memória do operador.

### O gate do resgate é do servidor

A ficha rara é **pilha própria por raro**, rotulada com o nome dele. No scan, o
servidor confere — dentro da transação da captura — se o raro está ativo, se o
aluno destravou **todos** os temas e se ele já não tem um exemplar. Nas três
recusas (`RARO_INDISPONIVEL` 404, `RARO_BLOQUEADO` 403, `RARO_JA_CAPTURADO`
409) **a ficha não é consumida** e volta a valer.

Com gate humano, uma ficha rara fotografada e mandada no grupo do WhatsApp
entregaria o raro para quem nunca respondeu nada. A recusa também **não diz
qual tema falta**: é a mesma regra de vazamento.

O gate é lido de `rare_unlocks` e **nunca recalculado** de `quiz_attempts` — uma
errata que anule uma tentativa depois não tira o raro de quem já destravou.

O **quiz de treino não conta**: ele não grava `quiz_attempts`, por construção.

## Operação

```bash
npm run db:seed-quiz            # popula/atualiza as 420 questões oficiais (idempotente)
npm run db:seed-quiz-treino     # popula/atualiza as 317 questões de treino
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
  A do QR de tela (`20260926000000_add_capture_token_assigned_to`) **também
  foi**: as 17 migrations aplicadas em sequência num Postgres 16 descartável, a
  coluna nascendo nula (todo papel já impresso continua anônimo), o índice
  `[assigned_to_id, redeemed_at]` e a FK com `ON DELETE CASCADE` conferidos no
  `\d capture_tokens`, e o `migrate diff` acusando **exatamente as mesmas duas
  divergências pré-existentes** que a base sem ela — ou seja, zero divergência
  nova. As duas herdadas (a FK de `password_reset_tokens` e o default de
  `professors.types`) são anteriores a esta tarefa e continuam em aberto.
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
  que ainda não foi tomada. **Continua valendo para a captura comum no modo
  `ficha`**; no professor **raro** o gate passou a ser do servidor (ver a seção
  acima), que confere `rare_unlocks` antes de dar baixa na ficha, e no modo
  `tela` o QR só vale para quem acertou (`assigned_to_id`).
