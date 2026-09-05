# Tarefa 6 — Correções pontuais e revisão de UI/UX

**Prioridade:** alta (é o pacote que o aluno mais sente)
**Perfil:** front-end, com uma parte de back-end em 6.6 (status por exemplar)
**Sugestão:** faça **6.7 primeiro** (arquitetura de informação). Ele decide onde
cada tela vai parar, e várias correções abaixo mudam de lugar dependendo disso.

---

## Contexto do projeto

ProfDex é um app web mobile-first estilo Pokédex da Semana Tecnológica da UNIFIL:
o aluno responde uma questão na bancada do estande, acerta, recebe um QR impresso,
escaneia no app e captura o professor. Depois vê o professor em 3D/RA e batalha
por turnos (PvE contra bot e PvP ranqueado por Elo, via Socket.IO).

- **Front:** `profdex-front/` — Vue 3 (`<script setup>`), Vite, Pinia, vue-router.
  Estética retrô: Press Start 2P, tokens em `src/style.css`.
- **Back:** `profdex-back/` — NestJS + Prisma + PostgreSQL, sessão por cookie.
- **Domínio de batalha:** roda de 9 tipos (`src/data/types.js` no front e
  `src/battle/engine/types.ts` no back — mesma roda, portada), movepool em
  `src/data/moves.js` / `src/battle/engine/moves.ts`, motor em
  `src/composables/battleEngine.js` / `src/battle/engine/engine.ts`.
- **Convenções:** `.codex/CODE_STYLE.md`. Vue: SFC acima de 400 linhas com mais de
  uma responsabilidade deve ser quebrado; derivar UI com `computed`; respeitar
  `prefers-reduced-motion` (já é praxe no projeto).

---

## 6.1 — Botão "Sair" pequeno demais

**Problema.** Em `src/views/ProfdexView.vue`, o `.logout-btn` (CSS ~linha 142) tem
`padding: 6px 14px` e `font-size: 12px` — resulta em algo perto de 28 px de altura,
bem abaixo do alvo mínimo de toque (44×44). Fica no canto superior direito, onde o
polegar esbarra sem querer, e a ação é destrutiva: derruba a sessão e o socket do
lobby (o `logout()` dispara `auth:expired`).

**O que fazer.** A correção certa não é aumentar o botão, é **tirá-lo dali**:

1. O cabeçalho passa a ter um **botão de perfil** (avatar + nome, ≥ 44×44) que
   navega para `/perfil` — ver tarefa 4.
2. "Sair" vive dentro do perfil, com confirmação.
3. Se a tarefa 4 não for feita agora, o mínimo é: `min-height: 44px`,
   `padding: 10px 16px`, `aria-label="Sair da conta"` e um `confirm` antes.

**Aceite.** Nenhum alvo de toque abaixo de 44×44 no cabeçalho; sair exige
confirmação.

---

## 6.2 — Scanner: botão voltar desalinhado + orientação sobre o QR

### Desalinhamento

**Problema.** Em `src/views/ScanView.vue`, `.scan-topbar` é um flex com
`justify-content: space-between` e três filhos: `.back-btn`, `.scan-heading` e
`.topbar-spacer`. O espaçador tem `width: 82px` fixo e o botão tem
`min-width: 82px` — mas o conteúdo do botão ("‹" a 26 px + "Voltar" a 13 px +
`gap` + padding) **passa de 82 px**. Como o espaçador não cresce junto, o título
"SCANNER" fica deslocado para a direita.

**Correção.** Trocar o flex por grid de três colunas simétricas:

```css
.scan-topbar {
  display: grid;
  grid-template-columns: 1fr auto 1fr;  /* laterais iguais, centro pelo conteúdo */
  align-items: center;
  /* mantém min-height e o padding com env(safe-area-inset-top) que já existem */
}
.scan-heading { justify-self: center; }
.topbar-spacer { /* width fixo pode sair */ }
```

O `.back-btn` fica na coluna 1 com `justify-self: start`. Testar em 320 px, 390 px
e 430 px de largura, e com a barra de status do iOS (o `env(safe-area-inset-top)`
já está no padding — não remova).

### Orientação de onde conseguir o QR

**Problema.** A tela diz "APONTE PARA O QR CODE" e "Mantenha o código inteiro
dentro da mira", mas não diz **de onde vem o QR**. Quem abre o scanner sem saber
fica procurando QR pelo campus.

