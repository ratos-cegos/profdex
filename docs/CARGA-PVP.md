# PvP sob carga — análise e melhorias

Análise do multiplayer (`profdex-back/src/battle/`) pensando no cenário real do
evento: várias centenas de alunos com o app aberto ao mesmo tempo, uma fração
deles batalhando.

O teste que confirma (ou refuta) cada item está em
[`profdex-back/scripts/loadtest/`](../profdex-back/scripts/loadtest/README.md).

## Resumo

O motor de batalha é a parte **mais** saudável do sistema: estado em memória,
um timer por sala, ~10 queries por partida. Ele não é o gargalo.

O gargalo é o **lobby**. Hoje todo mundo vê todo mundo, e cada evento de
presença vira uma mensagem para todos os conectados. O custo cresce com o
quadrado da população online — e o pior caso não é o uso normal, é a
**reconexão em massa** depois de um blip de rede.

| # | Problema | Impacto | Situação |
|---|---|---|---|
| 1 | Fanout do lobby é O(N²) | 🔴 Crítico | ✅ Corrigido |
| 2 | `bcryptjs` bloqueia o event loop | 🔴 Crítico | ✅ Corrigido |
| 3 | Tempestade de reconexão | 🔴 Crítico | ✅ Corrigido |
| 4 | Processo único, sem adapter | 🟡 Teto | Aberto (alto esforço) |
| 5 | Pool do Prisma na transação de Elo | 🟡 Alto | Aberto (baixo esforço) |
| 6 | Cooldown consulta o banco antes do rate limit | 🟡 Médio | Aberto (baixo esforço) |
| 7 | `onModuleDestroy` sequencial | 🟡 Médio | Aberto (baixo esforço) |
| 8 | `emitToUser` re-serializa por socket | 🟢 Baixo | ✅ Corrigido (junto do 1) |
| 9 | Ranking sem cache e sem índice utilizável | 🟢 Baixo | Aberto |
| 10 | Vazamentos no `InviteService` | 🟢 Baixo | Aberto |
| 11 | Sessão de 15min vs. evento de horas | 🟡 Médio | Aberto |

---

## 1. 🔴 O fanout do lobby é O(N²)

**Onde:** `battle.gateway.ts:103-109` (snapshot + join), `:305` (status).

Três comportamentos se somam:

```ts
// Toda conexão recebe a lista COMPLETA de quem está online
client.emit('lobby:snapshot', { users: this.presence.snapshot() });

// Toda entrada avisa todo mundo
client.broadcast.emit('lobby:update', { type: 'join', ... });

// Toda mudança de status avisa todo mundo — inclusive quem não abriu o lobby
this.server.emit('lobby:update', { type: 'status', userId, status });
```

**A conta com 1000 alunos online:**

- Snapshot: ~100 bytes por usuário → **~100 KB entregues a cada conexão**.
- Rampa de 1000 entradas: ~50 MB só de snapshots e ~500.000 mensagens de join.
- Status: cada batalha gera 4 broadcasts (2 no início, 2 no fim, via
  `onRoomClosed`). Com 100 batalhas/min → 400 broadcasts/min × 1000 sockets =
  **~6.700 escritas de socket por segundo**, permanentes, só de ruído.

O uso em regime é pesado mas sobrevivível. O que derruba é o item 3.

**Correção aplicada.** A UI **já** escondia a lista atrás de um botão
(`BatalhaView.vue`, modal "Jogadores online") — o servidor é que insistia em
empurrá-la para todo mundo. Agora:

- **Sala `lobby`**: o cliente entra com `lobby:subscribe` ao abrir o modal e sai
  com `lobby:unsubscribe` ao fechar. Os eventos `join`/`leave`/`status` vão para
  a sala, não para o namespace. Quem está com o modal fechado — a maioria
  esmagadora — não recebe nada.
- **`lobby:snapshot` deixou de existir na conexão.** No lugar entra
  `lobby:count`, só com o total. A lista chega paginada (50) no ack do
  `subscribe`.
- **`lobby:search`** faz a busca no servidor; antes o cliente filtrava
  localmente, o que só era possível porque recebia o lobby inteiro.
- O total ainda vai para todos (a tela mostra "N jogadores" sem abrir a lista),
  mas **agrupado numa janela de 2s** em vez de uma mensagem por mudança.

