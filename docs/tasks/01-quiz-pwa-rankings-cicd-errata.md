# Tarefa 1 — Quiz, PWA, rankings, CI/CD e sistema de errata

**Prioridade:** alta (1.4 e 1.5 são pré-requisito do evento)
**Trilhas independentes:** 1.1 · 1.2 · 1.3 · 1.4 · 1.5 — podem ir para cinco
pessoas diferentes, não há acoplamento entre elas (exceto 1.5, que encosta em 1.1).

---

## Contexto do projeto

ProfDex é um app web mobile-first, estilo Pokédex, usado numa Semana Tecnológica:
o aluno responde uma questão na bancada do estande, acerta, recebe um QR impresso
e escaneia no app para "capturar" um professor. Depois batalha com os exemplares
capturados (PvE e PvP ranqueado por Elo).

- **Front:** `profdex-front/` — Vue 3 (`<script setup>`), Vite, Pinia, vue-router,
  axios, socket.io-client, three/TresJS, `@google/model-viewer`. Estética retrô
  (fonte Press Start 2P, tokens em `src/style.css`). Deploy na Vercel.
- **Back:** `profdex-back/` — NestJS + Prisma + PostgreSQL, sessão por **cookie**
  (não Bearer), Socket.IO para o PvP. Deploy em servidor próprio
  (`back-profedex.unifil.tech`).
- **Idioma:** código e comentários em pt-BR. Comentário explica *por quê*, não
  *o quê* — siga o tom dos arquivos existentes.
- **Convenções:** `.codex/CODE_STYLE.md`. Resumo: sem `any`, early return,
  RNG/relógio injetados, controller fino, DTO de saída com allowlist, nunca
  retornar campo interno (senha, hash, token de captura, gabarito).
- **Testes:** back `npm test` (Jest, `*.spec.ts` ao lado do arquivo); front
  `npm test` (`node --test`, em `profdex-front/test/`).
- **Docs de domínio:** `docs/QUIZ.md`, `docs/BATALHA-PVP.md`, `docs/METRICAS.md`,
  `docs/BANCO.md`, `docs/AUTENTICACAO.md`.

---

## 1.1 — Aleatoriedade das questões sem repetição

### Problema

O sorteio da questão está em `profdex-back/src/quiz/quiz.service.ts`, método
privado `sortearQuestao` (~linha 405). Hoje ele:

1. busca as **últimas 5** tentativas do aluno naquele tema
   (`AVOID_LAST_QUESTIONS = 5`, em `profdex-back/src/quiz/quiz.constants.ts:34`);
2. remove essas 5 do pool;
3. sorteia uniformemente entre o resto.

O banco tem **10 questões por tema** (`profdex-back/prisma/quiz-questions.ts`,
9 temas × 10). Com 5 excluídas, o aluno cai num pool de 5 — e como o cooldown por
tema é de 10 min (`THEME_COOLDOWN_MS`), na 6ª tentativa ele já pode reencontrar a
primeira questão. Na prática, quem passa o dia no estande vê repetição rápido.

Há ainda um furo: a tentativa só é gravada em `answer()`. Se o operador chamar
`start()` de novo (aluno desistiu, tablet travou), a questão anterior **não conta
como vista** — e pode sair de novo imediatamente.

### O que fazer

1. **Excluir tudo que o aluno já respondeu naquele tema**, não só as últimas 5.
   Buscar os `questionId` distintos de `QuizAttempt` para `(userId, theme)` e
   montar o pool com o complemento.
2. **Fallback quando esgotar:** se o aluno já viu todas as questões do tema, não
   recusar a tentativa (o comportamento atual de repetir é o certo), mas repetir
   **a menos recente** — ordenar as candidatas pela data da última tentativa
   ascendente e sortear dentro do terço mais antigo, nunca incluindo a última
   questão respondida.
