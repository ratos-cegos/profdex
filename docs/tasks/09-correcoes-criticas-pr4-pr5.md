# Tarefa 9 — Correções críticas antes de integrar os PRs #4 e #5

**Prioridade:** bloqueante (nenhum dos dois PRs deve entrar em `main` como está)
**Perfil:** back-end (9.1, 9.2), front-end (9.3, 9.4), full-stack (9.5)
**Origem:** revisão dos PRs
[#4](https://github.com/ratos-cegos/profdex/pull/4) (Quiz Treino) e
[#5](https://github.com/ratos-cegos/profdex/pull/5) (correções + IVs + foto RA + marca).

---

## Contexto

Os dois PRs entregam trabalho real e, em boa parte, bem feito:

- **#4** acerta a telemetria do treino (0 ponto / 0 interação de propósito), não
  toca em `quiz_attempts`, e o `practiceQuiz` do rollup usa allowlist de tema e
  comparação de string em vez de `::boolean` — a correção descrita na própria
  descrição do PR é legítima e o raciocínio está certo.
- **#5** tem um back-end de IVs bem desenhado: RNG injetado como manda o
  `CODE_STYLE`, backfill determinístico por `md5(id)` idempotente, `CHECK`
  de faixa 0–15 na migration, DTO com allowlist, e paridade mantida entre
  `engine.ts` e `battleEngine.js`. O `src/services/ar-photo.js` também está bom
  (trata `AbortError`, garante ≥1080 px, tem fallback quando a marca não carrega).

Ambos compilam e seus testes passam:

| | back build/testes | front build/testes |
|---|---|---|
| #4 | ✅ 141/141 | ✅ 9/9 |
| #5 | ✅ 130/131¹ | ✅ 13/13 |

¹ a falha é `auth-session.spec.ts`, **pré-existente na `main`** — não é dos PRs.

O que segue são os pontos que impedem o merge.

---

## 9.0 — Os dois PRs conflitam entre si

Ambos estão `MERGEABLE` contra a `main`, mas **não entre si**. Um merge de teste
dá conflito em três arquivos:

| Arquivo | Gravidade | Natureza |
|---|---|---|
| `profdex-front/src/data/types.js` | trivial | os dois acrescentam funções diferentes no fim do arquivo — ficar com as duas resolve |
| `profdex-front/src/views/PvpArenaView.vue` | moderado | dois blocos, import e template |
| `profdex-front/src/views/ProfessorView.vue` | **severo** | #5 reescreve o arquivo (647 → 62 linhas) exatamente onde #4 troca emoji por `TypeIcon` |

**Ordem de merge recomendada: #4 primeiro, #5 depois.** O #4 é menor, mais
focado e já está pronto salvo a 9.1. O #5 reescreve `ProfessorView.vue` inteiro,
então é mais barato ele reaplicar a troca de ícone do #4 sobre a versão nova do
que o contrário. Quem for segundo **rebase antes de mergear** — não resolvam pela
UI do GitHub, porque o conflito da `ProfessorView.vue` exige reaplicar o
`TypeIcon` dentro da estrutura de painéis nova.

Além disso, o #4 está baseado em `e07121b`, **4 commits atrás da `main`**. O
"141/141" foi medido nessa base. Rebase antes de medir de novo.

---

## 9.1 — 🔴 O Quiz Treino entrega o gabarito do quiz oficial (PR #4)

### O problema

`GET /api/quiz/treino/questions?theme=X` lê da **mesma tabela** `quiz_questions`
que a bancada usa, sem nenhum filtro de origem, e devolve `correctIndex` junto:

```ts
// quiz-practice.service.ts
const questoes = await this.prisma.quizQuestion.findMany({
  where: { theme, active: true },        // ← nenhuma separação de origem
  select: { id, theme, difficulty, prompt, options, answer },
});
// ...
return { id, theme, difficulty, prompt, options, correctIndex };
```

O banco tem 9 temas × 10 questões, e o DTO aceita `limit` até 20. Ou seja:
**9 requisições autenticadas bastam para baixar o gabarito inteiro do evento.**
Qualquer aluno logado consegue, sem ferramenta nenhuma além da barra de
endereços. Depois é só chegar na bancada e acertar todas — QR impresso, captura,
Elo, ranking.

Isso desmonta a mecânica central do evento. E não é uma ameaça hipotética: o
próprio código já reconhece esse modelo de risco. O comentário de `embaralhar()`,
em `quiz.service.ts`, diz que sem embaralhar as alternativas "decorar 'é a
segunda' resolveria o quiz sem saber o conteúdo". A rota de treino pula essa
etapa e entrega a resposta direto.

A janela de 60 s e o cooldown de 10 min não protegem nada aqui — eles limitam
**quantas vezes** o aluno tenta, não se ele já sabe a resposta.

> A tarefa 8.1 previa exatamente isto: *"só é seguro se os dois bancos forem
> separados de verdade. Se uma questão oficial vazar pela rota de treino, o quiz
> da bancada acaba."* Vale registrar que `docs/tasks/` ainda não estava
> versionado quando o #4 foi aberto — o autor provavelmente não tinha a spec.

### O que fazer

Escolha **uma** das duas separações. A segunda é mais chata e elimina a classe
inteira de bug; recomendo ela se houver qualquer dúvida.

**Opção A — coluna `origin` (reaproveita a tabela).**

```prisma
// QuizQuestion
origin String @default("oficial")  // oficial | treino
@@index([origin, theme, active])
```

E então, **sem exceção**:

- `QuizPracticeService.temas()` e `.questoes()` filtram `origin: 'treino'`;
- `QuizService` (bancada) filtra `origin: 'oficial'` em **toda** consulta —
  incluindo `themes` e o sorteio;
- o seed oficial grava `origin: 'oficial'`, o de treino grava `'treino'`.

**Opção B — tabela `TrainingQuestion` separada**, sem relação com `QuizAttempt`.
Custa uma tabela e torna o vazamento impossível por construção.

**Em qualquer uma das opções, o teste é obrigatório** — é o mais importante desta
tarefa:

```ts
it('nunca devolve questão oficial pela rota de treino', async () => {
  // semeia 1 questão oficial e 1 de treino no mesmo tema
  const { questoes } = await service.questoes('logica', 20);
  const ids = questoes.map((q) => q.id);
  expect(ids).not.toContain(oficial.id);
  expect(ids).toEqual([treino.id]);
});
```

E um segundo teste, do outro lado: a bancada **não** pode sortear questão de
treino (senão o aluno que treinou reconhece a pergunta e o efeito é o mesmo).

### Banco de questões de treino

Sem banco próprio, não há o que servir. Gerar com IA como descrito na tarefa 8.1
(`scripts/gerar-questoes-treino.ts` + `db:seed-quiz-treino`), mínimo **15 por
tema**, validando o JSON no script e revisando por amostragem.

### Enquanto isso não existe

Se o evento for antes da geração do banco, a saída segura é **não expor o
gabarito**: o treino corrige no servidor (`POST /quiz/treino/responder`,
devolvendo só certo/errado + explicação) e a resposta nunca sai. É mais round-trip,
mas não vaza. O que **não** dá para fazer é manter a rota atual em produção.

### Aceite

- Nenhuma questão `oficial` sai pela rota de treino — teste automatizado.
- Nenhuma questão de treino é sorteada pela bancada — teste automatizado.
- ≥15 questões de treino por tema, revisadas por amostragem.
- Cooldown, `quiz_attempts` e o relatório de `/admin/quiz` seguem intactos.

---

## 9.2 — 🔴 Os IVs decidem a partida ranqueada (PR #5)

### O problema

O #5 aplica os IVs em dois lugares:

```ts
maxHp = DEFAULT_MAX_HP + ivHp                        // 120..135
baseStats = { rigor|didatica|raciocinio: 100 + iv }  // 100..115

effectiveStat(c, stat) = (baseStats[stat] / 100) * stageMultiplier(stages[stat])
```

e `effectiveStat` alimenta **três** coisas: dano do atacante, defesa do defensor
e **a ordem do turno**.

A ordem do turno é o problema maior, e é um problema de *forma*, não de
magnitude. `turnOrder` é um degrau:

```ts
const playerFirst = ps === es ? chance(0.5) : ps > es;
```

Com `ivRaciocinio` uniforme em 0–15, dois jogadores empatam em só **1 caso em
16**. Nos outros ~94%, um dos lados age primeiro **em todos os turnos da partida
inteira** — e isso foi decidido no sorteio da captura, não em campo.

### Medição

Simulação com o **motor real do servidor** (`engine.ts`), espelho perfeito
(mesmos tipos e mesmo deck dos dois lados, escolha de golpe aleatória e idêntica),
n = 4000 por linha:

| Cenário | Vitórias de A |
|---|---|
| controle — os dois sem IV | **50,3%** ← valida o harness |
| A e B diferem em **1 ponto** de `ivRaciocinio` (8 vs 7) | **69,4%** |
| A com `ivRaciocinio` 15, B com 0 | 69,2% |
| A com `ivHp` 15, B com 0 | 64,5% |
| A com `ivRigor` 15, B com 0 | 66,1% |
| A com `ivDidatica` 15, B com 0 | 64,8% |
| A 10/10/10/10 vs B 5/5/5/5 (diferença comum) | **81,2%** |
| A 15/15/15/15 vs B 0/0/0/0 (pior caso) | **93,0%** |

E a pergunta que interessa para o Elo — **com dois jogadores de IV aleatório,
com que frequência vence o exemplar de IV total maior?**

| Regra | Vitória do IV maior |
|---|---|
| **como está no PR #5** | **64,1%** |
| só ordem de turno proporcional | 58,5% |
| ordem proporcional + teto +7 | 55,8% |
| **ordem proporcional + teto +5** | **52,9%** |
| ordem proporcional + teto +3 | 52,5% |

A tarefa 6.6 pediu explicitamente *"um spread de ~10%"* e *"a diferença entre
dois jogadores deve continuar sendo **decisão**, não sorte de captura"*. 64,1%
é o oposto: em quase dois terços das partidas ranqueadas quem ganha é quem teve
sorte no QR.

### O que fazer

**1. Tirar a velocidade do degrau.** A velocidade vira peso de uma moeda, não
chave de ordenação:

```ts
export function turnOrder(state, playerMove, enemyMove) {
  const ps = effectiveStat(state.player, STAT.RACIOCINIO);
  const es = effectiveStat(state.enemy, STAT.RACIOCINIO);
  const playerFirst = chance(ps / (ps + es));   // 108 vs 107 → 50,2%, não 100%
  // ...
}
```

Assim `raciocinio` continua valendo (e os buffs/debuffs de estágio continuam
importando, inclusive mais do que hoje), mas 1 ponto de IV deixa de valer uma
partida. Medido: 69,4% → **50,7%**.

**2. Baixar o teto do bônus para +5**, mantendo a faixa 0–15 gravada no banco
(as estrelas continuam com 16 níveis por atributo; muda só a conversão em
atributo de combate):

```ts
const IV_BONUS_MAX = 5;
const bonus = (iv) => (iv / 15) * IV_BONUS_MAX;
maxHp = DEFAULT_MAX_HP + bonus(ivHp);              // 120..125
baseStats[s] = 100 + bonus(iv);                    // 100..105
```

Guardar 0–15 e converter na hora deixa o balanceamento ajustável por uma
constante, sem migration nem backfill novo — importante porque este número vai
querer ser ajustado depois do evento.

**3. Aplicar nos dois motores.** `profdex-back/src/battle/engine/engine.ts` e
`profdex-front/src/composables/battleEngine.js` precisam continuar em paridade.
⚠️ Eles **já divergem** hoje no desempate de velocidade: o front usa
`ps >= es` (empate → jogador, comentado como intencional para o PvE) e o back usa
`chance(0.5)`. Ao trocar pela versão proporcional, decidam se o PvE mantém o viés
a favor do jogador — se mantiver, **comente explicitamente**, porque é o tipo de
divergência que a próxima pessoa vai "corrigir" sem querer.

**4. Teste de balanceamento versionado.** Um spec que roda a simulação com n
menor (500 basta) e falha se a vitória do IV maior passar de ~56%. Sem isso, o
próximo ajuste de motor desregula isso de novo sem ninguém perceber.

### Cuidado — Elo

A tarefa 6.6 já avisava: isto muda o balanceamento do ranqueado. Comparar
partidas de antes e depois é comparar dois jogos. **Decidam com o time se o Elo
é zerado na virada** (`npm run db:reset-ranking`) e registrem a decisão no
`docs/BATALHA-PVP.md`.

### Aceite

- 1 ponto de diferença em `ivRaciocinio` não muda a taxa de vitória mais que
  ~2 pontos percentuais.
- Vitória do exemplar de IV maior entre jogadores aleatórios ≤ 56%.
- Teste de balanceamento versionado, rodando no CI.
- Motores em paridade, com a divergência de desempate documentada.
- Decisão sobre reset de Elo registrada.

---

## 9.3 — 🟠 SFCs minificados em uma linha (PR #5)

### O problema

Dez arquivos do #5 vêm com template, script e CSS **colapsados em linhas únicas**
de até **1823 caracteres**:

```
1823  src/views/ProfessorView.vue
1750  src/components/ProfessorExemplares.vue
 818  src/components/AppHeader.vue
 777  src/components/ProfessorIdentidade.vue
 773  src/views/TreinoView.vue
 419  src/components/EstadoErro.vue
 361  src/components/MoveButton.vue
 307  src/components/BottomSheet.vue
 303  src/components/EstadoVazio.vue
```

Não é o padrão da casa: nos **56** arquivos de `profdex-front/src` na `main`,
**nenhum** tem linha acima de 300 caracteres. E os 10 reprovam no Prettier do
próprio repositório (`npx prettier --check` → 10 de 10), enquanto o
`.codex/CODE_STYLE.md` abre com *"Usar UTF-8, LF e Prettier como formato
canônico"*.

Isso tem custo prático, não estético: o diff do GitHub vira uma linha vermelha e
uma verde, `git blame` aponta tudo para o mesmo commit, e o conflito da
`ProfessorView.vue` (9.0) fica muito mais difícil de resolver à mão.

Vale dizer que a **funcionalidade está lá** — `ProfessorExemplares.vue` tem
filtro por tipo, estrelas, fraquezas/resistências e os golpes em `<details>`,
tudo que a 6.6 pediu. É só ilegível. Também vale notar que o critério de aceite
da 6.5 ("SFC principal abaixo de 250 linhas") foi atingido removendo quebras de
linha, não reduzindo responsabilidade — o arquivo tem 62 linhas e ~5 KB.

### O que fazer

1. `npx prettier --write src/` nos arquivos do PR, em **um commit separado**
   ("style: aplica o Prettier nos arquivos novos"), para o diff de revisão ficar
   limpo.
2. Depois disso, reler `ProfessorView.vue` e `ProfessorExemplares.vue` com olhos
   de revisor — com o arquivo formatado é provável que apareçam simplificações.
3. Trocar `captures.ensureLoaded().catch(() => {})` (`ProfessorView.vue`) por um
   `catch` com comentário de intenção: o `CODE_STYLE` proíbe `catch {}` mudo.
4. Ligar o Prettier no CI (`prettier --check`) para não voltar.

**Aceite.** `npx prettier --check src/` passa; nenhum arquivo novo com linha
acima de ~120 caracteres.

---

## 9.4 — 🟠 O hub de treino leva a uma batalha que não é a prometida (PR #5)

### O problema

O #5 cria `/treino` com o botão "INICIAR TREINO", que faz:

```js
function practice() {
  const target = firstCaptured.value ?? professors.professors[0]
  if (target) router.push({ name: 'arena', params: { id: target.slug ?? target.id } })
}
```

Só que a `ArenaView` **ignora o parâmetro da rota**: `const ENEMY_KEY = 'gustavo'`
continua fixo (linha 42). O aluno é levado a lutar contra o Gustavo sempre,
independente do professor que o hub escolheu. O `target` calculado ali é código
morto que só serve para montar uma URL enganosa.

E, como a 8.2 já apontava, **nada na tela diz que aquilo não vale ranking** —
procurar por "treino", "não vale" ou "ranking" na `ArenaView` não retorna nada.
Agora que existe um botão chamado "INICIAR TREINO" levando até lá, a ausência do
selo fica pior: o aluno tem motivo para achar que aquilo conta.

### O que fazer

Mínimo para o #5 entrar:

1. **Selo "TREINO — NÃO VALE RANKING"** no cabeçalho da `ArenaView` e no painel
   de resultado. É a correção mais barata e a que mais evita frustração.
2. **Ou** honrar o parâmetro da rota, **ou** parar de passá-lo. Levar o aluno
   para `/arena/eron` e mostrar o Gustavo é pior do que não deixar escolher:
   quebra a confiança na tela toda. Enquanto a tarefa 2 não entrega os sprites
   de frente/costas dos outros professores, o honesto é o hub dizer contra quem
   se treina.
3. **Ligar `/treino` ao `/quiz/treino` do #4** (ver 9.5).

Fica para depois (tarefa 8.2 completa): escolha de oponente, escolha de exemplar
próprio via `PvpPickView`, e os três níveis de bot.

**Aceite.** A batalha de treino se identifica como treino em todas as telas; a
URL e o oponente mostrado são coerentes.

---

## 9.5 — 🟡 Duas portas de treino que não se conhecem

Depois dos dois merges o app fica com:

- `/treino` (PR #5) — hub com batalha contra bot + guia;
- `/quiz/treino` (PR #4) — quiz de treino, alcançável por um botão dentro de
  `/batalha`;
- `/batalha/guia` — o guia, linkado pelos dois.

São dois hubs de treino paralelos, que é exatamente a fragmentação que a 6.7
existe para acabar. O `TreinoView.vue` do #5 tem dois cartões e a 8.2 pedia
justamente **três**: quiz, batalha e guia.

**O que fazer.** Acrescentar o cartão "QUIZ DE TREINO" no `TreinoView.vue`
apontando para `/quiz/treino`, e tirar o botão de Quiz Treino de dentro do fluxo
de `/batalha` — deixando `/treino` como porta única, como o mapa da 6.7 propõe.
É uma mudança pequena, mas precisa ser feita **depois dos dois merges**, senão
vira mais conflito.

**Aceite.** `/treino` é a única porta de treino, com os três cartões, alcançável
em no máximo dois toques a partir da tela inicial.

---

## 9.6 — Achados menores (não bloqueiam)

- **Fonte no canvas da foto RA** (`ar-photo.js`): o `ctx.font` pede
  `"Press Start 2P"`, mas o canvas não espera o carregamento da fonte. Se ela
  ainda não estiver pronta, o navegador cai em `monospace` **sem avisar**, e a
  foto — que é peça de divulgação — sai sem a identidade visual. Corrigir com
  `await document.fonts.load('700 46px "Press Start 2P"')` antes de desenhar.
- **`public-links.js`**: a porta `5174` da landing em dev está fixa no código.
  Vale ler de `import.meta.env` para quem roda em outra porta.
- **`ProfessorGolpes.vue`**: os `MoveButton` do painel "GOLPES" recebem
  `@select="() => {}"`. Botões clicáveis que não fazem nada — ou vira detalhe do
  golpe (6.4), ou vira elemento não interativo.
- **`vite.config.js`**: o import dinâmico do `@vitejs/plugin-basic-ssl` está
  correto, mas o plugin segue em `dependencies`. Se a intenção era torná-lo
  opcional em produção, mover para `optionalDependencies` e documentar o
  `HTTPS=1` no README de dev.
- **Marca UNIFIL (7.3)**: os arquivos estão em `public/marca/` com README, mas o
  critério de aceite pede **aprovação registrada da comunicação da UNIFIL antes
  do deploy**. Confirmar que existe e-mail/ticket antes de publicar.
- **`auth-session.spec.ts`** falha na `main` hoje. Não é dos PRs, mas convém
  arrumar antes para o CI voltar a ser sinal confiável.

---

## Ordem sugerida

1. 9.1 no #4 → rebase na `main` → merge do #4.
2. 9.2 + 9.3 + 9.4 no #5 → rebase → merge do #5.
3. 9.5 num PR pequeno depois dos dois.
4. 9.6 conforme couber.
