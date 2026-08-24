# Estilo visual — sprites 2D e cenário da arena

Documento de referência para a **Tarefa 2** (sprites dos professores e ginásio
UNIFIL). Toda arte nova de batalha parte daqui — inclusive geração por IA ou
render a partir dos modelos 3D.

**Status:** proposta para validação do time (2026-08-22).

---

## Decisões fechadas

| Decisão | Valor adotado | Motivo |
|---|---|---|
| Era visual | **16-bit (SNES/GBA)**, não 8-bit puro | O `gustavo-frente.png` já está nesse patamar; a fonte Press Start 2P e os ícones da navegação também. 8-bit (4 cores, 32×32) não sustenta rostos reconhecíveis. |
| Grade de export | **35×64 px (frente)**, **35×64 px (costas)** | Medidas reais do sprite de referência já versionado. Exportar em **1×** e ampliar no CSS com `image-rendering: pixelated`. |
| Proporção do corpo | ~3,5 cabeças (chibi-heroico) | Mantém legibilidade num boneco de ~64 px de altura. |
| Paleta | **28 cores** (tabela abaixo), derivadas da UI UNIFIL | Amarra a arte à identidade do app; acentos laranja/dourado, neutros cinza. |
| Contorno | **1 px** na cor mais escura da silhueta (nunca `#000000` puro) | Legibilidade sobre o fundo do ginásio. |
| Enquadramento | Oponente: 3/4 de frente, olhando para a câmera. Jogador: 3/4 de costas, ombro esquerdo à frente | Perspectiva clássica de batalha por turnos — é o que `ArenaView.vue` e `PvpArenaView.vue` já assumem. |
| Sombra | Elipse achatada, **60% de opacidade**, incluída no mesmo PNG | “Cola” o personagem no chão da arena. |
| Fundo do sprite | **Transparente (PNG-32)** | Obrigatório. |
| Traço identificador | **1 objeto-assinatura** por professor (caneca, notebook, régua T…) | Diferencia 16 bonecos numa grade pequena. |
| Cartoons antigos | **Manter** `*-cartoon.png` | Usados em `ProfessorView.vue`, `ScanView.vue` e `ProfCard.vue`. Não apagar até a tarefa 5.2 substituí-los, se for o caso. |

### Nota sobre o tamanho 96×128 do plano original

O rascunho da tarefa sugeria frente **96×128** e costas **96×112**. Optamos por
**manter a grade do Gustavo (35×64)** como padrão porque:

1. o sprite de referência já está no repositório e posicionado na arena;
2. redesenhar o Gustavo agora atrasa a entrega do evento;
3. o CSS já amplia com `pixelated` — a resolução de export não precisa ser a
   resolução de exibição.

Se no futuro o time quiser migrar para uma grade maior, **todos** os sprites
precisam ser refeitos juntos (incluindo o Gustavo).

---

## Sprite de referência

| Arquivo | Papel |
|---|---|
| `profdex-front/public/professors/gustavo-frente.png` | **Referência principal** — copiar estilo de contorno, paleta, sombra e proporção. |
| `profdex-front/public/professors/gustavo-costas.png` | Referência de costas e enquadramento do jogador. |
| `profdex-front/public/professors/gustavo-frente-sheet.png` | Folha de idle (13 frames) — reservada para animação futura. |
| `profdex-front/public/professors/gustavo-costas-sheet.png` | Folha de idle (7 frames) — reservada para animação futura. |

**Medidas atuais (verificadas no repositório):**

| Arquivo | Largura × altura | Peso |
|---|---|---|
| `gustavo-frente.png` | 35 × 64 px | ~2,2 KB |
| `gustavo-costas.png` | 35 × 64 px | ~1,8 KB |

Todo sprite novo deve bater com essas medidas (±0 px — mesma grade).

---

## Paleta (28 cores)

Cores derivadas dos tokens em `profdex-front/src/style.css` e do sprite do
Gustavo. Usar **somente** esta paleta nos PNGs de arena (frente, costas, ataque
e ginásio).

### Identidade UNIFIL (acentos)

| Nome | Hex | Uso |
|---|---|---|
| Laranja UNIFIL | `#995200` | `--unifil-orange` — detalhes de marca, faixas, objetos-assinatura |
| Dourado UNIFIL | `#EDAF68` | `--unifil-gold` — reflexos quentes, destaques |
| Laranja DS | `#CBA034` | `--ds-orange` — botões/acentos secundários |
| Brilho dourado | `#FFDF6D` | `--ds-orange-glow` — highlight pontual (1–2 px) |

### Neutros (pele, roupa, sombra)