3. **Contabilizar a questão exibida, mesmo sem resposta.** Ao abrir uma nova
   sessão para um aluno que já tinha uma aberta (o `for` que limpa
   `this.sessions` em `start()`), registrar o `questionId` descartado num
   conjunto em memória por usuário — ou, mais simples e durável, gravar a
   tentativa com `answerIndex: null` e `correct: false` já no descarte. **Decida e
   comente a escolha**: gravar tentativa mexe no relatório e no cooldown; o
   conjunto em memória some no restart. A recomendação é o conjunto em memória,
   com TTL igual a `THEME_COOLDOWN_MS`.
4. **Injetar o RNG.** Trocar `Math.random()` direto por uma dependência
   (`private readonly rng: () => number = Math.random`) para o teste conseguir
   fixar o sorteio. Vale para `sortearQuestao` e para `embaralhar` (~linha 493).
5. **Manter proporção de dificuldade.** O seed é 4 fáceis / 3 médias / 3 difíceis
   por tema. Ao filtrar as já vistas, o pool pode ficar só com difíceis. Sortear
   primeiro a dificuldade (respeitando a proporção do que sobrou) e depois a
   questão dentro dela.
6. **Ampliar o banco** de 10 para pelo menos 20 questões por tema. Ver tarefa 8.1
   — a geração com IA pode produzir as duas coisas de uma vez, mas as do evento
   **têm de ser revisadas por humano** antes de entrar.

### Onde mexer

- `profdex-back/src/quiz/quiz.service.ts` — `sortearQuestao`, `start`, construtor.
- `profdex-back/src/quiz/quiz.constants.ts` — `AVOID_LAST_QUESTIONS` provavelmente
  deixa de existir; se sumir, remover a constante e o comentário.
- `profdex-back/src/quiz/quiz.service.spec.ts` — novos casos.
- `profdex-back/prisma/quiz-questions.ts` — questões novas.
- `docs/QUIZ.md` — atualizar a seção de sorteio.

### Critérios de aceite

- Aluno com N tentativas no tema nunca recebe uma questão já respondida enquanto
  houver inédita disponível — teste com RNG fixo cobrindo isso.
- Aluno que respondeu todas as 20 do tema recebe a mais antiga primeiro, e nunca
  a que acabou de responder.
- Abrir uma questão e abandoná-la não faz ela reaparecer na tentativa seguinte.
- `npm test` no back verde; sem `any` novo.

### Cuidados

- O gabarito **nunca** pode sair do servidor junto com a questão (é o motivo do
  `correctIndex` viver só na sessão em memória). Não regrida isso ao refatorar.
- `QuizAttempt` é a base do cooldown **e** do relatório do painel. Qualquer linha
  extra que você gravar aparece em `/admin/quiz` — se gravar descartes, filtre-os
  na consulta de `attempts()`.

---

## 1.2 — PWA instalável

### Problema

O app não é instalável. `profdex-front/index.html` tem `theme-color`,
`mobile-web-app-capable` e `apple-mobile-web-app-*`, mas **não há manifest, nem
service worker, nem ícones de instalação** — só `public/favicon.ico`. Os ícones em
`public/icons/` são da barra de navegação, não do app.

Instalável importa aqui por três motivos: o aluno usa o app andando pelo campus
(atalho na home tela evita re-login e a barra do navegador), a câmera ocupa a tela
inteira (modo standalone ganha área útil) e a rede do evento é ruim (shell em
cache abre offline).

### O que fazer

1. Adicionar `vite-plugin-pwa` como devDependency e configurar em
   `profdex-front/vite.config.js` com `registerType: 'prompt'`.
2. **Manifest**: `name: "ProfDex"`, `short_name: "ProfDex"`,
   `start_url: "/profdex"`, `scope: "/"`, `display: "standalone"`,
   `orientation: "portrait"`, `background_color` e `theme_color` alinhados aos
   tokens (`#CC0000` já está no `index.html`; conferir com `--unifil-orange` em
   `src/style.css` e usar **um** valor). `lang: "pt-BR"`, `categories: ["education","games"]`.
3. **Ícones**: gerar 192×192, 512×512 e uma variante `maskable` (com margem de
   segurança de 20%) a partir da arte da eagle-ball (`public/eagle-ball.png`) com
   a marca UNIFIL — coordenar com a tarefa 7.3. Adicionar `apple-touch-icon`
   180×180 no `index.html`: **o iOS ignora os ícones do manifest**.