**O que fazer.** No bloco `.hint-copy` (dentro de `.scan-hint`), acrescentar uma
linha de orientação permanente:

> "O QR aparece quando você acerta uma questão na bancada do ProfDex, na Semana
> Tecnológica."

E um botão discreto "Como conseguir um QR?" que abre uma folha inferior
(bottom-sheet) com os 4 passos — reaproveite o módulo compartilhado criado na
tarefa 3 (`src/data/comoFunciona.js`), para não haver dois textos divergentes.

**Cuidado.** A tela do scanner é usada sob luz forte, ao ar livre, com uma mão. O
texto novo não pode invadir a mira (`.viewfinder`) nem empurrar o `hint` para fora
da tela em aparelho baixo. Contraste alto, fundo semi-opaco atrás do texto.

**Aceite.** Título centralizado em qualquer largura; a orientação aparece na
primeira abertura, sem cobrir a mira; a folha de ajuda fecha com toque fora e com
o botão físico de voltar.

---

## 6.3 — Número de dano flutuante na sprite

**Problema.** Hoje o dano só aparece como texto no painel ("Causou 32 de dano!") e
como flash/tremida — `src/composables/useBattle.js`, `play(events)` (~linha 47),
`case 'damage'`; no CSS, `.arena__model--hit` (`ArenaView.vue` ~linha 345) e
`.arena__hud--player-hit` (~linha 365). Não há o feedback numérico ancorado ao
personagem, que é o que torna a troca de golpes legível.

**O que fazer.**

1. Criar `src/components/DamagePopup.vue` (ou `FloatingNumber.vue`): recebe
   `{ amount, kind }` com `kind` em `dano | cura | critico`, e anima subindo com
   fade (~900 ms), fonte pixel, contorno escuro para legibilidade sobre qualquer
   fundo. Vermelho para dano, verde para cura.
2. Ancorar sobre a `<img>` do combatente atingido, com deslocamento horizontal
   aleatório pequeno para múltiplos golpes não se sobreporem (o movepool tem
   `multiHit`, que gera 2–5 acertos seguidos).
3. Disparar no mesmo ponto onde o flash já é disparado: `case 'damage'` do
   `play()`. Os eventos do PvP têm o mesmo formato — vêm do servidor
   (`profdex-back/src/battle/engine/engine.ts`, tipo `BattleEvent`:
   `{ type: 'damage', target, amount }`) — então `PvpArenaView.vue` usa o mesmo
   componente.
4. Aproveitar o evento `effectiveness` (`'super4' | 'super' | 'weak' | 'weak4'`),
   que **já existe no motor**, para mostrar um rótulo junto ("SUPER EFICAZ!" /
   "pouco eficaz…") com cor e tamanho diferentes.
5. `prefers-reduced-motion: reduce` → sem subida nem fade; o número aparece e some.

**Cuidado.** `.arena__model--hit` já anima `transform` no `<img>`. Se o popup for
filho do mesmo elemento, ele treme junto. Ancore num wrapper posicionado, não no
`<img>`.

**Aceite.** Todo dano/cura mostra o número sobre o personagem certo, em PvE e PvP;
sequência de multi-hit mostra os números sem sobreposição ilegível.

---

## 6.4 — Deixar claro o que cada ataque faz

**Problema.** Em `ArenaView.vue`, cada `.move-btn` mostra só `move.name` e
`move.raw` (o texto cru da planilha "Poder / Efeito"). O aluno não vê **o tipo do
golpe**, que é a mecânica central: a roda de 9 tipos dá 2× de dano contra dois
tipos e 0,5× contra dois outros (`src/data/types.js` — `effectiveness`,
`typeMultiplier`, `strongAgainst`, `weakAgainst`). Escolher golpe sem ver o tipo é
escolher no escuro.

**O que fazer.** Os dados já existem em `src/data/moves.js`: cada golpe tem
`type`, `category`, `power`, `accuracy`, `effects`, `description`, `raw`; e cada
tipo tem `icon`, `label` e `color` em `src/data/types.js` (`getType`).

1. **Sempre visível no botão:** um chip com o **ícone + cor do tipo**, o poder e a
   precisão. É informação de decisão — não pode ficar atrás de interação.
