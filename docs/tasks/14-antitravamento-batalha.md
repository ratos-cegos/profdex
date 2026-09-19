# Tarefa 14 — Antitravamento: convite e batalha sem softlock

**Prioridade:** alta — travamento em evento não tem conserto depois
**Perfil:** full-stack (gateway + store do front)
**Depende de:** nada. **Pode ser feita primeiro**, em paralelo com as tarefas 11–13
**Origem:** relato de teste em jogo + leitura do código, em 19/09/2026

---

## Contexto do projeto

O PvP ranqueado do ProfDex é uma sala em memória no servidor, com Socket.IO,
timers no back e estado espelhado no Pinia. O fluxo é:

```
lobby → convite → picking → preview → active ⇄ switching → done
```

**Stack**

- `profdex-front/` — Vue 3 + Vite + Pinia + vue-router.
- `profdex-back/` — NestJS + Prisma + PostgreSQL + Socket.IO.

**Documentos que você precisa ler antes de mexer**

| Documento | Por quê |
|---|---|
| `docs/BUG-BATALHA-TRAVANDO.md` | **Leia inteiro.** As correções P1, P2 e P4 desta tarefa estão diagnosticadas lá em detalhe |
| `docs/BATALHA-PVP.md` | Contratos WS, fases, Elo, regras de borda |
| `docs/CARGA-PVP.md` | Por que a lista de jogadores é sob demanda — a decisão 14.3 mexe nisso |

**Como testar de ponta a ponta:** `npm run pvp:smoke` no `profdex-back/` roda o
fluxo PvP pela rede; `scripts/seed-dois-treinadores.ts` cria duas contas com 3
exemplares cada; `scripts/bot-bia.js` é um adversário automatizado.

---

## Os seis travamentos

| # | Travamento | Origem |
|---|---|---|
| 1 | Convite aceito com um dos lados **sem nenhum professor** | relato em jogo |
| 2 | Notificação de desafio **some ao navegar** para outra tela | relato em jogo |
| 3 | Reconexão sem sala: o servidor **não responde nada** (P1) | `BUG-BATALHA-TRAVANDO.md` |
| 4 | **Socket zumbi** ao voltar para o app (P2) | idem |
| 5 | `connect()` **retorna cedo** com socket morto em mãos (P4) | idem |
| 6 | Fase de seleção **sem ter o que selecionar**, e sem saída | relato em jogo |

Os três do documento (P1, P2, P4) continuam **não implementados** — confirmado
lendo `stores/battle.js` e `battle.gateway.ts`. P5 (sessão de 15 min) já foi
resolvido: a sessão passou para 8 horas no commit `043bebc`.

---

## 14.1 — Convite sem professor

**Problema.** `invite:accept` (`battle.gateway.ts:284`) valida presença, status
e cooldown, e **cria a sala**. Ninguém pergunta se os dois têm exemplar. Quem
não tem nada entra em `picking`, não consegue confirmar time, e os **dois**
ficam presos até o timeout de 60s — com o status em `em_batalha`, invisíveis
para o resto do lobby.

**O que fazer.** Checar quantidade de capturas nos **dois** lados, em dois
pontos:

- `invite:send` — recusa com "Você ainda não capturou nenhum professor" (quem
  convida) ou "<Nome> ainda não tem professores para batalhar" (o alvo).
- `invite:accept` — a mesma checagem, porque entre o envio e o aceite passam até
  60 segundos. O handler precisa virar `async`.

É uma `capture.count({ where: { userId } })` por lado — barata e coberta pelo
índice `[userId, professorId]`.

No front, o botão "Desafiar" fica desabilitado quando o próprio aluno não tem
exemplar, com a razão escrita na tela (não um botão morto sem explicação).

**Onde mexer**

- `profdex-back/src/battle/battle.gateway.ts`
- `profdex-front/src/views/BatalhaView.vue`

**Critérios de aceite**

- Convite para quem não tem professor é recusado com mensagem, **sem criar
  sala** e sem mudar o status de ninguém.
- Aluno sem professor não consegue enviar convite, e a tela diz por quê.
- Um aluno que captura durante os 60s do convite consegue aceitar normalmente.

**Cuidados**

- A checagem no aceite é a que importa: é a última antes de a sala nascer.
- Não usar o front como fonte — ele desabilita o botão por cortesia, não por
  segurança.

---

## 14.2 — Saída da fase de seleção

