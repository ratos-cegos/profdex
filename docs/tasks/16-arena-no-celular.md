# Tarefa 16 — A arena no celular (e o raro de 5 estrelas)

**Prioridade:** alta — o PvP é jogado no celular, no evento, e hoje a tela
esconde justamente os dois personagens que ela existe para mostrar
**Perfil:** full-stack leve (uma função no Nest, o resto é Vue + CSS)
**Depende de:** 🔗 **tarefa 15** (professor raro) — concluída e em produção
**Origem:** entrevista de design com o Gustavo em 25/09/2026, a partir de
capturas de tela do PvP num Samsung. As decisões da tabela "Decisões de
produto" estão **fechadas** — não reabrir sem alinhar.

---

## Contexto do projeto

O ProfDex é uma "Pokédex de professores" para a semana tecnológica da UNIFIL
(1000+ alunos). Existem **duas** telas de batalha, e elas divergiram:

| Tela | Rota | Arquivo | Estado |
|---|---|---|---|
| **Treino** (contra um professor) | `/arena/:id` | `ArenaView.vue` (802 linhas) | **Aprovada.** É a referência desta tarefa |
| **PvP ranqueado** | `/batalha/pvp/arena` | `PvpArenaView.vue` (902 linhas) | É o que esta tarefa conserta |

**Documentos que você precisa ler antes de mexer**

| Documento | Por quê |
|---|---|
| `docs/BATALHA-PVP.md` | O fluxo do PvP: convite, seleção às cegas, turnos, Elo |
| `docs/BATALHA.md` | O motor de combate e o papel dos IVs |
| `docs/tasks/15-professores-raros.md` | **A decisão 13 dela é revertida aqui** — leia antes de estranhar |
| `.codex/CODE_STYLE.md` | SFC acima de 400 linhas com mais de uma responsabilidade deve ser extraído; tokens de CSS; sem valor mágico repetido |

### Como funciona hoje

**O palco do treino funciona porque os lutadores têm quadro próprio.** Em
`ArenaView.vue`, o palco é `position: relative` e cada lutador é um quadro
**absoluto, em porcentagem** — o inimigo ocupa `38% × 24%` no alto à esquerda,
o jogador `42%` embaixo à direita —, e o sprite preenche esse quadro com
`object-fit: contain`. O tamanho não depende de mais nada na tela. As barras de
HP ficam **sobrepostas** ao palco, num HUD próprio.

**O palco do PvP não tem quadro.** Em `PvpArenaView.vue`, cada lado é uma
coluna flex (`.pvp-arena__foe`, `.pvp-arena__you`) que empilha barra de HP,
banco de reservas e sprite. O sprite é `flex: 1; min-height: 0`, ou seja:

> **o tamanho do personagem é o espaço que sobrou.**

É a causa raiz de "não dá para ver os personagens". Quem tem mais coisa na
coluna fica menor, e os dois lados ficam em escalas diferentes sem que ninguém
tenha escolhido isso. O banco de reservas do rival, que fica **entre** a barra
de HP e o sprite dele, é o que mais espreme.

**O jogador vê o próprio professor de frente.** `PvpArenaView.vue:135-136`:

```js
const youSprite = computed(() => spriteFrenteDe(pvp.value?.you?.professor))
const foeSprite = computed(() => spriteFrenteDe(pvp.value?.foe?.professor))
```

As duas usam `spriteFrenteDe`. O treino usa `spriteCostasDe` no jogador
(`ArenaView.vue:145`), que é a perspectiva clássica de batalha por turnos. É
bug, não escolha — e `spriteCostasDe` já cai no sprite frontal para quem não
tem arte de costas, então corrigir é seguro para o elenco inteiro.

**A faixa de comandos muda de altura sozinha.** Ela alterna entre três blocos
mutuamente exclusivos, nenhum com altura reservada:

1. `pvp.phase === 'switching'` → painel "Quem entra agora?"
2. `trocaAberta` → painel de troca
3. senão → grade de golpes + botão "⇄ Trocar"

Daí os dois sintomas relatados, que são **o mesmo defeito**: a tela pula quando
um golpe é usado (bloco 3 → 1) e os golpes somem quando o professor cai (a
grade alta vira uma linha só, "o rival está escolhendo quem entra…").

