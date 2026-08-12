# Contexto — Sistema de Batalha (RPG de turnos em AR)

Documento para retomar o desenvolvimento da batalha. Última atualização: 2026-07-21.

> Atualizado após os commits `56266cf (AR positioning in battle)` e
> `ffdd103 (implementation of types and movesets)`, que substituíram o movepool
> placeholder por um sistema real de **tipos + movesets + motor de batalha**.

## Visão geral

O ProfDex é uma "Pokédex de professores": o aluno escaneia QR codes pelo campus
para descobrir/capturar professores. A **batalha** é um RPG de turnos estilo
Pokémon onde o professor capturado vira o inimigo, renderizado em 3D (com opção
de AR via `model-viewer`).

Fluxo de telas:
`ProfdexView` → `BatalhaView` (menu) → botão **Batalha** → `ArenaView` (o combate).

## Como rodar

Da raiz do projeto (`profdex/`):

```bash
npm run dev          # sobe front (5173) + back (3000) juntos
# ou separados:
npm run dev:front
npm run dev:back
```

- Front: Vue 3 + Vite + Pinia + vue-router. Proxy `/api` → `http://localhost:3000`.
- Back: NestJS + Prisma + **PostgreSQL** (Supabase/Railway). JWT em `.env`.
- **A batalha precisa de login** (rota tem `meta: { auth: true }`).

### ⚠️ Banco de dados — atenção ao rodar localmente
O commit `e0ddd82 (chore(back): configure Prisma PostgreSQL for Railway)` trocou o
Prisma de SQLite para **PostgreSQL**. Consequências para rodar local:
- O `profdex-back/.env` precisa de `DATABASE_URL` e `DIRECT_URL` no formato
  `postgresql://...` (ver `profdex-back/.env.example`).
  Um `DATABASE_URL="file:./dev.db"` (SQLite antigo) faz o backend quebrar no boot
  com `PrismaClientInitializationError P1012` ("URL must start with postgresql://").
- O antigo `dev.db` (SQLite) e o usuário de teste `teste123/senha123` **não valem
  mais** — o banco agora é Postgres e precisa ser migrado/semeado:
  `npm run db:migrate` e `npm run db:seed` (em `profdex-back/`) apontando para o Postgres.
- Para dev offline **não reverta o schema para SQLite**: use o Postgres local do
  `profdex-back/docker-compose.yml` (`npm run db:up`), que roda o mesmo provider
  do deploy. Ver "Banco local via Docker" no `profdex-back/README.md`.

## Arquivos da batalha

| Arquivo | Papel |
|---|---|
| `profdex-front/src/views/ArenaView.vue` | A tela de combate: palco 3D + HUD + comandos. |
| `profdex-front/src/composables/battleEngine.js` | **Motor puro** de combate (sem Vue): combatentes, status, ordem de turno, resolução de golpes, IA do inimigo. |
| `profdex-front/src/composables/useBattle.js` | Camada reativa: envolve o motor com refs do Vue e anima a fila de eventos. |
| `profdex-front/src/data/types.js` | **Roda de tipos** (9 tipos) e cálculo de efetividade (2×/½×/…). |
| `profdex-front/src/data/moves.js` | **Movepool real por tipo** (categorias + efeitos). |
| `profdex-front/src/components/BattleHpBar.vue` | Barra de HP reutilizável (inimigo e jogador). |
| `profdex-front/src/router/index.js` | Rota `/arena/:id` (name `arena`). |
| `profdex-front/src/views/BatalhaView.vue` | Menu; `goToArena()` navega para a arena. Também tem `BattleGuideView` (`/batalha/guia`) com o guia de tipos. |

O `ARViewer.vue` / `useModelViewer.js` NÃO são usados na arena (só na tela
"Ver Prof." / `CharacterARView`). A arena instancia `<model-viewer>` direto e usa
o composable `useArenaAR.js` para o posicionamento em AR.

## Como a batalha funciona hoje

Arquitetura em duas camadas: **motor puro** (`battleEngine.js`, testável, sem Vue)
+ **camada reativa** (`useBattle.js`, refs do Vue + timing das animações).

### Motor (`battleEngine.js`)
- `createCombatant({ name, type/types, maxHp, moves })` — HP padrão `DEFAULT_MAX_HP` = **120**.
- `turnOrder` (quem age primeiro), `upkeep` (status no início do turno:
  paralisia pode travar, veneno/DOT causa dano, etc.), `performMove` (resolve um
  golpe: dano, efetividade de tipo, efeitos, cura, buffs/debuffs, escudos),
  `chooseEnemyMove` (IA simples do inimigo).
- `performMove`/`upkeep` retornam uma **fila de eventos** (`message`, `damage`,
  `heal`, `status`, `effectiveness`, `faint`) — a UI só reproduz a fila.
- `STATUS` e efeitos (`EFFECT` em `moves.js`): paralisia, confusão, DOT, recuo,
  multi-hit, ignora defesa, buffs/debuffs de atributo, escudos, cura, etc.

