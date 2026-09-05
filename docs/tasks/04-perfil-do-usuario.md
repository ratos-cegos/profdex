# Tarefa 4 — Ver e editar o próprio perfil

**Prioridade:** média
**Perfil:** full-stack (Nest + Vue)
**Conversa com:** 6.1 (botão "Sair" pequeno demais — o perfil é o destino natural
dele) e 1.5 (o sino de vouchers mora no mesmo cabeçalho).

---

## Contexto do projeto

ProfDex é um app web mobile-first estilo Pokédex usado numa Semana Tecnológica:
o aluno captura professores por QR e batalha com eles (PvE e PvP ranqueado).

- **Front:** `profdex-front/` — Vue 3 (`<script setup>`), Vite, Pinia, vue-router,
  axios. Estética retrô (Press Start 2P, tokens em `src/style.css`).
- **Back:** `profdex-back/` — NestJS + Prisma + PostgreSQL. **Sessão por cookie**
  (`JwtAuthGuard` lê o cookie; não há Bearer). Ver `docs/AUTENTICACAO.md`.
- **Convenções:** `.codex/CODE_STYLE.md` — controller fino, DTO validado com
  class-validator, DTO de saída com allowlist, nunca vazar campo interno.

---

## Situação atual

Não existe tela de perfil. O que há:

- `GET /auth/me` (`profdex-back/src/auth/auth.controller.ts:119`) devolve
  `{ user }` — o principal montado pela estratégia JWT.
- `profdex-front/src/stores/auth.js` guarda esse `user` em memória e expõe
  `login`, `logout`, `restoreSession`.
- O único lugar que mostra dados do aluno é o cabeçalho da
  `src/views/ProfdexView.vue`: "TREINADOR" + `auth.user?.name`, e um botão
  minúsculo "Sair".
- `profdex-back/src/users/users.service.ts` só tem `createForDevelopment` — não há
  nenhuma operação de atualização de usuário.

Dados que já existem no `User` (`profdex-back/prisma/schema.prisma`) e servem de
conteúdo para a tela: `matricula`, `name`, `email`, `role`, `battleRating`,
`battleWins/Losses/Draws`, `engagementScore`, `createdAt`.

---

## 4.1 — Backend

### Rotas novas (módulo `users`)

| Rota | O que faz |
|---|---|
| `GET /users/me` | Perfil completo: dados cadastrais + estatísticas agregadas (nº de capturas, professores distintos, total de professores, acertos/tentativas no quiz, Elo, tier, vitórias/derrotas/empates). |
| `PATCH /users/me` | Atualiza **apenas** o que o aluno pode mudar. |
| `POST /users/me/password` | Troca de senha: `{ senhaAtual, novaSenha }`. |

**O que é editável:** `name` (é o que aparece no ranking e na batalha).
**O que não é:** `matricula`, `email`, `role`, `battleRating` e qualquer contador.
Modele o DTO de entrada com allowlist explícita — `PATCH` com spread do body é o
caminho mais curto para alguém virar admin.

Regras:

- `name`: 2 a 40 caracteres, sem quebra de linha, `trim`, sem HTML. Ele é
  renderizado em ranking e mensagens de batalha; valide no servidor.
- Troca de senha: conferir `senhaAtual` com bcrypt (`@node-rs/bcrypt`, como em
  `auth.service.ts`), exigir mínimo compatível com o cadastro atual, e **aplicar
  rate limit** — já existe `profdex-back/src/auth/auth-rate-limit.service.ts`,
  reutilize em vez de escrever outro.
- Contas criadas por Google (`googleId` preenchido, `password` vazio ou
  placeholder): a tela **não** oferece troca de senha; o endpoint responde 400 com
  mensagem clara.
- Nunca retorne `password`, `googleId` ou hash. Use um `select` explícito, como
  `profdex-back/src/professors/public-professor.select.ts` faz.

### Estatísticas

Agregue no service, em paralelo (`Promise.all`):

```ts
prisma.capture.count({ where: { userId } })
prisma.capture.findMany({ where: { userId }, distinct: ['professorId'], select: { professorId: true } })
prisma.professor.count()
prisma.quizAttempt.groupBy({ by: ['correct'], where: { userId }, _count: { _all: true } })
// rating/tier: reaproveite `tierOf` de src/battle/elo.ts
```

Se a tarefa 1.3 (rankings de captura) já tiver saído, exponha aqui também a
**posição** do aluno nos três rankings — é a informação que ele mais procura.

---

## 4.2 — Frontend

### Rota

```js
{ path: '/perfil', name: 'perfil', component: () => import('../views/PerfilView.vue'), meta: { auth: true } }
```

### Como se chega lá

Substituir, no cabeçalho da `ProfdexView.vue`, o bloco "TREINADOR + nome" e o
botão "Sair" por **um botão de perfil**: avatar + nome, área de toque ≥ 44×44,
que navega para `/perfil`. O "Sair" passa a viver dentro do perfil, com
confirmação. Isso resolve 6.1 de quebra — hoje o `.logout-btn` tem `padding:
6px 14px` e `font-size: 12px`, bem abaixo do alvo mínimo de toque, e fica colado
no canto onde o polegar esbarra sem querer.

### Conteúdo da tela

1. **Cabeçalho** — avatar, nome, matrícula, tipo de conta (aluno/admin), "membro
   desde".
2. **Estatísticas** — cards com: capturas, dex (`X/Y`, com barra igual à da
   ProfDex), Elo + tier + emblema (o mapa `TIER_BADGE` está em
   `src/views/RankingView.vue` — extraia para `src/data/tiers.js` e importe nos
   dois lugares), V/D/E, acertos no quiz.
3. **Editar** — campo de nome com salvar/cancelar, estados de carregando e erro,
   e feedback de sucesso. Atualizar o `auth.user` no store depois do PATCH, senão
   o cabeçalho continua com o nome velho até o F5.
4. **Segurança** — trocar senha (escondido para conta Google).
5. **Ações** — "Sair" com confirmação; link para `/sobre` (tarefa 3) e para
   `/batalha/guia`.

### Avatar

Sem upload — não há storage de arquivos no projeto e um bucket só para isso não se
paga. Duas opções, nesta ordem:

1. **Escolher um professor já capturado como avatar** (usa
   `/professors/<slug>-cartoon.png`, que já existe). Guarde só o slug num campo
   `avatarSlug String?` do `User`, validando no servidor que o aluno realmente
   capturou aquele professor. É temático e custa uma coluna.
2. **Iniciais** em bloco colorido derivado do nome, se 1 for adiada.

---

## Critérios de aceite

- `/perfil` mostra dados e estatísticas corretos, batendo com o que o ranking diz.
- Editar o nome reflete imediatamente no cabeçalho e no próximo carregamento do
  ranking.
- Tentar alterar `matricula`, `role` ou `battleRating` via `PATCH /users/me` é
  ignorado ou rejeitado — **com teste cobrindo isso**.
- Conta Google não vê a seção de senha, e o endpoint recusa a operação.
- Senha errada em série é barrada pelo rate limit existente.
- Nenhum campo sensível na resposta (`password`, `googleId`) — teste de contrato.
- Botão de perfil com alvo de toque ≥ 44×44 px e `aria-label` adequado.

## Cuidados

- `logout()` no store dispara o evento `auth:expired`, que derruba o socket do
  lobby de batalha. Se o aluno sair no meio de um convite PvP, isso é o
  comportamento certo — não contorne.
- Nome é exibido para outros alunos (ranking, batalha). Um filtro simples de
  palavrão/caractere de controle evita constrangimento no telão do evento.