**O raro é estatisticamente igual a qualquer um.** A decisão 13 da tarefa 15
mandou sortear os IVs do raro normalmente, para o Elo não medir quem respondeu
quiz. `rollCaptureIvs` sorteia 0–15 em quatro atributos, e
`starsFromIvs` = soma ÷ 60 × 5 — cinco estrelas exigem os quatro em 15.

### O que muda

Duas frentes independentes, no mesmo doc porque saíram da mesma conversa:

1. **O raro nasce com 5 estrelas.** IVs fixos em 15, de verdade — ele fica mais
   forte em combate.
2. **O PvP adota o palco do treino**, por extração de um componente comum, e a
   faixa de comandos para de se mexer.

---

## Decisões de produto (fechadas)

| # | Decisão | Escolha | Por quê |
|---|---|---|---|
| 1 | Estrelas do raro | **5 de verdade** — IVs 15 nos quatro | É o que dá sentido aos ~100 min de bancada. Estrela **é** IV: não há "5 estrelas decorativas" sem mentir na ficha |
| 2 | Efeito no Elo | **Aceito, conscientemente.** Reverte a decisão 13 da tarefa 15 | Mitiga sozinho: time de até 3 e **1 raro por conta**, então ele é no máximo 1/3 do time, nunca um trunfo isolado |
| 3 | Onde mora a regra dos 15 | **Em `rollCaptureIvs`**, que passa a receber o professor | Função **pura e já testada**, num lugar só. O banco passa a refletir o que o aluno vê, e ninguém precisa lembrar da exceção numa consulta nova |
| 4 | Retroatividade | **Não.** Quem capturou antes fica com o sorteado | Consequência aceita: dois alunos podem ter o mesmo raro com estrelas diferentes. Na prática é quase teórico — produção não tinha raro capturado quando a decisão foi tomada |
| 5 | Alvo da tela | **Celular, alvo único.** Desktop só não pode quebrar | 1000+ alunos com celular na mão; desktop é ambiente de teste. Tratar os dois como requisito dobra o trabalho de uma tela mexida sob prazo |
| 6 | Como unificar as telas | **Extrair um palco compartilhado** a partir do treino | Copiar o layout resolveria hoje e divergiria no próximo ajuste — foi exatamente assim que chegamos aqui |
| 7 | Fidelidade do treino | **Pixel-idêntico.** O treino é a referência, não o refatorado | O que já foi aprovado vira a especificação; o PvP converge para ele. Qualquer diferença visível no treino é regressão |
| 8 | Fronteira do componente | **Dentro:** fundo (cenário, câmera AR, marca), dois lutadores em quadro fixo, animação de dano, barras de HP sobrepostas. **Fora:** comandos, timer, mensagem, banco de reservas, botões | O palco é idêntico nas duas por natureza; o que difere são os comandos |
| 9 | Altura da faixa de comandos | **Travada pelo maior dos três blocos** | É a causa única dos dois sintomas relatados |
| 10 | Durante a resolução do turno | **Golpes visíveis e desabilitados** | Dizem "é sua vez daqui a pouco" e mantêm a leitura do time. Sumir com eles é o que dá a sensação de tela quebrada |
| 11 | Banco de reservas | **Sai do palco** para uma linha fina no topo da faixa de comandos | É ele que espreme o sprite do rival. Fora do palco, sobram só os dois lutadores — que é a queixa original |
| 12 | Normalização de sprite | **Só CSS**: quadro de altura fixa, `object-fit: contain`, alinhamento pelo pé | O problema não é a arte, é o `flex: 1`. Recortar o PNG de todo o elenco é trabalho manual grande, sob prazo, com a arte já impressa nas fichas |
| 13 | Timer | **Fica onde está**, na linha da mensagem | Ninguém reclamou dele; mexer no que não incomoda é risco sem retorno |
| 14 | Caixa de diálogo | **PvP adota a moldura do treino** | É boa parte do porquê de uma tela "parecer certa" e a outra não. As duas já usam a mesma variável `message` — a diferença é só apresentação |
| 15 | Fim de batalha | **Fora de escopo** | O PvP já sai para `/batalha` no fim e a tela de resultado é outra. Escopo que cresce sozinho faz spec virar projeto |

