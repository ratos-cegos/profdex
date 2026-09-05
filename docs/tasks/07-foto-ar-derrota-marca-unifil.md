# Tarefa 7 — Foto na RA, feedback de derrota e presença da marca UNIFIL

**Prioridade:** média (7.1 tem alto valor de divulgação: é o que gera post de aluno)
**Perfil:** front-end (7.1 e 7.2) + design/institucional (7.3)

---

## Contexto do projeto

ProfDex é um app web mobile-first estilo Pokédex da Semana Tecnológica da UNIFIL.
O aluno captura professores por QR, vê o professor em 3D/realidade aumentada e
batalha por turnos.

- **Front:** `profdex-front/` — Vue 3 (`<script setup>`), Vite, Pinia, vue-router.
  Estética retrô (Press Start 2P, tokens em `src/style.css`).
- **RA — dois caminhos distintos**, é importante não confundir:
  1. **`<model-viewer>`** (`src/components/ARViewer.vue` +
     `src/composables/useModelViewer.js`), usado em
     `src/views/CharacterARView.vue` (`/character-ar/:id`). Em desktop e no modo
     "magic window" o modelo é renderizado num canvas **da própria página**; ao
     tocar em "Ver em RA" no celular, ele delega ao **Scene Viewer** (Android) ou
     ao **Quick Look** (iOS) — apps do sistema, fora do controle da página.
  2. **WebXR próprio** (`src/composables/useArenaAR.js`): sessão
     `immersive-ar` com three.js e hit-test de chão, usada pela arena.
     Só Android/Chrome; iOS não tem WebXR.
- **Docs:** `docs/CENARIO-3D-E-AR.md`.

---

## 7.1 — Botão de tirar foto na RA (+ baixar / compartilhar)

### O que é possível, e o que não é

Vale começar por aqui, porque o pedido tinha uma dúvida legítima:

- ✅ **Tirar a foto e baixar no celular** — sim, funciona em Android e iOS.
- ✅ **Abrir a folha de compartilhamento nativa** (que inclui Instagram, WhatsApp,
  Fotos…) — sim, via **Web Share API nível 2** (`navigator.share` com `files`).
  Suportada no Chrome Android e no Safari iOS. É assim que se "compartilha no
  Instagram" a partir de uma página web.
- ❌ **Postar direto no feed/story do Instagram por um botão da página** — não.
  Não existe API pública de publicação para web. O deep link
  `instagram-stories://share` é restrito a apps nativos registrados com um App ID
  da Meta. Então o fluxo real é: foto → folha nativa → o usuário escolhe Instagram.
- ⚠️ **Capturar a tela do Scene Viewer / Quick Look** — não. Naquele momento a
  câmera é de um app do sistema; a página nem está na frente. O que dá para fazer
  é orientar o usuário a usar o **print de tela do próprio aparelho** (que é,
  aliás, o que a maioria já faz).

Conclusão: implemente a foto no que a página controla — o canvas do
`<model-viewer>` (magic window) e, se valer o custo, a sessão WebXR própria.

### Implementação — caminho `<model-viewer>` (faça este primeiro)

1. Adicionar um botão "📷 Foto" sobre o viewer em `ARViewer.vue`, na mesma camada
   do `ar-button`.
2. Capturar com a API do próprio componente:

   ```js
   // viewerRef é o <model-viewer>; useModelViewer.js já o expõe
   const blob = await viewerRef.value.toBlob({ idealAspect: true, mimeType: 'image/png' })
   ```

3. **Compor a moldura** num `<canvas>` fora da tela: desenhar o blob, e por cima
   a marca ProfDex + UNIFIL, o nome do professor, os tipos e a data. É esse
   enquadramento que faz a foto virar divulgação em vez de screenshot.
4. Entregar ao usuário:

   ```js
   const file = new File([final], `profdex-${slug}.png`, { type: 'image/png' })
   if (navigator.canShare?.({ files: [file] })) {
     await navigator.share({ files: [file], title: 'ProfDex', text: `Capturei o Prof. ${nome}!` })
   } else {
     // fallback universal: download
     const url = URL.createObjectURL(final)
     Object.assign(document.createElement('a'), { href: url, download: file.name }).click()
     URL.revokeObjectURL(url)
   }
   ```

   Chame `navigator.share` **dentro do handler do clique** — fora de um gesto do
   usuário, o navegador recusa. E sempre ofereça o botão de baixar como
   alternativa visível, não só como fallback silencioso.

### Implementação — caminho WebXR (opcional, mais trabalhoso)

Em `useArenaAR.js`, o `WebGLRenderer` precisa ser criado com
`preserveDrawingBuffer: true` para o canvas poder ser lido; sem isso o buffer já
foi descartado quando você chama `toBlob`. Alternativa sem custo de performance:
capturar dentro do loop de render (`renderer.setAnimationLoop`), no frame seguinte
ao clique, marcando uma flag. O botão precisa estar no **DOM overlay** da sessão
XR (feature `dom-overlay`), senão não aparece durante o `immersive-ar`.

Avalie se compensa: a maior parte das fotos virá da tela de personagem, não da
arena.

### Extras que valem pouco esforço

- Registrar uma métrica `foto_ar` (o `src/stores/metrics.js` e o
  `MetricsService` do back já existem — ver `docs/METRICAS.md`).
