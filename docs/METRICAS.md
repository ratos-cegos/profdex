# Métricas de uso e painel administrativo

Como o ProfDex mede o engajamento dos alunos durante o evento, e como os
organizadores acompanham isso.

## Por que não medir como rede social

O modelo comum — contar curtidas, comentários, compartilhamentos — não serve
aqui. Uma interação neste app não é um clique: **capturar um professor exige
estar fisicamente diante do QR** e **uma batalha consome minutos dos dois
jogadores**. Contar "interações" achatando tudo faria o aluno que abriu o app 30
vezes parecer mais engajado que o que atravessou o campus e batalhou.

Por isso a régua é ponderada e o tempo entra como métrica de primeira classe.

## As três camadas

| Camada | Tabela | Papel |
|---|---|---|
| Sessão de uso | `user_sessions` | Quanto tempo, quando, por quem |
| Evento bruto | `app_events` | O que aconteceu — trilha de auditoria |
| Agregado horário | `metrics_hourly` | O que o painel lê |

**O painel nunca lê `app_events`.** Um job recalcula os agregados a cada 5
minutos; sem isso, cada abertura do painel varreria a tabela de eventos inteira
— e o painel é aberto justamente durante o evento, quando há menos folga.

### Tempo só conta com a aba visível

`user_sessions.active_ms` acumula **apenas** o tempo com a aba em primeiro
plano (`visibilitychange` no cliente). Sem essa regra, quem esquece o app aberto
a noite toda lidera qualquer métrica de tempo e o número perde o sentido.

O cliente é quem sabe se a aba está visível, então ele reporta o delta — mas o
servidor **limita o valor pelo tempo real decorrido** (com 50% de folga para
atraso de rede). Não dá para digitar um número grande e liderar o ranking.

Sessões sem sinal de vida por 3 minutos são encerradas por varredura, incluindo
as que ficaram órfãs de um restart do servidor.

## Pontuação de engajamento

| Ação | Pontos |
|---|---|
| Primeira sessão do dia | 5 |
| Minuto ativo | 1 (teto de 60/dia) |
| Professor descoberto | 20 |
| **Professor capturado** | **50** |
| Convite de batalha enviado | 5 |
| **Batalha concluída** | **80** |
| Vitória | +30 |
| Coleção completa | 200 |
| Quiz respondido na bancada | 10 |
| Quiz acertado | +25 |
| **Lendário capturado** | **200** |

Definidos em `src/metrics/engagement.ts`.

Três cuidados embutidos:

- **Teto diário no tempo** — senão deixar a aba aberta renderia mais que jogar.
- **Nada pontua duas vezes** — re-escanear o mesmo QR não gera nova captura, e
  o servidor detecta isso antes de pontuar.
- **O cliente não declara o que vale ponto** — ver a seção seguinte.

### Eventos que só o servidor registra

`POST /metrics/events` aceita o que o app mandar, e o app é código rodando no
celular do aluno. Sem uma barreira, um `fetch` no console valeria 50 pontos de
"professor capturado" sem sair da cadeira.

Por isso os eventos de valor estão em `SERVER_ONLY_EVENTS` e são **descartados
em silêncio** quando chegam pela ingestão. Eles nascem no servidor, no momento
em que o fato acontece:

| Evento | Onde é registrado |
|---|---|
| `professor_discovered`, `professor_captured`, `collection_completed` | `captures.service.ts` |
| `battle_invite_sent`, `battle_started`, `battle_finished`, `battle_won` | `battle-room.service.ts` |
| `quiz_answered`, `quiz_correct` | `quiz.service.ts` |
| `rare_unlocked` | `quiz.service.ts` (o 5º acerto no tema) |
| `rare_captured` | `captures.service.ts` (a ficha rara validada) |
| `raid_started` | `raid.service.ts` (a sala da raid nasceu) |
| `legendary_captured` | `raid.service.ts` (a raid vencida e o exemplar criado) |

O que o app ainda declara: `screen_view`, `scan_open`, `ranking_viewed`,
`guide_opened`, `quiz_practice_answered` — volume de navegação e treino, que não
pontua. Um front adulterado não consegue inflar o próprio placar.

### `quiz_practice_answered` — o Quiz Treino

Vale **0 pontos e 0 interações**, e é o único evento de quiz que o cliente pode
declarar. Os três detalhes que explicam por quê:

