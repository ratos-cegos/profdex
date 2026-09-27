# Tarefa 17 — QR na tela, questão que não repete na fila, e três consertos de navegação

**Prioridade:** alta — quatro dos cinco itens são defeitos que o aluno encontra
no evento; o quinto (QR na tela) muda como a captura é entregue
**Perfil:** full-stack. Uma migração pequena, o primeiro ajuste não-numérico do
painel, e CSS de navegação
**Depende de:** 🔗 **tarefa 12** (captura por tipo), 🔗 **tarefa 15** (professor
raro) e 🔗 **tarefa 16** (palco compartilhado) — as três concluídas. A 17.3
conserta uma regressão introduzida pela 16
**Origem:** entrevista de design com o Gustavo em 26/09/2026 (22 perguntas). As
decisões da tabela **Decisões de produto** estão **fechadas** — não reabrir sem
alinhar.

> ⚠️ **Uma verificação ficou pendente.** A 17.4 foi diagnosticada **só pelo
> código** — a investigação em `profdex.unifil.tech` não aconteceu porque a
> extensão do Chrome não estava conectada. O conserto proposto é o que os fatos
> do código sustentam; se depois de aplicado o incômodo for outro, é lá que se
> olha primeiro.

---

## Contexto do projeto

O ProfDex é uma "Pokédex de professores" para a semana tecnológica da UNIFIL
(1000+ alunos). O aluno responde **uma** questão de 60s num tablet no estande
(a *bancada*), e o acerto vale uma **ficha de QR** que ele escaneia com o
celular para capturar um professor sorteado no servidor.

| Frente | Arquivos principais |
|---|---|
| Bancada (quiz) | `profdex-back/src/quiz/quiz.service.ts` (879 linhas) · `profdex-front/src/views/AdminQuizBoothView.vue` (1091) |
| Captura | `profdex-back/src/captures/` (`captures.service.ts`, `capture-lottery.ts`, `capture-sheet.ts`, `admin-capture-tokens.service.ts`) |
| Ajustes de operação | `profdex-back/src/settings/` · `profdex-front/src/views/AdminConfiguracoesView.vue` |
| Conta do aluno | `profdex-back/src/auth/` · `profdex-back/src/users/` · `profdex-front/src/views/PerfilView.vue` · `stores/auth.js` |
| Arena | `profdex-front/src/components/ArenaPalco.vue` · `views/PvpArenaView.vue` · `views/ArenaView.vue` · `src/style.css` |
| Coleção | `profdex-front/src/views/ProfdexView.vue` · `views/ProfessorView.vue` · `components/BottomNav.vue` |

**Documentos que você precisa ler antes de mexer**

| Documento | Por quê |
|---|---|
| `docs/QUIZ.md` | O fluxo da bancada, o sorteio da questão, o cooldown, a errata e o gate do raro. **É o documento que esta tarefa mais altera** |
| `docs/tasks/12-captura-por-tipo.md` | Por que a ficha vale por tipo e o professor sai no scan |
| `docs/tasks/15-professores-raros.md` | O gate do raro e a regra de não vazar em que tema ele existe |
| `docs/tasks/16-arena-no-celular.md` | O palco compartilhado, que a 17.3 conserta |
| `docs/AUTENTICACAO.md` | Sessão por cookie HttpOnly, JWT com `matricula` no payload |
| `.codex/CODE_STYLE.md` | Tokens de CSS, sem valor mágico repetido, SFC grande é extraído |

---

## Decisões de produto (fechadas)

