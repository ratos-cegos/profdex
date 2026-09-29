# Changelog

Mudanças relevantes do ProfDex. As entradas mais recentes ficam no topo.

O formato segue o espírito do [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/):
`Adicionado` para novidades, `Alterado` para mudanças de comportamento existente,
`Corrigido` para defeitos e `Removido` para o que saiu.

## [Não publicado] — revisão do PWA: matrícula na bancada

### Corrigido

- **A bancada do quiz não encontrava alunos recém-cadastrados.** O cadastro
  gravava a matrícula como veio, só com `trim()`, e a bancada digita 0–9 num
  numpad e procura por igualdade exata. No celular, o que chegava ao campo
  nem sempre era a matrícula. A faixa de autofill do teclado oferece ali o
  e-mail do Google que o aluno acabou de usar (o campo é
  `autocomplete="username"`). Também chegavam `2023.123-45`, espaços no meio,
  espaço de largura zero colado do portal e dígitos de largura total. Nenhum
  desses valores a bancada acha. Agora:
  - o **valor novo** (cadastro pelo Google e troca no Perfil) é normalizado e
    precisa ser **só dígitos**, até 20. Um e-mail é recusado com uma mensagem
    que diz o que fazer, e a tela mostra o valor normalizado antes de enviar;
  - a **busca** no login, na bancada, na errata e na recuperação de senha tenta
    o valor exato e depois o normalizado, então conta antiga não é trancada;
  - o "não encontrada" da bancada manda o operador pedir ao aluno que confira a
    matrícula no **Perfil**, onde ele a corrige.

  A regra fica em `profdex-back/src/users/matricula.ts`, com o par em
  `profdex-front/src/services/matricula-rules.js`. Um teste confere que os dois
  não divergem. A decisão 8 da tarefa 17 ("não validar formato") foi revista
  para valores novos.

- **Rate limit do login por matrícula normalizada.** Com a busca tolerante,
  `2023.12345` e `202312345` chegam à mesma conta. Com chaves diferentes, cada
  variação ganharia as próprias tentativas de senha.

- **Erro de validação da API aparecia como lista** (`["…"]`) no cadastro e no
  Perfil. Agora aparece só a primeira mensagem.

- **`/auth/me` devolvia o que estava no token, e não o banco.** O Perfil
  mostrava a matrícula antiga por até 8h depois de uma troca em outro aparelho
  ou da normalização. Pior: depois do `db:limpar-evento`, uma conta apagada
  continuava "logada". Agora ele lê o banco, reemite o cookie quando o token
  está velho e responde 401, limpando o cookie, quando a conta não existe mais.

### Adicionado

- **`npm run db:normalizar-matriculas`** conserta as matrículas gravadas antes
  da regra. É dry-run por padrão, com `--yes` para aplicar e `--listar` para ver
  quem precisa de contato. Sem `--listar`, só imprime contagens e motivos. Não
  mexe em conflito (o valor normalizado já é de outra conta) nem em e-mail ou
  nome, que o aluno corrige no Perfil. Ver deploy.md.

- **Passo a passo ilustrado para instalar no iPhone.** O iOS não deixa a página
  abrir o diálogo de instalação, então o "Instalar o ProfDex" do Perfil mostra
  o caminho com os mesmos desenhos que o aluno procura na tela: Compartilhar,
  Adicionar à Tela de Início, Adicionar e o ícone do app. O texto muda para o
  Chrome do iPhone, que tem o Compartilhar em outro lugar. Em navegadores de
  dentro de apps, como Instagram e Facebook, onde não dá para instalar, ele
  manda abrir no Safari e oferece copiar o link. No Android nada muda: o botão
  continua abrindo o diálogo nativo.

## [Não publicado] — raid do professor lendário

### Alterado

- **Contas de administração saem dos três rankings.** Batalha, capturas e dex
  passam a comparar só quem tem papel `aluno`. A conta `@unifil.br` é de quem
  organiza o evento e existe para exercitar o app — dar a si mesmo a Profdex
  inteira para conferir a raid é operação normal, e sem este filtro a mesa
  lideraria o ranking de coleção com uma dex que ninguém pode alcançar.

  É filtro de **exibição**: as capturas do organizador continuam existindo, a
  Profdex dele continua completa, o Elo continua sendo calculado e o painel de
  métricas continua contando tudo. Só a comparação entre alunos muda. No rodapé
  do ranking, a conta admin aparece sem posição, como quem ainda não jogou.

### Adicionado

- **`SLUGS=todos` no `db:dar-capturas`.** Dá o elenco ATIVO inteiro —
  inclusive os raros e o lendário — a uma matrícula que já existe:

  ```bash
  MATRICULA=<sua> SLUGS=todos npm run db:dar-capturas
  ```

  Nesse modo o comando vira idempotente: quem a conta já tem é **pulado**, e
  repetir depois de cadastrar um professor novo completa a coleção em vez de
  duplicar as outras. Com lista de slugs o comportamento é o de sempre (uma
  ficha, um exemplar). Avisa quando a matrícula **não** é `admin` — aí as
  capturas contariam no ranking.

