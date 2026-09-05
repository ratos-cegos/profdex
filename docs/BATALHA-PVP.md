# Batalha PvP ranqueada — planejamento e implementação

Criado em **02/08/2026**. Feature para a semana tecnológica (1000+ alunos).

> **Status: IMPLEMENTADO** (todas as 5 fases). Como validar:
>
> - Unit: `npm test` em `profdex-back` (91 testes — presença, convites,
>   cooldown, motor portado, salas, Elo, shutdown).
> - Integração: com o backend de dev no ar, `npm run pvp:smoke` em
>   `profdex-back` percorre pela rede o fluxo inteiro — registro → lobby →
>   convite → aceite → pick às cegas → turnos até nocaute → Elo → ranking →
>   cooldown bloqueando rematch.
> - Manual: dois navegadores/celulares logados → aba Batalha → Desafiar.
>
> Mapa do código: back em `profdex-back/src/battle/` (gateway Socket.IO,
> `presence/invite/cooldown/battle-room/rating/rankings`, regras de time em
> `team.ts` + motor portado em `engine/`); front em `stores/battle.js`,
> `views/BatalhaView.vue` (lobby + tabs), `views/PvpPickView.vue` e
> `views/PvpArenaView.vue`.
>
> **Atualização de 05/09/2026:** o formato passou a ser **time de até 3
> exemplares**, com troca no turno e team preview. Ver "Batalha em time".
>
> Notas de operação:
> - Deploy/restart **anula** batalhas ativas (`annulled`, sem pontos, sem
>   cooldown) via shutdown hook — preferir janelas calmas mesmo assim.
> - Auditoria: cada fim de batalha loga uma linha JSON `audit: battle_end`
>   com dupla, status, turnos e deltas.
> - A sessão (cookie) dura 15 min — batalha mais longa que isso perde o
>   reconnect após F5 (limitação pré-existente do auth, não do PvP).

## Decisões já tomadas (com o Gustavo)

| Decisão | Escolha |
|---|---|
| Cooldown anti win-trading | **12h por dupla** — cada par de jogadores tem 1 batalha ranqueada a cada 12h |
| Presença | **Todos os usuários logados e conectados aparecem online**, sem filtro de rede |
| Autoridade da batalha | **Servidor autoritativo** — o motor roda no backend; o cliente só envia intenções e renderiza eventos |
| Tema dos tiers | **Metais clássicos** (Bronze → Prata → Ouro → Platina → Diamante → Mestre) |
| Formato | **Time de até 3 exemplares** (05/09/2026) — ver "Batalha em time" abaixo |

## Visão geral do fluxo

```
Lobby (BatalhaView)                     Preparação                    Batalha
┌─────────────────────┐   aceite   ┌──────────────┐  ┌───────────┐  ┌────────────┐
│ lista de online     │──convite──▶│ time de até 3│─▶│ preview + │─▶│ turnos 60s │──▶ Elo
│ (disponível/em luta)│  TTL 60s   │ (às cegas)   │  │ lead      │  │ ⇄ trocas   │
└─────────────────────┘            └──────────────┘  └───────────┘  └────────────┘
```