| # | Decisão | Escolha | Por quê |
|---|---|---|---|
| 1 | Não repetir questão entre alunos | **Janela por contagem**: as últimas **K = 10** aplicações do tema, configurável | Bloqueio absoluto esgota um tema de 40 questões em 40 aplicações, e aí o tema inteiro cai no modo "repete a mais antiga" — o filtro pessoal morre junto |
| 2 | Quando os dois filtros brigam | **Pessoal é regra, global é preferência** | Se o global eliminasse, o pool poderia zerar e o aluno receberia questão que ele já respondeu: o inverso do que a regra pede |
| 3 | O que conta na janela global | **Respondida e abandonada** | O que a regra protege é o que a **fila viu**, e a fila lê o enunciado mesmo quando ninguém responde |
| 4 | Onde mora o estado global | `quiz_attempts` (respondidas) + o mapa em memória que já existe (abandonadas) | Nenhuma tabela nova, e o índice `[theme, createdAt]` já cobre a consulta. Restart perde só as abandonadas — o mesmo trade-off já aceito no descarte pessoal |
| 5 | Trocar matrícula | **Autoatendimento no Perfil** | O erro é do cadastro, e quem sabe o valor certo é o dono. A unicidade impede tomar matrícula já cadastrada, então ninguém rouba conta existente |
| 6 | Quantas trocas | **Ilimitadas** | O caso legítimo é um, mas limitar custa uma tela de exceção no painel para um problema que não apareceu |
| 7 | Senha atual na troca | **Exigida** | É troca de **credencial de login** (`LoginDto` é matrícula + senha). Sem ela, um celular emprestado e desbloqueado troca o login do dono em dois toques |
| 8 | Validar formato da matrícula | **Não** | O formato varia entre cursos e anos; validar trancaria conta legítima e não é informação que este time tem fechada |
| 9 | Barra de HP do jogador | **Sobe para 8px acima da faixa**, por um token só, nas duas telas | A barra vive dentro do contexto de empilhamento do palco e nunca vence a faixa. Subir é o único conserto que não exige cirurgia de `z-index` |
| 10 | Ficha do professor | **Ganha `BottomNav`**, e a volta para a coleção para de remontar | A queixa foi sobre *navegar*: a barra sumir e voltar é o que faz a coleção parecer outra tela |
| 11 | Modo de captura | Ajuste `captureQrMode` (`ficha` \| `tela`), **global**, em `/admin/configuracoes` | O número certo depende do dia; e é o primeiro ajuste não-numérico do painel |
| 12 | Papel já impresso | **Continua valendo nos dois modos** | São tokens independentes no banco. Papel no bolso do aluno não pode virar lixo por causa de um clique no painel |
| 13 | Sorteio do professor comum | **Continua no scan** | Antecipar para o acerto abre **reroll infinito**: quem não gostou não escaneia, espera o cooldown e tenta outro |
| 14 | 3D do professor comum | **Depois do scan**, como revelação | Consequência direta da 13 — antes do scan não existe professor para mostrar |
| 15 | Raro no modo tela | Gera o QR **e mostra o 3D antes do scan** | A ficha rara grava `variantId` e **não passa pelo sorteio** (`captures.service.ts:121`): não há reroll possível |
| 16 | Arte do raro na bancada | **Vaza, e é aceito** | Quem vê o 3D é quem já estava lendo `ENTREGUE A FICHA ✦ FULANO` em caixa alta, no mesmo segundo |
| 17 | Professor sem modelo 3D | **Sprite 2D** do professor certo, nunca o GLB de outro | Existem 3 GLB e `modeloDe()` cai no Gustavo: mostrar o professor errado ao lado do QR é pior que não mostrar 3D |
| 18 | Vínculo do QR de tela | `capture_tokens.assignedToId`; qualquer outra conta leva **403** | É o que a sua frase "só pode ser executado pelo aluno que acertou" exige, e mantém a foto da tela inútil para terceiros |
| 19 | Morte do token de tela | **Trocar de aluno ou de tema**, sem TTL; e emitir um QR novo mata o anterior do mesmo aluno | Mesma regra que `start` já aplica à sessão da questão ("um aluno por vez"), fechando o buraco do tablet que recarregou |
| 20 | Não escaneou | **Perde** — no comum. No raro a perda é recuperável | `raroPendenteDoAluno` é estado **derivado** ("destravou tudo e não capturou"), então a pendência reaparece no cartão. O acerto comum não fica guardado em lugar nenhum |
| 21 | Matrícula errada na bancada | **Nome e matrícula grandes** na tela do QR; sem diálogo de confirmação | É o último momento em que o erro é visível e o aluno está olhando a tela. "Tem certeza?" por rodada é atrito no caminho que sempre dá certo |
| 22 | Como a bancada sabe do scan | **Polling de 2s** enquanto o QR está na tela | É um tablet só, a sessão do quiz já é de processo único, e o socket de batalha é autenticado por aluno — puxar a bancada para dentro dele acopla quiz a PvP sem ganho |
| 23 | Contabilidade das fichas de tela | **Tiragem sintética diária**, `source: 'bancada'`, id `bancada-AAAA-MM-DD` | `/admin/fichas` conta por tiragem; sem isso o estoque muda sozinho e a "última tiragem" fica congelada em dias atrás |

---

## 17.1 — A questão não repete na fila

**Problema.** O sorteio filtra o histórico **do aluno** naquele tema
(`quiz.service.ts:641`), mas a bancada é **uma** e a fila assiste. Quem está
atrás vê o enunciado e as alternativas do aluno da frente, e pode receber a
mesma questão minutos depois — respondendo sem saber o conteúdo, que é
exatamente o que o embaralhamento das alternativas já tenta evitar.

**O que fazer.**

1. Ajuste novo no catálogo (`settings.ts`), numérico como os dois existentes:

   ```ts
   quizGlobalRepeatWindow: {
     key: 'quiz.global_repeat_window',
     default: 10, min: 0, max: 50,
     label: 'Janela sem repetir na fila', unit: 'aplicações',
     help: 'Quantas aplicações do tema uma questão fica fora do sorteio para '
       + 'TODOS os alunos. A fila assiste quem está respondendo. 0 desliga.',
   }
   ```
   `min: 0` é o interruptor de emergência: banco esgotando no meio do evento se
   resolve zerando isso na hora, sem deploy.