- **Conferência no fim do `db:limpar-evento`.** Depois de aplicar, ele reconta
  as onze tabelas que o painel de métricas lê (raid, raro, capturas, quiz,
  eventos, sessões) e imprime o resultado. A pergunta seguinte era sempre "mas
  o painel ainda mostra número na seção de raros", e a causa quase nunca é o
  comando: é ter rodado sem `--yes`, ou contra outra `DATABASE_URL`. Agora o
  comando também **imprime o banco alvo** antes de qualquer coisa.

- **Tela de descanso na bancada.** Botão `☾ Tela de descanso` ao lado do
  `← Painel`, na cena da matrícula. Cobre o quiosque inteiro com a marca no
  centro (eagle ball, `PROFDEX`, mote e assinatura UNIFIL) e o elenco
  desfilando em três camadas de paralaxe — é o atrator para quando a fila
  acaba e o tablet ficaria com o numpad parado.

  **Raro e lendário passam como silhueta preta**, nunca com a arte de verdade:
  a tela fica virada para a fila, e mostrar quem são entregaria de graça a
  surpresa que o quiz e a raid existem para guardar. Um `?` dourado marca o
  vulto — é ele que salva o caso da arte enviada sem transparência, que
  viraria um retângulo preto liso.

  Sai ao primeiro toque ou tecla. Pede tela cheia e segura a tela acesa
  (`wakeLock`) quando o navegador deixa; recusa dos dois não impede nada.

- **`npm run db:limpar-evento`.** Zera ranking, Elo, capturas e Profdex
  mantendo o cadastro de pé: professores, arte, variantes, questões e ajustes
  do painel ficam. **Mantém as contas `admin` com e-mail `@unifil.br`** (mais a
  conta local `admin` do seed) e apaga o resto, junto de tudo que elas
  produziram. Dry-run por padrão, `--yes` para aplicar, e recusa rodar se
  nenhuma conta sobraria.

  Diferente do `db:reset`, as **fichas de papel voltam a valer**: o token que
  uma captura apagada havia consumido volta ao estoque. `--manter-fichas` pula
  essa parte. Ver deploy.md.

- **Raid do professor lendário.** Quem captura todos os professores comuns
  destrava uma batalha contra o professor **lendário**, controlado pelo
  servidor: até 3 exemplares do aluno contra um chefe com **4× a vida** de um
  professor normal e IV máximo. Vencer **captura o lendário e completa a
  Profdex** — ele é a entrada `Y+1`, que até lá aparece como silhueta `???`
  piscando colorido, com um botão CAPTURAR.

  Não exige os raros e é opcional. Tentativas são **ilimitadas**, com cooldown
  de 30 min entre elas; o exemplar ganho tem **IV 15 nos quatro atributos** e
  joga no PvP como qualquer outro. O card só aparece **depois** de destravar:
  quem não fechou a coleção não sabe que existe uma entrada a mais.

  A batalha roda no **servidor**, numa sala irmã da do PvP
  (`RaidRoomService`), reusando o motor e as regras de time — o `battle-room`
  ranqueado não foi tocado. As telas de seleção e de arena são as mesmas,
  em modo raid.

- **Ajustes ao vivo da raid** em `/admin/configuracoes`: vida do chefe
  (`raid.hp_multiplier`, padrão 4×), atributos (`raid.legendary_iv`, 15), teto
  de turnos (`raid.turn_cap`, 60) e cooldown (`raid.cooldown_minutes`, 30). Os
  três primeiros são congelados no nascimento de cada sala, então mexer no
  painel não muda a vida do chefe com um aluno já lutando.

- **Seção `Raid ⚡` em `/admin/metrics`**, com a **fila do prêmio** (posição,
  nome, matrícula, horário e número de tentativas de quem capturou, em ordem de
  chegada) e o funil de destravamentos → tentativas → vitórias. A ordem de
  quem capturou primeiro **não** aparece no app durante o evento: anunciar que
  o primeiro lugar já saiu tira o motivo de os outros tentarem.

- **Cadastro do lendário** no painel de professores, com as mesmas travas do
  raro: imutável depois de criado, **um ativo por vez**, variante única, e
  recusado se marcado junto com "raro" — são vias de captura excludentes.

- `npm run db:seed-dex-completa` cria uma conta com a Profdex inteira (a única
  forma de abrir a tela da raid sem escanear uma ficha por professor), e
  `npm run raid:smoke` percorre o fluxo completo pela rede.

### Corrigido

- **`collection_completed` voltou a ser alcançável.** A contagem de "coleção
  completa" incluía professores **desativados**, que nunca podem ser
  capturados: a partir do primeiro "remover" no painel, ninguém mais fecharia a
  Profdex nem ganharia os 200 pontos do evento. Era um achado em aberto desde a
  tarefa 15 e virou pré-requisito da raid, porque é a **mesma** contagem que
  destrava o lendário. O filtro agora é `{ rare: false, legendary: false,
  active: true }` nos dois lados da conta.

## [Não publicado] — banco de questões do quiz

### Corrigido