1. **Presença**: usuário logado conecta no WebSocket e aparece no lobby com status `disponivel` ou `em_batalha`. O lobby **não** mostra tamanho de coleção.
2. **Convite**: A convida B. O convite expira em **60s** (timer no servidor; some dos dois lados). B aceita → nasce a batalha. Recusa/expiração apaga o convite.
3. **Seleção do time**: cada um monta um time de **até 3 exemplares**, às cegas. A navegação continua em duas etapas — primeiro o professor, depois **qual exemplar** dele (o mesmo professor pode estar na coleção em combinações de tipos diferentes, cada uma com o seu deck) — e uma faixa de 3 slots mostra o time em montagem. Validado no servidor contra `captures`, por `captureId`.
4. **Team preview + lead**: com os dois times confirmados, cada jogador vê os 3 do adversário (**professor e tipos**, nunca IVs nem golpes) e escolhe quem entra primeiro, às cegas. O preview acontece **depois** da confirmação — é isso que impede que ele devolva o counter-pick que a seleção às cegas elimina.
5. **Turnos (estilo Showdown)**: os dois escolhem **golpe ou troca** simultaneamente; quando ambos submetem (ou estoura o timer de **60s**), o servidor resolve a rodada e emite a lista de eventos. Quem não escolheu não age no turno — só sofre o golpe.
6. **Revezamento**: quando o ativo cai e ainda há reserva vivo, a rodada pausa e quem perdeu escolhe quem entra (60s, fallback pelo próximo da ordem). Sem reserva, aquele lado perde.
7. **Fim**: um lado ficou sem ninguém em pé, ou abandono, ou o teto de 40 turnos → servidor calcula Elo, persiste `Battle` + `battle_slots`, atualiza ratings e notifica os dois.

## Batalha em time

Introduzida em **05/09/2026**, substituindo o 1 contra 1. As decisões e o
porquê de cada uma estão em `docs/tasks/10-batalha-em-time-e-painel-qr.md`; o
essencial para mexer no código:

| Regra | Como é |
|---|---|
| Tamanho | **Até 3**. Os times podem ter tamanhos diferentes (1v3, 2v3…) |
| Assimetria | **Sem compensação** — nem de Elo, nem de atributo. Ter mais exemplares é a vantagem que paga a captura, que é o ponto do evento |
| Ação do turno | **Golpe OU troca**, nunca as duas |
| Prioridade | **A troca resolve antes de qualquer golpe**, independente de Raciocínio. Quem entra come o ataque — é esse custo que faz a troca ser decisão. Os dois trocando = ninguém ataca |
| Repetição | Trava por **`captureId`**. Dois exemplares do mesmo professor são legítimos; o mesmo exemplar duas vezes, não |
| Ao sair de campo | Zera `stages`, `shields`, `timedBuffs`, `regen`, `debuffImmuneTurns`, `forceMiss`, `usage`, `lastAttackId` e **confusão**. Mantém `hp`, paralisia e queimadura (`benchCombatant` em `team.ts`) |
| Upkeep na troca | Quem trocou **não** passa por upkeep no turno: gastou o turno trocando |
| Teto de turnos | **40**. No teto vence quem tiver mais **HP somado** (caídos contam 0); igual = empate |
| Abandono | **Contador único** por jogador: lead, entrada pós-nocaute e turno somam na mesma conta; **3** = derrota. Ação válida zera |
| Prazos | **60s em todas as fases** (`PHASE_TIMEOUT_MS`) |
| Treino (bot) | **Continua 1 contra 1.** `ArenaView` e `battleEngine.js` não sabem de time |

> **A composição de time é regra de SALA, não do motor.** Ela vive em
> `src/battle/team.ts` e `battle-room.service.ts`; `engine/engine.ts` continua
> resolvendo um combatente contra outro, e por isso a paridade com
> `profdex-front/src/composables/battleEngine.js` segue valendo do jeito que
> valia. A única mudança no motor foi acrescentar `switch` ao tipo
> `BattleEvent` — evento emitido pela sala, nunca pelo motor.

### Máquina de estados da sala

```
picking ──▶ preview ──▶ active ⇄ switching ──▶ done
```

`onModuleDestroy` anula `active` **e** `switching` (as duas já têm linha no
banco). O `resync` cobre as quatro fases.

## Arquitetura

### Tempo real: Socket.IO
- `@nestjs/websockets` + `@nestjs/platform-socket.io` no back; `socket.io-client` no front.
- **Autenticação no handshake** reutilizando o cookie de sessão existente (`profdex_session`, JWT HttpOnly): o handshake WS envia cookies como qualquer request; o gateway valida com o mesmo código de `auth-session.ts`. Sem sessão → conexão recusada.
- Namespace único `/battle`; salas (`room`) por batalha.
- Em dev, o proxy do Vite repassa WS (`ws: true` na config do proxy).

