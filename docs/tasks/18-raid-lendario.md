# Tarefa 18 — Raid do professor lendário

**Prioridade:** alta — é conteúdo de evento, e o evento abre em **28/09/2026**
**Perfil:** full-stack (Prisma + Nest + Socket.IO + Vue)
**Depende de:** 🔗 **tarefa 10** (batalha em time e o motor no servidor) e
🔗 **tarefa 15** (professores raros — o padrão de silhueta e de gate)
**Origem:** entrevista de design com o Gustavo em 27/09/2026. As decisões da
tabela abaixo estão **fechadas** — não reabrir sem alinhar.

> **Status: IMPLEMENTADO.** Como validar:
>
> - Unit: `npm test` em `profdex-back` (503 testes; os novos estão em
>   `battle/raid.service.spec.ts`, `battle/raid-room.service.spec.ts` e
>   `battle/engine/bot.spec.ts`).
> - Integração: com o backend de dev no ar e um lendário cadastrado,
>   `npm run raid:smoke` percorre pela rede o fluxo inteiro — recusa antes da
>   dex fechar → captura de todos os comuns → destravamento → `raid:start` →
>   time → lead → turnos → fim → captura e fila do prêmio no banco.
> - Manual: `npm run db:seed-dex-completa` cria a conta `dex` (senha
>   `senha123`) com a Profdex inteira. Entre com ela, abra `/profdex` e o card
>   ⚡ estará lá, piscando, na posição `Y+1`.
>
> Mapa do código: back em `profdex-back/src/battle/raid.service.ts`
> (elegibilidade), `raid-room.service.ts` (a sala), `raid.controller.ts`
> (`GET /raid/status`) e `engine/bot.ts` (a IA); front em `stores/battle.js`
> (`mode: 'raid'` + `startRaid`), `stores/professors.js` (`raid`),
> `views/ProfdexView.vue` (o card) e as duas telas do PvP reusadas.

---

## O que é

> Quem captura **todos os professores comuns** destrava uma **raid**: uma
> batalha contra o professor **lendário**, controlado pelo servidor. O aluno
> leva até 3 exemplares; vencendo, **captura o lendário e completa a Profdex**.

> ⚠️ **Atualizado em 29/09/2026:** o gate passou a exigir **comuns E raros**, e
> o primeiro aluno a vencer gera um **e-mail** para a organização. Ver a entrada
> de 29/09/2026 no `INDEX.md`. O resto desta tarefa continua valendo.

> ⚠️ **Atualizado em 29/09/2026 (noite):** além da coleção, agora existe uma
> trava de **HORÁRIO** — `raid.opens_at` no painel, padrão **01/10 às 19h**.
> Fechar a Profdex antes disso destrava o card, mas não o botão: aparece a hora
> e, na última hora, a contagem. Ver a entrada no `INDEX.md`.

O evento é **opcional**. Na Profdex ele aparece como a
entrada `qtd_professores + 1`: silhueta com `???`, piscando colorido, e um
botão **CAPTURAR**. Tentativas são ilimitadas, com cooldown entre elas.

A pergunta que a feature precisa responder no fim do evento é **"quem capturou
primeiro?"** — porque esse aluno ganha um prêmio.

---

## Decisões de produto (fechadas)