- Uma moldura sazonal ("Semana Tecnológica 2026") como asset em
  `public/molduras/`, trocável sem mexer no código.

### Critérios de aceite

- Botão visível na tela de RA, com alvo ≥ 44×44 e `aria-label`.
- Foto sai com a moldura e o nome do professor, em resolução ≥ 1080 px de largura.
- Android/Chrome e iOS/Safari: a folha nativa abre e o Instagram aparece como
  destino (com o app instalado).
- Navegador sem Web Share de arquivos: o download acontece e a imagem abre na
  galeria.
- Nada trava se o usuário cancelar o compartilhamento (o `share` rejeita com
  `AbortError` — trate sem mostrar erro).

---

## 7.2 — Deixar vermelho quando for derrotado

**Problema.** Ao perder, o feedback é só textual: `useBattle.js` seta
`message.value = 'Você foi derrotado...'` (~linha 100). O motor emite um evento
`faint` com o alvo, mas a tela não faz nada de visual com ele. Há flash vermelho,
mas só no dano (`.arena__hud--player-hit`).

**O que fazer.** Um estado de derrota explícito nas duas arenas
(`ArenaView.vue` e `PvpArenaView.vue`), disparado pelo evento `faint`:

1. **Sprite do derrotado:** `filter: grayscale(1) brightness(0.6)` + tombamento
   (`rotate(12deg)`) + `opacity: 0.75`, com transição de ~600 ms.
2. **Tela:** vinheta vermelha nas bordas (`radial-gradient`, `pointer-events: none`)
   e pulso lento — **só quando quem caiu foi o jogador**. Se o derrotado for o
   oponente, o realce é dourado/vitória, não vermelho.
3. **Barra de HP:** `BattleHpBar.vue` já muda de cor por faixa; garanta que o
   estado zerado fique vermelho sólido, não sumindo.
4. **Painel final:** o bloco `.battle-panel__end` deve deixar claro o resultado —
   "VOCÊ FOI DERROTADO" em vermelho, com o Elo perdido no PvP (o servidor já
   devolve `ratingDeltaA/B`, ver `docs/BATALHA-PVP.md`).
5. `prefers-reduced-motion` → sem pulso, só o estado estático.

**Cuidado.** Vermelho sobre fundo escuro em fonte pixel perde contraste rápido.
Verifique 4.5:1 nos textos (o `PRODUCT.md` pede contraste forte porque o app é
usado ao ar livre). Não use **só** a cor para comunicar derrota — o texto tem de
dizer.

**Aceite.** Em PvE e PvP, derrota e vitória são distinguíveis num relance e sem
depender de cor; o estado aparece no mesmo instante em que o HP zera.

---

## 7.3 — Marca UNIFIL mais presente + seção "Quem somos"

### Situação

Não há nenhum arquivo de logo da UNIFIL em `profdex-front/public/` — só
`eagle-ball.png` (a "pokébola" com a águia, que é a apropriação temática da
marca) e o `favicon.ico`. Os tokens `--unifil-orange` e `--unifil-gold` existem em
`src/style.css`, mas a marca em si não aparece em lugar nenhum.

### O que fazer

1. **Obter os arquivos oficiais** com a comunicação/marketing da UNIFIL:
   SVG (preferencial) em versão colorida, monocromática clara e escura, mais o
   manual de marca (área de respiro, usos proibidos, cores oficiais).
   ⚠️ Uso de marca institucional precisa de aprovação — trate isso como
   pré-requisito, não como detalhe.

   > **A PREENCHER:** responsável pelo contato e prazo.

2. **Onde colocar** (sem virar poluição):
   - `/sobre` — cabeçalho e rodapé (tarefa 3);
   - tela de login e `/` — assinatura discreta no rodapé;
   - cabeçalho da ProfDex — logo pequena ao lado do título;
   - ícone do PWA e splash (tarefa 1.2) — combinação eagle-ball + UNIFIL;
   - fundo do ginásio da batalha (tarefa 2.4) — faixa/bandeira no cenário;
   - moldura da foto de RA (7.1).
   Regra: **uma** aparição por tela, no mesmo canto, no mesmo tamanho.

3. **Seção "Quem somos / grupo de pesquisa"** — mora na `/sobre` (tarefa 3), com
   uma âncora `/sobre#equipe` para linkar de dentro do app (perfil e rodapé).
   Conteúdo: cards com foto, nome, papel no projeto (dev, arte, pesquisa,
   coordenação); um bloco do **grupo de pesquisa** com nome oficial, linha de
   pesquisa, professores responsáveis e link (CNPq/site do curso); e uma menção ao
   curso e ao evento.

   > **A PREENCHER:** nomes, papéis, fotos, nome e linha do grupo de pesquisa,
   > links, texto institucional.

4. **Acessibilidade:** logo é imagem informativa no rodapé
   (`alt="UNIFIL"`) e decorativa quando acompanha um título que já diz o nome
   (`alt=""` + `aria-hidden`). SVG inline permite herdar `currentColor` nas
   versões monocromáticas.

### Critérios de aceite

- Logos oficiais versionadas em `profdex-front/public/marca/`, com README curto
  citando as regras do manual.
- Marca presente nas telas listadas, sem repetição dentro da mesma tela.
- Seção "Quem somos" publicada na `/sobre`, com o grupo de pesquisa citado.
- Aprovação da comunicação da UNIFIL registrada (e-mail/ticket) antes do deploy.