---

## 16.1 — O raro nasce com 5 estrelas

**Problema.** O raro sai do sorteio de IVs como qualquer professor, então quem
passou ~100 minutos na bancada pode receber um exemplar pior que uma captura
comum.

**O que fazer.**

1. `rollCaptureIvs(random)` passa a aceitar um segundo parâmetro opcional:
   `rollCaptureIvs(random, { rare = false })`. Com `rare: true`, devolve `15`
   nos quatro atributos **sem consumir o RNG** — chamar o sorteio e descartar o
   resultado deixaria o teste de IV do comum dependente da ordem das chamadas.
2. `CapturesService.captureByToken` passa a flag. O valor já está à mão no
   fluxo: `ficha.variant?.professor.rare`, o mesmo que hoje alimenta a métrica
   `rare_captured`.
3. Nada mais muda: `starsFromIvs` já devolve 5 para quatro 15s, e o motor de
   combate (back e front) já lê os IVs gravados.

**Onde mexer.** `profdex-back/src/captures/capture-ivs.ts` ·
`profdex-back/src/captures/captures.service.ts`

**Critérios de aceite.**

- Capturar um raro grava `ivHp = ivRigor = ivDidatica = ivRaciocinio = 15`.
- `GET /captures` do dono mostra o raro com **5 estrelas**.
- Captura **comum** continua com IVs sorteados — a distribuição não muda, e o
  teste existente de sorteio continua passando sem ajuste.
- Um raro capturado **antes** desta mudança continua com os IVs que tinha
  (decisão 4).

**Cuidados.**

- **Não confunda com o bug do `star-rating-scope`.** Existe um teste de
  regressão (`profdex-front/test/star-rating-scope.test.js`) para um defeito em
  que as estrelas apareciam **sempre** 5/5 por vazamento de escopo de CSS.
  Depois desta tarefa, "5 estrelas" deixa de ser sintoma: o raro mostra 5
  legitimamente. O teste continua válido — ele guarda o seletor, não o valor.
- O front tem motor próprio (`composables/battleEngine.js`, com `ivBonus` e
  `effectiveStat`), então o efeito aparece nos dois lados sem mudança extra.

---

## 16.2 — Palco compartilhado, extraído do treino

**Problema.** Duas telas de batalha com o mesmo palco e CSS independentes. Uma
está boa, a outra não, e o próximo ajuste vai divergir de novo.

**O que fazer.**

1. Criar `components/ArenaPalco.vue` a partir do que **já existe em
   `ArenaView.vue`** — não redesenhar. Ele recebe por props os dois lutadores
   (professor, HP, HP máximo, estados `hit`/`fainted`), a lista de popups de
   dano de cada lado e a flag de AR.
2. O palco é `position: relative`, e cada lutador é um **quadro absoluto em
   porcentagem**, como hoje no treino:
   - inimigo: alto à esquerda, `width: 38%`, `height: 24%`, com o contorno
     vermelho por `drop-shadow` (segue a silhueta do PNG transparente, ao
     contrário de um `outline` retangular);
   - jogador: embaixo à direita, `width: 42%`, ancorado de forma a não cobrir a
     barra de HP dele.
3. O sprite preenche o quadro com `object-fit: contain` e
   `object-position: bottom center`. **O tamanho do personagem não pode
   depender de mais nada na tela** — é o que quebra hoje no PvP.
4. As barras de HP ficam **sobrepostas** ao palco, dentro do componente.
5. `ArenaView.vue` e `PvpArenaView.vue` passam a usá-lo. O PvP perde as colunas
   flex `.pvp-arena__foe` / `.pvp-arena__you`.

**Onde mexer.** `profdex-front/src/components/ArenaPalco.vue` (novo) ·
`profdex-front/src/views/ArenaView.vue` · `profdex-front/src/views/PvpArenaView.vue`

**Critérios de aceite.**

- O treino fica **visualmente idêntico** ao de hoje — inclusive o modo AR, o
  contorno vermelho do inimigo e as posições dos dois lutadores.
