# Tarefa 2 — Sprites 2D dos professores e arte do ginásio

**Prioridade:** média-alta (destrava o polimento visual da batalha)
**Perfil:** trilha de arte + uma parte pequena de código (registro dos assets e CSS)
**Depende de:** nada. **É pré-requisito de:** 6.3 (animação de dano fica muito
melhor com sprite de ataque) e 7.2 (estado de derrota).

---

## Contexto do projeto

ProfDex é um app web mobile-first estilo Pokédex usado numa Semana Tecnológica.
O aluno captura professores via QR e batalha com eles (PvE e PvP por turnos).

- **Front:** `profdex-front/` — Vue 3 + Vite. Estética retrô: fonte
  **Press Start 2P**, tokens de cor em `src/style.css`
  (`--unifil-orange`, `--unifil-gold`, `--red`, `--surface`…).
- **Telas de batalha:** `src/views/ArenaView.vue` (PvE) e
  `src/views/PvpArenaView.vue` (PvP). As duas desenham o oponente de frente ao
  fundo e o jogador de costas em primeiro plano, com `<img>` — **não** com 3D.
- **Registro dos sprites:** `src/data/professorSprites.js`.
- **Conversor de Aseprite já existe:** `profdex-front/scripts/ase2png.cjs`
  decodifica `.ase` em Node puro (sem precisar do Aseprite instalado) e exporta o
  frame isolado e a folha de frames.

---

## Situação atual da arte

| Professor | Frente | Costas | Estilo |
|---|---|---|---|
| Gustavo | `public/professors/gustavo-frente.png` | `gustavo-costas.png` | **pixel art de verdade** (origem: `.ase`) |
| Eron | `public/professors/eron-cartoon.png` | — | cartoon vetorial suave |
| Mário | `public/professors/mario-cartoon.png` | — | cartoon vetorial suave |

`src/data/professorSprites.js` mantém três mapas: `PROFESSOR_SPRITES` (frente),
`PROFESSOR_SPRITES_COSTAS` e o `Set` `SPRITES_PIXEL_ART` — só o que está nesse
`Set` recebe `image-rendering: pixelated` (aplicar o filtro nos cartoons serrilha
as bordas deles).

Ou seja: **hoje a arena mistura dois estilos**. Existem 16 professores mapeados em
`src/data/professorTypes.js` e só 3 têm qualquer arte. É isso que esta tarefa
resolve.

Detalhe importante: `ArenaView.vue` está com o oponente **fixo no Gustavo**
(`const ENEMY_KEY = 'gustavo'`, com comentário explicando que é por ser o único
com arte nas duas orientações). Assim que houver sprite dos demais, essa amarração
sai — ver tarefa 8.2.

---

## 2.1 — Definir o estilo (fazer primeiro, com o time junto)

Sem uma definição escrita, cada geração de IA sai com um estilo e a arena vira
colcha de retalhos. **Proposta a validar:**

| Decisão | Valor proposto | Por quê |
|---|---|---|
| Era visual | **16-bit (SNES/GBA)**, não 8-bit | O `gustavo-frente.png` já está nesse patamar de detalhe; a fonte Press Start 2P e os ícones da navegação também. 8-bit puro (paleta de 4 cores, 32×32) não sustenta 16 rostos reconhecíveis. |
| Tamanho da arte | **frente 96×128 px**, **costas 96×112 px** | Corpo inteiro, proporção ~3,5 cabeças (chibi-heroico, não realista). Exportar 1× e deixar o CSS ampliar com `pixelated`. |
| Paleta | 24 a 32 cores, derivadas dos tokens da UI | Amarra a arte à identidade: laranja/dourado UNIFIL nos acentos, cinzas neutros no restante. Fixe a paleta num `.gpl`/`.png` de referência no repositório. |
| Contorno | 1 px escuro (não preto puro — use o tom mais escuro da paleta) | Legibilidade sobre o fundo do ginásio. |
| Enquadramento | Oponente: 3/4 de frente, olhando para a câmera. Jogador: 3/4 de costas, ombro esquerdo à frente | Enquadramento clássico de batalha por turnos — é o que as duas telas já assumem. |
| Sombra | Elipse achatada, 60% de opacidade, no mesmo arquivo | "Cola" o personagem no chão do ginásio. |
| Fundo | Transparente (PNG-32) | Obrigatório. |
| Traço identificador | Cada professor com **1 objeto-assinatura** (caneca, notebook, régua T, capacete de robótica…) | É o que torna 16 sprites distinguíveis num boneco de 96 px. |

**Entregável desta sub-tarefa:** um arquivo `docs/ESTILO-VISUAL.md` com a tabela
acima fechada, a paleta em hexadecimal, e o `gustavo-frente.png` marcado como
sprite de referência. Todo mundo que gerar arte depois parte dele.

