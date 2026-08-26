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
> `presence/invite/cooldown/battle-room/rating/rankings` + motor portado em
> `engine/`); front em `stores/battle.js`, `views/BatalhaView.vue` (lobby +
> tabs), `views/PvpPickView.vue` e `views/PvpArenaView.vue`.
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

## Visão geral do fluxo

```
Lobby (BatalhaView)                    Batalha (ArenaView modo PvP)
┌─────────────────────┐   aceite   ┌──────────────┐   2 escolhas   ┌────────────┐
│ lista de online     │──convite──▶│ seleção às   │───────────────▶│ turnos 60s │──▶ Elo + ranking
│ (disponível/em luta)│  TTL 60s   │ cegas do prof│  (blind pick)  │ (Showdown) │
└─────────────────────┘            └──────────────┘                └────────────┘
```

1. **Presença**: usuário logado conecta no WebSocket e aparece no lobby com status `disponivel` ou `em_batalha`.
2. **Convite**: A convida B. O convite expira em **60s** (timer no servidor; some dos dois lados). B aceita → nasce a batalha. Recusa/expiração apaga o convite.
3. **Seleção**: em duas etapas — primeiro o professor, depois **qual exemplar** dele (o mesmo professor pode estar na coleção em combinações de tipos diferentes, cada uma com o seu deck). Validado no servidor contra a tabela `captures`, pelo id da captura. Escolha às cegas — um não vê o pick do outro até os dois confirmarem (evita counter-pick e dodge).
4. **Turnos (estilo Showdown)**: os dois escolhem golpe simultaneamente; quando ambos submetem (ou estoura o timer de **60s**), o servidor resolve a rodada com o motor e emite a lista de eventos para os dois clientes animarem. Quem não escolheu não age no turno — só sofre o golpe.
5. **Fim**: HP zerou (ou abandono) → servidor calcula Elo, persiste `Battle`, atualiza ratings e notifica os dois.

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
  playerAId    String    @map("player_a_id")
  playerBId    String    @map("player_b_id")
  professorAId String    @map("professor_a_id")
  professorBId String    @map("professor_b_id")
  status       String    // active | finished | abandoned | annulled
  winnerId     String?   @map("winner_id")        // null = empate/anulada
  ratingDeltaA Int?      @map("rating_delta_a")
  ratingDeltaB Int?      @map("rating_delta_b")
  createdAt    DateTime  @default(now()) @map("created_at")
  finishedAt   DateTime? @map("finished_at")

  @@index([playerAId, playerBId, finishedAt]) // cooldown por dupla
  @@map("battles")
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
| `battle:start` | S→C | `{ battleId, opponent }` → vai pra seleção |
| `battle:pick` | C→S | `{ captureId }` (validado contra as capturas do próprio usuário) |
| `battle:begin` | S→C | estado inicial + moveset próprio + prof do oponente |
| `battle:move` | C→S | `{ moveId }` (validado: é seu, batalha ativa, ainda não escolheu) |
| `battle:round` | S→C | `{ events[], hpA, hpB, deadline }` — eventos no formato do motor |
| `battle:end` | S→C | `{ winnerId, ratingDelta, newRating, newTier }` |
| `battle:resync` | C→S / S→C | reconexão: servidor devolve snapshot do estado |

### REST

- `GET /api/rankings/battle?page=` — leaderboard paginado + posição do usuário logado (`SELECT count(*) WHERE rating > meu`).
- `GET /api/battles/me` — histórico do usuário (futuro; barato porque `Battle` já persiste tudo).

## Frontend

- **`stores/battle.js`** (Pinia): conexão WS, lista de online, convites, estado da batalha ativa.
- **BatalhaView**: seção "Jogadores online" (status + botão convidar), toast de convite recebido com contagem regressiva de 60s, e **tabs** internas: `Batalha | Ranking` (a aba Ranking de Pokédex futura entra ao lado depois).
- **Tela de seleção**: grid dos professores com exemplar, depois a lista de exemplares daquele professor com tipos e golpes (`GET /api/captures`) + "aguardando oponente…".
- **ArenaView**: ganha modo `pvp` — sem IA e sem motor local; anima `battle:round` (mesmo formato que `useBattle.js` já consome), timer de 60s visível, banner "oponente está escolhendo…".
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

1. **Não escolheu professor em 60s** → batalha cancelada, sem pontos, cooldown **não** consumido (ninguém pode ser punido na preparação; blind pick já elimina vantagem de dodge).
2. **Empate** (duplo nocaute na mesma rodada, via recuo/reflexão) → `S = 0.5` para os dois no Elo; conta `battleDraws`.
3. **Ambos abandonam** (3 turnos sem ação dos dois) → anulada, sem pontos, cooldown consumido (evita farmar cancelamento pra resetar matchup).
4. **Mesmo professor pelos dois** → permitido (espelho); não há vantagem estrutural.
5. **Convidar quem está `em_batalha`** → bloqueado na hora, com mensagem.

## Fases de entrega (cada uma deployável e testável)

| Fase | Entrega | Valida |
|---|---|---|
| **1. Fundação** | Gateway WS com auth por cookie, presença no lobby, UI de online na BatalhaView | 2 navegadores se veem online |
| **2. Convites** | Envio/aceite/recusa com TTL 60s, cooldown 12h por dupla, rate limit | convite expira sozinho; 2ª batalha da dupla é recusada |
| **3. Batalha** | Motor portado + seleção às cegas + turnos 60s + reconexão | partida completa entre 2 celulares |
| **4. Ranking** | Elo + migration + `GET /api/rankings/battle` + tabs e tela real | rating muda ao fim; leaderboard global atualiza |
| **5. Hardening** | Testes e2e, abandono, logs de auditoria, revisão de carga | suíte verde + teste manual de queda de rede |