- No PvP, os dois personagens têm o mesmo tamanho e enquadramento do treino, e
  o tamanho **não muda** quando o banco de reservas some da coluna.
- Professores com proporções de arte diferentes ficam alinhados pelo pé, sem
  um flutuando acima do chão.
- As duas telas continuam funcionando com professor sem arte de costas
  (`spriteCostasDe` cai no sprite frontal).

**Cuidados.**

- O `ArenaView.vue` tem 802 linhas e o `PvpArenaView.vue` 902; o `CODE_STYLE`
  pede extração acima de 400 quando há mais de uma responsabilidade. Esta
  tarefa reduz as duas, mas **não** transforme isso numa refatoração geral —
  extraia o palco e pare.
- O AR só existe no treino. O componente aceita a flag; o PvP simplesmente não
  a liga.

---

## 16.3 — O jogador vê o próprio professor de costas

**Problema.** No PvP, os dois lados usam o sprite frontal. O jogador vê a
própria cara, e a cena perde a perspectiva de batalha por turnos.

**O que fazer.**

1. Extrair um módulo puro `src/composables/battleSprites.js` com
   `spritesDaBatalha(you, foe)`, devolvendo
   `{ you: spriteCostasDe(you), foe: spriteFrenteDe(foe) }`.
2. `PvpArenaView.vue` e `ArenaView.vue` passam a usá-lo. É o que torna o bug
   testável — componente Vue não é testado neste repositório, função pura é.

**Onde mexer.** `profdex-front/src/composables/battleSprites.js` (novo) ·
`profdex-front/src/views/PvpArenaView.vue` (linhas 135-136 de hoje) ·
`profdex-front/src/views/ArenaView.vue`

**Critérios de aceite.**

- No PvP, o seu professor aparece **de costas** e o rival **de frente**.
- Professor sem `spriteBackUrl` cai no frontal, sem quebrar.
- O treino continua exatamente como está.

---

## 16.4 — A faixa de comandos para de se mexer

**Problema.** A tela pula quando um golpe é usado, e os golpes somem quando o
professor cai. São o mesmo defeito: três blocos alternam no mesmo espaço, sem
altura reservada.

**O que fazer.**

1. Travar a altura da faixa de comandos pelo **maior** dos três blocos (grade
   de golpes + botão de troca, painel de entrada, painel de troca), com
   `min-height` derivado de uma medida única — não repita o valor em três
   seletores.
2. Durante a resolução do turno, os golpes ficam **visíveis e desabilitados**,
   não removidos.
3. Na queda, o painel "Quem entra agora?" ocupa **exatamente** o mesmo
   espaço — e o estado "o rival está escolhendo…" também, sem encolher.

**Onde mexer.** `profdex-front/src/views/PvpArenaView.vue`

**Critérios de aceite.**

- Usar um golpe **não move nada** na tela.
- Quando seu professor cai, os golpes não somem antes de o painel de entrada
  aparecer no mesmo lugar.
- Com o rival escolhendo quem entra, a faixa mantém a altura.
- Abrir e fechar "⇄ Trocar" não muda a altura.

**Cuidados.**

- A altura travada precisa caber num aparelho de tela curta sem empurrar o
  palco para fora — teste com a barra de endereço do navegador **visível**,
  que é o estado real do aluno (as capturas de origem são assim).

---

## 16.5 — Banco de reservas fora do palco

**Problema.** O `BancoDeReservas` do rival fica entre a barra de HP e o sprite
dele, dentro da coluna. Como o sprite é `flex: 1`, o banco literalmente rouba o
tamanho do personagem.

**O que fazer.**

1. Tirar os dois `BancoDeReservas` do palco e colocá-los numa **linha fina no
   topo da faixa de comandos**, os dois times lado a lado (o seu e o do rival).
2. A linha entra na conta da altura travada da 16.4.
3. O componente em si não muda de responsabilidade — só de lugar.

**Onde mexer.** `profdex-front/src/views/PvpArenaView.vue` ·
`profdex-front/src/components/BancoDeReservas.vue` (só se o tamanho exigir)

**Critérios de aceite.**