- **A resposta certa não é mais a alternativa mais longa.** O banco tinha o
  vício clássico de prova de múltipla escolha: quem escreve capricha na
  alternativa correta e despacha as erradas em três palavras. Medido, o padrão
  era gritante — em **51%** das questões oficiais (e 55% das de treino) a
  correta era a única mais longa, contra 25% que o acaso daria, e em **41%**
  delas a diferença passava de 6 caracteres. Em `humanas` chegava a 75%: dava
  para gabaritar o tema sem ler o enunciado, que é o oposto do que a bancada
  precisa medir antes de liberar um QR de captura.

  As 126 questões fora da linha tiveram os **distratores reescritos** — não a
  resposta certa encurtada, que só empobreceria o gabarito. O enunciado de cada
  uma ficou intocado de propósito: ele é a chave única das tabelas, e mexer
  nele criaria questão nova e desativaria a antiga, junto com o código de 4
  dígitos que já está impresso na bancada.

  Depois: a fatia de respostas visivelmente mais longas caiu de **41% para
  6,4%** (oficial) e de **41% para 5,7%** (treino), e o tamanho médio da
  correta saiu de 1,34× o dos distratores para 1,05×.

### Adicionado

- **Os dois bancos dobraram de tamanho.** O oficial foi de 210 para **420**
  questões (40 por tema, mantendo a proporção 4:3:3 de fácil/média/difícil;
  `matematica` tem 60 e `algoritmos`, 80) e o de treino, de 158 para **317**
  (30 por tema, 47 em `matematica` e 60 em `algoritmos`). O assunto de cada
  tema é o mesmo: o que entrou foi conteúdo que ainda não estava coberto —
  ANPD, licenças e propriedade intelectual em `humanas`; combinatória, matrizes
  e inferência em `matematica`; Transformers, RAG e métricas em `ia`; SLAM,
  filtro de Kalman e barramentos em `robotica`; paginação, TLB e coerência de
  cache em `arquitetura`; TDD, MVC e SOLID em `engenharia-software`; BGP, TLS e
  sub-redes em `redes`; transações, isolamento e planos de execução em `banco`;
  grafos, ordenação e quantificadores em `algoritmos`.

  Dobrar o pool importa porque o sorteio **nunca devolve ao aluno uma questão
  que ele já respondeu no tema** enquanto houver inédita: com 20 por tema, quem
  passava o dia no estande esgotava o banco antes do fim do evento e caía no
  modo de repetição.

- **`src/quiz/option-balance.ts` e o guarda de CI.** A regra que impede o vício
  de voltar, verificada nos dois bancos: por questão, a correta não pode passar
  da errada mais longa por mais de 8 caracteres; no banco todo, no máximo 15%
  podem ter a correta visivelmente mais longa e a média dela não passa de
  1,15× a dos distratores. O gerador de treino
  (`scripts/gerar-questoes-treino.ts`) passou a pedir alternativas de
  comprimento parecido no prompt e a **descartar** a questão que voltar fora da
  margem — é o erro mais frequente do lote gerado por IA.
## [Não publicado] — branch `feat/professores-raros`

### Adicionado

- **Cooldowns ajustáveis pelo painel**, em `/admin/configuracoes`: o do **tema**
  na bancada (1 a 120 min, padrão 10) e o da **dupla** no PvP ranqueado (1 a 72
  h, padrão 12). Os dois eram constantes de código, e o número certo depende do
  tamanho da fila — que ninguém sabe antes de abrir o estande.

  Valem **na hora**, sem deploy nem restart: o servidor lê o valor a cada
  tentativa de quiz e a cada convite de batalha, com cache de 10 s. Encurtar o
  cooldown libera na mesma hora quem já estava esperando, porque a conta é
  sempre "agora − última tentativa", nunca um prazo congelado.

  A tabela `app_settings` nasce **vazia**: chave ausente significa "usa o
  padrão", então uma instalação que nunca abriu a tela se comporta como antes.
  O mínimo é 1 nos dois — zerar o cooldown de dupla liberaria exatamente o
  win-trading que ele existe para impedir. Faixa, unidade e texto de apoio vêm
  do servidor, para o formulário não poder discordar da validação.

### Alterado

- **A bancada não anuncia mais qual professor o aluno vai capturar.** A tela de
  acerto passa a dizer só "escaneie o QR Code para capturar seu professor", e a
  lista `professores` saiu das duas rotas (`GET /admin/quiz/themes` e
  `POST /admin/quiz/answer`).

  Era promessa que a captura não tinha como cumprir: quem o aluno leva é
  sorteado no servidor, no instante do scan, a partir do que ele **já tem**
  (`capture-lottery.ts`) — ele podia ouvir "vá capturar o Eron" e receber outro.
  Resolve a divergência que estava registrada em `docs/QUIZ.md` desde a tarefa
  12.

  De quebra, some a superfície que obrigava a filtrar `rare: false` em duas
  telas viradas para o aluno: sem lista de professor, não há por onde o nome de
  um raro escapar — nem por um filtro que alguém esqueça de repetir numa
  consulta nova.

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