2. `sortearQuestao` ganha um terceiro conjunto, a **janela global**: os
   `questionId` distintos das últimas K tentativas daquele tema, **sem filtro de
   aluno**, mais as questões abandonadas por qualquer aluno (decisão 3). O
   índice `[theme, createdAt]` de `quiz_attempts` já cobre a consulta.
3. A ordem de preferência passa a ser, e nesta ordem:
   1. inéditas para o aluno **e** fora da janela global → é daqui que sai o
      sorteio no caso comum;
   2. inéditas para o aluno, mesmo dentro da janela global;
   3. `maisAntigas(...)`, como hoje.

   O passo 2 é a decisão 2 encarnada: **o filtro pessoal nunca cede**.
4. O mapa `descartadas` ganha uma chave global ao lado da por aluno — mesma
   varredura, mesmo TTL. Uma questão aberta e abandonada sai do sorteio de todo
   mundo pelo tempo do cooldown.
5. A dificuldade continua sendo sorteada **antes** da questão, renormalizada
   entre as faixas que sobraram no pool (nada muda em
   `sortearPorDificuldade`).

**Onde mexer.** `profdex-back/src/settings/settings.ts` ·
`settings/dto/update-settings.dto.ts` · `settings/settings.service.ts` ·
`quiz/quiz.service.ts` · `profdex-front/src/views/AdminConfiguracoesView.vue`
(a tela lê faixa e ajuda do servidor, então provavelmente não precisa de
mudança)

**Critérios de aceite.**

- Duas matrículas diferentes, mesmo tema, em sequência: a segunda **não**
  recebe a questão da primeira.
- Com `K = 10`, a 11ª aplicação do tema pode devolver a questão da 1ª.
- Aluno com todas as 40 do tema respondidas **continua recebendo questão** (cai
  em `maisAntigas`), e nunca a que ele acabou de responder.
- Um tema com **menos de K questões ativas** não trava: com todas na janela, o
  sorteio cai no passo 2 e a tentativa acontece.
- `K = 0` reproduz exatamente o comportamento de hoje.
- Questão aberta e abandonada por um aluno não sai para o **próximo** da fila.

**Cuidados.**

- **Não transforme o global em eliminação.** É a inversão que a decisão 2
  proíbe, e ela é invisível em teste feliz: só aparece com o banco quase
  esgotado, no fim do dia de evento.
- A consulta é por **tema**, não global entre temas. Contar as últimas 10
  aplicações de todos os temas juntos suprimiria questão de `redes` porque
  `humanas` andou.
- `annulled` **não** filtra aqui. A questão anulada por errata continua tendo
  sido lida em voz alta na frente da fila.

---

## 17.2 — Trocar a matrícula no perfil

**Problema.** A matrícula é digitada uma vez, no cadastro, com
`MaxLength(64)` e **nenhuma validação de formato** — um dígito trocado é aceito
em silêncio. Depois disso não existe nenhuma forma de corrigir: o projeto **não
tem `users.controller`**, e `PerfilView.vue:32` apenas exibe
`auth.user?.matricula`. Quem errou aparece na bancada como "aluno não
encontrado", ou pior, como outra pessoa.

**O que fazer.**

1. `PATCH /users/me/matricula` (controller novo no módulo `users`, sob
   `JwtAuthGuard`), recebendo `{ matricula, currentPassword }`:
   - confere a senha atual com bcrypt — é troca de credencial (decisão 7);
   - `trim()` e unicidade; matrícula já cadastrada responde **409** com a mesma
     mensagem do cadastro ("Matrícula já cadastrada");
   - grava, **reassina a sessão** e reemite o cookie com
     `getSessionCookieOptions(...)`, como `AuthController.authenticate` faz —
     o JWT carrega `matricula` no payload (`auth.service.ts:76`) e sem isso o
     perfil segue mostrando o valor velho;
   - devolve `{ user }` para o `authStore` atualizar;
   - registra `{ audit: 'matricula_changed', userId, from, to }` no logger, no
     padrão de `qr_batch` e `setting_updated`. Sem tabela nova.
2. Passa pelo **rate limit** que já existe (`auth-rate-limit.service.ts`),
   chaveado por `ip:matricula`: o campo de senha atual num endpoint autenticado
   é um oráculo de senha se ficar sem contagem de tentativa.
3. No Perfil, seção **CONTA** ganha "Corrigir matrícula": mostra a atual, pede a
   nova e a senha, e avisa em texto que **o login passa a ser a nova matrícula**.
4. `authStore` ganha a ação correspondente e usa `setSession(data)`, que já
   existe.

**Onde mexer.** `profdex-back/src/users/users.controller.ts` (novo) ·
`users/users.service.ts` · `users/dto/update-matricula.dto.ts` (novo) ·
`users/users.module.ts` · `profdex-front/src/views/PerfilView.vue` ·
`stores/auth.js`