Métricas que provam: `lobby.page_users` (deve travar em 50, não crescer com a
população) e `lobby.events_per_user.sem_lista` (deve ficar em zero).

> Efeito colateral a lembrar: `pvp-smoke.js` e o harness de carga esperavam
> `lobby:snapshot` na conexão e foram ajustados para `lobby:count`. Qualquer
> outro cliente que dependesse do snapshot automático precisa do mesmo ajuste.

## 2. 🔴 `bcryptjs` bloqueava o event loop — ✅ CORRIGIDO

**Onde estava:** `auth.service.ts` e `users.service.ts`, com `bcryptjs`.

`bcryptjs` é a implementação em **JavaScript puro** e roda **na thread
principal**. O problema não é ser lenta — é ser **bloqueante**.

Medição real nesta máquina, 20 hashes simultâneos (rounds 10), observando o
atraso de um timer de 10ms:

| | Tempo total | Pior travada do loop | Ticks de timer no período |
|---|---|---|---|
| `bcryptjs` | 1314 ms | **1303 ms** | **1** |
| `@node-rs/bcrypt` | 285 ms | 11 ms | 18 |

Com 20 logins concorrentes o servidor ficava **congelado por 1,3 segundo**:
nenhum websocket atendido, nenhum timer de turno disparado. Com 200 logins —
plausível no minuto de abertura do evento — seriam mais de 10 segundos de
paralisia, e as batalhas em curso sofreriam timeout de turno em cascata.

Note que em velocidade bruta a diferença é pequena (~1,2x por hash). O ganho de
4,6x no total acima vem de o nativo usar a **threadpool do libuv**, resolvendo
os hashes em paralelo sem tomar a thread principal.

**Correção aplicada:** troca por `@node-rs/bcrypt`. O formato do hash é o mesmo
(`$2b$`), verificado nos dois sentidos — senhas já cadastradas continuam
válidas e um rollback para `bcryptjs` também funcionaria. `bcryptjs` e
`@types/bcryptjs` foram removidos das dependências.

> ⚠️ **Atenção no deploy:** `@node-rs/bcrypt` é um módulo **nativo**. Ele traz
> binários pré-compilados para as plataformas comuns (incl. `linux-x64-gnu`,
> usada por Railway), mas se o build de produção rodar em imagem Alpine (musl),
> confirme que o pacote `@node-rs/bcrypt-linux-x64-musl` foi resolvido.

O harness de carga **evita** o login de propósito (assina o JWT localmente) para
não medir custo de hash no lugar do PvP. O cenário `loginOnly` existe para medir
isso isoladamente.

## 3. 🔴 Tempestade de reconexão — ✅ CORRIGIDO

O `socket.io-client` reconecta sozinho, com delay padrão de 1s a 5s e
`randomizationFactor` 0.5. Depois de um blip de Wi-Fi no ginásio, **todos os
clientes reconectam dentro da mesma janela de poucos segundos**.

Cada reconexão dispara o item 1 inteiro: snapshot completo + broadcast de join.
Com 1000 usuários isso é ~100 MB e ~1.000.000 de escritas de socket concentradas
em segundos. **É o cenário que derruba o servidor**, e ele é auto-reforçado: o
servidor engasga, mais clientes caem, mais reconexões.

**Correções aplicadas:**

- O item 1 resolvido já torna a reconexão barata: ela agora custa um
  `lobby:count` (dezenas de bytes) em vez do lobby inteiro.
- Backoff mais largo e embaralhado em `stores/battle.js`:
  `reconnectionDelayMax: 30000`, `randomizationFactor: 0.75` — as reconexões se
  espalham por uma janela de ~30s em vez de se concentrarem em 5s.

**Ainda em aberto:** avaliar `connectionStateRecovery` do Socket.IO v4.6+, que
restauraria a sessão sem refazer o ciclo de presença.

## 4. 🟡 Processo único — o teto real

`main.ts` não tem cluster nem `@socket.io/redis-adapter`, e todo o estado
(`PresenceService`, `InviteService`, `BattleRoomService`) vive em `Map` no
processo. Consequências:

- **Um core** atende o evento inteiro. Node aguenta alguns milhares de
  websockets ociosos, mas o teto é o CPU de um núcleo.
- **Não dá para escalar horizontalmente**: duas instâncias = dois lobbies
  disjuntos, e um convite não atravessa de uma para a outra.
- Todo deploy derruba as batalhas ativas (tratado com `annulled`, mas derruba).

**Caminho, em ordem de custo/benefício:** corrija 1–3 primeiro — compram muito
espaço sem mexer na arquitetura. Só se ainda faltar fôlego, adote
`@socket.io/redis-adapter` + presença e convites no Redis, com sticky sessions.
As salas de batalha podem continuar presas a uma instância (são 2 jogadores),
desde que o convite saiba rotear.

## 5. 🟡 Pool do Prisma na transação de Elo

**Onde:** `rating.service.ts:29` — `this.prisma.$transaction(async (tx) => ...)`.

Transação **interativa**: segura uma conexão do pool durante todo o bloco (5
queries). O pool padrão do Prisma é `nº de CPUs × 2 + 1` — em uma máquina de 2
cores, **5 conexões**.

O risco concreto é um rebanho: as batalhas começam juntas (todo mundo entra no
evento ao mesmo tempo), então os timers de turno de 60s **ficam alinhados**.
Dezenas de partidas terminam no mesmo instante → dezenas de transações
concorrentes → fila no pool → `P2024` (timeout de 5s) → batalhas que não fecham.

**Correções:**

- Adicionar jitter ao deadline do turno: `TURN_TIMEOUT_MS + random(0..3000)` em
  `armTurnTimer` (`battle-room.service.ts:445`). Barato e desalinha o rebanho.
- Subir `connection_limit` na `DATABASE_URL` e o `pool_timeout`.
- Trocar a transação interativa por uma sequência de `$transaction([...])` em
  batch, que não segura conexão entre as queries.

`pvp.rating_applied` versus `pvp.battles_completed` denuncia quando isso começa.

## 6. 🟡 O cooldown consulta o banco antes do rate limit

**Onde:** `battle.gateway.ts:163-174`.

```ts
const availableAt = await this.cooldown.availableAt(me.id, toUserId); // ← QUERY
if (availableAt) { ... }
const result = this.invites.create(...);  // ← o rate limit (5/min) mora AQUI
```

O limitador de spam está **depois** da query. Ou seja: ele nunca protege o
banco. Um cliente em loop força uma query por tentativa, sem limite efetivo.

**Correção:** expor um `peekRateSlot(userId)` no `InviteService` e checá-lo
antes do `await`, mantendo o `consumeRateSlot` onde está. Alternativa
complementar: manter em memória as duplas em cooldown (o `InviteService` já é
em memória) e só ir ao banco quando não houver entrada.

## 7. 🟡 `onModuleDestroy` é sequencial

**Onde:** `battle-room.service.ts:82-96`.

```ts
for (const room of [...this.rooms.values()]) {
  await this.prisma.battle.update({ ... });   // um por vez
}
```

Com 300 salas ativas num deploy, são 300 round-trips em série. O prazo de
SIGTERM de um container costuma ser 30s — estourou, o processo é morto e as
batalhas ficam `active` órfãs no banco, exatamente o que o código quer evitar.

**Correção:** um único `updateMany({ where: { id: { in: ids } }, ... })`.

## 8. 🟢 `emitToUser` re-serializava por socket — ✅ CORRIGIDO

**Onde estava:** `battle.gateway.ts`, um `.to(socketId).emit()` por aba aberta —
cada chamada montando um `BroadcastOperator` e serializando o payload de novo.

**Correção aplicada:** sala privada por usuário. O socket entra em
`user:<id>` na conexão e o `emitToUser` virou um `.to(userRoom(userId)).emit()`
único. Uma serialização, um lookup — e já fica pronto para o Redis adapter, se
o item 4 for encarado um dia.

## 9. 🟢 Ranking sem índice utilizável e sem cache

**Onde:** `rankings.service.ts:20-26,61,92`.

O filtro `PLAYED` é um `OR` de três colunas com `gt: 0` — **não usa índice**
(o único índice é em `battleRating`). Cada request faz dois `count()` que viram
varredura completa de `users`.

