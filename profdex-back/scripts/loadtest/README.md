# Teste de carga do PvP

Mede o multiplayer com centenas de conexões simultâneas: lobby, convites,
seleção às cegas, turnos e Elo — tudo pelo protocolo real do Socket.IO.

A análise dos gargalos que este teste serve para confirmar está em
[`docs/CARGA-PVP.md`](../../../docs/CARGA-PVP.md).

## Por que Artillery (e por que não o engine `socketio` dele)

Artillery entra pelo que faz bem: fases de chegada, agregação de métricas,
relatório e execução distribuída. Mas o **engine `socketio` embutido não serve**
aqui, por três motivos:

1. O fluxo é dirigido pelo servidor — `battle:start`, `battle:begin`,
   `battle:round` e `battle:end` chegam quando o servidor decide. O engine
   embutido só sabe "emitir e talvez casar um channel de resposta".
2. Todo comando usa **ack callback** (`invite:send`, `battle:move`…), que o
   engine não modela.
3. **Não há como parear dois usuários virtuais entre si** — e uma batalha exige
   exatamente isso.

Por isso o teste usa um **processor customizado** (`pvp-processor.js`) que roda
o `socket.io-client` de verdade dentro da cena.

k6 foi descartado: Socket.IO é um protocolo em cima do Engine.IO (framing
`40`/`42[...]`, ids de ack, heartbeat). Com `k6/experimental/websockets` seria
preciso reimplementar isso à mão — frágil e sem ganho real aqui.

## Pré-requisitos

```bash
npm install                 # inclui o artillery (devDependency)
npm run db:seed             # o banco precisa de ao menos 2 professores
```

O `.env` precisa de `DATABASE_URL`, `DIRECT_URL` e `JWT_SECRET` válidos
(ver `.env.example`). O gerador de carga fala **direto com o banco** para criar
as contas de teste, além de falar com o servidor pela rede.

> **Atenção:** rode contra ambiente local ou de homologação. O script cria
> usuários e batalhas de verdade.

## Rodando

```bash
# Padrão: ~500 conexões simultâneas no platô (8 min de execução)
npx artillery run scripts/loadtest/pvp-load.yml

# Com relatório HTML
npx artillery run --output run.json scripts/loadtest/pvp-load.yml
npx artillery report run.json

# Outro alvo de carga, sem editar o arquivo
npx artillery run scripts/loadtest/pvp-load.yml \
  --overrides '{"config":{"phases":[{"duration":300,"arrivalRate":20}]}}'

# Contra outro servidor
LOAD_WS_URL=https://homolog.exemplo.com npx artillery run scripts/loadtest/pvp-load.yml
```

### Como chegar a um número específico de conexões

A concorrência de lobby é aproximadamente:

```
conexões ≈ arrivalRate × peso_do_cenário × LOAD_LOBBY_HOLD_S
```

Com o padrão (`arrivalRate 10`, lobby com peso 0,8, hold 60s): `10 × 0,8 × 60 ≈
480` sockets parados, mais ~60 em batalha. Para **1000 conexões**, use
`arrivalRate 20` ou `LOAD_LOBBY_HOLD_S=120`.

## Cenários

| Cenário | Peso | O que faz | Sockets/VU |
|---|---|---|---|
| `lobby-parado` | 80% | Conecta e fica parado, como o aluno esperando ser chamado | 1 |
| `batalha-completa` | 20% | Convite → aceite → pick → turnos → Elo | **2** |

No cenário `lobby-parado`, uma fração (`LOAD_LOBBY_SUBSCRIBE_RATIO`, padrão
`0.2`) abre a lista de jogadores — só esses recebem eventos de presença. É o
comportamento real da UI e o que permite comparar os dois grupos.

`batalha-completa` usa **um VU para os dois lados**. O servidor não distingue
isso de dois clientes independentes — são dois websockets falando o protocolo
real — e em troca some a necessidade de coordenar VUs entre si, que é o que
costuma quebrar teste de carga de jogo. Só lembre de contar 2 conexões por VU
desse cenário.