**Critérios de aceite.**

- Troca com senha certa: perfil mostra a nova matrícula **sem relogar**, e o
  login com ela funciona.
- Senha errada → 401, e a matrícula não muda.
- Matrícula de outra conta → 409, e a matrícula não muda.
- Depois da troca, a **bancada encontra o aluno pela matrícula nova** e todo o
  progresso continua: capturas, `quiz_attempts`, `rare_unlocks` e vouchers são
  todos por `userId`.
- Login com a matrícula **antiga** deixa de funcionar (é o esperado, e a tela
  avisa antes).
- Trocar não é limitado em quantidade (decisão 6).

**Cuidados.**

- **Não valide formato** (decisão 8). Uma regra nova aqui trancaria contas
  criadas com valor fora do padrão.
- O papel (`role`) vem do **domínio do e-mail** validado no ticket do Google,
  nunca da matrícula: esta rota não pode tocar `role`, e o DTO não pode ter o
  campo.
- `db:set-admin -- <matricula>` passa a mirar um valor que muda. Quem
  administrar durante o evento precisa saber disso.

---

## 17.3 — A barra de HP do jogador volta a aparecer

**Problema.** Regressão da tarefa 16. `.palco` declara `z-index: 0` e vira
**contexto de empilhamento próprio** — de propósito, para prender os lutadores
abaixo do HUD. Consequência não prevista: as barras de HP, que são `z-index: 2`
**dentro** do palco, também não conseguem passar da faixa de comandos
(`z-index: 2`, fora do palco). E as medidas põem a barra do jogador debaixo da
faixa:

```
--faixa-altura  = 10 + 44 + 8 + 56 + 8 + (88×2 + 8×2 + 40) + 12  = 370px
--palco-recuo   = 370 − 305                                      =  65px
barra do jogador = 65 + 256                                      = 321px  ← 49px DENTRO da faixa
```

No treino a sobreposição é a mesma, mas o topo da faixa é um gradiente
translúcido e a barra aparecia "por baixo do vidro". No PvP a faixa é
`background: var(--bg-card)` — opaca, com `border-top` sólido — e a barra
simplesmente desaparece.

**O que fazer.**

1. `src/style.css`: `--palco-barra-jogador: calc(var(--palco-faixa) + 8px)`
   (313px). Como o PvP sobe o palco exatamente pela diferença entre a faixa dele
   e a do treino, **o topo da faixa coincide com `palco bottom + 305px` nas
   duas telas** — um valor, dois lugares certos.
2. `ArenaView.vue`: `.arena__status--player` usa
   `calc(var(--palco-barra-jogador) - 24px)`, ou seja fica **abaixo** da barra e
   voltaria para dentro da faixa. Inverter para acima dela (`+` a altura da
   barra), ou ancorar no mesmo lugar que a barra e empilhar.
3. Atualizar o comentário de `--palco-barra-jogador` em `style.css`: ele hoje
   diz "fica dentro da faixa de propósito", que é justamente o que deixa de
   valer.

**Onde mexer.** `profdex-front/src/style.css` ·
`profdex-front/src/views/ArenaView.vue` (só o chip de status)

**Critérios de aceite.**

- PvP: a barra de HP do **jogador** aparece inteira, acima da faixa, com nome,
  ícones de tipo e número legíveis.
- Treino: idem, e o chip de status (Travado/Confuso/Queimando) continua colado
  na barra, visível.
- Sem colisão com o sprite: a barra é ancorada à esquerda (`max-width: 58%`) e o
  quadro do jogador ocupa os 42% da direita.
- Nenhum `z-index` novo, em nenhum dos dois arquivos.
- Professor caído, troca abertas e painel "Quem entra agora?": a barra não se
  mexe (a faixa tem altura travada desde a 16.4).

**Cuidados.**

- **Não resolva subindo a barra para o HUD da view.** Ela passaria a ficar *por
  cima* dos golpes, trocando um defeito por outro.
- O treino é a referência aprovada da 16, e este item **muda o enquadramento
  dele** de propósito (a barra sobe 57px). É o preço de ter uma barra só, num
  lugar só — está na decisão 9.

---

## 17.4 — A ficha do professor e a volta para a coleção

**Problema.** Três coisas somadas, todas no caminho ProfDex → ficha → ProfDex:

1. `ProfessorView.vue` **não renderiza `BottomNav`** — é a única tela alcançada
   pela navegação principal sem a barra. Ela desaparece ao entrar e volta ao
   sair, com a transição `out-in` de 180ms no meio.
2. Ao voltar, `ProfdexView` chama `store.fetch()` no `onMounted`: recarrega a
   lista inteira, mostra spinner e **a grade desaparece** por um instante.
3. A rolagem da coleção volta ao topo — o aluno perde o lugar onde estava, e
   quem estava vendo o 40º professor recomeça do 1º.

**O que fazer.**