| Nome | Hex | Uso |
|---|---|---|
| Contorno escuro | `#1A1210` | Contorno de 1 px (substitui preto puro) |
| Sombra no chão | `#1A1210` @ 60% | Elipse achatada sob os pés |
| Cinza profundo | `#121418` | `--bg-deep` — sombras de roupa |
| Superfície | `#1A1A1A` | `--surface` — tecido escuro (camiseta preta) |
| Borda | `#2B2B2B` | `--surface-border` — dobras, costuras |
| Cinza médio | `#4A4A4A` | Calça/jeans escuro |
| Cinza claro | `#6E6E6E` | Jeans médio, detalhes metálicos |
| Off-white | `#E8E8E8` | Tênis, reflexo de tela |

### Pele e cabelo

| Nome | Hex | Uso |
|---|---|---|
| Pele base | `#D4A574` | Tom principal (Gustavo) |
| Pele sombra | `#B8895A` | Lateral do rosto, pescoço |
| Pele luz | `#F0C896` | Testa, nariz, topo da mão |
| Cabelo / barba | `#6B4226` | Marrom médio |
| Cabelo escuro | `#4A2E18` | Contorno capilar |

### Roupa comum (ajustar por professor)

| Nome | Hex | Uso |
|---|---|---|
| Jeans | `#2E4A7A` | Calça padrão |
| Jeans claro | `#4A6A9A` | Dobras da calça |
| Camiseta escura | `#1A1A1A` | `--surface` |
| Camiseta clara | `#F5F5F5` | Camisas claras (variante) |
| Branco tênis | `#FFFFFF` | Calçado — usar com parcimônia |

### Controles DS (HUD da arena — referência, não obrigatório no sprite)

| Nome | Hex | Uso |
|---|---|---|
| Azul DS | `#3C7FA1` | `--ds-blue` — contorno do jogador na arena |
| Brilho azul | `#7EC5E6` | `--ds-blue-glow` |
| Verde DS | `#549942` | `--ds-green` |
| Erro | `#FF6B6B` | `--error` — contorno do oponente na arena |

### Tipos de batalha (referência opcional para objeto-assinatura)

Cores de `profdex-front/src/data/types.js` — usar **só** no objeto-assinatura ou
detalhe de roupa, nunca como paleta inteira do boneco:

| Tipo | Hex |
|---|---|
| Lógica | `#6C4DE0` |
| Cálculo | `#F03E3E` |
| IA / ML | `#12B886` |
| Robótica | `#0CA5B8` |
| Arquitetura | `#F5A623` |
| Redes | `#7048E8` |
| Algoritmos | `#E64980` |
| Banco de Dados | `#4263EB` |
| NPI | `#82C91E` |

> **Entregável futuro:** exportar esta paleta como `docs/paleta-profdex.gpl`
> (GIMP) ou `docs/paleta-profdex.png` (swatch visual). Por enquanto a tabela
> acima é a fonte da verdade.

---

## Convenção de arquivos

Todos em `profdex-front/public/professors/`, salvo o ginásio.

| Tipo | Padrão de nome | Exemplo |
|---|---|---|
| Frente (arena) | `{slug}-frente.png` | `eron-frente.png` |
| Costas (arena) | `{slug}-costas.png` | `eron-costas.png` |
| Folha de ataque | `{slug}-ataque-sheet.png` | `eron-ataque-sheet.png` |
| Folha de idle (opcional) | `{slug}-frente-sheet.png` | já existe p/ Gustavo |
| Cartoon (ficha/captura) | `{slug}-cartoon.png` | **não substituir** na tarefa 2 |
| Modelo 3D (referência) | `public/models/modelo-{slug}.glb` | `modelo-eron.glb` |

**Chave no código:** slug normalizado (`normalizeKey` em `professorTypes.js`) —
`'mario'` e `'Mário'` resolvem o mesmo arquivo.

**Registro:** `profdex-front/src/data/professorSprites.js`

```js
export const PROFESSOR_SPRITES = {
  eron: '/professors/eron-frente.png',
  // ...
}
export const PROFESSOR_SPRITES_COSTAS = {
  eron: '/professors/eron-costas.png',
  // ...
}
// Incluir TODOS os novos em SPRITES_PIXEL_ART (Set interno).
```

**Ginásio:** `profdex-front/public/arena/unifil-ginasio.png`.

---

## Escopo do evento (6 professores)

Elenco no seed, sprites e tipos: **Gustavo, Eron, Mário, João, Simone, Tânia**.

| Slug | Nome | Frente arena | Costas arena |
|---|---|---|---|
| `gustavo` | Gustavo | ✅ | ✅ (jogador na PvE) |
| `eron` | Eron | ✅ | ✅ |
| `mario` | Mário | ✅ | ✅ |
| `joao` | João | ✅ | ✅ |
| `simone` | Simone | ✅ | ✅ |
| `t-camis` | Tânia (T. Camis) | ✅ (`tania-frente.png`) | ✅ (`tania-costas.png`) |

