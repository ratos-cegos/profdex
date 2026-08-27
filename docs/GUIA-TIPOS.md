# Contexto — Sistema de Tipos e Tela de Instruções

Documento de retomada. Última atualização: 2026-07-20.
Complementa o [BATALHA.md](./BATALHA.md) (contexto geral da batalha).

## O que foi feito nesta rodada

Adicionada a **Roda de Vantagens** (sistema de tipos estilo Pokémon) e uma
**tela de instruções de batalha** que a explica. A partir da tela de batalha
(`BatalhaView`), um botão **📖 Instruções de Batalha** abre a explicação
**em uma nova aba do navegador** (`window.open` da rota resolvida) — assim o
guia fica aberto enquanto o jogador luta.

## Arquivos

| Arquivo | Estado | Papel |
|---|---|---|
| `profdex-front/src/data/types.js` | **novo** | Dados dos 9 tipos + regras de vantagem. A fonte da verdade. |
| `profdex-front/src/views/BattleGuideView.vue` | **novo** | Tela de instruções: roda (SVG) + guia dos tipos. |
| `profdex-front/src/router/index.js` | editado | Rota `/batalha/guia` (name `battle-guide`, `meta.auth`). |
| `profdex-front/src/views/BatalhaView.vue` | editado | Botão "Instruções de Batalha" → `openBattleGuide()`. |
| `.claude/launch.json` | editado | `autoPort: true` no front (sobe mesmo com a 5173 ocupada). |

## Como o sistema de tipos funciona (`data/types.js`)

São **9 tipos** numa roda cíclica. **A ordem do array `TYPE_CYCLE` É a roda**
(sentido horário) — mudar a ordem muda as vantagens. Os "forte/fraco" são
**derivados da posição em runtime**, não digitados à mão.

Ordem atual (horário):
`Lógica → Cálculo → IA/ML → Robótica → Arquitetura → NPI → Redes → Banco de Dados → Algoritmos →` (volta a Lógica)

Regra:
- **Super-eficaz (2×)** contra os **2 tipos seguintes** (horário).
- **Fraco (0,5×)** contra os **2 tipos anteriores**.
- **Neutro (1×)** contra o resto.

Cada tipo tem `{ id, label, icon, color (hex), description }`.

⚠️ **O campo `icon` (emoji) é legado.** As telas desenham `TypeIcon.vue` — a
arte oficial vetorial dos 9 tipos, trazida da landing page (outro repositório,
por isso o componente é copiado e não importado). O componente indexa pelo
mesmo `id`, então não há tabela de tradução.

Os ícones herdam `currentColor`, e é isso que faz cada um sair na cor do seu
tipo — por isso não são arquivos `.svg`: servidos por `<img>` não poderiam ser
recoloridos. Quem renderiza escolhe a cor com um dos dois helpers de
`types.js`:

- `onColor(hex)` — preto ou branco **sobre** a cor do tipo (roda de vantagens,
  onde o ícone fica em cima do círculo preenchido).
- `legibleColor(hex)` — a cor do tipo clareada até 4,5:1 **no** fundo escuro.
  Sem ele o NPI (`#495057`) daria 1,7:1 e o ícone sumiria.

São vetor, não pixel art: **não** aplicar `image-rendering: pixelated` (a
convenção dos PNGs de `/icons`), que só serrilharia as curvas.

O emoji continua no arquivo de propósito: um `{{ t.icon }}` esquecido em alguma
tela não quebraria o build — renderizaria vazio, em silêncio. Mantido, degrada
para o emoji antigo em vez de deixar um buraco.

API exportada:
- `TYPE_CYCLE` — o array/roda.
- `getType(id)`, `strongAgainst(id)`, `weakAgainst(id)` — retornam tipo(s).
- `effectiveness(attackerId, defenderId)` → `2 | 0.5 | 1`. **Ainda não está
  ligado ao cálculo de dano** (ver próximos passos).
- Constantes `SUPER_EFFECTIVE`, `NOT_EFFECTIVE`, `NEUTRAL`.

## A tela (`BattleGuideView.vue`)

Página rolável (padrão visual das outras telas: header vermelho, `.pixel`,
tokens do `style.css`). Duas seções:

1. **Roda de Vantagens** — SVG gerado por código a partir de `TYPE_CYCLE`:
   9 nós posicionados num círculo (começa às 12h, gira no horário) + setas de
   fluxo de cada nó para o seguinte + centro "ProfDex / vence os 2 seguintes →".
   As posições e setas são calculadas em `computed` (trigonometria), não
   hard-coded — se mudar o nº de tipos, a roda se reajusta.
2. **Guia dos Tipos** — 9 cards (`icon`, `label`, `description`, FORTE 2×,
   FRACO 0,5×), com `strongAgainst`/`weakAgainst` derivados dos dados.

Sem GLB/model-viewer aqui, então **renderiza normalmente no preview de dev**
(diferente da arena, ver BATALHA.md).

## Verificação feita

Rodado o front desta sessão (Vite subiu na **5174**, porque 5173 estava ocupada
por outra sessão). Logado com `teste123`/`senha123`. Confirmado via árvore de
acessibilidade + inspeção de DOM:
- Guia renderiza sem erros de console.
- Os 9 matchups batem exatamente com as imagens de referência do design.
- Roda: 9 nós + 9 setas, coordenadas válidas, SVG cabe no viewport mobile.
- Botão "Instruções de Batalha" presente na `BatalhaView`.

⚠️ Screenshots do browser pane travaram nesta sessão (conflito de portas com o
servidor de outra sessão) — a verificação foi textual, não visual.

## Estado do git

Commit `feat: guia de tipos e instruções de batalha` já **feito e com push** na
branch `feature/Battle`. O commit também levou junto trabalho de batalha que
estava pendente no working tree (arena, `useBattle`, `BattleHpBar`, `moves.js`,
`docs/BATALHA.md`). **`.claude/settings.local.json` foi deixado de fora** de
propósito (permissões locais da máquina).

## Próximos passos

1. **Ligar `effectiveness()` ao dano**: em `useBattle.js` (`rollDamage`),
   multiplicar o dano pelo `effectiveness(tipoDoGolpe, tipoDoInimigo)`.
2. **Dar tipo aos golpes**: adicionar campo `type` (id de `TYPE_CYCLE`) aos
   golpes em `data/moves.js`; e definir o tipo do professor/inimigo.
3. Mensagem de batalha reagindo à eficácia ("Foi super-eficaz!" / "Pouco
   eficaz...").
4. (Opcional) reaproveitar `color`/`icon` dos tipos como badge do professor na
   ProfDex e no HUD da arena.