1. `ProfessorView.vue` monta `BottomNav` no rodapé, e o `<main class="detail">`
   passa a ser `flex-direction: column` com os painéis em `flex: 1; min-height: 0`
   (ele já é assim — só entra um filho novo, que é `flex-shrink: 0`).
2. `BottomNav.vue`: `professor` entra na lista de rotas que destacam **ProfDex**,
   ao lado das de batalha que já estão lá.
3. `ProfdexView`: `store.ensureLoaded()` no lugar de `store.fetch()`. O botão de
   erro continua chamando `fetch()` — recarregar é o que "tentar de novo"
   significa.
4. Preservar a rolagem da coleção: guardar `scrollTop` do `.profdex__main` ao
   sair para a ficha e restaurar ao voltar (`onActivated`/`onMounted` com o valor
   no store da coleção, ou `history.state`). O router **não** tem
   `scrollBehavior` de propósito — o scroll não é o da janela —, então isso é
   feito na view, e não lá.
5. O "←" da ficha usa `router.back()` quando há história, caindo em
   `push({ name: 'profdex' })` para acesso direto por link.

**Onde mexer.** `profdex-front/src/views/ProfessorView.vue` ·
`components/BottomNav.vue` · `views/ProfdexView.vue` ·
`stores/professors.js` (se a rolagem ficar lá)

**Critérios de aceite.**

- A barra inferior está presente e funcional **dentro** da ficha do professor,
  com ProfDex destacado.
- Tocar em Capturar/Batalha/Perfil de dentro da ficha vai direto para a aba, sem
  passar pela coleção.
- Voltar da ficha **não** mostra spinner e **não** recarrega a lista.
- Voltar da ficha mantém a rolagem onde estava.
- As três abas da ficha (SOBRE/EXEMPLARES/GOLPES) continuam deslizando na
  horizontal, com a rolagem vertical de cada painel funcionando.
- Acesso direto a `/professor/:id` (link, F5) continua funcionando.

**Cuidados.**

- ⚠️ **Diagnóstico não confirmado em produção** (ver o aviso no topo). Se depois
  disso a barra ainda "ficar estranha", suspeite da transição `out-in` do
  `App.vue` — é a terceira hipótese, que não foi escolhida.
- A ficha perde altura útil para a barra. Conferir em celular pequeno que o
  painel EXEMPLARES com muitos exemplares continua rolando.

---

## 17.5 — O modo de captura, configurável

**Problema.** A entrega do QR passa a ter **dois modos**, e a escolha entre eles
é de operação: depende de quantas fichas foram impressas e de como a fila está
andando. Isso não pode virar deploy.

**O que fazer.**

1. `settings.ts` deixa de ser só numérico. Hoje `SettingSpec` é
   `{ default: number; min; max }` e `parseSetting` devolve `number`; o catálogo
   ganha um segundo tipo:

   ```ts
   type SettingSpec = NumberSetting | EnumSetting
   // EnumSetting: { kind: 'enum', options: readonly string[], default: string, ... }
   ```
   `AppSetting.value` já é `String` no schema — **nenhuma migração**. O que muda
   é o catálogo, `parseSetting` (valor fora das opções cai no padrão, como já
   faz com número fora da faixa), o tipo do cache em `SettingsService` e o
   `UpdateSettingsDto` (um `@IsIn` no lugar de `@Min/@Max`).
2. Ajuste novo:

   ```ts
   captureQrMode: {
     kind: 'enum', key: 'capture.qr_mode',
     options: ['ficha', 'tela'] as const, default: 'ficha',
     label: 'Entrega do QR de captura',
     help: 'ficha: a mesa entrega o papel sorteado da pilha. tela: o acerto '
       + 'gera na hora um QR vinculado ao aluno, que ele escaneia ali. '
       + 'Fichas já impressas continuam valendo nos dois modos.',
   }
   ```
3. `AdminConfiguracoesView.vue` desenha `select` quando o ajuste vem com
   `options`, e o `input[type=number]` de hoje quando vem com `min/max`. A tela
   já recebe rótulo, ajuda e faixa **do servidor** — manter isso: o formulário
   não pode discordar da validação.

**Onde mexer.** `profdex-back/src/settings/settings.ts` ·
`settings/settings.service.ts` · `settings/dto/update-settings.dto.ts` ·
`settings/admin-settings.controller.ts` ·
`profdex-front/src/views/AdminConfiguracoesView.vue`

**Critérios de aceite.**

- `/admin/configuracoes` mostra os três ajustes; o novo é um seletor de duas
  opções, com o texto de ajuda vindo do servidor.
- Trocar o modo vale **em no máximo 10s** sem deploy nem restart (o cache
  invalida na escrita, como hoje).
- Instalação sem nenhuma linha em `app_settings` se comporta como
  `ficha` — o padrão é o comportamento histórico.
- Valor inválido gravado à mão no banco cai no padrão em vez de derrubar a
  bancada.