- **Não é `SERVER_ONLY`, ao contrário de `quiz_answered`/`quiz_correct`.** O
  treino é corrigido no próprio aparelho do aluno (o gabarito vai junto com a
  questão), então o servidor nunca saberia que houve resposta — como
  server-only, o evento simplesmente nunca seria registrado.
- **Forjá-lo não rende nada**, exatamente porque vale 0/0. `addPoints` retorna
  cedo em `points <= 0`, então `users.engagement_score` nunca é tocado.
- **Zera de propósito**: o treino é ilimitado e sem supervisão. Qualquer valor
  acima de zero faria o placar medir quem deixou o dedo no botão, e não quem
  participou do evento — a régua de `quiz_answered` foi calibrada para uma
  tentativa por tema a cada 10 minutos, com um administrador ao lado.

O treino também **não grava `quiz_attempts`** (é o que sustenta o cooldown da
bancada) e **não afeta o ranking**, que ordena por `battleRating`/`battleWins` e
nunca lê `app_events`.

⚠️ **Uma ressalva ao ler o painel:** `active_users` é
`COUNT(DISTINCT user_id) FROM app_events` **sem filtro de tipo**
(`rollup.service.ts`). Um aluno que só treina conta como ativo, mesmo somando 0
ponto e 0 interação. Isso já valia para `screen_view`, disparado em toda
navegação — o treino não muda o comportamento, só amplia quem cai nele.

### `raid_started` e `legendary_captured` — a raid

Os dois são **server-only**, e o segundo é hoje o evento mais valioso do
catálogo:

| Evento | Pontos | Interações | Rótulo |
|---|---|---|---|
| `raid_started` | **0** | 20 | Raids iniciadas |
| `legendary_captured` | **200** | 0 | Lendários capturados |

Somado aos 70 da captura inédita (`professor_discovered` 20 +
`professor_captured` 50), o lendário vale **270** — acima dos 210 do raro, e
essa ordem é deliberada: o raro custa ~50 min de bancada por tema, o lendário
exige a **Profdex inteira** antes de a primeira tentativa ser possível.

Dois detalhes que explicam os zeros:

- **Tentar vale 0 ponto, mas 20 interações.** A raid é ilimitada (com cooldown)
  e sem supervisão, então pontuar a tentativa faria o placar medir quem
  insistiu. Mas ela **é** atividade real — são minutos de batalha, como uma
  `battle_finished` —, e é o número que mostra o esforço de quem não passou.
- **`legendary_captured` não gera interação**: o gesto já foi contado pelo
  `professor_captured` (15) e pela tentativa que o produziu.

**`collection_completed` NÃO redispara** ao capturar o lendário. Aquele evento
já pagou 200 quando o aluno fechou a coleção (comuns **e** raros) — e é
justamente ela que destrava a raid. Pagar de novo contaria a mesma conquista
duas vezes.

### `rare_unlocked` e `rare_captured` — o professor raro

Os dois são **server-only**, e o segundo é o evento mais valioso do catálogo:

| Evento | Pontos | Interações | Rótulo |
|---|---|---|---|
| `rare_unlocked` | **0** | 0 | Temas destravados |
| `rare_captured` | **140** | 0 | Professores raros capturados |

**A aritmética do 140.** Uma captura comum inédita vale 70
(`professor_discovered` 20 + `professor_captured` 50). O raro grava os mesmos
dois **mais** `rare_captured`, totalizando **210 = 3×**. Cinquenta minutos de
bancada por tema é objetivamente mais engajamento do que atravessar o campus
até um QR; e, diferente da batalha, premiar aqui não desequilibra nada — o Elo
não passa por este número.

**Por que 0 no destravamento.** Os 5 acertos já foram pagos: cada um rendeu
`quiz_answered` (10) + `quiz_correct` (25). O evento existe para o painel contar
quantos chegaram lá, não para pontuar de novo.

**Por que 0 interação nos dois.** O gesto já foi contado — os 5 acertos como 5
`quiz_answered`, e a captura do raro como um `professor_captured`. É a mesma
lógica de `battle_won` e `quiz_correct`.