2. **Prévia de eficácia:** calcular `typeMultiplier(move.type, oponente.types)` e
   marcar o botão com um indicador (↑↑ super eficaz / ↓ pouco eficaz), igual à
   Pokémon dos jogos recentes. É o que ensina a roda de tipos sem tutorial.
3. **Detalhe sob demanda:** toque longo (`pointerdown` + timer de ~400 ms, com
   `pointercancel`/`pointerup` limpando) **ou** um "i" no canto do botão abre uma
   folha com `description`, `raw` e a lista de efeitos traduzidos. Prefira o "i"
   se o toque longo conflitar com o gesto de rolagem — toque longo em mobile também
   dispara o menu de seleção do navegador; nesse caso use
   `user-select: none; -webkit-touch-callout: none`.
4. **Ícone de categoria** (ataque / defesa / buff / debuff / status / cura — a
   constante `CATEGORY` já existe) para distinguir golpe de suporte num relance.

Fazer o mesmo em `PvpArenaView.vue` e, se couber, no seletor de exemplar
(`PvpPickView.vue`). Considere extrair um `src/components/MoveButton.vue` para as
três telas — hoje o markup está duplicado.

**Aceite.** Dá para escolher um golpe sabendo tipo, poder, precisão e se é forte
contra o oponente, sem abrir nada. O detalhe completo está a um toque. Nada
quebra em 320 px de largura.

---

## 6.5 — Ficha do professor com informação demais

**Problema.** `src/views/ProfessorView.vue` tem 647 linhas e empilha, numa
rolagem só: identidade + tipos + 4 barras de atributo + avatar + botão RA +
descrição + todos os exemplares agrupados por variante, **cada um com seus 4
golpes e a descrição de cada golpe**. Um aluno com 6 exemplares de um professor
rola por dezenas de blocos iguais. O `CODE_STYLE` inclusive pede quebrar SFC acima
de 400 linhas com mais de uma responsabilidade — é o caso.

**O que fazer.** Painéis deslizantes com um cabeçalho fixo:

```
┌──────────────────────────────┐
│  ← #003   Prof. Eron         │  ← fixo: avatar, nome, tipos, nº da dex
│  🏛️ Arquitetura  🤖 IA/ML     │
├──────────────────────────────┤
│  [ SOBRE ] EXEMPLARES  GOLPES│  ← segmented control + swipe
│                              │
│  (conteúdo do painel)        │
└──────────────────────────────┘
```

- **Sobre:** descrição, atributos, botão "Ver em RA".
- **Exemplares:** a coleção (ver 6.6).
- **Golpes:** o movepool dos tipos, hoje só exibido quando não há exemplar.

Implementação sem biblioteca nova: um container com
`display: flex; overflow-x: auto; scroll-snap-type: x mandatory` e cada painel com
`scroll-snap-align: start; min-width: 100%`. O segmented control faz
`scrollIntoView({ behavior: 'smooth' })`; um `IntersectionObserver` (ou o evento
`scroll` com debounce) devolve qual painel está visível para marcar a aba ativa.
Acessibilidade: `role="tablist"`/`role="tabpanel"`, navegação por teclado, e
`prefers-reduced-motion` desligando o scroll suave.

Aproveite para extrair componentes: `ProfessorIdentidade.vue`,
`ProfessorExemplares.vue`, `ProfessorGolpes.vue`.

**Aceite.** Nenhum painel exige mais de ~2 telas de rolagem; troca por swipe e por
toque na aba; o SFC principal cai abaixo de 250 linhas.

---

## 6.6 — Meus exemplares: filtro por tipo, fraquezas e estrelas 0–5

### O que existe

- Cada captura é um **exemplar** com combinação de tipos (`variant.types`) e um
  deck de golpes sorteado **no resgate**
  (`profdex-back/src/captures/captures.service.ts`, `buildMoveset(variant.types)`).
- `src/stores/captures.js` já agrupa por variante (`groupedByVariant`).
- **Não existe status aleatório por exemplar.** As 4 barras que a ficha mostra são
  derivadas do **slug do professor** por hash (`statFromSeed`,
  `ProfessorView.vue` ~linha 54) — ou seja, iguais para todos os exemplares e para
  todos os alunos. A batalha usa HP fixo (`MAX_HP = 120` na `ArenaView.vue`,
  `DEFAULT_MAX_HP = 120` no motor do back).