- Os dois ajustes numéricos existentes continuam funcionando, com as mesmas
  mensagens de erro.

**Cuidados.**

- Não estenda o catálogo virando tudo `string`. Os dois ajustes de hoje são
  usados como número (`* 60_000`), e perder o tipo espalha `Number(...)` pelo
  código que lê cooldown.
- `SETTINGS` é `as const satisfies Record<string, SettingSpec>` — a união tem de
  preservar isso, senão o painel perde a checagem que impede ajuste sem rótulo.

---

## 17.6 — O QR na tela, vinculado ao aluno

**Problema.** No modo `tela`, o acerto precisa produzir um QR que **só o aluno
que acertou** consiga resgatar. Hoje todo token é anônimo: quem escanear
primeiro leva, o que é correto para papel entregue na mão e errado para um código
exibido numa tela virada para a fila.

**O que fazer.**

1. **Migração**: `capture_tokens.assigned_to_id` (nullable, FK para `users`) +
   índice `[assignedToId, redeemedAt]`. Nulo = ficha de papel, que continua
   anônima (decisão 12). Três campos opcionais no mesmo modelo agora
   (`type`, `variantId`, `assignedToId`) — o comentário do schema que explica
   "exatamente um de `type`/`variantId`" precisa ganhar a terceira linha:
   `assignedToId` é **ortogonal** aos outros dois, e vale para ficha comum e rara.
2. `QuizService.answer`, quando `captureQrMode === 'tela'` **e** o aluno acertou:
   dentro da **mesma transação** da tentativa, emite o token —
   `type: session.theme`, `assignedToId: user.id`, `batch` do dia (17.8) — e
   devolve `{ qr: { payload, professor: null } }`. O sorteio **não** acontece
   aqui (decisão 13).
   - Antes de emitir, **mata o token de tela não resgatado** daquele aluno
     (decisão 19).
3. Fechando o gate do raro no mesmo acerto, o token é o **raro**:
   `variantId` da variante única dele, `assignedToId` igual, e a resposta traz
   `raro.liberado` com `modelUrl`/`spriteFrontUrl` para a revelação (17.7). A
   rota é admin — nada disso fica ao alcance do app do aluno.
4. `POST /admin/quiz/token/:id/encerrar` (ou `DELETE`): a bancada chama ao tocar
   em **PRÓXIMO ALUNO** ou **OUTRO TEMA**. Apaga o token se ele ainda não foi
   resgatado. Chamada `void` com `.catch(() => {})` — falhar em matar não pode
   travar a tela do operador, e a trava do item 2 cobre o resto.
5. `GET /admin/quiz/token/:id` para o polling de 2s: devolve
   `{ redeemed: boolean, professor?: { name, types, modelUrl, spriteFrontUrl } }`.
6. `CapturesService.captureByToken`: depois de achar a ficha, se
   `assignedToId !== null && assignedToId !== userId`, recusa com **403**
   `FICHA_DE_OUTRO_ALUNO` e **sem consumir o token** — a mesma disciplina das
   três recusas do raro. A checagem entra **antes** do `updateMany` condicional,
   ou o token morre na tentativa de quem não podia usá-lo.
7. A tela de resultado, no modo `tela`: QR grande, **nome e matrícula do aluno em
   destaque acima dele** (decisão 21), e o texto trocado — hoje ela diz "Agora
   escaneie o QR Code", que no modo `ficha` continua certo.

**Onde mexer.** `profdex-back/prisma/schema.prisma` + migração ·
`profdex-back/src/quiz/quiz.service.ts` · `quiz/quiz.controller.ts` ·
`captures/captures.service.ts` · `captures/capture-sheet.ts` (reuso de
`generateCaptureToken` e `qrSvgDataUrl`) ·
`profdex-front/src/views/AdminQuizBoothView.vue`

**Critérios de aceite.**

- Modo `ficha`: **nada muda** em nenhuma tela nem em nenhuma rota.
- Modo `tela`, acerto: aparece um QR na bancada; a conta do aluno que acertou
  captura com ele.
- Outra conta escaneando o mesmo QR: **403**, e o token **continua válido** para
  o dono.
- Ficha de papel (`assignedToId` nulo) continua capturável por qualquer conta,
  nos dois modos.
- "PRÓXIMO ALUNO" / "OUTRO TEMA" invalida o QR: escanear depois dá o mesmo erro
  de QR inválido de sempre.
- Acertar de novo emite um QR novo e **invalida o anterior** do mesmo aluno.
- O token é emitido na **mesma transação** da tentativa: falha ao gravar o
  token não deixa tentativa registrada sem QR, nem QR sem tentativa.
- Erro (**mesmo tema sem professor ativo**): o sorteio no scan já responde
  `TIPO_SEM_PROFESSOR` sem consumir a ficha — continua valendo, e o token segue
  vivo.

**Cuidados.**