`rare_captured` é o alvo óbvio de quem abre o DevTools, e por isso nasce só
dentro da transação da captura, depois de o servidor conferir `rare_unlocks`.
A seção `Raros ✦` de `/admin/metrics` mostra quem capturou, `destravaram` vs
`capturaram` por raro, e quem está **a um acerto** — este último é a única
exibição de progresso de raro no sistema, e ela só existe porque o painel nunca
fica virado para aluno (ver `docs/QUIZ.md`).

## Total de interações

O número-síntese do evento: **"o app gerou N interações"**. É uma régua
diferente do `engagementScore` e de propósito — o score compara alunos entre si
e por isso tem teto; a contagem de interações mede volume de atividade, na
unidade "curtida de rede social", e a pergunta é quantas delas cada gesto aqui
equivale.

| Fonte | Interações |
|---|---|
| Tela visitada | 1 |
| Ranking / guia aberto | 1 |
| Câmera aberta | 2 |
| Convite de batalha | 2 |
| Professor descoberto | 5 |
| Batalha iniciada | 5 |
| **Turno de batalha** | **1** (PvP e raid, por jogador) |
| **10 minutos ativos** | **5** |
| **Professor capturado** | **15** |
| **Quiz respondido na bancada** | **20** |
| **Batalha concluída** | **25** (por jogador) |
| Coleção completa | 50 |

`battle_won` e `quiz_correct` valem 0 aqui: eles são gravados **junto** com o
evento de conclusão, e contar os dois faria a mesma batalha valer mais para um
lado do que para o outro. `quiz_practice_answered` vale 0 por outro motivo — é
treino livre, ver acima.

### O turno de batalha (29/09/2026)

A batalha vale 25 por lado como fato consumado, mas esse número é o mesmo para
uma luta de 4 turnos e para uma de 38 — e a diferença entre as duas é
exatamente a diferença de engajamento que o relatório precisa mostrar. Cada
turno passou a valer **1**, como uma tela visitada: é um toque e alguns
segundos de animação.

As duas fontes já existiam no banco e **nenhuma exigiu evento novo**: o PvP
grava `turns` no `metadata` do `battle_finished` (um por jogador, mantendo a
simetria do "25 para cada lado") e a raid grava em `raid_attempts.turns`
(inclusive as `anulada` — os turnos foram jogados). Sai como
`interactions_turns` no rollup.

### A bancada passou de 10 para 20 (29/09/2026)

Uma rodada de bancada custa fila, um operador e minutos do aluno — é o gesto
mais caro do evento, e valia **metade** de um professor inédito
(`professor_discovered` 5 + `professor_captured` 15 = 20). Empatar com a
captura é o mínimo defensável.

> ⚠️ Mudar um peso muda a série INTEIRA, não só daqui para a frente. O rollup
> recalcula as últimas **24h** a cada passada; o que for mais antigo que isso
> se conserta com `npm run metrics:rollup-full`. Sem um dos dois, o gráfico
> ganha um degrau no dia da mudança que não corresponde a evento nenhum.

O total é somado pelo rollup (métrica `interactions`) e o painel só lê o
agregado. Saem também `interactions_time` e `interactions_turns` sozinhas, para
a tela mostrar quanto do total veio de tempo e de turno, e não de ação — sem
isso o número seria uma caixa preta.

Duas consequências que valem saber ao ler o painel:

- **O tempo só entra quando a sessão fecha.** A parcela de tempo é atribuída à
  hora do `ended_at`, igual a `active_minutes`. Quem está com o app aberto agora
  ainda não aparece nessa fatia.
- **O número anda a cada 5 minutos**, no ritmo do rollup, não em tempo real.

## Relatório do estande (PDF)

No topo de `/admin/metrics` há um seletor de **dia** e dois botões — **PDF do
dia** e **PDF da semana** —, que abrem `GET /admin/metrics/report` numa aba:
interações, bancada (respondidas × acertadas), professores capturados, batalhas
e alunos no evento, com três gráficos e a quebra das interações. `Ctrl+P` →
"Salvar como PDF".

| Botão | Rota | Eixo X |
| --- | --- | --- |
| PDF do dia | `?date=AAAA-MM-DD` (ou `&periodo=dia`) | 7 barras, uma por hora |
| PDF da semana | `?date=AAAA-MM-DD&periodo=semana` | 7 barras, uma por dia |