| # | Decisão | Escolha | Por quê |
|---|---|---|---|
| 1 | Onde a batalha roda | **Sala nova no servidor** (`RaidRoomService`), irmã da do PvP, reusando `engine/` e `team.ts` | O prêmio é uma captura real e um "primeiro lugar". No cliente, um `fetch` no console venceria a raid. E generalizar `BattleRoomService` significaria um `if (isBot)` em cada uma das regras escritas para dois humanos — no arquivo mais frágil do projeto |
| 2 | Onde mora a lendariedade | **`professors.legendary`**, coluna própria, imutável na criação | A semântica difere do raro em todos os eixos: gate é a dex (não o quiz), aquisição é batalha (não papel), e ele **conta** para completar a Profdex |
| 3 | Quantos lendários | **Um ativo por evento**, cadastrado no painel; o segundo é recusado com 409 | A Profdex desenha **um** card na posição `Y+1` e o gate pergunta "qual é o lendário?" no singular |
| 4 | Variante | **Única**, a combinação completa dos tipos | Igual ao raro (tarefa 15, decisão 1): ele não passa pelo sorteio e não tem pilha de papel, então combinações parciais nasceriam órfãs |
| 5 | O que destrava | Todos os professores `rare:false`, `legendary:false`, `active:true` capturados | Os três filtros importam: sem `legendary` o gate seria **circular**; sem `active` a dex fica incompletável no primeiro "remover" do painel |
| 6 | O destravamento tranca de novo? | **Não.** Gravado em `raid_unlocks`, nunca recalculado | Mesmo princípio de `RareUnlock`. Cadastrar um professor às 15h não pode tirar a raid de quem fechou a coleção às 14h |
| 7 | O corpo do chefe | `maxHp = 4 × 120 = 480` e IV **15** nos quatro — **ambos configuráveis** no painel | O aluno leva ~375 de HP somado: 2× ele passa fácil, 3× é moeda justa, 4× exige jogar bem. Ninguém sabe qual é o certo antes de ver 20 alunos tentarem, e a alternativa seria deploy no meio do evento |
| 8 | Regras especiais do chefe | **Nenhuma.** Sem escudo por fase, sem golpe duplo | Tudo que ele faz de especial cabe em `maxHp` + IVs. Escudo exigiria mexer no `engine.ts`, que tem uma cópia gêmea no front e quebraria o treino de graça |
| 9 | O cérebro | **`chooseEnemyMove` portado do front**, sem "melhorias" | Uma IA ótima contra um time ruim vira parede que ninguém passa — e aí o prêmio do primeiro nunca é entregue. Se ficar fácil, o ajuste é `raid.hp_multiplier` (um clique), não a IA (deploy) |
| 10 | O time do aluno | **1 a 3**, validação idêntica à do PvP; raro liberado | Exigir exatamente 3 seria caminho divergente para impedir algo que só prejudica quem faz |
| 11 | Teto de turnos | **60, configurável.** No teto, **o lendário vence** | 480 de HP contra golpes de 20–35 chega perto de 35 turnos; o teto de 40 do PvP viraria o juiz. E "quem tem mais HP somado" é regra de simetria — contra um chefe, o tempo acabar significa que ele resistiu |
| 12 | Tentativas | **Ilimitadas**, cooldown de **30 min** configurável, contado do **FIM** | Contar do início transformaria raid longa em cooldown de graça |
| 13 | O que consome cooldown | Derrota, abandono e limite de turnos **sim**; queda de rede e restart **não** (`anulada`) | Sem o abandono na conta, quem está perdendo fecha o app e tenta de novo na hora. E cobrar 30 min por um deploy nosso é cobrar um erro que não é do aluno |
| 14 | O prêmio | Exemplar com **IV 15 nos quatro**, status normais (sem o 4×), **liberado no PvP**, **uma por conta para sempre** | Decisão do Gustavo. O `iv-balance.spec.ts` mede que IV total maior vence ~53% — pequeno, mas **real**: todo aluno que fechar a dex passa a ter um 15/15/15/15 no ranqueado. Banir o maior prêmio do evento do modo principal seria punir quem ganhou |
| 15 | Depois de capturar | O card vira capturado, a raid some, e o total da dex é `Y+1` | É o que torna verdade "capturei o lendário e completei a Profdex" |
| 16 | Quando o card aparece | **Só ao destravar** | Um `???` piscando desde o dia 1 faria 900 alunos perguntarem na mesa o que é aquilo, e a resposta ("nada que você possa fazer hoje") é a pior frase possível na fila |
| 17 | As telas | **`PvpPickView` e `PvpArenaView` reusadas** em modo raid, pulando o `preview` às cegas | Copiá-las daria 1900 linhas duplicadas de duas telas que ainda estão recebendo correção |
| 18 | Métricas | `raid_unlocks`, `raid_attempts` (cooldown + funil) e `raid_clears` (a fila do prêmio) | "Quem foi o primeiro?" vale um prêmio físico e não pode depender de arqueologia de logs com a fila esperando |
| 19 | Engajamento | `raid_started` **0**, `legendary_captured` **200** (270 com a captura) | Acima do raro (210), que é o que faz sentido: o lendário exige a Profdex inteira antes da primeira tentativa |
| 20 | Visibilidade do "primeiro" | **Só no `/admin/metrics`** durante o evento | Anunciar ao vivo que o primeiro lugar já saiu tira o motivo de os outros 900 tentarem |

---

## Modelo de dados