---

## 2.2 — Produzir os sprites

### Escopo

- **Mínimo para o evento:** os professores que terão QR impresso.
- **Alvo:** os 16 de `src/data/professorTypes.js` — gustavo, mario, ricardo-petri,
  simone, eron, t-camis, joao, marcelo, guilherme, renata, serginho, marcos, igor,
  edson.

> **A PREENCHER:** lista final de professores e ordem de prioridade.

### Caminho recomendado (o mais barato e o mais consistente)

**Renderize os sprites a partir dos modelos 3D que já existem.**
`public/models/modelo-{eron,gustavo,mario}.glb` estão no repositório, e a tarefa 5
vai produzir os do NDE. No Blender (gratuito):

1. importar o `.glb`, posicionar câmera ortográfica de frente e de costas;
2. render a 96×128 com filtro *Nearest* e sem antialias;
3. reduzir a paleta (nó *Color Ramp* ou pós no Aseprite);
4. repassar o contorno à mão.

Vantagens: consistência garantida entre 3D e 2D, mesma iluminação para todos, e a
**animação de ataque sai de graça** (basta renderizar 4–6 frames de uma animação
do Mixamo). É o caminho que resolve 2.3 junto.

### Alternativas com IA (para quem não tiver 3D do professor)

Verifique o plano gratuito **antes** de investir tempo — todas mudam de política
com frequência.

| Ferramenta | Serve para | Observação |
|---|---|---|
| **PixelLab.ai** | Gerar pixel art a partir de descrição/referência, rotacionar personagem, animar | O mais alinhado ao caso: gera nas 4 direções mantendo o mesmo personagem. Tem teto gratuito. |
| **Leonardo.ai** | Geração com *character reference* | Créditos diários grátis. Use uma imagem do professor como referência e o mesmo prompt/seed para todos. |
| **Gemini (edição de imagem) / ChatGPT-imagem** | Estilizar a foto do professor no estilo definido, antes de pixelar | Ótimos para manter semelhança; o resultado ainda precisa de pixel-art pass. |
| **Retro Diffusion** | Modelo especializado em pixel art, com plugin de Aseprite | Pago, mas é o que dá o resultado mais próximo de pixel art real. |
| **Aseprite** | Finalização, paleta, folhas de frames | Pago (~US$20) e **já faz parte do fluxo** (há `.ase` no histórico e o conversor `ase2png.cjs`). Alternativas grátis: **LibreSprite**, **Pixelorama**, **Piskel**. |

Independentemente da ferramenta, **toda arte gerada por IA passa por retoque
manual**: IA não acerta grade de pixel, e sprite com pixels de tamanhos diferentes
fica visivelmente errado ao lado do `gustavo-frente.png`.

> **Sobre o spriteflow.io e contas descartáveis:** criar várias contas com e-mail
> temporário para burlar o limite de 2 animações costuma violar os termos de uso, e
> o material fica preso a contas que você perde o acesso. Se o volume de animação
> for o gargalo, o caminho do Blender (acima) resolve sem limite e sem conta. Se
> ainda assim optarem por isso, é decisão do time — só **baixem os arquivos na
> hora** e versionem no repositório.

### Registro no código

Para cada professor novo, em `src/data/professorSprites.js`:

```js
export const PROFESSOR_SPRITES = {
  eron: '/professors/eron-frente.png',
  // ...
}
export const PROFESSOR_SPRITES_COSTAS = { /* ... */ }
const SPRITES_PIXEL_ART = new Set([ /* incluir TODOS os novos */ ])
```

A chave é o slug normalizado (`normalizeKey` de `src/data/professorTypes.js`) —
tanto `'mario'` quanto `'Mário'` resolvem o mesmo arquivo.

### Critérios de aceite

- Todo professor no escopo tem frente e costas, fundo transparente, na mesma
  paleta e no mesmo tamanho de grade.
- Nenhum arquivo acima de 120 KB (rode `oxipng -o 4` ou `pngquant`).
- Os cartoons antigos (`*-cartoon.png`) continuam existindo — eles são usados na
  ficha do professor (`ProfessorView.vue`) e na captura (`ScanView.vue`). **Não
  apague**, a menos que a tarefa 5.2 os substitua.
- Arena com dois professores quaisquer não mistura pixel art e cartoon.

---

## 2.3 — Animações

### Idle (em CSS, sem asset novo)

Uma animação de respiração no sprite, nas duas arenas:

```css
@keyframes idle-respira {
  0%, 100% { transform: translateY(0)      scaleY(1); }
  50%      { transform: translateY(-2px)   scaleY(1.01); }
}
```

- 2,4 s, `ease-in-out`, `infinite`, com **fases diferentes** para jogador e
  oponente (senão os dois "respiram" em sincronia e parece bug).