- ⚠️ **A migração do quiz nunca foi validada contra banco**
  (`20260807020000_add_quiz`, ver *Limitações conhecidas* em `docs/QUIZ.md`). A
  desta tarefa **tem de ser** — aplique num Postgres 16 descartável com todas as
  anteriores e rode `prisma migrate diff` contra o schema, como foi feito na
  migração da errata.
- **Nunca logar o token** — é ficha em texto puro (`CODE_STYLE`). O banco
  continua guardando só `sha256(token)`, inclusive no modo tela.
- Não inverta a ordem do item 6. `updateMany` com `redeemedAt: null` é o que
  decide quem chegou primeiro; checar o dono **depois** dele queima o token de
  quem tinha direito.
- O 403 **não** diz de quem é a ficha. É a mesma regra de vazamento das recusas
  do raro.

---

## 17.7 — A revelação: o 3D girando na bancada

**Problema.** O QR sozinho é um quadrado preto e branco. O momento que vale para
quem está na fila é ver **quem** saiu — e é isso que a paridade com o papel não
tinha como dar.

**O que fazer.**

1. **Comum**: enquanto o QR está na tela, a bancada pergunta de 2 em 2 segundos
   se o token foi resgatado. Quando for, o QR dá lugar ao professor: o modelo 3D
   **girando** ao lado do nome e dos tipos. O polling para ao resgatar, ao
   encerrar, e ao operador avançar.
2. **Raro**: o 3D aparece **junto** com o QR, sem esperar scan (decisão 15) — a
   cena dourada já nomeia o professor, e não há sorteio para adiantar.
3. O 3D reusa `Stage3D.vue` com rotação automática (`OrbitControls` já está lá;
   a bancada não precisa de interação — ninguém vai arrastar o tablet do
   operador). Fundo transparente ou `clearColor` da cena da bancada.
4. **Sem modelo próprio** (`modelUrl` vazio): sprite 2D do professor certo, com
   um balanço leve. **Nunca** o GLB padrão — hoje `modeloDe()` cai no Gustavo, o
   que mostraria o professor errado (decisão 17).
5. `/admin/professores` ganha um aviso de quem está **sem modelo 3D**, para a
   mesa saber o que falta antes do evento. Existem 3 GLB
   (`modelo-eron`, `modelo-gustavo`, `modelo-mario`) para um elenco maior.

**Onde mexer.** `profdex-front/src/views/AdminQuizBoothView.vue` ·
`components/Stage3D.vue` (rotação automática, se ainda não houver) ·
`data/professorArte.js` (uma função "tem modelo próprio?", para não repetir a
regra na view) · `views/AdminProfessoresView.vue`

**Critérios de aceite.**

- Comum: aluno escaneia → em até ~2s a bancada troca o QR pelo professor girando,
  com nome e tipos.
- Raro: o 3D aparece junto com o QR, antes de qualquer scan.
- Professor sem modelo: aparece o **sprite dele**, e nunca o modelo do Gustavo.
- O operador pode tocar em PRÓXIMO ALUNO a qualquer momento, inclusive durante a
  espera — e o polling para.
- O polling não continua rodando depois de sair da tela de resultado (sem
  timer órfão, como o cronômetro da questão já trata com `pararCronometro`).
- Rede caindo no meio: a tela **não** quebra; fica no QR e deixa o operador
  avançar.

**Cuidados.**

- A bancada é um tablet aberto o dia inteiro. Carregar um GLB por acerto é
  memória que acumula: descarregue a cena ao sair do resultado.
- `prefers-reduced-motion`: a rotação para, como o resto do app já respeita.

---

## 17.8 — A contabilidade das fichas de tela

**Problema.** `/admin/fichas` conta por tipo e destaca a **última tiragem**
(`qr_batches`). Token emitido pela bancada sem tiragem entraria no estoque vivo
sem origem: o número muda sozinho e a "última tiragem" fica congelada em dias
atrás, exatamente na tela que existe para decidir se é preciso imprimir mais.

**O que fazer.**

1. Tiragem sintética por dia: `batch = 'bancada-AAAA-MM-DD'`,
   `source = 'bancada'`, criada na primeira emissão do dia (upsert) e com
   `total` incrementado a cada QR.
2. `inventory()` já agrupa por tipo e por batch — a linha da bancada aparece
   sem mudança na consulta. O que muda é a apresentação: distinguir tiragem de
   **papel** de tiragem de **tela**, para "imprimir mais" ser uma decisão
   tomada com o número certo.
3. `generate`/`generateRare` **não mudam**: papel continua sendo papel.

**Onde mexer.** `profdex-back/src/captures/admin-capture-tokens.service.ts`
(leitura/apresentação) · `quiz/quiz.service.ts` (a emissão) ·
`profdex-front/src/views/AdminFichasView.vue`

**Critérios de aceite.**

- Emitir QR pela bancada cria/atualiza a tiragem do dia, com `source: 'bancada'`.
- `/admin/fichas` mostra as duas origens separadas, e o estoque vivo por tipo
  continua batendo com a soma.
