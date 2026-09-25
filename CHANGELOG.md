# Changelog

Mudanças relevantes do ProfDex. As entradas mais recentes ficam no topo.

O formato segue o espírito do [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/):
`Adicionado` para novidades, `Alterado` para mudanças de comportamento existente,
`Corrigido` para defeitos e `Removido` para o que saiu.

## [Não publicado] — branch `feat/professores-raros`

### Adicionado

- **Professor raro** (tarefa 15). Uma segunda via de aquisição, paralela e
  independente da captura comum: um professor marcado como raro **não sai em
  ficha comum, não conta para completar a Profdex**, e só é capturável por quem
  acertar **5 questões em cada tipo dele** no quiz de bancada. Uma captura por
  conta, para sempre.

  Os **tipos do professor são os temas exigidos** — não há coluna separada. Um
  raro de dois tipos exige os 5 em **cada** um ("E", não "OU"), o que faz do
  número de temas o dial de dificuldade. Ele ganha **uma** variante (a
  combinação completa) em vez das três do professor comum, porque tem arte e
  pilha de papel próprias.

  O aluno **nunca vê progresso** — nem no app, nem na bancada, nem parcial. A
  bancada fica virada para ele, e um "4/5 rumo ao raro" revelaria o tema para a
  fila inteira. O único aviso é a **cena dourada** no acerto que fecha o gate
  (`ENTREGUE A FICHA ✦ <NOME>`), mais uma tarja de pendência no resultado e no
  cartão do aluno até a ficha virar captura. Quem enxerga progresso é o
  **painel**, que não fica virado para ninguém.

  O **servidor é o porteiro do resgate**: a checagem roda dentro da transação da
  captura e, nas três recusas (`RARO_INDISPONIVEL` 404, `RARO_BLOQUEADO` 403,
  `RARO_JA_CAPTURADO` 409), **a ficha não é consumida**. Com gate humano, uma
  ficha fotografada e mandada no grupo do WhatsApp entregaria o raro para quem
  nunca respondeu nada.

  Em batalha ele é um exemplar como qualquer outro — variante, deck e IVs saem
  do sorteio normal, e a diferença é só cosmética (selo `✦`). O PvP é ranqueado
  por Elo, e um raro estatisticamente superior faria o ranking medir quem
  respondeu quiz, não quem joga melhor.

  Também entram: cadastro pelo painel com validação de **um raro por tema**
  (409 `TEMA_JA_TEM_RARO`), **tiragem de pilha própria** por raro em
  `/admin/fichas` → `Raros ✦` (folha com moldura e os temas exigidos impressos),
  rota `GET /professors/rares` que devolve só a contagem e os capturados, seção
  `✦ Raros` na Profdex com entradas bloqueadas, e a seção `Raros ✦` de
  `/admin/metrics` com quem capturou, `destravaram` vs `capturaram` e quem está
  **a um acerto**.

  Migração `20260924000000_add_professores_raros`: aditiva e sem backfill
  (`professors.rare`, `qr_batches.rare_professor_id`, tabela `rare_unlocks`).
  Aplicada num Postgres 16 descartável com todas as anteriores, e o
  `prisma migrate diff` acusou zero divergência para o schema.

### Alterado

- **A palavra "dex" passou a excluir os raros nos três lugares que contam
  coleção**, senão "100% da dex" ficaria inalcançável: `GET /professors`, o
  `dexLeaderboard` do ranking (nos dois lados da fração) e o
  `collection_completed` das métricas. O estoque por tipo de `/admin/fichas`
  também ignora o raro — ele responde "quantos professores podem sair numa
  ficha comum deste tipo", e o raro nunca sai numa.
- **`ScanView` confere o código de erro antes do status HTTP.** As recusas de
  ficha rara reusam 404 e 409, e a ordem anterior faria um `RARO_JA_CAPTURADO`
  cair no texto genérico de "QR já utilizado" — mandando embora um aluno cuja
  ficha continua valendo.

## [Não publicado] — branch `deploy`

Trabalho da branch de deploy, sobre a `main` já integrada.

### Adicionado

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

- **Revisão de UI/UX da tarefa 6:** navegação principal com Perfil e Treino,
  scanner com ajuda contextual, ficha de professor em painéis deslizantes,
  cards de golpe completos e números flutuantes de dano/cura em PvE e PvP.
- **IVs reais por exemplar:** quatro atributos persistidos, nota de 0–5 estrelas,
  filtros e fraquezas na coleção, backfill determinístico e bônus moderado nas
  batalhas ranqueadas.

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