### Motor no servidor
- Portar para `profdex-back/src/battle/engine/` (TypeScript): `battleEngine`, `types`, `moves`, `professorTypes` (dados canônicos passam a viver no back).
- Adaptações mínimas ao motor:
  - `turnOrder`: empate de raciocínio hoje favorece `player`; em PvP vira **cara ou coroa**.
  - Rodada sem escolha: resolve só o golpe de quem escolheu (upkeep roda para os dois).
- O front **não roda mais o motor em PvP** — ele recebe do servidor os eventos já com texto (`message`, `damage`, `faint`…), que é exatamente o formato que `useBattle.js` já anima. O moveset do jogador chega no evento de início da batalha (nome, tipo, categoria, descrição — o necessário pra UI de escolha).
- A batalha vs. IA existente (ArenaView atual) continua client-side e **não ranqueia** — vira modo treino.

### Estado da batalha
- Em memória no processo (Map battleId → estado), com timers de turno/convite no servidor.
- Persistência só nos momentos que importam: criação (status `active`) e fim (resultado + deltas de rating). Crash do servidor no meio = batalha anulada sem pontos (aceitável; registrar em log).
- **Limitação consciente**: isso exige instância única. Railway roda 1 instância hoje. Escalar horizontal depois exige Redis (adapter do Socket.IO + estado compartilhado) — documentado, não implementado agora.

## Modelo de dados (Prisma)

```prisma
model User {
  // ... campos atuais ...
  battleRating Int @default(1000) @map("battle_rating")
  battleWins   Int @default(0)   @map("battle_wins")
  battleLosses Int @default(0)   @map("battle_losses")
  battleDraws  Int @default(0)   @map("battle_draws")
}

model Battle {
  id           String    @id @default(uuid())
  pairKey      String    @map("pair_key")        // "menor:maior" — cooldown por dupla
  playerAId    String    @map("player_a_id")
  playerBId    String    @map("player_b_id")
  status       String    // active | finished | abandoned | annulled
  winnerId     String?   @map("winner_id")        // null = empate/anulada
  ratingDeltaA Int?      @map("rating_delta_a")
  ratingDeltaB Int?      @map("rating_delta_b")
  createdAt    DateTime  @default(now()) @map("created_at")
  finishedAt   DateTime? @map("finished_at")
  slots        BattleSlot[]

  @@index([pairKey, finishedAt])
  @@map("battles")
}

// Um exemplar levado para a batalha. Substituiu professorAId/professorBId
// quando o formato virou time: com uma coluna por lado não havia onde
// registrar um time, e sem linha por slot morre a pergunta do painel
// ("qual professor mais jogou, qual mais venceu").
model BattleSlot {
  id          String  @id @default(uuid())
  battleId    String  @map("battle_id")
  side        String  // "a" | "b"
  slot        Int     // 0..2 — ordem de seleção, e fallback de lead/entrada
  captureId   String  @map("capture_id")   // o exemplar, com tipos, deck e IVs
  professorId String  @map("professor_id")
  lead        Boolean @default(false)
  fainted     Boolean @default(false)

  @@unique([battleId, side, slot])
  @@index([professorId])
  @@map("battle_slots")
}
```

- Convites **não** vão pro banco: são efêmeros (TTL 60s), vivem em memória com o timer.
- Cooldown: no convite, buscar última `Battle` `finished` da dupla (nas duas ordens) com `finishedAt > now - 12h`. Existindo, recusar com o tempo restante na mensagem.
- Índice para o leaderboard: `@@index([battleRating(sort: Desc)])` em `users`.

## Sistema de pontos — Elo

Igual ao Showdown/chess.com, simplificado para uma semana de evento:

- Todo mundo começa com **1000**.
- Atualização clássica: `R' = R + K × (S − E)`, onde `E = 1 / (1 + 10^((Radv − R)/400))` e `S` = 1 vitória, 0.5 empate, 0 derrota.
- **K = 40 nas 5 primeiras batalhas** (provisional — espalha rápido), **K = 24 depois**.
- **Piso 1000** (como no Showdown): ninguém fica "negativado", todo mundo se mantém motivado a jogar o evento inteiro.
- Vitória por abandono conta como vitória normal.

### Tiers (visíveis no ranking, cortes em constante única e fácil de ajustar)

| Tier | Pontos |
|---|---|
| 🥉 Bronze | 1000–1099 |
| 🥈 Prata | 1100–1199 |
| 🥇 Ouro | 1200–1299 |
| 💠 Platina | 1300–1399 |
| 💎 Diamante | 1400–1499 |
| 👑 Mestre | 1500+ |

Com K acima, um jogador ativo alcança Ouro/Platina numa semana; Mestre fica raro — como deve ser.

### IVs por exemplar e o reset do Elo

Desde a introdução dos IVs (status por exemplar, sorteados no resgate), duas
capturas do mesmo professor podem ter atributos diferentes, e isso entra na
conta da batalha. Como o Elo compara partidas ao longo do tempo, **partidas de
antes e depois dessa virada são de jogos diferentes** — misturá-las no mesmo
ranking é somar réguas distintas.

**Decisão: o Elo é zerado na virada** (`npm run db:reset-ranking`), junto com o
deploy que traz os IVs. Poucas partidas ranqueadas existiam até aqui, e começar
limpo custa menos que explicar por que o ranking mede duas coisas.

O peso dos IVs foi calibrado para que a captura **influencie sem decidir**:

- o banco guarda 0–15 por atributo (é essa faixa que vira as estrelas de 0 a 5
  na coleção), mas o combate reescala para **0–5** (`IV_BONUS_MAX` no motor);
- a velocidade **pesa a moeda** da ordem de turno, em vez de definir quem age
  primeiro — antes, 1 ponto de diferença dava a iniciativa em todos os turnos
  da partida, o que sozinho valia ~69% de vitória;
- medido com o motor real, em espelho perfeito: entre dois jogadores com IVs
  aleatórios, o exemplar de IV total maior vence ~53% das partidas (era 64%).

`iv-balance.spec.ts` roda essa simulação no CI e falha se o número voltar a
subir. Mexer em `IV_BONUS_MAX` ou na ordem de turno exige rever esse teste — e,
se o balanceamento mudar de novo, a mesma pergunta sobre zerar o Elo volta.

### Segundo reset: a virada para time (05/09/2026)

A pergunta voltou, e a resposta foi a mesma. Trocar 1 contra 1 por time de até
3 com troca é mudança maior que os IVs: partidas de antes e depois não medem o
mesmo jogo, e somá-las no mesmo ranking é somar réguas distintas.

**O Elo foi zerado de novo**, junto com a migration
`20260905010000_add_battle_slots`, que também apaga as `battles` antigas — elas
não têm para onde migrar, já que `professor_a_id`/`professor_b_id` saíram da
tabela. Nada de `captures`, `capture_tokens` ou `discoveries` é tocado: a
coleção dos alunos fica intacta.

⚠️ O motor tem duas cópias (`profdex-back/src/battle/engine/engine.ts` e
`profdex-front/src/composables/battleEngine.js`). Elas precisam continuar
idênticas nessas regras: divergir aqui faz a batalha de treino ensinar um jogo
que não é o ranqueado.

## Contratos

### Eventos WebSocket (namespace `/battle`)