Com 1000 alunos é irrelevante. O problema é o padrão de acesso: **todo mundo
abre a aba Ranking ao mesmo tempo**, e aí são 1000 requests × 2 varreduras.

**Correções:** cache de 15–30s na página 1 (é um placar, defasagem não incomoda)
ou uma coluna denormalizada `battlesPlayed` com índice
`[battlesPlayed, battleRating]`.

## 10. 🟢 Vazamentos no `InviteService`

**Onde:** `invite.service.ts:129-136` e `:138-148`.

- `incomingOf()` cria um `Set` em `incomingByUser` e **nunca remove a entrada**
  quando ela esvazia (`remove()` só faz `.delete(inviteId)`).
- `sentLog` só é sobrescrito quando o mesmo usuário volta a convidar; entradas
  vencidas de quem não voltou ficam para sempre.

Ambos são limitados pelo número de usuários distintos — pequeno, mas cresce
monotonicamente ao longo de um evento de semanas.

**Correção:** apagar a chave quando o `Set` ficar vazio e varrer o `sentLog`
periodicamente (ou trocar por um LRU com TTL).

## 11. 🟡 Sessão de 15 minutos num evento de horas

`SESSION_MAX_AGE_MS` e o `expiresIn` do JWT são **15 min**, e a sessão só é
verificada **no handshake**. Um socket aberto continua valendo indefinidamente,
mas **qualquer reconexão depois de 15 min falha**.

Combinado com o item 3: blip de rede após 20 min de evento → todo mundo
reconecta → todo mundo recebe `error:unauthorized` → o front derruba o socket e
exige login novo (`stores/battle.js:69-73`). Um blip vira um re-login em massa —
que cai direto no item 2.

**Correções:** aumentar o TTL da sessão para a duração plausível de uma sessão de
uso, ou implementar refresh silencioso do cookie enquanto o socket está vivo.

---

## Resultado medido

Executado em 07/08/2026 contra o backend real (Postgres 16 em contêiner,
servidor e gerador de carga na mesma máquina — um notebook).

**1.320 usuários virtuais, pico de 496 conexões simultâneas, zero falhas.**

| Métrica | Resultado |
|---|---|
| `lobby.events_per_user.sem_lista` | **0** (min, média, p95, máx) |
| `lobby.events_per_user.com_lista` | média 1.460 eventos · ~130 KB / 60s |
| `lobby.page_users` | máx **50** — travado no teto |
| `pvp.connect_ms` p95 | 7,9 ms |
| `pvp.invite_to_start_ms` p95 | 10,1 ms |
| `pvp.move_to_round_ms` p95 | **13,1 ms** (limite do gate: 1.500 ms) |
| `pvp.pick_to_begin_ms` p95 | 8,9 ms |
| Batalhas concluídas | 260 · **260 com Elo aplicado** |

Duas leituras importam:

1. **`sem_lista` é exatamente zero, não "menor".** Quem está com a tela de
   jogadores fechada — a maioria esmagadora, durante quase todo o evento — não
   recebe nenhum evento de presença. A correção é estrutural, não um paliativo.
2. **`page_users` travou em 50 com 496 online.** Antes esse número era a
   população inteira, entregue a cada conexão.

Para dimensionar o que foi evitado: os ~130 KB/60s que um usuário **com a lista
aberta** recebe, multiplicados pelas 496 conexões do pico, dariam ~64 MB por
minuto só de atualização de lobby. É o tráfego que o modelo antigo geraria.

> Ressalva honesta: 496 conexões numa máquina só, com o gerador de carga
> disputando CPU com o servidor. Os números de latência são um piso otimista —
> servem para provar que o gargalo do lobby saiu do caminho, não para prever o
> comportamento com 1.000 alunos em rede real. Para isso, rode o harness de
> outra máquina contra o ambiente de homologação.

## Próximos passos

1. **Itens 5 e 7** — jitter no timer de turno e `updateMany` no shutdown. São
   baratos e removem dois modos de falha em cascata.
2. **Item 6** — mover o rate limit para antes da query de cooldown.
3. Rodar o harness **de outra máquina** contra homologação, com 1.000+ conexões.
4. Só encarar o **item 4** (Redis/multi-processo) se os números ainda pedirem —
   é o único que muda a arquitetura.