A data escolhida é o **último** dia nos dois casos: a semana conta para trás a
partir dela. É o que o organizador quer no fim da feira ("a semana até hoje"),
sem ter de calcular qual foi a segunda-feira. `periodo` fora de `dia`/`semana` é
recusado com 400 — cair em silêncio no relatório do dia entregaria um papel de
um dia só, com cara de certo, a quem pediu a semana.

**A janela é das 17h à meia-noite** do dia, no fuso do evento — o horário em que
o estande funciona. Um relatório de 24h diluía a feira em dezessete horas de
campus dormindo: a taxa de acerto da bancada e o pico de batalhas só significam
alguma coisa dentro do turno em que houve gente. São 7 baldes, e todos aparecem
no gráfico mesmo vazios, porque uma hora sem registro é informação sobre o ritmo
do evento.

O recorte é fechado nos dois extremos (`gte` e `lt`). Só com `gte`, um relatório
de terça somaria o evento inteiro dali para a frente, e o número impresso
cresceria a cada dia sem ninguém notar. Sem o parâmetro `date`, o dia é **hoje
no fuso do evento** — o servidor roda em UTC, e às 22h daqui lá já é o dia
seguinte: o relatório abriria vazio justamente no fim da feira.

Os limites são `REPORT_HORA_INICIO`/`REPORT_HORA_FIM` em
`admin-metrics.service.ts`, e o fuso entra como offset fixo `-03:00` (o Brasil
aboliu o horário de verão em 2019, então não há salto a tratar).

### O consolidado da semana

> 🔑 **A semana soma o mesmo que os sete relatórios diários.** É a única coisa
> que este relatório promete, e é dela que sai todo o resto do desenho.

A semana são **sete janelas de estande** (`janelaDaSemana`), não um bloco
contínuo de sete dias. Alguém vai somar os PDFs do dia na calculadora e
comparar; se o consolidado incluísse as 17 horas mortas de cada dia, as duas
contas divergiriam e as duas perderiam a credibilidade junto. Batalha é a prova
viva disso — ela acontece do celular, a qualquer hora.

Em consequência:

- as sete faixas vão ao banco como sete (`where: { OR: [...] }`), e a leitura de
  `metrics_hourly` descarta em memória o balde que caiu fora de todas elas;
- o deslocamento entre dias é feito em **epoch** (`- 86_400_000`), nunca em
  calendário: virar o mês ou o ano não exige conta nenhuma;
- cada barra do gráfico é o turno inteiro de um dia, rotulada `29/09` em vez de
  `17h`. Sete barras em vez de 49 é o que mantém o papel legível.

**Duas exceções, e as duas são sobre público** — uma puxa o número para baixo, a
outra para cima. O rodapé do PDF avisa das duas, porque um número que não fecha
com a soma das partes, sem explicação, parece defeito:

- **"Alunos no evento" (o KPI) é menor que a soma dos sete dias.** É contagem de
  alunos **distintos** na semana: quem veio quarta e quinta é um aluno, não dois.
  Somar daria uma plateia que nunca existiu. São `UNION` (nunca `UNION ALL`) numa
  consulta só, com as sete faixas como parâmetros — ver `distinctUsersEmJanelas`.
- **A barra de "presença" é maior que a plateia.** A série é `active_users`, que
  é "alunos distintos *naquela hora*"; numa barra de DIA ela é a soma de sete
  horas, então quem ficou das 18h às 21h conta quatro vezes. É **aluno×hora**, e
  por isso o relatório da semana a chama assim em vez de "alunos ativos" —
  mantê-la com o nome de gente inflaria a plateia em três a cinco vezes num papel
  que vai para a coordenação. No relatório do DIA a barra é de uma hora só e
  "alunos ativos" está exato, então lá o nome não muda.

Quem responde "quantos alunos vieram?" é sempre o KPI do topo, nunca a barra.

O dia e a semana saem do **mesmo** `AdminMetricsService.relatorio` e do mesmo
`buildMetricsReport`, parametrizados por `escala: 'hora' | 'dia'`. Com dois
caminhos, bastava uma correção entrar num deles para o consolidado deixar de
bater com a soma dos diários.

É **HTML com `@media print`**, não PDF binário — o mesmo caminho das fichas de
QR (`captures/capture-sheet.ts`). Gerar PDF de verdade exigiria Chromium
(puppeteer) dentro da imagem Docker: centenas de MB e um processo a mais
competindo com o PvP na mesma t3.micro, para produzir o mesmo papel. Os
gráficos são **SVG inline**, sem biblioteca e sem script — um `<canvas>`
desenhado por JavaScript sai em branco em parte das impressões.

