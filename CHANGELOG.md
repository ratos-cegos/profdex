# Changelog

Mudanças relevantes do ProfDex. As entradas mais recentes ficam no topo.

O formato segue o espírito do [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/):
`Adicionado` para novidades, `Alterado` para mudanças de comportamento existente,
`Corrigido` para defeitos e `Removido` para o que saiu.

## [Não publicado] — branch `feat/sprites-2d-e-ginasio`

### Adicionado

- **Tânia palmeirense:** sprite de frente e costas
  (`t-camis-palmeirense-frente.png` / `-costas.png`) na arena em
  `/arena/t-camis-palmeirense`.

### Alterado

- **Ginásio da arena:** PvE e PvP usam `public/arena/unifil-ginasio.png` como fundo.
  A marca UNIFIL já vem na arte, então o overlay do logo foi retirado.

- **Elenco do evento:** seed, tipos e sprites passam a ter só Tânia (`t-camis`),
  João, Eron, Gustavo, Simone e Mário. Quem não está nessa lista some da Pokédex
  e das arenas.

### Removido

- Professores fora do elenco (Marcelo, Renata, Serginho e os demais mapeados
  só em tipo) saíram do seed e dos mapas de sprite. Os PNGs locais não foram
  apagados, só deixaram de ser versionados.

## [Não publicado] — branch `deploy`

### Adicionado

- **Folhas de ataque na arena** (`{slug}-ataque-sheet.png` e
  `{slug}-ataque-costas-sheet.png`, 6 frames). No golpe, a arena troca o idle
  por uma reprodução em `steps()`; quem ainda não tem folha continua com o
  lunge em CSS. Geração: `profdex-front/scripts/make-ataque-sheets.ps1`.