### Decisão tomada

As estrelas serão **status reais por exemplar (IVs)**, gravados na captura e
**usados na batalha**. Não é enfeite.

### Backend

1. **Migration** em `profdex-back/prisma/`: quatro colunas em `Capture`

   ```prisma
   ivHp         Int @default(0) @map("iv_hp")
   ivRigor      Int @default(0) @map("iv_rigor")       // Ataque
   ivDidatica   Int @default(0) @map("iv_didatica")    // Defesa
   ivRaciocinio Int @default(0) @map("iv_raciocinio")  // Velocidade
   ```

   Faixa sugerida: **0 a 15** cada (soma máxima 60).
2. **Sorteio no resgate**, no mesmo ponto onde o moveset é sorteado
   (`captures.service.ts`). Injete o RNG, como manda o `CODE_STYLE`.
3. **Backfill** das capturas existentes: derive de forma **determinística do
   `capture.id`** (hash) para que rodar o script duas vezes dê o mesmo resultado e
   ninguém "perca" um exemplar bom.
4. **Exposição:** incluir os IVs e as estrelas no DTO de saída de `/captures`
   (o mapeamento já existe no service; mantenha a allowlist).
5. **Uso na batalha** — o ponto delicado. Aplique como bônus **pequeno**:

   ```
   maxHp = DEFAULT_MAX_HP + ivHp                    // 120..135
   ataque/defesa/velocidade: +0..15 sobre a base
   ```

   Motivo do teto baixo: o Elo é ranqueado (`docs/BATALHA-PVP.md`) e a diferença
   entre dois jogadores deve continuar sendo **decisão**, não sorte de captura.
   Um spread de ~10% é perceptível sem decidir partida. Ajuste o motor nos dois
   lados (`profdex-back/src/battle/engine/engine.ts` e
   `profdex-front/src/composables/battleEngine.js`) e atualize os testes de motor
   — eles hoje assumem HP 120 fixo.

### Frontend

1. **Estrelas.** `estrelas = (ivHp + ivRigor + ivDidatica + ivRaciocinio) / 60 * 5`,
   arredondado para meia estrela. Componente `src/components/StarRating.vue`
   (5 estrelas, meia estrela, `aria-label="4,5 de 5 estrelas"`). Mostre em cada
   card de exemplar e no seletor de batalha (`PvpPickView.vue`) — é lá que a nota
   decide alguma coisa.
2. **Filtro por tipo.** Chips de tipo no topo do painel "Exemplares", filtrando os
   grupos. Use `getType(id)` para ícone/cor. Com poucos exemplares, esconda o
   filtro.
3. **Fraquezas e resistências.** Já há tudo em `src/data/types.js`: para os tipos
   do exemplar, percorra `TYPE_CYCLE` calculando `typeMultiplier(t, exemplar.types)`
   e classifique em 4× / 2× / 0,5× / 0,25×. Exiba dois blocos, "Fraco contra" e
   "Resiste a", com os ícones coloridos. Extraia como
   `fraquezasDe(types)` em `src/data/types.js` (função pura, testável) e escreva
   o teste em `profdex-front/test/`.
4. Ordenação dos exemplares: por estrelas (desc) por padrão.

**Aceite.**

- Cada exemplar mostra 0–5 estrelas estáveis (o mesmo exemplar nunca muda de nota).
- Dois exemplares do mesmo professor podem ter notas diferentes.
- Fraquezas conferem com a roda de tipos — teste unitário cobrindo tipo duplo
  (4× e 0,25×).
- Batalha usa os IVs, e os testes do motor foram atualizados.
- Backfill idempotente, com script versionado em `profdex-back/scripts/`.

**Cuidado.** Isto muda o balanceamento do PvP ranqueado. Combine com o time se o
Elo deve ser **zerado** na virada (existe `npm run db:reset-ranking`) — comparar
partidas antes e depois da mudança é comparar dois jogos diferentes.

---

## 6.7 — Revisão da arquitetura de informação (o "fluxo confuso")

**Diagnóstico.** O app cresceu por adição e hoje tem três níveis de navegação
concorrentes:

- **Barra inferior** (`BottomNav.vue`): ProfDex · Scanear · Batalha.
- **Abas superiores** (`TopTabs.vue`): Batalha ↔ Ranking — mas só aparecem em
  duas telas, e o item "Batalha" da barra inferior fica aceso quando você está no
  Ranking (há um `computed` só para isso).
- **Rotas soltas sem entrada clara:** `/batalha/guia`, `/arena/:id` (a batalha
  contra bot — alcançada por um botão dentro da tela de batalha),
  `/character-ar/:id`, `/tres-demo`, `/tunel-binario`, `/professor/:id`.

Somam-se: a `/` (HomeView) que quase ninguém vê, o `/admin` com layout próprio, e
agora as telas novas (perfil, treino, landing, errata). Sem uma decisão de
estrutura, cada tarefa nova pendura mais um botão em algum canto.

**Proposta de estrutura** (validar com o time antes de implementar):

```
Barra inferior — 4 itens fixos, sempre visíveis:
  📕 ProfDex   → /profdex          (coleção; ficha em /professor/:id)
  📷 Capturar  → /scan             (scanner; ajuda "como conseguir um QR")
  ⚔️  Batalha   → /batalha          (hub)
  👤 Perfil    → /perfil           (dados, estatísticas, vouchers, sair)

Dentro de /batalha (abas superiores, 3 itens):
  Jogar        → convites PvP, lobby, escolha de exemplar
  Ranking      → /ranking (abas ELO · Capturas · Dex — tarefa 1.3)
  Treino       → /treino (quiz de treino + batalha contra bot — tarefa 8)
                 e link para o guia /batalha/guia

Fora da navegação (deep link / entrada contextual):
  /            landing interna atual
  /sobre       landing pública (tarefa 3)
  /admin/**    painel (layout próprio)
  /tres-demo, /tunel-binario   laboratórios — marcar como internos
```

Ganhos: a barra inferior deixa de mudar de significado (hoje "Batalha" acende no
Ranking), o Perfil ganha lugar fixo — o que resolve 6.1 e dá casa para o sino de
vouchers (1.5) —, e Treino sai de dentro do fluxo ranqueado, onde confunde
(tarefa 8.2).

**Consistência visual, no mesmo passo:**

- `src/views/HomeView.vue` reimporta a fonte no `<style scoped>`
  (`@import url(...Press+Start+2P...)`) — já está no `index.html`. Remova.
- Convivem duas famílias de token: `--red`/`--red-dark`/`--yellow` e
  `--unifil-orange`/`--unifil-gold`/`--surface`. Escolha **uma** como oficial em
  `src/style.css`, mapeie a outra por alias e migre as telas aos poucos.
- Cabeçalhos de tela são recriados em cada view com CSS quase igual (ProfDex,
  Ranking, Professor, Batalha). Extraia `src/components/AppHeader.vue`
  (título, subtítulo, ação à esquerda, ação à direita).
- Estados de carregando/erro/vazio também são recriados em cada tela. Extraia
  `EstadoVazio.vue` / `EstadoErro.vue` a partir do que já existe na
  `ProfdexView.vue` (`.error-state` com "SEM CONEXÃO" e botão de tentar de novo).
- Remover arquivos mortos: `src/components/ProfCard (1).vue` e
  `src/stores/counter.js`.

**Entregável.** Um `docs/NAVEGACAO.md` com o mapa acima aprovado, e a
implementação em passos pequenos (um PR por nível de navegação) — refatorar tudo
de uma vez neste app, que tem pouca cobertura de teste de tela, é pedir regressão.

---

## Checklist da tarefa 6

- [ ] 6.7 mapa de navegação aprovado (`docs/NAVEGACAO.md`)
- [ ] 6.1 botão de perfil no lugar do "Sair" minúsculo
- [ ] 6.2 topbar do scanner em grid + orientação sobre o QR
- [ ] 6.3 `DamagePopup.vue` em PvE e PvP, com rótulo de eficácia
- [ ] 6.4 `MoveButton.vue` com tipo, poder, precisão, categoria e prévia de eficácia
- [ ] 6.5 ficha do professor em painéis deslizantes e SFC quebrado
- [ ] 6.6 IVs no banco + estrelas + filtro por tipo + fraquezas + motor atualizado
- [ ] Tokens unificados, componentes de cabeçalho/estado extraídos, arquivos mortos removidos
- [ ] CHANGELOG atualizado