| Evento | Direção | Payload |
|---|---|---|
| `lobby:snapshot` | S→C | lista de online `{ id, name, rating, tier, status }` |
| `lobby:update` | S→C | delta (entrou/saiu/mudou status) |
| `invite:send` | C→S | `{ toUserId }` → erro amigável se cooldown/ocupado/spam |
| `invite:received` | S→C | `{ inviteId, from, expiresAt }` |
| `invite:accept` / `invite:decline` | C→S | `{ inviteId }` |
| `invite:expired` / `invite:cancelled` | S→C | `{ inviteId }` |
| `battle:start` | S→C | `{ battleId, pickDeadline, opponent }` → vai pra seleção |
| `battle:pick` | C→S | `{ captureIds: string[] }` — 1 a 3, distintos, todos do próprio usuário |
| `battle:pick:opponent` | S→C | `{}` — o rival confirmou o time (nunca o quê) |
| `battle:preview` | S→C | `{ deadline, you: { team[] }, foe: { name, team[] } }` — o time do rival vem **sem** `captureId`, `moves` nem IVs |
| `battle:lead` | C→S | `{ captureId }` — quem entra primeiro |
| `battle:lead:opponent` | S→C | `{}` — o rival escolheu o lead |
| `battle:begin` | S→C | estado inicial + moveset próprio + os dois times |
| `battle:move` | C→S | `{ moveId }` (validado: é do ativo, batalha ativa, ainda não agiu) |
| `battle:switch` | C→S | `{ captureId }` — troca no turno; alternativa ao golpe |
| `battle:move:opponent` | S→C | `{}` — o rival agiu (golpe ou troca, sem dizer qual) |
| `battle:round` | S→C | `{ turn, deadline, events[], you, foe }` — eventos no formato do motor |
| `battle:faint` | S→C | `{ deadline, youChoose, events[], you, foe }` — o ativo caiu; `youChoose` diz quem escolhe |
| `battle:enter` | C→S | `{ captureId }` — quem entra no lugar de quem caiu |
| `battle:end` | S→C | `{ result, reason, rating, you, foe }` |
| `battle:resync` | C→S / S→C | reconexão: snapshot com a fase (`picking`/`preview`/`active`/`switching`) |

### REST

- `GET /api/rankings/battle?page=` — leaderboard paginado + posição do usuário logado (`SELECT count(*) WHERE rating > meu`).
- `GET /api/rankings/captures?page=` — exemplares resgatados por aluno.
- `GET /api/rankings/dex?page=` — professores **distintos** por aluno, com o percentual da dex (`dexTotal` acompanha a resposta).

Os três têm o mesmo formato (`entries`, `me`, `page`, `pageSize`, `total`) e a
mesma `PAGE_SIZE`, e são as três abas internas do `/ranking`. A diferença está
no `me`: o de batalha marca `played`, os de coleção marcam `ranked` — nos dois
casos, "tem posição para mostrar?". Quem nunca jogou/capturou fica fora do
ladder pelo mesmo motivo: cadastro não é ranking.
- `GET /api/battles/me` — histórico do usuário (futuro; barato porque `Battle` já persiste tudo).

## Frontend

- **`stores/battle.js`** (Pinia): conexão WS, lista de online, convites, estado da batalha ativa. Ações de batalha: `pickTeam`, `chooseLead`, `submitMove`, `switchTo`, `enterWith`.
- **BatalhaView**: seção "Jogadores online" (status + botão convidar), toast de convite recebido com contagem regressiva de 60s, e **tabs** internas. O painel administrativo **saiu daqui** (05/09/2026) e agora mora no Perfil.
- **PvpPickView**: cobre as duas fases da preparação. Em `picking`, a navegação de dois níveis (professor → exemplar) mais uma **faixa de 3 slots** e o botão "Confirmar". Em `preview`, os dois times lado a lado e a escolha do lead.
- **PvpArenaView**: sem IA e sem motor local; anima `battle:round` (mesmo formato que `useBattle.js` já consome), timer de 60s visível. Ganhou o **banco de reservas** (foto + barra de HP dos dois lados), o botão **Trocar** ao lado dos golpes e o painel de **entrada após nocaute**.
- **Ranking**: `PointsLeaderboard` deixa de usar o mock `data/ranking.js` e consome a API, exibindo tier + pontos.