### Identidade visual

O relatório usa os tokens de `profdex-front/src/style.css` — laranja `#995200` e
dourado `#edaf68` da UniFil, superfícies escuras, `Press Start 2P` nos títulos,
raios 8/16 —, copiados como literais porque o arquivo é servido pelo **backend**
e não enxerga o CSS do front. Mudou a marca lá? Mude em `metrics-report.ts`
também; é o preço de o relatório não depender do bundle do app para imprimir.

Na tela ele é escuro, como o app. No papel **inverte** para fundo branco. Não é
abrir mão da identidade, é o que a preserva: a maioria dos navegadores descarta
o fundo ao imprimir, e um tema escuro sem essa inversão sairia como texto branco
em papel branco — ou seja, em branco. O que atravessa para o papel é o que de
fato identifica o app: fonte pixelada nos títulos, laranja da marca na régua do
cabeçalho, e **as cores das séries, idênticas às da tela**, para a legenda
impressa bater com a que foi vista.

### Dois números que estavam errados

Corrigidos junto com o relatório, em 29/09/2026:

- **Batalhas vinham dobradas.** `battle_finished` é gravado uma vez **por
  jogador**, e o card contava o evento. Passou a contar linhas de `battles`
  (`status: 'finished'`), que tem uma por batalha. O peso de interação continua
  contando os dois lados — lá a simetria é proposital.
- **O DAU perdia a bancada.** O aluno responde no tablet do **operador**, então
  o `quiz_answered` dele nasce com `sessionId: null`; se o app no bolso não
  estava em primeiro plano (a varredura encerra a sessão em 3 min, menos que a
  fila), ele não tinha linha em `user_sessions` e sumia da contagem. Agora é
  `user_sessions` **UNION** `app_events`.

## Impacto em carga

Métrica não pode competir com o PvP pelo servidor (ver
[`CARGA-PVP.md`](CARGA-PVP.md)). Por isso:

- **Nenhum request por interação.** Eventos vão para uma fila no cliente e
  sobem em lote a cada 10s.
- **Nenhuma linha por heartbeat.** O heartbeat só atualiza memória no servidor;
  o estado das sessões é descarregado em lote a cada 10s, numa única query.
- **Buffer com teto** (50 mil eventos). Se o banco cair, métrica antiga é
  descartada em vez de a memória crescer até derrubar o app.
- **Falha de métrica nunca quebra a ação.** Todos os pontos de registro são
  silenciosos em caso de erro — o aluno já escaneou o QR.

## Painel administrativo

A área `/admin` tem navegação própria e estas seções:

| Rota | O que é |
|---|---|
| `/admin/metricas` | Este documento — **somente leitura** |
| `/admin/quiz` | Tentativas do quiz de bancada (ver [QUIZ.md](./QUIZ.md)) |
| `/admin/quiz-treino` | Uso do Quiz Treino, contado à parte |
| `/admin/errata` | Contestação de questão e check de voucher — **escreve** |
| `/admin/quiz/bancada` | Quiosque do quiz, fora do layout do painel |

Em métricas, todas as rotas são `GET` e o serviço não tem nenhum método de
escrita, por desenho: ser administrador dá acesso a acompanhar números e
**nada além do que um aluno pode fazer** sobre a conta de ninguém.

A **errata é a exceção** e a primeira escrita administrativa do painel: ela
altera questões, anula tentativas e emite vouchers. O que a mantém dentro do
mesmo princípio é o escopo — nada ali toca cadastro, senha ou coleção do aluno,
e todo ato fica assinado (`openedById`, `resolvedById`, `redeemedById`,
preenchidos a partir da sessão, nunca do corpo da requisição). O `AdminGuard`
confere o papel **no banco** a cada request, então revogar um administrador
passa a valer na hora.

Mostra:

- **Total de interações** em destaque, com a quebra por fonte
- Usuários hoje / na semana, sessões, média por sessão, minutos ativos
- **Usuários logados por hora** (e outras séries: interações, capturas,
  batalhas, sessões)