**Problema.** Entrou em `picking` e não há o que fazer? Só o timeout de 60s
tira dali. Com 14.1 no lugar o caminho principal fecha, mas sobram bordas
(resync trazendo o jogador para uma seleção que ele não quer, exemplar
desaparecendo entre o convite e o pick).

**O que fazer.** Comando novo `battle:leave`, válido **só** nas fases `picking`
e `preview`: cancela a sala para os dois, emite `battle:cancelled` com
`reason: 'left'`, e **não** consome cooldown nem pontua — exatamente como o
`onPickTimeout` já faz quando ninguém escolheu. A tela ganha um botão "Sair da
seleção".

Além disso, `PvpPickView` passa a mostrar estado explícito quando o aluno não
tem exemplar nenhum, em vez de uma lista vazia sem explicação.

**Onde mexer**

- `profdex-back/src/battle/battle.gateway.ts`
- `profdex-back/src/battle/battle-room.service.ts`
- `profdex-front/src/stores/battle.js`
- `profdex-front/src/views/PvpPickView.vue`

**Critérios de aceite**

- `battle:leave` em `picking`/`preview` fecha a sala, devolve os dois ao status
  `disponivel` e leva as duas telas ao lobby.
- `battle:leave` em `active`/`switching` é **recusado** — desistir de batalha
  começada é abandono, e o abandono já tem regra própria (3 faltas).
- Nenhum registro em `battles` é criado (a linha só nasce em `begin()`).

**Cuidados**

- Não transformar isso em rota de fuga de derrota. Por isso a trava por fase.

---

## 14.3 — A notificação de desafio alcança o aluno em qualquer tela

**Problema.** O socket só conecta em `BatalhaView`, `PvpPickView` e
`PvpArenaView`, e o banner de desafio existe **só na primeira**. Sair da tela de
batalha esconde o convite — que morre em 60s sem o aluno saber que existiu. É o
"mexer rápido na tela e sumir a notificação".

**O que fazer**

- Conectar o socket **logo após o login**, em todas as rotas autenticadas.
- Extrair o banner de convite da `BatalhaView` para um componente montado no
  `App.vue`, visível em qualquer tela, com aceitar/recusar e contagem
  regressiva. Aceitar leva direto para a seleção.

O que **não** muda: a lista de jogadores continua sob demanda
(`lobby:subscribe` ao abrir o modal). O que escalava mal era ela — ver
`CARGA-PVP.md`. O custo novo é um socket e uma entrada de presença por aluno
logado.

**Onde mexer**

- `profdex-front/src/App.vue`
- `profdex-front/src/components/ConviteBanner.vue` (**novo**, extraído da
  `BatalhaView`)
- `profdex-front/src/stores/battle.js` e `stores/auth.js` (conectar no login,
  derrubar no logout — o listener de `auth:expired` já existe)
- `profdex-front/src/views/BatalhaView.vue` (remove o banner local)

**Critérios de aceite**

- Recebendo um convite enquanto navega na Profdex, no perfil ou no scan, o
  banner aparece e dá para aceitar de lá.
- Sair da tela de batalha **não** desinscreve nem derruba nada além do
  `lobby:unsubscribe` que já existe.
- Logout derruba o socket.

**Cuidados**

- Com a conexão global, o `disconnect` do store limpa `incomingInvites` — um
  blip de rede apaga um convite que o servidor ainda considera vivo. Depois de
  reconectar, pedir o estado ao servidor em vez de assumir que não há nada.
- O banner não pode cobrir a navegação inferior nem o botão de ação da tela em
  que aparece.

---

## 14.4 — P1: o servidor sempre responde a reconexão

**Problema.** Em `handleConnection`, quando **não** há sala ativa, nada é
enviado. O cliente que voltou com `pvp.phase === 'active'` e
`youMoved === true` fica com os botões mortos para sempre — o `canAct` da arena
depende exatamente desses dois campos, e nenhum evento chega mais para
corrigi-los. Só o F5 resolve, porque joga o estado fora.

**O que fazer.** Emitir `battle:resync` **sempre**, com `{ phase: 'idle' }`
quando não há sala. No cliente, `phase === 'idle'` limpa o `pvp`, mostra "a
batalha foi encerrada enquanto você esteve sem conexão" e volta ao lobby.

Vale também para o handler `battle:resync` pedido pelo cliente, que hoje
devolve `{ ok: false }` e não emite nada.

**Onde mexer**