4. **Service worker (Workbox)**:
   - precache **apenas** o shell (HTML, JS, CSS, ícones);
   - `globIgnores` para `**/models/**` e `**/*.glb` — os modelos 3D pesam 27 MB,
     27 MB e 74 MB (`profdex-front/public/models/`); precachear isso destrói o
     armazenamento do celular e trava a instalação;
   - `maximumFileSizeToCacheInBytes` em ~3 MB como rede de segurança;
   - runtime caching: `NetworkOnly` para `/api/**` e `**/socket.io/**`
     (sessão por cookie + WebSocket não podem passar por cache),
     `CacheFirst` com expiração para `/professors/*.png` e `/icons/*.png`.
5. **Atualização**: com `registerType: 'prompt'`, mostrar um aviso discreto
   ("Nova versão disponível — atualizar") em vez de recarregar sozinho. Recarga
   automática no meio de uma batalha PvP derruba a partida.
6. **Botão de instalar**: capturar `beforeinstallprompt`, guardar o evento e
   expor um botão na landing (`/sobre`, tarefa 3) e/ou no perfil (tarefa 4). Para
   iOS, que não dispara o evento, mostrar instrução textual ("Compartilhar →
   Adicionar à Tela de Início").
7. Conferir `profdex-front/vercel.json`: o rewrite `/(.*) → /index.html` não pode
   engolir `/manifest.webmanifest`, `/sw.js` e `/registerSW.js`. Arquivos
   estáticos existentes têm precedência na Vercel, mas **teste em preview** e, se
   necessário, declare exceções antes do catch-all.

### Onde mexer

- `profdex-front/vite.config.js`, `profdex-front/index.html`,
  `profdex-front/package.json`, `profdex-front/public/icons/`,
  `profdex-front/vercel.json`.

### Critérios de aceite

- Lighthouse → categoria "Installable" sem erros, no build de produção.
- Android/Chrome oferece "Instalar app"; instalado, abre em standalone na
  `/profdex` e mantém a sessão (cookie).
- iOS/Safari: "Adicionar à Tela de Início" usa o ícone certo e abre sem a barra.
- Cortando a rede depois de uma visita, o shell abre e mostra o estado de erro
  já existente ("SEM CONEXÃO") em vez de página em branco do navegador.
- Nenhuma resposta de `/api` servida do cache (checar no DevTools → Application).

### Cuidados

- Contexto seguro: câmera e AR já exigem HTTPS, então o SW não muda nada em
  produção; em dev use `HTTPS=1` (ver comentário no `vite.config.js`).
- Não coloque o `start_url` em `/` — quem já tem sessão é redirecionado, e a
  Vercel serviria uma navegação a mais em cada abertura.

---

## 1.3 — Ranking de capturas (abas no `/ranking`)

### Problema

Existe um ranking só, o de Elo de PvP: `profdex-back/src/battle/rankings.service.ts`
(`battleLeaderboard`, paginado, com a posição do próprio jogador) exposto em
`rankings.controller.ts` como `GET /rankings/battle`, e consumido por
`profdex-front/src/views/RankingView.vue`. Quem captura muito não aparece em lugar
nenhum.

### O que fazer

**Backend** — dois leaderboards novos, no mesmo formato do de batalha (mesma
`PAGE_SIZE = 25`, mesmo objeto `me` com posição própria, mesmo desempate estável):

- `GET /rankings/captures` — nº total de exemplares resgatados por aluno
  (`count` em `Capture` agrupado por `userId`). Desempate: quem chegou lá
  primeiro (data da captura mais recente ascendente).
- `GET /rankings/dex` — nº de **professores distintos** capturados, com o
  percentual da dex (`distinct professorId` / total de professores).

Implementar com `prisma.capture.groupBy({ by: ['userId'] })` + um `findMany` de
`User` para os nomes, ou uma query raw se a paginação por agregado ficar cara.
Filtrar quem tem zero (mesmo espírito do `PLAYED` do ladder de batalha: cadastro
não é ranking). O índice `@@index([userId, professorId])` de `Capture` já cobre a
agregação.

**Frontend** — `RankingView.vue` ganha um seletor de três abas (ELO · CAPTURAS ·
DEX) e troca a fonte de dados conforme a aba. Reaproveitar
`components/PointsLeaderboard.vue` (já recebe `users`, `unidade`,
`mostrar-cabecalho`) mudando só `unidade` ("ELO" / "capturas" / "% da dex") e o
campo `detalhe`. Manter o rodapé fixo com a posição do próprio aluno.

Atenção: `components/TopTabs.vue` é a navegação **externa** (Batalha ↔ Ranking).
As abas novas são internas da tela de ranking — não misture as duas, ou vira
quatro níveis de navegação. Ver a proposta de arquitetura de informação em 6.7.

### Critérios de aceite

- As três abas carregam, paginam ("CARREGAR MAIS") e destacam o próprio aluno.
- Aluno sem captura vê "você ainda não capturou ninguém" no lugar da posição.
- Trocar de aba não perde a posição de rolagem nem dispara requisição duplicada.
- Testes de unidade do service novo (posição, desempate, aluno fora do ranking).

---

## 1.4 — CI/CD do front e do back

### Situação atual

- **Front:** Vercel. `profdex-front/vercel.json` faz rewrite de `/api/(.*)` para
  `https://back-profedex.unifil.tech/api/$1` e serve a SPA no resto.
- **Back:** servidor próprio na AWS. A branch **`back-deploy`** (não mergeada) já
  tem tudo para rodar em container:
  - `profdex-back/Dockerfile` — multi-stage node:20-bookworm-slim, `prisma generate`,
    `npm run build`, copia `src/`, `scripts/` e `tsconfig.json` para o runtime
    (o seed roda via ts-node e importa de `src/`);
  - `profdex-back/docker-compose.prod.yml` — API + Postgres + nginx, com TLS por
    Origin Certificate do Cloudflare (modo Full Strict), Postgres exposto só em
    `127.0.0.1`;
  - `profdex-back/docker-entrypoint.sh` — `prisma migrate deploy` antes de subir;
  - `profdex-back/.dockerignore`.
  Hoje o deploy é **manual**: entrar na instância e rodar
  `docker compose -f docker-compose.prod.yml up -d --build`.
- **Não há `.github/workflows/`** — nada de lint/teste automático em PR.
- **Railway saiu.** `docs/HANDOFF-DEPLOY-RAILWAY-VERCEL.md` está obsoleto, e há
  comentários citando Railway em `profdex-front/vite.config.js` (bloco do
  `DEV_API_PROXY_TARGET`) e em `profdex-front/src/router/index.js:8`.

### O que fazer

**Passo 0 — consolidar a branch.** Mergear `back-deploy` na `main` (ou trazer os
cinco arquivos de infra). Nada abaixo funciona sem eles versionados na `main`.

**Passo 1 — `.github/workflows/ci.yml`** (em todo PR e push para `main`):

- job `front`: Node 22 · `npm ci` em `profdex-front` · `npx oxlint .` e
  `npx eslint .` **sem `--fix`** (os scripts atuais têm `--fix`, que mascara
  problema no CI — crie `lint:ci` sem ele) · `npm test` · `npm run build`.
- job `back`: Node 22 · `npm ci` em `profdex-back` · `npx prisma generate` ·
  `npx prisma validate` · `npm run lint` (idem, versão sem `--fix`) ·
  `npm test` · `npm run build`.
- cache de `~/.npm` por `package-lock.json`.
- Ligar **branch protection** na `main` exigindo os dois jobs verdes.

**Passo 2 — `.github/workflows/deploy-back.yml`** (push na `main` tocando
`profdex-back/**`, mais `workflow_dispatch`):

1. roda o job `back` do CI (ou `needs:` do workflow de CI);
2. conecta por SSH na instância (`appleboy/ssh-action` ou `ssh` puro com chave em
   secret);
3. `git fetch --all && git reset --hard origin/main` no checkout do servidor;
4. `docker compose -f docker-compose.prod.yml up -d --build`;
5. `docker image prune -f`;
6. **smoke test**: `curl -fsS https://back-profedex.unifil.tech/api/professors`
   deve responder **401** (rota existe e está protegida). Falhou → job vermelho.

Alternativa mais robusta, se a instância for pequena: buildar a imagem **no
Actions**, publicar no GHCR (`ghcr.io/<org>/profdex-back:<sha>`) e o servidor só
dar `docker compose pull && up -d`. Evita compilar na produção (o build do Nest +
Prisma consome RAM e pode derrubar a API durante o deploy numa t3.micro).

**Passo 3 — front.** Manter o deploy nativo da Vercel (integração Git). Não
duplique com `vercel deploy` no Actions — só exija o CI verde antes do merge.
Confirmar que `VITE_API_URL` **não** está definida na Vercel: o app deve usar o
caminho relativo `/api` e o rewrite do `vercel.json`, senão o cookie de sessão
vira cross-site e toda rota autenticada volta 401 (ver
`profdex-front/src/services/api-base-url.js` e `docs/AUTENTICACAO.md`).

**Passo 4 — limpeza.**

- Substituir `docs/HANDOFF-DEPLOY-RAILWAY-VERCEL.md` por `docs/DEPLOY.md`
  descrevendo Vercel + AWS: variáveis de ambiente, certificados, como rodar
  migration, como restaurar backup, como ver logs.
- Remover as menções a Railway nos comentários do front (`vite.config.js`,
  `src/router/index.js`).
- `profdex-front/.vite/deps/` está **versionado** no Git (cache do Vite,
  ~10 arquivos). Adicionar ao `.gitignore` e remover do índice.
- Remover arquivos mortos: `profdex-front/src/components/ProfCard (1).vue`
  (cópia do `ProfCard.vue`) e `profdex-front/src/stores/counter.js` (scaffold do
  Vite). Conferir que ninguém importa antes.

### Critérios de aceite

- PR aberto roda os dois jobs e falha se lint/teste/build quebrar.
- Merge na `main` publica o back sozinho e o smoke test confirma o 401.
- Nenhum segredo no repositório: `SSH_HOST`, `SSH_USER`, `SSH_KEY` (e, se usar
  GHCR, `GHCR_TOKEN`) em GitHub Secrets. As credenciais de banco continuam só no
  `.env` do servidor.
- `grep -ri railway` no repositório não retorna nada além do histórico do Git.

### Cuidados

- `docker-entrypoint.sh` roda `prisma migrate deploy` a cada boot. Com um
  container só isso é seguro; se um dia houver réplica, migração concorrente
  quebra. Deixe registrado no `docs/DEPLOY.md`.
- Deploy durante o evento derruba as batalhas PvP em andamento (estado do
  Socket.IO é em memória — ver `docs/BATALHA-PVP.md`). Combine janela de deploy,
  ou pelo menos avise na tela.

---

## 1.5 — Sistema de errata (código de 4 dígitos + voucher)

> Maior item deste arquivo. Vale quebrar em duas entregas:
> **(a)** dados + telas de admin; **(b)** notificação e resgate do voucher.

### O fluxo decidido

1. Toda questão tem um **código de 4 dígitos** visível na bancada (ex.: `#4821`).
2. O aluno contesta a questão na hora. O operador abre a **tela de errata** (só
   admin), digita o código e a matrícula do aluno, e marca a questão como
   **questionada**.
3. Na mesma tela existe a visão de **revisão**: a lista das questões questionadas,
   com enunciado, alternativas e gabarito, onde o admin corrige o que estiver
   errado.
4. Se a errata for **procedente**, o aluno ganha um **voucher**: vale um QR sem
   precisar responder outra pergunta.
5. O aluno vê o voucher num **dropdown de notificação na tela da ProfDex**. Ele
   abre, mostra para um operador.
6. O operador **dá check no voucher** na tela de errata. O voucher é marcado como
   usado, some da tela do aluno, e o operador entrega a ficha de QR — que o aluno
   escaneia pelo scanner normal.

### Modelo de dados (Prisma)

Em `profdex-back/prisma/schema.prisma`, mais uma migration em
`profdex-back/prisma/migrations/`:

```prisma
model QuizQuestion {
  // ... campos atuais
  code String @unique   // 4 dígitos, "1000".."9999"
}

// Uma contestação. Nasce na bancada, morre no painel.
model QuizErratum {
  id          String    @id @default(uuid())
  questionId  String    @map("question_id")
  studentId   String    @map("student_id")   // aluno que respondeu
  attemptId   String?   @map("attempt_id")   // tentativa, quando localizável
  openedById  String    @map("opened_by_id") // admin/operador que abriu
  status      String    @default("aberta")   // aberta | procedente | improcedente
  notes       String?
  resolvedById String?  @map("resolved_by_id")
  resolvedAt  DateTime? @map("resolved_at")
  createdAt   DateTime  @default(now()) @map("created_at")

  @@index([status, createdAt])
  @@index([questionId])
  @@map("quiz_errata")
}

// Vale um QR sem responder pergunta. Emitido por errata procedente.
model CaptureVoucher {
  id           String    @id @default(uuid())
  userId       String    @map("user_id")
  erratumId    String?   @map("erratum_id")
  theme        String?                       // tema da questão contestada
  reason       String    @default("errata")
  status       String    @default("disponivel") // disponivel | usado | cancelado
  issuedById   String    @map("issued_by_id")
  redeemedById String?   @map("redeemed_by_id")
  redeemedAt   DateTime? @map("redeemed_at")
  createdAt    DateTime  @default(now()) @map("created_at")

  @@index([userId, status])
  @@map("capture_vouchers")
}
```

Adicionar as relações inversas em `User` e `QuizQuestion`.

**Geração do código de 4 dígitos:** sortear entre 1000 e 9999, garantindo unicidade
(retry no erro P2002 do Prisma, ou pré-sortear uma permutação no seed). São 9000
códigos para um banco de ~180 questões — folga suficiente. Backfill das existentes
na própria migration ou num script `profdex-back/scripts/backfill-question-codes.js`.
O código **é público** (aparece na tela do aluno) e não revela nada: não derive do
id nem do gabarito.

### Backend

Novo módulo `profdex-back/src/errata/` (ou dentro de `quiz/`, decida pela coesão —
o `QuizService` já tem 535 linhas, o `CODE_STYLE` recomenda até 300 por módulo de
domínio; separar é o caminho):

| Rota | Guard | O que faz |
|---|---|---|
| `POST /errata` | Admin | Abre a contestação. Body: `{ code, matricula, notes? }`. Resolve a questão pelo código e o aluno pela matrícula; localiza a última tentativa daquele aluno naquela questão. |
| `GET /errata?status=aberta` | Admin | Lista para revisão, com enunciado, alternativas, gabarito, aluno e data. |
| `PATCH /errata/:id` | Admin | Resolve: `{ status: 'procedente' \| 'improcedente', notes? }`. Se procedente, emite o voucher **na mesma transação**. |
| `PATCH /quiz/questions/:id` | Admin | Corrige enunciado, alternativas e gabarito; permite `active: false`. |
| `GET /vouchers/me` | Aluno | Vouchers `disponivel` do próprio usuário. |
| `GET /vouchers?matricula=` | Admin | Busca vouchers de um aluno para dar o check. |
| `POST /vouchers/:id/redeem` | Admin | Marca `usado`, grava `redeemedById` e `redeemedAt`. Idempotente: resgatar duas vezes retorna 409, não cria efeito duplo. |

Regras que **precisam** estar no service, não na tela:

- Só admin abre, revisa e resolve errata. O aluno lê **apenas os próprios**
  vouchers (nunca aceite `userId` vindo do cliente — use o principal da sessão).
- Errata procedente também deve **limpar o cooldown** daquele aluno naquele tema:
  a tentativa foi consumida por uma questão errada. Como o cooldown é derivado da
  última `QuizAttempt` (`assertForaDoCooldown`, `quiz.service.ts:380`), marque a
  tentativa (campo `annulled Boolean @default(false)` em `QuizAttempt`) e ignore
  as anuladas na consulta do cooldown **e** nas estatísticas do painel.
- Corrigir o gabarito de uma questão **não** reprocessa tentativas antigas
  automaticamente — o voucher é a compensação, e é individual. Deixe isso escrito
  em `docs/QUIZ.md`.

### Frontend — admin

Nova rota filha em `profdex-front/src/router/index.js`, dentro do bloco `/admin`
(que já tem `metricas` e `quiz`), com `meta: { auth: true, admin: true }`:

```
/admin/errata → views/AdminErrataView.vue
```

Três seções na mesma tela (segmented control), no estilo de
`views/AdminQuizAttemptsView.vue`:

1. **Abrir** — dois campos (código de 4 dígitos, matrícula), preview da questão e
   da resposta do aluno, botão "Marcar como questionada".
2. **Revisar** — lista das abertas; ao expandir, edita alternativas/gabarito e
   decide procedente/improcedente.
3. **Vouchers** — busca por matrícula ou lista de pendentes, com o botão de check.

> ⚠️ **A bancada não pode virar tela de errata.** `/admin/quiz/bancada`
> (`AdminQuizBoothView.vue`) fica **fora** do `AdminLayout` de propósito: a tela é
> virada para o aluno. A errata mostra gabarito — ela vive dentro do
> `AdminLayout` e não pode ter link a partir da bancada. Ver o comentário em
> `src/router/index.js:135`.

### Frontend — aluno

No cabeçalho de `profdex-front/src/views/ProfdexView.vue`, um ícone de
notificação (sino, em pixel art para casar com `public/icons/`) com badge de
contagem. Clicando, abre um dropdown/bottom-sheet listando os vouchers
disponíveis; cada card mostra um código grande, o motivo ("Errata da questão
#4821") e a instrução "Mostre esta tela a um operador do estande".

- Buscar em `onMounted` e revalidar ao voltar o foco da aba
  (`visibilitychange`) — assim o voucher some logo depois do check do operador.
  Não faça polling curto: são centenas de celulares na mesma rede.
- Criar `profdex-front/src/stores/vouchers.js` no padrão dos stores existentes
  (`captures.js` é bom modelo: `fetch`, `ensureLoaded`, uma requisição em voo).
- Esse cabeçalho também é alvo das tarefas 4 (perfil) e 6.1 (botão sair). Se as
  três forem feitas juntas, o cabeçalho vira: avatar/nome → perfil, sino →
  vouchers, e o "Sair" sai de lá.

### Critérios de aceite

- Toda questão tem código único de 4 dígitos, exibido na bancada e no resultado.
- Operador abre errata por código + matrícula; a questão aparece com a resposta
  daquele aluno.
- Admin marca procedente → aluno recebe voucher; marca improcedente → não recebe.
- Voucher aparece no sino da ProfDex em até um refresh de foco.
- Operador dá check → voucher some da tela do aluno e não pode ser resgatado de
  novo (segundo resgate → 409).
- Errata procedente libera o aluno do cooldown daquele tema.
- Aluno não consegue ler voucher de outro aluno nem abrir errata (403 do
  `AdminGuard`, testado).
- Testes de service cobrindo: emissão, resgate idempotente, isolamento por
  usuário, anulação de tentativa.

### Cuidados

- **Auditoria**: `openedById`, `resolvedById` e `redeemedById` existem para
  responder "quem liberou isso?" depois do evento. Nunca os preencha a partir do
  corpo da requisição.
- O painel é de **leitura** hoje (ver `docs/METRICAS.md`); a errata é a primeira
  escrita administrativa. Registre isso no doc e confirme que o `AdminGuard`
  confere o papel **no banco**, não no token.
- Fila da bancada é o gargalo real: a tela de check tem de resolver em dois
  toques. Priorize buscar por matrícula com teclado numérico
  (`inputmode="numeric"`) e botão grande.