## Produção e boas práticas

- **Validação server-side de tudo**: o exemplar precisa ser do próprio usuário, golpe precisa estar no moveset gravado nele, escolha única por turno, participante precisa ser da batalha.
- **Rate limiting**: 1 convite pendente por usuário; máx. ~5 convites/min (reusar o padrão de `auth-rate-limit.service.ts`).
- **Timers no servidor** (convite 60s, turno 60s, seleção 60s) com cleanup no disconnect/fim.
- **Reconexão**: queda de WS não é derrota — ao reconectar, `battle:resync` devolve o estado. **3 turnos consecutivos sem ação = derrota por abandono.**
- **Anti-cheat/auditoria**: resultado calculado e gravado só no servidor; log estruturado por batalha (dupla, horários, deltas) permite auditar padrões de win trading além do cooldown.
- **Testes**: unit no motor portado (paridade com o comportamento atual), unit no Elo (tabela de casos), e2e do gateway com `socket.io-client` (convite→pick→turno→fim), teste do cooldown.
- **Carga**: 1000 alunos ≈ centenas de conexões WS simultâneas no pico — tranquilo para 1 instância Node (payloads pequenos, eventos esparsos). Leaderboard é a query mais quente: paginada + índice em `battleRating`.
- **Deploy**: migration nova (campos de rating + tabela `battles`). Deploy no meio do evento derruba batalhas ativas → status `annulled`, sem pontos; fazer deploys em janelas calmas.

## Regras de borda (defaults propostos — ajustáveis)

1. **Não confirmou NENHUM exemplar em 60s** → batalha cancelada, sem pontos, cooldown **não** consumido (ninguém pode ser punido na preparação). Quem confirmou pelo menos 1 **entra com o que confirmou**: o formato já aceita times menores, então cancelar por lentidão puniria por uma regra que não existe.
2. **Empate** (os dois times caem na mesma rodada, ou HP somado igual no teto de turnos) → `S = 0.5` para os dois no Elo; conta `battleDraws`.
3. **Ambos abandonam** (3 faltas dos dois) → anulada, sem pontos, cooldown consumido (evita farmar cancelamento pra resetar matchup).
4. **Mesmo professor pelos dois** → permitido (espelho); não há vantagem estrutural. **O mesmo exemplar duas vezes no próprio time**, não.
5. **Convidar quem está `em_batalha`** → bloqueado na hora, com mensagem.
6. **Não escolheu o lead em 60s** → entra o primeiro da ordem de seleção, e conta uma falta.
7. **Não escolheu quem entra após nocaute em 60s** → entra o próximo vivo pela ordem, e conta uma falta.
8. **Batalha travada em trocas** → o teto de 40 turnos encerra pelo HP somado. Sem ele, trocar não custa recurso (o motor não tem PP) e a sala ficaria aberta em memória para sempre.

## Fases de entrega (cada uma deployável e testável)

| Fase | Entrega | Valida |
|---|---|---|
| **1. Fundação** | Gateway WS com auth por cookie, presença no lobby, UI de online na BatalhaView | 2 navegadores se veem online |
| **2. Convites** | Envio/aceite/recusa com TTL 60s, cooldown 12h por dupla, rate limit | convite expira sozinho; 2ª batalha da dupla é recusada |
| **3. Batalha** | Motor portado + seleção às cegas + turnos 60s + reconexão | partida completa entre 2 celulares |
| **4. Ranking** | Elo + migration + `GET /api/rankings/battle` + tabs e tela real | rating muda ao fim; leaderboard global atualiza |
| **5. Hardening** | Testes e2e, abandono, logs de auditoria, revisão de carga | suíte verde + teste manual de queda de rede |