- `profdex-back/src/battle/battle.gateway.ts` (`handleConnection` e
  `onBattleResync`)
- `profdex-back/src/battle/battle-room.service.ts` (`resync` devolve o estado
  `idle` em vez de `null`)
- `profdex-front/src/stores/battle.js` (handler de `battle:resync`)

**Critérios de aceite**

- Reconectar sem sala ativa leva ao lobby com o aviso, a partir de qualquer
  fase em que o cliente estivesse.
- A arena nunca fica com botão morto depois de um resync.

---

## 14.5 — P2: detectar o socket zumbi

**Problema.** Quando o sistema operacional congela a aba, `socket.connected`
continua `true` por até ~45s (`pingInterval` 25s + `pingTimeout` 20s). Nessa
janela `command()` acha que tem conexão, emite no vazio e só devolve erro no
timeout de 5s.

**O que fazer.** No `visibilitychange` para `visible`, disparar um
`battle:resync` com ack e timeout curto (~2s). Sem resposta, forçar
`socket.disconnect(); socket.connect()`. Resolve a janela morta **e** já traz o
snapshot na volta.

**Onde mexer**

- `profdex-front/src/stores/battle.js`

**Critérios de aceite**

- Voltando ao app depois de minutos em segundo plano, a tela reflete o estado do
  servidor em poucos segundos, sem F5.
- O listener é registrado uma vez só e removido no `disconnect`.

**Cuidados**

- Não disparar o ciclo a cada troca de aba num desktop: só quando o documento
  ficou oculto por mais que alguns segundos.

---

## 14.6 — P4: `connect()` reconectar de fato

**Problema.** `stores/battle.js:59` é `if (socket) return`. Com um objeto de
socket desconectado em mãos, chamar `connect()` de novo **não faz nada** — e as
três telas de batalha chamam `connect()` no `onMounted` justamente contando com
isso funcionar.

**O que fazer.** Se o socket existe mas está desconectado, chamar
`socket.connect()`.

**Onde mexer**

- `profdex-front/src/stores/battle.js`

**Critérios de aceite**

- `connect()` com socket desconectado reabre a conexão.
- `connect()` com socket conectado continua sendo no-op (é chamado em todo
  `onMounted`).

---

## Testes exigidos

1. `battle.gateway.spec.ts` — convite recusado quando qualquer um dos dois não
   tem captura, no envio **e** no aceite; nenhuma sala criada; status intacto.
2. `battle-room.service.spec.ts` — `battle:leave` fecha a sala em `picking` e
   `preview`, é recusado em `active`, e não cria linha em `battles`.
3. `battle.gateway.spec.ts` — `handleConnection` sem sala emite
   `battle:resync` com `phase: 'idle'`.
4. Front (`test/`) — o handler de `resync` com `phase: 'idle'` limpa o `pvp`;
   `connect()` reconecta socket desconectado.
5. `npm run pvp:smoke` continua passando.
6. Teste manual com duas contas (`seed-dois-treinadores`): convidar, navegar
   para outra tela, aceitar pelo banner global.

---

## Documentação

Atualizar `docs/BUG-BATALHA-TRAVANDO.md`: marcar **P1, P2 e P4 como
implementados** (com o número desta tarefa), registrar que **P5 já foi resolvido**
pela sessão de 8h, e acrescentar à Parte 2 os dois travamentos que o documento
não previa — o convite sem professor e a notificação presa a uma tela só. P6
(cortar o WebGL do fundo) segue **fora de escopo**: é otimização, não softlock.

---

## Ordem de execução e riscos

1. **14.6** e **14.4** — as duas menores, e as que sustentam todas as outras.
2. **14.1** e **14.2** — o par do convite/seleção.
3. **14.3** — a maior mudança de comportamento do front.
4. **14.5** — fecha.

**Risco principal:** 14.3 mudar o perfil de carga. Hoje só quem entra na área de
batalha abre socket; depois, todo aluno logado abre. Com 1000+ alunos vale medir
o número de conexões simultâneas antes do evento — `CARGA-PVP.md` tem o método.

**Risco secundário:** a reconexão forçada de 14.5 entrar em laço com o backoff
de reconexão do Socket.IO (que é largo e embaralhado de propósito, para uma
oscilação de Wi-Fi não derrubar todo mundo junto). Garantir que o ciclo
`disconnect/connect` só dispare por `visibilitychange`, nunca em cadeia.