- Nenhuma tiragem de papel muda de aparência ou de contagem.
- Dia sem nenhum QR de tela não cria tiragem vazia.

---

## Testes exigidos

O back testa com Jest (`*.spec.ts`); o front testa **módulos JS puros** com
`node --test` (`profdex-front/test/*.test.js`) e **não** testa componentes Vue.
O que não couber nisso vai para o checklist manual, rotulado honestamente.

| Arquivo | O que fixa |
|---|---|
| `quiz.service.spec.ts` | Dois alunos em sequência não recebem a mesma questão; o filtro pessoal **vence** o global quando os dois brigam; `K = 0` reproduz o comportamento de hoje; tema com menos de K questões não trava; abandonada sai do sorteio da fila |
| `settings.spec.ts` | Ajuste enum: valor fora das opções cai no padrão; ausência de linha dá `ficha`; os dois numéricos continuam com clamp |
| `settings.service.spec.ts` | `captureQrMode` lido e gravado, cache invalidando na escrita |
| `captures.service.spec.ts` | Ficha com `assignedToId` recusa outra conta com **403 sem consumir**; o dono captura; ficha anônima segue capturável por qualquer conta |
| `quiz.service.spec.ts` (modo tela) | Acerto no modo `tela` emite token vinculado, na mesma transação; emitir novo mata o anterior do mesmo aluno; modo `ficha` não emite nada |
| `users.service.spec.ts` / novo spec do controller | Troca de matrícula: senha errada → 401; duplicada → 409; sucesso reassina a sessão e mantém o `userId` |

### Checklist manual

**Bancada (tablet, virado para o aluno)**

- [ ] Duas matrículas seguidas, mesmo tema: questões diferentes
- [ ] Modo `ficha`: a tela de resultado está **idêntica** à de hoje
- [ ] Modo `tela`: QR aparece com nome e matrícula grandes acima dele
- [ ] Aluno escaneia: o professor aparece girando em ~2s
- [ ] Outro celular escaneando o mesmo QR: erro, e o dono ainda consegue
- [ ] PRÓXIMO ALUNO durante a espera: QR morre, polling para
- [ ] Fechar o gate do raro: cena dourada **com** o 3D do raro e o QR
- [ ] Professor sem modelo 3D: aparece o sprite dele, não o Gustavo
- [ ] Trocar o modo em `/admin/configuracoes` vale sem restart

**Celular (aluno)**

- [ ] Perfil → corrigir matrícula → perfil mostra a nova sem relogar
- [ ] Login com a matrícula nova funciona; com a antiga, não
- [ ] Bancada encontra o aluno pela matrícula nova, com o histórico intacto
- [ ] PvP: barra de HP do jogador inteira e legível
- [ ] Treino: barra do jogador e chip de status visíveis
- [ ] Ficha do professor **com** barra inferior; ProfDex destacado
- [ ] Voltar da ficha: sem spinner, sem perder a rolagem
- [ ] Ir da ficha direto para Batalha pela barra

---

## Decisões residuais (tomadas nesta redação — conteste se discordar)

1. **`assignedToId` e não uma tabela de "QR pendente"**. O vínculo é atributo do
   token, não entidade nova, e o gate no scan é uma comparação — uma tabela
   paralela obrigaria a manter duas verdades sobre a mesma ficha.
2. **O polling é da bancada, não do aluno.** Quem espera a notícia é o operador;
   o celular do aluno já sabe o resultado, porque foi ele que capturou.
3. **A morte do token é um `DELETE`, não um `expiredAt`.** Sem TTL, uma coluna de
   validade só teria dois estados (nulo ou "morreu agora") — e ela mentiria para
   quem lesse o estoque.
4. **A janela global não é configurável por tema.** Um número por tema é nove
   dials para o operador girar no meio da fila.
5. **Nada de tela nova.** Tudo cai em telas que já existem: bancada, perfil,
   configurações, fichas, professores.

---

## Fora de escopo (explicitamente)

- **Amarrar o acerto à captura no modo `ficha`.** O gate comum continua humano
  (o operador manda escanear). É a decisão de produto que `docs/QUIZ.md` lista
  como não tomada, e ela não foi tomada aqui.
- **Reexibir o QR perdido.** "Ele perde" é decisão 20; o raro é recuperável só
  porque a pendência dele já é estado derivado.
- **Validação de formato da matrícula** (decisão 8) e **limite de trocas**
  (decisão 6).
- **Troca de matrícula pelo painel.** O autoatendimento cobre; o aluno que
  perdeu a senha usa a recuperação, que aceita matrícula **ou** e-mail.
- **Layout de desktop** da bancada. Ela roda num tablet deitado.
- **Testes de componente Vue.** Infraestrutura nova no meio do evento.
- **Repadronizar a arte** e **modelar os professores que faltam** — a 17.7 só
  faz o aviso no painel dizer quem falta.