### Camada reativa (`useBattle.js`)
- Estado reativo: `playerHp`, `enemyHp`, `phase`, `message`, `enemyHit`,
  `playerHit`, `playerStatus`, `enemyStatus`, `isOver`.
- Fases: `intro` → `player-turn` → `busy` (resolução) → `player-turn`,
  terminando em `victory` | `defeat` | `fled`.
- `useMove(move)`: monta a ordem do turno, roda `upkeep` + `performMove` de cada
  lado pelo motor e **anima a fila de eventos** (dano, cura, mensagens de
  efetividade). `flee()` encerra a batalha.

### Tipos (`types.js`)
- `TYPE_CYCLE`: 9 tipos temáticos (Lógica, Cálculo, IA/ML, Robótica, Arquitetura,
  NPI, Redes, Banco de Dados, Algoritmos), dispostos numa **roda**.
- Regra: cada tipo é super-eficaz (2×) contra os **2 seguintes** e fraco (½×)
  contra os **2 anteriores** — forte/fraco são derivados da ordem, não digitados.
- `typeIdFromSeed(slug/id/nome)`: deriva um tipo **determinístico** por professor
  (mesmo prof → mesmo tipo), já que a API pode não trazer `type`.
- `typeMultiplier` combina em 4×/2×/1×/½×/¼× para defensores de 1 ou 2 tipos.

### Movepool (`moves.js`)
- `MOVES_BY_TYPE`: golpes por tipo, cada um com `category` (ataque/defesa/buff/
  debuff/status/cura), `power`, `accuracy`, `effects[]` e texto de sabor (`raw`
  = matéria real da grade). Índices prontos: `MOVE_BY_ID`, `ALL_MOVES`.
- `buildMoveset(types, size = 4)`: monta o conjunto de 4 golpes de um combatente a
  partir do(s) tipo(s) — é o que `ArenaView.vue` usa para jogador e inimigo.

### Tela (`ArenaView.vue`)
- **Palco**: dois `<model-viewer>` estáticos (sem `camera-controls`, sem
  `auto-rotate`, com `disable-zoom/tap/pan` + `pointer-events:none`).
  - Inimigo: fundo/esquerda, de frente — `camera-orbit="-15deg 86deg 105%"`.
  - Jogador: primeiro plano/direita, **de costas** — `camera-orbit="165deg 88deg 105%"`.
  - Posição/tamanho vêm do CSS (`.arena__model--enemy` / `--player`).
  - **Não fixar `field-of-view`**: isso quebra o auto-enquadramento e corta o
    modelo. Deixe o model-viewer calcular a distância; ajuste só o `orbit` e o CSS.
- **HUD** sobreposto: barra do inimigo no topo-esquerdo, barra do jogador
  embaixo-esquerda, botão voltar, painel de comandos (mensagem + grid 2×2 de
  golpes + Fugir). Flash/shake quando cada lado toma dano.

### Modelo 3D
- Cada lado usa o GLB do seu dono, resolvido por `modelUrlForProfessor`
  (`src/data/professorModels.js`): o inimigo é o professor da rota e o jogador é
  sempre o Gustavo (`PLAYER_MODEL_URL`). Professor sem modelo próprio cai no
  padrão (`modelo-gustavo.glb`) em vez de pedir um arquivo inexistente.
- Os arquivos ficam em `public/models/` (`modelo-eron.glb`, `modelo-gustavo.glb`,
  `modelo-mario.glb`). São grandes (28–77 MB) — vale gerar versões mobile.
- O tipo de cada combatente é derivado do professor via `typeIdFromSeed`, e o
  moveset via `buildMoveset` — então já variam por professor mesmo sem campo na API.

## Limitações conhecidas / decisões em aberto

1. **AR real com 2 personagens**: `model-viewer` só coloca **um** modelo na câmera
   AR nativa (Scene Viewer/Quick Look), e o HUD da página some dentro dela. Uma
   batalha com os dois bonecos sobre a câmera exige **WebXR + DOM overlay**
   (Android/Chrome; iOS não suporta). Por isso a arena hoje é 3D na tela, não AR.
2. **Ângulos dos modelos** foram calibrados "no olho"; podem precisar de ajuste
   fino no dispositivo real (mexer em `camera-orbit` e no CSS `.arena__model--*`).
   Lembrete: **não fixar `field-of-view`** — quebra o auto-enquadramento e corta o modelo.
3. O preview em navegador de desenvolvimento não renderiza o GLB pesado (WebGL por
   software trava); testar 3D no celular.
4. **Dados do combate ainda não persistem no backend** — HP/nível/tipo do professor
   não vêm da API (derivados no front). Integrar quando o back expuser esses campos.

## Ideias de continuação

- Expor tipo/nível/HP do professor pela API e consumir no lugar dos derivados.
- Tela de vitória com recompensa (captura, XP).
- Balancear `power`/`accuracy`/efeitos do movepool com playtesting.
- Avaliar WebXR para a batalha acontecer sobre a câmera.