```prisma
model Professor {
  // ...
  /// Não sai em ficha nenhuma, não conta no gate da PRÓPRIA raid (seria
  /// circular), mas CONTA para completar a Profdex depois de capturado.
  legendary Boolean @default(false)
}

/// Fechou a Profdex. Permanente, nunca recalculado (decisão 6).
model RaidUnlock {
  userId  String @unique
  dexSize Int    // auditoria: "destravou com a dex de qual tamanho?"
}

/// Sustenta o cooldown, como `quiz_attempts` sustenta o da bancada.
/// `result: 'anulada'` é o único que NÃO faz o aluno esperar.
model RaidAttempt {
  userId, professorId, startedAt, endedAt?, result?, turns
  @@index([userId, endedAt(sort: Desc)])
}

/// A fila do prêmio. Uma linha por aluno, ordenada por `clearedAt`.
model RaidClear {
  userId String @unique  // é este unique que resolve duas abas vencendo juntas
  professorId, captureId?, attemptId?, attempts, clearedAt
  @@index([clearedAt])
}
```

Migration: `20260927000000_add_raid_lendario`. Aditiva, sem backfill, e **não
zera o Elo** — a raid é PvE e não pontua no ranqueado, então as partidas de
antes e depois continuam medindo o mesmo jogo.

---

## A máquina de estados

```
picking ──▶ preview ──▶ active ⇄ switching ──▶ done
```

As mesmas fases do PvP, e os **mesmos eventos de socket** — é isso que faz as
duas telas serem reusáveis. As diferenças:

| | PvP | Raid |
|---|---|---|
| `preview` | Revela o time do rival depois do pick às cegas | Não há revelação: transição imediata, a fase sobrevive só como a tela de "quem entra primeiro" |
| Turno | Espera os dois submeterem | O chefe decide na hora; a rodada resolve no ato |
| Teto de turnos | 40, vence quem tem mais HP somado | 60 (configurável), **vence o chefe** |
| Elo | Aplicado | **Nunca** |
| `mode` no payload | ausente (= `'pvp'`) | `'raid'` |

Um aluno só pode estar em **uma** sala: o gateway consulta
`RaidRoomService.hasActiveRoom` primeiro e despacha todos os comandos de
batalha para a sala certa. Durante a raid ele fica `em_batalha` no lobby, então
ninguém o convida.

---

## Ajustes ao vivo (`/admin/configuracoes`)

| Chave | Padrão | Faixa |
|---|---|---|
| `raid.hp_multiplier` | 4 | 1–10 |
| `raid.legendary_iv` | 15 | 0–15 |
| `raid.turn_cap` | 60 | 20–200 |
| `raid.cooldown_minutes` | 30 | 0–240 |
| `raid.opens_at` | `2026-10-01T19:00:00-03:00` | data e hora |

Os três primeiros são **congelados no nascimento da sala**: mexer no painel com
uma raid em andamento não muda a vida do chefe com o aluno já lutando.

`raid.opens_at` é o contrário: lido a **cada tentativa**, porque é trava de
porta — adiantar a abertura precisa valer para a próxima pessoa que apertar o
botão, não para a próxima sala. A hora é a do **evento** (Londrina), guardada
com o offset explícito porque produção roda em UTC. **Para abrir agora, ponha
uma data no passado.**

> ⚠️ `raid.hp_multiplier` tensiona a regra do topo de `settings.ts` ("regra que
> muda o significado do dado continua constante de código"). Entra como exceção
> **datada**: ninguém sabe se 4× é justo até ver os primeiros alunos, e o
> conserto não pode exigir deploy. O que continua constante é o que muda o
> SIGNIFICADO do resultado — quem vence no teto, o que consome cooldown.

---

## O número para olhar na primeira hora

`/admin/metrics` → seção **Raid ⚡** → **taxa de vitória**.

É ele que diz se o 4× ficou justo, e é acionável **enquanto** o painel ainda
resolve. Perto de 0% com dezenas de tentativas: baixe o multiplicador. Perto de
100%: suba. A seção também tem a **fila do prêmio** (posição, nome, matrícula,
horário, nº de tentativas) — sem a matrícula você teria um nome e mil alunos.

---

## Riscos conhecidos

- **Instância única.** A sala vive em memória, como a do PvP. Deploy no meio do
  evento derruba raids ativas — elas são **anuladas** (sem cooldown), e o boot
  varre tentativas órfãs. Escalar horizontal exigiria Redis, como já está
  documentado para o PvP.
- **IV perfeito no ranqueado (decisão 14).** Todo aluno que fechar a dex passa a
  ter um 15/15/15/15 disponível no PvP. O efeito medido é ~53% de vitória para
  o IV total maior — pequeno, mas real. Se desequilibrar, bani-lo da seleção de
  time é **uma linha** em `team.ts`, e dá para virar durante o evento; o
  contrário (soltar depois) não dá.
- **A raid é inalcançável até alguém fechar a dex.** No dia 1, com ficha de
  papel e cooldown de 10 min por tema na bancada, isso é aproximadamente
  ninguém. É folga para ajustar, não motivo para relaxar o teste.