- O palco mostra **apenas** os dois lutadores, o fundo e as barras de HP.
- Continua dando para ver, de relance, quantos reservas cada lado tem e quem
  já caiu — essa informação é de decisão, não de menu.
- O tamanho do sprite do rival é idêntico ao do seu.

**Cuidados.**

- As reservas do rival são **públicas** de propósito: o time dele já foi
  revelado no preview e o HP de cada um foi visto em campo. Esconder não criaria
  segredo, só obrigaria a decorar. O comentário que diz isso está no código —
  leve-o junto.

---

## 16.6 — A caixa de diálogo do treino no PvP

**Problema.** As duas telas mostram a mesma variável `message`, mas o treino a
põe numa caixa com moldura e o PvP num `<p>` solto. Parte da sensação de "uma
está certa e a outra não" vem daí.

**O que fazer.** O PvP passa a usar a mesma moldura do treino para a mensagem
de turno, mantendo o timer na mesma linha (decisão 13). Se o estilo virar CSS
repetido nas duas views, extraia para o componente de mensagem — não duplique.

**Onde mexer.** `profdex-front/src/views/PvpArenaView.vue` ·
`profdex-front/src/views/ArenaView.vue`

**Critérios de aceite.**

- A mensagem de turno do PvP aparece na mesma moldura do treino.
- O timer continua na mesma linha, à direita, e continua ficando vermelho nos
  últimos 10 s.

---

## Testes exigidos

O front deste repositório testa **módulos JS puros** com `node --test`
(`profdex-front/test/*.test.js`); componentes Vue **não** são testados. O que
não couber nisso vai para o checklist manual abaixo, honestamente rotulado.

| Arquivo | O que fixa |
|---|---|
| `profdex-back/src/captures/capture-ivs.spec.ts` | `rollCaptureIvs(rng, { rare: true })` devolve 15 nos quatro **sem consumir o RNG**; sem a flag, a distribuição de hoje não muda |
| `profdex-back/src/captures/captures.service.spec.ts` | Capturar um raro grava IV 15; captura comum continua sorteando |
| `profdex-front/test/battle-sprites.test.js` (novo) | `spritesDaBatalha` devolve **costas** para você e **frente** para o rival; professor sem arte de costas cai no frontal |

### Checklist manual (celular real, barra de endereço visível)

- [ ] Treino: **pixel-idêntico** ao de hoje, inclusive AR e contorno do inimigo
- [ ] PvP: você de costas, rival de frente
- [ ] PvP: os dois personagens no mesmo tamanho do treino
- [ ] Usar um golpe não move nada na tela
- [ ] Professor cai: golpes não somem antes do painel de entrada aparecer
- [ ] Rival escolhendo quem entra: a faixa mantém a altura
- [ ] Abrir/fechar "⇄ Trocar" não muda a altura
- [ ] Palco sem banco de reservas; times visíveis na faixa de comandos
- [ ] Desktop não quebrou (não precisa estar bonito — decisão 5)

---

## Decisões residuais (tomadas nesta redação — conteste se discordar)

1. **O componente se chama `ArenaPalco.vue`** e vive em `components/`. Nome em
   português como o resto do domínio do front (`BancoDeReservas`,
   `ProfessorFace`).
2. **A flag de raro entra em `rollCaptureIvs` como objeto de opções**
   (`{ rare }`) e não como booleano posicional: o próximo ajuste de captura
   quase certamente quer outro campo, e `rollCaptureIvs(rng, true, false)` é
   ilegível.
3. **Nenhuma migração.** A tarefa não muda schema; os IVs já têm coluna.

---

## Fora de escopo (explicitamente)

- **Tela de fim de batalha** e a de resultado do PvP.
- **Repadronizar a arte dos professores** (enquadramento e proporção dos PNGs).
  Vale abrir depois do evento: melhoraria o alinhamento que a 16.2 resolve por
  CSS, mas é trabalho manual sobre arte já impressa nas fichas.
- **Layout próprio para desktop.**
- **Retroatividade das estrelas** de raros já capturados.
- **Testes de componente Vue** (Vitest / Testing Library). Infraestrutura nova
  no meio do evento; o que dá para testar hoje vira função pura.