Há ainda `loginOnly`, **não incluído no `pvp-load.yml` de propósito**: hash de
senha custa CPU e misturá-lo com o PvP contamina a medição de latência. Para
medir o login isoladamente, crie um YAML só com esse cenário.

## Métricas

| Métrica | Lê assim |
|---|---|
| `pvp.connect_ms` | Handshake até o `lobby:count`. Subiu = event loop saturado. |
| `pvp.online_total` | Total online visto por cada conexão — confirma a concorrência que o teste realmente atingiu. |
| `lobby.page_users` | Usuários por página no `lobby:subscribe`. **Deve travar em 50**, não crescer com a população. |
| `lobby.events_per_user.sem_lista` | Eventos de presença recebidos por quem **não** abriu a lista. **Deve ser zero** — é a prova de que o fanout está contido. |
| `lobby.events_per_user.com_lista` | O mesmo para quem abriu a lista. Aqui é normal crescer. |
| `lobby.update_bytes_per_user.*` | O mesmo, em bytes. |
| `pvp.invite_to_start_ms` | `invite:send` até os dois lados receberem `battle:start`. |
| `pvp.pick_to_begin_ms` | Pick dos dois até `battle:begin` (inclui o `battle.create` no banco). |
| `pvp.move_to_round_ms` | **Latência que o jogador sente**: move enviado → rodada resolvida. |
| `pvp.battle_total_ms` / `pvp.turns` | Duração e tamanho da partida. |
| `pvp.battles_completed` / `_failed` | Taxa de sucesso. |
| `pvp.rating_applied` | Confirma que a transação de Elo rodou (pega erro `P2024` de pool). |
| `pvp.error.*` | Falhas agrupadas pela mensagem. |

O run **falha** (exit ≠ 0) se estourar os limites em `ensure.thresholds` — dá
para usar em CI.

### O que observar no servidor ao mesmo tempo

As métricas acima são a visão do cliente. Meça em paralelo, no servidor:

- **CPU do processo Node** — é single-process; 100% de um core é o teto real.
- **Lag do event loop** — o sintoma de trabalho síncrono pesado (hash de senha,
  serialização de broadcast) roubando a thread principal.
- **Conexões e tempo de query no Postgres** — o pool padrão do Prisma é pequeno
  (`nº de CPUs × 2 + 1`); estouro aparece como `P2024`.

## Limpeza

Cada execução cria contas `load*` e batalhas reais.

```bash
npm run db:reset-ranking                              # mostra o que faria
npm run db:reset-ranking -- --yes --purge-test-users  # limpa
```

Limpar entre execuções também **zera o cooldown de 12h por dupla** (ele lê a
tabela `battles`). Contas novas a cada VU já evitam o problema, mas o reset
mantém o banco de teste enxuto.

## Banco para testar localmente

O harness precisa de um Postgres. Se não houver um à mão:

```bash
npm run db:up    # docker-compose.yml na raiz do backend

# no .env
DATABASE_URL="postgresql://profdex:profdex@localhost:55432/profdex"
DIRECT_URL="postgresql://profdex:profdex@localhost:55432/profdex"

npx prisma migrate deploy && npm run db:seed
```

## Limitações conhecidas

- **Node 22+**: o `artillery@2.0.33` declara `engines: node >= 22.13`. Em Node
  20 ele roda, mas o npm avisa `EBADENGINE` — se aparecer comportamento
  estranho, atualize o Node antes de investigar outra coisa.
- O gerador de carga e o servidor competem por CPU se rodarem na mesma máquina.
  A execução de referência (496 conexões) foi assim, então as latências
  registradas em `docs/CARGA-PVP.md` são um **piso otimista**. Para números que
  valham como previsão, rode de outra máquina contra homologação.
- O cenário de batalha usa 2 sockets por VU; some isso ao contar concorrência.
- `jsonwebtoken` e `dotenv` são usados como dependências transitivas
  (`@nestjs/jwt`, `@nestjs/config`). Se algum dia sumirem do fecho de
  dependências, adicione-as explicitamente.