- Funil: cadastrados → descobriram → capturaram → batalharam
- Retenção D1: dos que estrearam ontem, quantos voltaram
- Ranking de engajamento

### Quem é administrador

Contas com `users.role = 'admin'`, derivado do domínio do e-mail institucional
no login com Google (**`@unifil.br` = admin**, `@edu.unifil.br` = aluno — ver
[AUTENTICACAO.md](./AUTENTICACAO.md)). Também dá para ajustar por matrícula:

```bash
npm run db:set-admin                       # lista os admins atuais
npm run db:set-admin -- 202312345          # promove
npm run db:set-admin -- 202312345 --remover
```

A conta precisa entrar de novo para o app mostrar o painel: o papel viaja no
cookie de sessão (8h, ver SESSION_MAX_AGE). A **autorização**, porém, é conferida no banco a cada
request pelo `AdminGuard` — revogar um admin vale na hora.

## Endpoints

**Ingestão** (aluno autenticado; tudo sempre atribuído ao dono da sessão):

| Método | Rota |
|---|---|
| POST | `/api/metrics/session` — abre sessão, devolve `sessionId` |
| POST | `/api/metrics/session/heartbeat` — `{ sessionId, activeMs }` |
| POST | `/api/metrics/session/end` — `{ sessionId }` |
| POST | `/api/metrics/events` — lote de até 50 eventos |

**Painel** (admin, somente leitura):

| Método | Rota |
|---|---|
| GET | `/api/admin/metrics/overview` |
| GET | `/api/admin/metrics/interactions` — total e composição |
| GET | `/api/admin/metrics/series?metric=&hours=` |
| GET | `/api/admin/metrics/funnel` |
| GET | `/api/admin/metrics/engagement?limit=` |
| GET | `/api/admin/metrics/retention` |

Métricas de série disponíveis: `interactions`, `interactions_time`,
`logged_users`, `active_users`, `sessions_started`, `active_minutes` e
`event_<tipo>` (ex.: `event_professor_captured`).

## Privacidade

O sistema registra, por aluno identificado, quanto tempo usou o app e o que fez
dentro dele. Duas providências ficam **pendentes** e valem decidir antes do
evento:

1. **Aviso no primeiro acesso**, explicando o que é coletado e para quê.
2. **Política de retenção** — sugestão: apagar `app_events` com mais de 90 dias,
   mantendo apenas os agregados de `metrics_hourly`, que não identificam
   ninguém.

Nenhuma das duas está implementada.

## Validação

Executado em 07/08/2026 contra Postgres 16 e o servidor no ar:

- Migration `20260807000000_add_metrics` aplicada com sucesso.
- Batalha real → `battle_finished` para os dois jogadores, `battle_won` para o
  vencedor; placares **exatamente** conforme a tabela (110 = 80 + 30 para quem
  venceu, 80 para quem perdeu).
- Ciclo de sessão completo: abrir, heartbeat, eventos, encerrar.
- **O clamp anti-fraude funcionou**: um heartbeat declarando 65s de uso após
  milissegundos reais decorridos foi recusado, e o tempo não foi creditado.
- Tipos de evento desconhecidos são ignorados sem derrubar o lote.
- Painel recusa aluno (403) e anônimo (401).
- Sob carga (496 conexões, 260 batalhas), o rollup agregou 458 eventos de
  batalha sem atrasar o PvP — ver [`CARGA-PVP.md`](CARGA-PVP.md).

Em 08/08/2026, para o total de interações:

- Cenário controlado (2 capturas + 1 batalha + 1 tela + 1 quiz + 20min ativos)
  fechou **exatamente** o esperado: 76 interações, com a quebra por fonte
  somando o mesmo total e o recorte "hoje" idem.
- A ingestão **recusou** `professor_captured`, `quiz_correct` e
  `battle_finished` vindos do cliente autenticado, aceitando só o `screen_view`
  do mesmo lote.

## Limitações conhecidas

- O SQL dos agregados é **específico do Postgres** (`generate_series`,
  `date_trunc`, `gen_random_uuid`) — não roda em SQLite.
- O teto diário de pontos por tempo vive em memória: um restart do servidor
  zera o contador do dia. A alternativa seria uma leitura no banco a cada
  heartbeat.
- Minutos ativos são atribuídos à hora em que a sessão **fechou**, não
  repartidos proporcionalmente entre as horas que ela atravessou.