- Obrigatório: desligar sob `@media (prefers-reduced-motion: reduce)` — o projeto
  já faz isso em `BottomNav.vue` e no `RouterView`, siga o padrão.
- Cuidado: `ArenaView.vue` já usa `transform` na classe `.arena__model--hit`
  (shake ao tomar dano, ~linha 345). Duas animações disputando `transform` no
  mesmo elemento se anulam — aplique a idle num **wrapper** e o shake no `<img>`,
  ou componha as duas numa keyframe só.

### Ataque (1 animação por professor)

- 4 a 6 frames, folha horizontal `<slug>-ataque-sheet.png`, frames de largura fixa.
- Reprodução por `background-position` com `steps()`, ou por troca de `src` no
  loop de eventos da batalha.
- Gatilho: o evento `damage` que já existe. Em `src/composables/useBattle.js`
  (`play(events)`, ~linha 47) o `case 'damage'` já dispara flash e shake — é ali
  que entra o "atacante toca a animação de ataque". No PvP, os mesmos eventos
  chegam do servidor (`profdex-back/src/battle/engine/engine.ts`, tipo
  `BattleEvent`), então a lógica de tela é a mesma.
- Se o custo for alto, **priorize um só golpe genérico por professor** — o pedido
  original já era esse.

---

## 2.4 — Arte do ginásio da UNIFIL (fundo da batalha)

### Problema

Hoje o fundo das duas arenas é o **túnel binário 3D**:
`ArenaView.vue:158` e `PvpArenaView.vue:211` renderizam
`<BinaryTunnelScene>` (three/TresJS). Bonito, mas: é um cenário genérico de
"matrix", não tem nada da UNIFIL, e mantém um contexto WebGL vivo durante toda a
partida — custo real no celular, no mesmo app que já teve problema de memória
(ver `docs/BUG-BATALHA-TRAVANDO.md`).

### O que fazer

1. **Arte:** um ginásio/arena da UNIFIL no mesmo estilo definido em 2.1 — 16-bit,
   mesma paleta. Composição em três planos: fundo (arquibancada, faixa/bandeira
   UNIFIL, luminárias), meio (parede/pilares) e chão (plataforma onde os dois
   lutadores pisam, com o ponto de apoio deles bem definido).
2. **Formato:** `public/arena/ginasio-unifil.png`, 480×270 (16:9) exportado 1×,
   com `image-rendering: pixelated` e `object-fit: cover`. Se quiser paralaxe,
   entregue os planos separados (`-fundo.png`, `-meio.png`, `-chao.png`) e anime
   só o horizontal, devagar.
3. **Código:** trocar `<BinaryTunnelScene>` por uma `<div>` com a imagem de fundo
   nas duas arenas. Manter o túnel binário como opção (a rota `/tunel-binario` já
   existe e é usada como laboratório) — mas ele sai do caminho crítico da batalha.
4. Verificar as caixas dos sprites depois da troca: os comentários no CSS do
   `ArenaView.vue` (~linha 302 em diante) explicam que as caixas foram refeitas
   para pixel art, que é "bem mais alta" — o novo chão precisa bater com esses
   pontos de apoio.

### Ferramentas para o fundo

Mesma lista de 2.2. Para cenário especificamente, funciona bem gerar uma base em
**Leonardo.ai / Krea / Ideogram** com prompt de "16-bit SNES JRPG gymnasium
interior, pixel art background, 480x270" e depois **redesenhar em cima** no
Aseprite/LibreSprite para acertar a grade e a paleta. Fotos reais do ginásio da
UNIFIL como referência ajudam a semelhança.

### Critérios de aceite

- O fundo carrega em < 100 KB e não é um contexto WebGL.
- Ganho medível de memória/bateria numa partida de 3 min em celular médio (compare
  com o estado atual pelo DevTools remoto).
- Os dois lutadores parecem apoiados no chão, não flutuando.
- A marca UNIFIL aparece no cenário (ver tarefa 7.3 — usar a marca oficial e
  validar com a comunicação da instituição).

---

## Checklist de entrega da tarefa 2

- [ ] `docs/ESTILO-VISUAL.md` escrito e aprovado
- [ ] Sprites frente/costas de todos os professores no escopo
- [ ] `src/data/professorSprites.js` atualizado (mapas + `SPRITES_PIXEL_ART`)
- [ ] Idle em CSS nas duas arenas, respeitando `prefers-reduced-motion`
- [ ] Ao menos uma animação de ataque por professor
- [ ] `public/arena/ginasio-unifil.png` substituindo o túnel binário nas arenas
- [ ] `ENEMY_KEY` fixo removido do `ArenaView.vue` (ver 8.2)
- [ ] PNGs otimizados e o CHANGELOG atualizado