Aliases de Tânia: `t-camis` / `camis` / `tania`.

Outros slugs (Marcelo, Renata, Serginho, etc.) saíram do código e do seed.

---

## Objeto-assinatura por professor (rascunho)

Preencher com o time. Serve de briefing para arte/IA.

| Slug | Objeto-assinatura sugerido |
|---|---|
| `gustavo` | Caneca / número na camiseta (já no sprite) |
| `eron` | _a definir_ |
| `mario` | _a definir_ |
| _(demais)_ | _a definir quando entrarem no escopo_ |

---

## Fluxo de produção recomendado

1. **Modelo 3D** (`public/models/modelo-{slug}.glb`) → Blender, câmera ortográfica
   frente e costas, render **35×64**, filtro *Nearest*, sem antialias.
2. **Redução de paleta** — Color Ramp no Blender ou pós no Aseprite/LibreSprite.
3. **Retoque manual** — contorno 1 px, sombra, objeto-assinatura, grade alinhada.
4. **Export PNG-32** — otimizar com `oxipng -o 4` ou `pngquant`.
5. **Conversor Aseprite** (se usar `.ase`): `profdex-front/scripts/ase2png.cjs`.
6. **Atalho a partir do cartoon** (primeiro passo automatizado, retoque manual
   depois): `node profdex-front/scripts/cartoon2sprite.cjs eron mario`
7. **Registrar** em `professorSprites.js` + incluir em `SPRITES_PIXEL_ART`.

Alternativa sem 3D: IA (PixelLab, Leonardo, etc.) **sempre** com retoque manual
para bater grade e paleta do Gustavo.

---

## Critérios de aceite (resumo)

### Sprites (2.2)

- [ ] Todo professor no escopo tem **frente + costas**, fundo transparente, mesma
      paleta e mesma grade (35×64).
- [ ] Nenhum PNG de arena acima de **120 KB**.
- [ ] Cartoons antigos (`*-cartoon.png`) **permanecem** para ficha/captura.
- [ ] Arena com dois professores quaisquer **não mistura** pixel art e cartoon.
- [ ] `professorSprites.js` atualizado; todos os novos em `SPRITES_PIXEL_ART`.

### Animações (2.3)

- [x] Idle CSS (`idle-respira`) nas duas arenas, fases diferentes jogador/oponente.
- [x] Respeitar `prefers-reduced-motion: reduce`.
- [x] Shake de dano (`transform`) em wrapper separado ou keyframe composta.
- [ ] Ao menos uma folha `{slug}-ataque-sheet.png` por professor no escopo (4–6
      frames); gatilho no evento `damage` **já dispara um lunge CSS** até as
      folhas existirem.

### Ginásio (2.4)

- [x] Arte `public/arena/unifil-ginasio.png` nas arenas PvE e PvP (marca já na arte).
- [x] Substituir `<BinaryTunnelScene>` nas arenas; manter `/tunel-binario` como lab.
- [x] Lutadores apoiados no chão (caixas CSS alinhadas aos ovais).
- [ ] Validar marca UNIFIL com comunicação institucional, se ainda precisar.

### Código

- [ ] Remover `ENEMY_KEY = 'gustavo'` fixo quando o escopo tiver frente+costas
      suficientes (ver tarefa 8.2).
- [x] Atualizar `CHANGELOG.md` na entrega.

---

## Ordem de implementação sugerida

1. ✅ Este documento (`docs/ESTILO-VISUAL.md`).
2. Sprites **Eron** e **Mário** (frente + costas) + registro no código.
3. ✅ Ginásio nas arenas (`unifil-ginasio.png`).
4. ✅ Idle CSS + lunge de ataque no evento `damage`.
5. Folhas `-ataque-sheet.png` + professores das 3 vagas restantes (quando confirmados).

---

## Referências no repositório

| Recurso | Caminho |
|---|---|
| Tokens de cor | `profdex-front/src/style.css` |
| Registro de sprites | `profdex-front/src/data/professorSprites.js` |
| Slugs / tipos | `profdex-front/src/data/professorTypes.js` |
| Arena PvE | `profdex-front/src/views/ArenaView.vue` |
| Arena PvP | `profdex-front/src/views/PvpArenaView.vue` |
| Evento `damage` | `profdex-front/src/composables/useBattle.js` |
| Conversor Aseprite | `profdex-front/scripts/ase2png.cjs` |
| Seed (professores com QR) | `profdex-back/prisma/seed.ts` |
| Gerador de QR | `profdex-back/scripts/generate-capture-qr.js` |
| Bug memória (motivo dos sprites 2D) | `docs/BUG-BATALHA-TRAVANDO.md` |