- **Landing page em `/landing`** (`profdex-landing/`). A vitrine pública do
  ProfDex, que vivia num repositório e num deploy Vercel separados
  ([KenzoLima/landing-page-profdex](https://github.com/KenzoLima/landing-page-profdex)),
  passa a ser publicada no mesmo domínio do app —
  `https://profdex.unifil.tech/landing/` — pelo mesmo pipeline: um `git push`
  na `deploy`, uma imagem no GHCR, um `docker compose up`.

  Continua sendo um **build separado**, com container próprio, e não uma rota
  do Vue Router do app. Os dois têm requisitos opostos: o app é uma casca
  mobile de 480px com `overflow: hidden` no `body`, e a landing é uma página
  longa de leitura, com 3D sob demanda. Fundir as duas custaria brigar com o
  CSS global do app e somar `three`/TresJS/GSAP ao bundle de quem só quer
  jogar.

  O que a mudança exigiu no código copiado está em
  [`profdex-landing/README.md`](profdex-landing/README.md); o resumo é que a
  página agora vive sob um **prefixo de URL** (`base: '/landing/'`), e o Vite
  aplica esse prefixo sozinho no HTML e no CSS mas **não** em strings dentro do
  JavaScript. Daí o `src/config/asset.js`: sem ele, os `.glb` e os sprites
  pediriam `/models/…` na raiz do domínio, onde o app responde com o
  `index.html` dele — um 404 que chega como 200 e aparece só como "o modelo não
  carrega".

- **`npm run dev:landing` e `npm run dev:all`** na raiz. O `dev:all` sobe app,
  backend e landing juntos; com os três no ar, o dev server do app repassa
  `/landing` para o da landing, então o endereço em desenvolvimento é o mesmo
  de produção. `npm run dev` segue sendo só app + backend.

### Alterado

- **`nginx/templates/default.conf.template`**: nova `location /landing/` (mais
  o redirect de `/landing` sem barra), declarada antes do `location /` que é o
  catch-all do app. O `proxy_pass` vai **sem** barra final de propósito — o
  container da landing serve os arquivos já sob `/landing/`, casando com o que
  o build do Vite emite.
- **`docker-compose.yml` / `docker-compose.github.yml` / workflow de deploy**:
  o serviço `landing` entra na stack e na lista de imagens buildadas e
  empurradas para o GHCR (`ghcr.io/<owner>/profdex-landing`).

## [Não publicado] — branch `refactor/frontend`

Trabalho da branch `refactor/frontend`, ainda não integrado à `main`.

### Adicionado

- **Conversor de sprites Aseprite (`.ase`) em Node**
  (`profdex-front/scripts/ase2png.cjs`). Decodifica o container binário —
  cabeçalho, chunks de camada e de cel, pixels comprimidos em zlib — e compõe as
  camadas visíveis de cada frame, sem depender do Aseprite instalado e sem
  dependência nova no projeto: usa só o `zlib` nativo. De cada arquivo saem o
  frame isolado, que é o que a arena consome, e a folha com todos os frames. O
  recorte usa a bounding box comum a todos os frames, e não a de cada um, para
  eles manterem o registro entre si e o sprite não "pular" ao animar.
- **Conversor dos ícones de navegação** (`profdex-front/scripts/build-icons.cjs`),
  na mesma linha: remove fundo preto chapado, recorta na bounding box e reduz por
  nearest-neighbor, que preserva a borda dura do pixel art onde a interpolação
  suave a destruiria.
- **Sprites de frente e de costas do professor Gustavo** na arena, no
  enquadramento clássico das batalhas por turnos: o oponente aparece de frente,
  ao fundo e menor; o jogador aparece de costas, em primeiro plano e maior. Os
  dois recebem `image-rendering: pixelated`.
- **Ícones de navegação em pixel art** na barra inferior, nas abas superiores e no
  botão principal da tela de Batalha.
- **Componentes compartilhados de navegação** (`BottomNav` e `TopTabs`), que
  substituem as cópias que existiam em cada view.
- **Ranking em rota própria** (`/ranking`), alimentado pelo Elo real de PvP, com
  pódio, paginação e a posição do próprio jogador.
- **Transição entre rotas** no `RouterView`, desligada sob
  `prefers-reduced-motion: reduce`.

### Alterado

- **Escala dos ícones da navegação.** Os ícones passam a ser dimensionados pela
  altura, com a largura livre, e os arquivos preservam a proporção original em vez
  de serem completados para quadrado. O ícone de batalha é uma arte larga
  (1.75:1); dentro de uma caixa quadrada ele aparecia com pouco mais da metade da
  altura dos demais. A geometria dos botões não mudou — seguem 118×68 a 390px de
  largura de tela.
- **Ranking** deixa de existir em dois lugares. Antes havia uma aba interna na
  tela de Batalha com o Elo real e uma rota `/ranking` com dados estáticos; agora
  há um ranking só, e a aba superior é o único acesso a ele.
- Barra inferior e abas superiores passam a navegar por `RouterLink`, com o estado
  ativo derivado da rota.

### Corrigido

- **Pódio com menos de três jogadores.** Os lugares vazios eram filtrados fora do
  array, então com um ou dois jogadores a grade de três colunas abria um vão à
  direita e o campeão virava `:last-child`, herdando a borda do canto em vez da
  composição central. Agora são sempre três lugares, com a vaga não preenchida
  virando um card tracejado, e as bordas seguem a posição no pódio em vez da ordem
  dos filhos. Verificado com 0, 1, 2 e 6 jogadores.
- **Inconsistência visual da barra inferior entre rotas.** A barra estava
  duplicada em três views e as mesmas classes significavam coisas diferentes em
  cada arquivo, então fundo, borda, padding e alinhamento mudavam ao trocar de
  tela.
- **Conteúdo cortado nas telas de autenticação e no painel `/admin`.** Sem
  container rolável e com `overflow: hidden` no `#app`, o que passava da altura
  sumia em vez de rolar.
- **`env(safe-area-inset-*)` inerte no iOS**: faltava `viewport-fit=cover` na meta
  viewport, e os 25 usos espalhados pelo projeto resolviam para 0px.
- **Altura da viewport no navegador móvel**: `#app` passa a `100dvh`, que acompanha
  a barra de endereço aparecendo e sumindo.
- **Sobreposição dos sprites na arena.** As caixas de posicionamento eram
  dimensionadas para os cartoons quase quadrados; com a pixel art (proporção
  ~0.55) os dois bonecos se cruzavam e o do jogador avançava por trás do painel de
  comandos, aparecendo nos vãos entre os botões.
- Grade da ProfDex cai para duas colunas em telas de 320px em vez de espremer três.

### Removido

- `src/data/ranking.js`, o conjunto de dados estáticos que alimentava o ranking
  antigo.
- Bloqueio de zoom (`maximum-scale=1.0, user-scalable=no`) na meta viewport, por
  WCAG 1.4.4.

### Notas

- As folhas de sprite (`gustavo-frente-sheet.png`, com 13 frames, e
  `gustavo-costas-sheet.png`, com 7, a 100ms cada) estão versionadas, mas a arena
  ainda usa só o primeiro frame de cada. Animar exige trocar as `<img>` por
  elementos com `background-image` e `steps()`.
