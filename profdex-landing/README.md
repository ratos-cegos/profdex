# Landing page do ProfDex

Página de divulgação do ProfDex para a Semana Tecnológica da UniFil. Estática,
sem backend, com um único CTA: levar o aluno ao login institucional.

Em produção ela responde em **https://profdex.unifil.tech/landing/** — mesmo
domínio do app, roteada pelo nginx de borda (`../nginx/`).

O briefing de conteúdo e identidade está em [LANDING-PAGE.md](./LANDING-PAGE.md).

```bash
npm install
npm run dev       # http://localhost:5174/landing/
npm run build     # roda o orçamento de assets antes de compilar
npm run preview
```

Da raiz do monorepo, `npm run dev:landing` sobe só a landing e
`npm run dev:all` sobe app + backend + landing juntos. Com os dois no ar, o dev
server do app repassa `/landing` para cá — ou seja,
`http://localhost:5173/landing/` funciona igual à produção.

## De onde este código veio

Cópia de [KenzoLima/landing-page-profdex](https://github.com/KenzoLima/landing-page-profdex),
trazida para o monorepo em 22/08/2026 para que a landing seja publicada no mesmo
domínio do app, pelo mesmo pipeline (um `git push` na `deploy`, uma imagem no
GHCR, um `docker compose up`).

`node_modules/` e `dist/`, que estavam versionados no repo de origem, ficaram de
fora — são 228 dos 232 MB daquele clone e nenhum dos dois é fonte.

### O que mudou em relação ao original

Só o necessário para a página viver sob um prefixo de URL e ao lado do app:

| Arquivo | Mudança | Porquê |
|---|---|---|
| `vite.config.mjs` | `base: '/landing/'` (via `VITE_BASE`), porta de dev 5174 | O prefixo do nginx; a 5173 é do app |
| `src/config/asset.js` | **Novo** | O Vite aplica o `base` no HTML e no CSS, nunca em strings dentro do JS |
| `src/data/professors.js` | Caminhos de `public/` passam por `asset()` | Idem — sem isso, os `.glb` e sprites apontariam para a raiz do domínio, onde mora o app |
| `src/three/GlbModel.vue`, `SiteNav.vue`, `SiteFooter.vue`, `HeroSection.vue` | Idem | O compilador do Vue não reescreve `src="/..."` absoluto |
| `src/config/links.js` | `APP_URL` padrão vazio (mesma origem) | O CTA vira `/login`: mesmo domínio, cookie de sessão intacto |
| `index.html` | `og:image` absoluto | `meta[content]` é o único atributo que o Vite não reescreve com o `base` |
| `Dockerfile`, `nginx.conf` | **Novos** | Build estático + nginx interno, espelhando `profdex-front/` |

### Como trazer mudanças novas do repo de origem

```bash
git clone --depth 1 https://github.com/KenzoLima/landing-page-profdex /tmp/landing-upstream
diff -ru --exclude=node_modules --exclude=dist --exclude=.git \
  /tmp/landing-upstream profdex-landing
```

Aplique o que interessa à mão e confira a tabela acima antes de sobrescrever um
dos arquivos listados — são os que divergem de propósito.

## Como é publicada

```
Internet → Cloudflare → nginx de borda (../nginx/)
                          └── /landing/ → container `landing` (este diretório)
```

`Dockerfile` compila com Vite e serve o `dist/` por um nginx interno, a partir de
`/usr/share/nginx/html/landing/` — o prefixo existe no disco porque o nginx de
borda repassa a URL inteira (`proxy_pass` sem barra final). Detalhes do deploy em
[../deploy.md](../deploy.md).

---

## Como se relaciona com o app

O app é o `../profdex-front` (Vue 3 + Vite + Pinia). A landing continua sendo um
projeto à parte mesmo dentro do monorepo, e isso é deliberado: o app é uma casca
mobile de 480px com `overflow: hidden` no `body`, que não serve como vitrine nem
em desktop. São builds separados, dependências separadas, containers separados.

O que foi copiado de lá, e precisa continuar em sincronia:

| Aqui | Origem | Observação |
|---|---|---|
| `src/styles/tokens.css` | `profdex-front/src/style.css` | Só os tokens de marca; os aliases de compatibilidade (`--red`, `--yellow`…) ficaram de fora |
| `src/styles/gba.css` | `HomeView.vue` | O molde GBA e o botão de pixel, extraídos do `<style scoped>` |
| `src/data/types.js` | `profdex-front/src/data/types.js` | **Cópia literal** + dois helpers de cor no fim. A roda da landing é derivada de `TYPE_CYCLE`/`strongAgainst()`, nunca digitada |
| `src/data/professors.js` | `professorTypes.js`, `professorSprites.js`, `professorModels.js` | Ver a correção de contagem abaixo |
| `public/eagle-ball.png`, `public/professors/*-cartoon.*` | `profdex-front/public/` | Recomprimidos por `assets:optimize` |
| `public/professors/*-pixel*.png` | `assets-src/sprites/` (aqui) | Normalizados para 64×64, ver abaixo |
| `public/models/*-hero.glb` | `modelo-{mario,eron,gustavo}.glb` | 127 MB → 2,24 MB, ver abaixo |
| `src/config/model-sizes.js` | — | **Gerado**, medindo os `.glb` publicados |

Os cortes de Elo (`src/content/copy.js` → `pvp.tiers`) vieram de
`profdex-back/src/battle/elo.ts`, que é a fonte de verdade.

Os pesados não são versionados aqui em bruto: os `.glb` de 27–74 MB e os PNG
4096² ficam no app, e este repo guarda o resultado mais os scripts que sabem
refazê-lo. Os scripts acham o app sozinhos nos lugares de sempre; se o seu clone
estiver noutro canto, `PROFDEX_FRONT=<caminho> npm run assets:optimize`.

**Os sprites são a exceção**: eles moram em `assets-src/sprites/` porque não
existem em nenhum outro lugar recuperável — são poucos kB cada, e só um dos seis
está no `profdex-front`.

### Os sprites

Os seis bonecos (três professores × frente e costas) estão versionados em
[`assets-src/sprites/`](./assets-src/sprites/) — **leia o README de lá antes de
mexer neles**, tem duas armadilhas registradas que já custaram retrabalho.

Resumo: o `profdex-front` só tem o `gustavo-pixel.png`. Do Gustavo existe a arte
de autoria em `.ase` (13 quadros de frente, 14 de costas), copiada para cá junto
com um leitor próprio (`scripts/ase-to-png.mjs`) — a cadeia arte → PNG →
`public/` é refazível sem abrir o Aseprite. Do Eron e do Mário existem só
capturas de tela em 3× passadas por um removedor de fundo.

A arte de autoria é **64×64**. Dá para medir que as capturas são 3×: o boneco do
Eron ocupa 106×192 px, exatamente 3× os 35×64 do Gustavo. Então `assets:optimize`
devolve cada um à grade nativa e **binariza o alfa** (o removedor de fundo deixa
~9% dos pixels numa borda macia, e pixel art não tem meio-termo). Os do Gustavo,
já nativos, passam intactos — reamostrar pixel art correta é sempre perda.

`assets:optimize` também recorta um `-pixel-face.png` de cada sprite de frente: é
o retrato da seção 3D. O recorte é 46% da ALTURA do boneco (a cabeça é a mesma
fatia vertical nos três — 38% cortava o cabelo do Mário e do Gustavo, 50% já
pegava ombro e deixava de ser zoom), mais três linhas transparentes de ar em
cima, porque o desenho começa em `y=0` e o cabelo encostaria na borda.

Onde cada um entra:

| | Card da Pokédex | Arena | Seção 3D |
|---|---|---|---|
| Mário | corpo, frente | frente (adversário, ao fundo) | rosto |
| Eron | corpo, frente | — | rosto |
| Gustavo | corpo, frente | **costas** (o seu, em primeiro plano) | rosto |

O enquadramento clássico é esse: o adversário encara você, e a câmera está atrás
do ombro do seu. Quem diz de que lado cada um está é o **disco no chão**
(vermelho/azul), não uma moldura — emoldurar um sprite recortado o devolve à
condição de retrato.

### O disco no chão, que custou duas tentativas

O sprite tem os pés encostados na borda de baixo da própria imagem (a caixa do
desenho vai de `y=0` a `y=63` num arquivo de 64 px), então **a linha do chão é
exatamente a base da `<img>`**. Duas coisas quebraram nesse alinhamento:

1. **O disco pintava por cima do boneco.** `::before` é `position: absolute`, e
   conteúdo posicionado pinta depois de conteúdo não posicionado — mesmo vindo
   antes no documento. A `<img>` precisou de `position: relative; z-index: 1`.
2. **`bottom: 9%` e `padding-bottom: 9%` não são a mesma medida.** Porcentagem de
   `bottom` resolve contra a ALTURA do contêiner; de `padding`, contra a LARGURA
   — e, num flex item, contra a largura do *flex container* (a linha de ~680 px),
   não a da própria figure. Dava 61 px de espaço morto e a elipse subia para a
   canela.

A versão que funciona não usa posicionamento absoluto: disco e boneco são o
**mesmo item de grade** (`grid-area: 1 / 1`), os dois `align-self: end`, e um
`translate: 0 50%` leva o centro da elipse até a base — que é a linha dos pés por
construção, não por um número mantido à mão. O respiro de baixo sai de
`calc(var(--largura) * 0.091)`, onde 0,091 é meia elipse derivada da mesma
largura, então os dois continuam casados em qualquer tela.

## Conteúdo: onde mexer

Todo o texto está em [`src/content/copy.js`](./src/content/copy.js), com o bloco
de **guardas factuais** no topo — a lista do que a página não pode afirmar
(não existe app nativo, não existe cadastro por formulário, a batalha contra a IA
não ranqueia…). Leia antes de escrever qualquer frase nova.

### Regra de tipografia que não é óbvia

**Texto em fonte pixel nunca leva `text-transform: uppercase`.**

A `Press Start 2P` não tem maiúscula acentuada utilizável: desenha `Ó` como um
`o` de altura minúscula e **descarta** o til de `Ã` e o grave de `À` — acento
acima da caixa alta não cabe na grade de pixel. (`Ç` funciona, porque o cedilha
fica abaixo da linha de base.)

Em português isso quebra palavras centrais: `COLEÇÃO` vira `COLECAO`. O app nunca
esbarrou nisso porque os textos dele em pixel não têm acento. Aqui a caixa é
decidida pelo conteúdo, no `copy.js`. A regra está registrada em
`src/styles/base.css`.

## A camada 3D

O briefing proíbe, com todas as letras, colocar os `.glb` do projeto nesta
página, e abre uma exceção: *um só, sob interação explícita do usuário, e
otimizado antes*. É exatamente o que está implementado.

### Por que a proibição existe

`docs/BUG-BATALHA-TRAVANDO.md` no repositório principal: a arena PvP montava dois
`<model-viewer>` simultâneos, o Safari do iOS estourava o orçamento de memória da
aba e **descartava a página no meio da batalha**. Chegou ao time como "a batalha
dá refresh sozinha".

O `gltf-transform inspect` mostrou que a explicação do documento — "~148 MB de
geometria" — não é o que acontecia:

| | Disco | Memória de GPU |
|---|---|---|
| Geometria (32.180 vértices) | 1,33 MB | — |
| baseColor 4096×4096 | 12,53 MB | **89,48 MB** |
| normal 4096×4096 | 5,96 MB | **89,48 MB** |
| metallicRoughness 4096×4096 | 8,25 MB | **89,48 MB** |

São **268 MB de textura na GPU para um professor**. Dois combatentes passavam de
meio gigabyte. A geometria era irrelevante.

### O que `npm run model:optimize` faz

Reduz as texturas a 1024/1024/512 e as converte para JPEG, depois solda os
vértices, simplifica a malha (só acima de 100 mil vértices) e comprime a
geometria com Draco. A memória de GPU cai de ~268 MB para ~13 MB por modelo:

| | Disco antes | Disco depois | Vértices |
|---|---|---|---|
| Mário | 26,77 MB | **0,36 MB** | 32.180 |
| Eron | 27,01 MB | **0,35 MB** | 31.099 |
| Gustavo | 73,61 MB | **1,53 MB** | 853.985 → 268.360 |

O `textureCompress` do gltf-transform quebra nestas texturas específicas
(`colourspace: parameter space not set`), então elas passam pelo sharp e só a
geometria vai pelos passos da lib.

O Gustavo é 4× os outros porque tem 26× mais vértices — um scan sem
retopologia. Ele **para em 31%** dos triângulos, não nos 25% pedidos, e afrouxar
o `error` de 0,001 para 0,01 não move o número em um vértice: o limite é
topológico (o meshopt trava borda e descontinuidade de UV, e um scan é feito de
costura), não de erro geométrico. Deixar mais leve exige retopologia na origem.

O tamanho de cada arquivo é gravado em `src/config/model-sizes.js` **medindo o
resultado**. É esse número que a seção mostra antes de baixar — nunca um valor
digitado à mão, que envelhece na primeira reotimização.

### Três modelos, um palco

A seção 3D deixa escolher o professor. A regra que importa não é "quantos
arquivos existem" — é **um palco WebGL por página**, e ela mora em
`useLazyModel.js`: trava no escopo do módulo, `release()` ao trocar de professor
(o `v-if` desmonta o palco entre um e outro, e é o desmonte que devolve as
texturas) e `release()` ao sair da tela. Trocar a URL de um palco vivo vazaria o
modelo anterior — por isso a troca passa por fechar e reabrir.

### A cadeia de guardas

`src/three/useLazyModel.js`. Nesta ordem, e todas precisam passar:

1. Seção visível (`IntersectionObserver`)
2. **Clique explícito** — sem gesto, nenhum byte é pedido
3. `navigator.connection.saveData` desligado
4. `effectiveType` fora de `slow-2g`/`2g`
5. `deviceMemory` ≥ 4 GB
6. WebGL disponível (contexto de sondagem é destruído com `WEBGL_lose_context`)

Cada recusa mostra o motivo ao usuário; o estado inicial e o de recusa são a
mesma imagem 2D. Uma trava no escopo do módulo garante **um** palco por página.
Rolar para fora desmonta.

O `import()` do palco é dinâmico, então `three` + `@tresjs` ficam num chunk
separado que só existe depois do clique.

### Por que há um `disposeObject3D.js` próprio

O `@tresjs/core` exporta um `dispose`, mas o `disposeMaterial` dele descarta
**apenas** `material.map`. Nosso modelo tem `map`, `normalMap` e
`metalnessMap`/`roughnessMap` — usar o da biblioteca vazaria duas de três
texturas, que é precisamente o modo de falha do incidente. O nosso varre o
material por contrato (`isTexture`).

## Orçamento de assets

`scripts/check-asset-budget.mjs` roda no `prebuild` e **quebra o build** se:

- algum `.glb` passar de **2 MB**;
- os `.glb` **somados** passarem de **5 MB**;
- alguma imagem passar de 350 kB;
- o `model-sizes.js` divergir do arquivo real (a página anuncia o tamanho antes de
  baixar; um aviso que mente é pior que nenhum aviso);
- algum `sprite`/`image`/`model` do `professors.js` apontar para um arquivo que
  não existe (card quebrado é pior que card ausente, e um 404 de `.glb` some
  dentro do loader — o palco fica carregando para sempre, sem erro);
- o `public/draco/` divergir do decodificador do `three` instalado (versão
  descasada não quebra o build: quebra o navegador do aluno).

O combinado verbal de "não põe `.glb` pesado" já existia no projeto e não
segurou. Por isso o limite é código.

**Uma regra mudou.** A versão anterior proibia mais de um `.glb` em `public/` —
leitura correta do incidente com arquivos de 27–74 MB, quando "quantos arquivos
existem" era uma proxy honesta para "quanta memória isto pode pedir". Depois do
`optimize-model.mjs` os três somam 2,24 MB, a contagem deixou de medir o risco, e
mantê-la custaria justamente o que o briefing pede na seção 3D: o aluno ver **o**
professor dele. O que impedia o incidente sempre foi um palco por página, e isso
continua onde estava. O teto passou a ser por arquivo **e somado** — três
modelos de 1,6 MB passariam num teto só por arquivo e ainda assim seriam demais.

## Números medidos

Build de produção, Chrome DevTools, **Slow 4G + CPU 4×**, viewport 390×844:

| | |
|---|---|
| LCP | **2,08 s** (elemento: o parágrafo do hero) |
| CLS | **0,00** |
| Lighthouse | Acessibilidade **100** · Boas práticas **100** · SEO **100** |
| Carregamento inicial | **~44 kB** comprimido (HTML com CSS embutido + JS) |

| Chunk | Bruto | Gzip | Quando carrega |
|---|---|---|---|
| `index.html` | 2,5 kB | 1,2 kB | sempre |
| `index.css` | 24,6 kB | 4,9 kB | sempre |
| `index.js` | 101,4 kB | 38,9 kB | sempre |
| `gsap` + `ScrollTrigger` | 112,7 kB | 45,0 kB | só ≥860px e sem movimento reduzido |
| `ModelStage` (three + tresjs) | 959,6 kB | 259,4 kB | só depois do clique em "VER EM 3D" |
| Draco (wasm + wrapper) | 478 kB | 154 kB | só junto com o `ModelStage` |

Mais: `eagle-ball.png` 6,4 kB, sprites 1,3–2,3 kB cada, retratos ~24 kB cada.

> ⚠️ **O in-line do CSS não está ligado.** Esta seção descrevia um plugin em
> `vite.config.js` que embutia o CSS da entrada no HTML — o arquivo não existe
> (a config é `vite.config.mjs`) e o build de hoje emite `index.css` à parte,
> como a tabela acima mostra. As linhas de LCP/CLS/Lighthouse são de uma medição
> anterior e não foram refeitas; os tamanhos de chunk são do build atual. Vale
> uma medição nova antes de citar esses números em qualquer lugar.

**Próxima alavanca, se quiserem mais:** o LCP restante é quase todo execução de
JavaScript, porque a página é renderizada no cliente. Pré-renderizar o HTML no
build (SSG) atacaria isso de frente. Não foi feito — é uma mudança de arquitetura,
e a meta de 2,5 s já é cumprida com folga.

## Movimento

Três camadas, por custo crescente:

1. **CSS** cobre quase tudo — reveal por `IntersectionObserver` (`useReveal.js`,
   ~30 linhas), barras de HP, barras da tabela de pontos. `steps()` em vez de
   `ease` é o que dá o gesto 8-bit.
2. **GSAP + ScrollTrigger**, `import()` dinâmico, só na roda de tipos, e só com
   viewport ≥860px, sem `prefers-reduced-motion` e após interação. No celular
   nunca é baixado.
3. **WebGL**, só sob clique.

O estado inicial invisível do reveal é aplicado pelo próprio JS
(`data-reveal="pending"`). Se o script falhar, o atributo não aparece, o seletor
não casa e o conteúdo fica visível — o modo de falha certo para uma landing.

Com `prefers-reduced-motion: reduce`, o GSAP não é baixado e o 3D continua
disponível, sem rotação automática: preferência de movimento não deve negar
conteúdo.

### A roda que gira na mão

`TypeWheelSection.vue` tem um quarto tipo de movimento, que não é nenhuma das
três camadas: **física própria num `requestAnimationFrame`**, ~40 linhas, zero
bytes de biblioteca. Segurar a roda carrega impulso, soltar deixa a inércia
correr com atrito exponencial, e ao parar ela trava no múltiplo de 40° mais
próximo. O tipo que ficou sob o ponteiro do topo é a seleção.

Quatro decisões que não são óbvias:

1. **O estado é um ângulo.** `rotation` é a fonte de verdade; `selectedId` é
   `indexAtTop(rotation)` gravado no momento do assentamento. Ele é publicado no
   INÍCIO da parada, não no fim — assim o painel acompanha a roda chegando, sem
   repintar a cada 40° durante o giro livre.
2. **Os ícones contra-giram.** O grupo dos setores gira por CSS; cada ícone
   recebe `rotate(-θ 14 14)` no atributo SVG. Sem isso os nove símbolos ficam de
   cabeça para baixo na primeira meia volta. É também por isso que o
   assentamento é interpolado em JS e não por `transition` de CSS: os dois
   precisam sair do MESMO número, ou o símbolo fica para trás do setor.
3. **O scroll-spin não disputa o transform.** O GSAP gira o `<svg>` inteiro
   (ponteiro junto); a mão gira só o grupo interno. No primeiro `pointerdown` o
   ângulo do scroll é dobrado no da mão e o ScrollTrigger morre — daí em diante
   a roda é do usuário.
4. **`touch-action: pan-y`.** A roda ocupa meia tela no celular; capturar o
   gesto vertical prenderia o aluno na seção. O que sobra para o gesto é o toque
   parado, que é exatamente o clique longo. Se o navegador decidir rolar no meio
   do giro, chega um `pointercancel` e a roda é solta com a inércia que tinha.

O clique curto continua selecionando o setor tocado (agora ele também viaja até
o topo). Com movimento reduzido não há giro nem inércia: o clique curto é um
corte seco e o clique longo avança um tipo. Pelo teclado, os nove chips
continuam alcançando tudo, e ←/→ andam de um tipo por vez — a `<svg>` segue
`aria-hidden`, e nunca foi a única porta.

### As variações do reveal

O reveal global (`useReveal.js` + `data-reveal`) ganhou duas variações em
`base.css`, aplicadas por classe no mesmo elemento observado, sem observador
novo: `.reveal-steps` troca o easing por `steps()` (para caixas de UI de jogo) e
`.reveal-stagger` mantém o contêiner visível e faz os FILHOS entrarem em
cascata, com o índice vindo do template (`--reveal-i`, 70ms por posição). Usam
isso a lista de passos, o fluxo do PvP, a grade da Pokédex, as barras da tabela
de pontos e as da escada de Elo.

## Acessibilidade

Contraste conferido e anotado em `tokens.css`. A armadilha: `--unifil-gold` sobre
`--unifil-orange` dá 3,1:1 — reprovado para texto pequeno, e por isso o dourado só
aparece no `DEX` do hero (display de 56px).

As cores canônicas dos tipos foram desenhadas para preencher área, não para virar
texto: `legibleColor()` em `src/data/types.js` clareia a cor até passar em 4,5:1
sobre o fundo escuro, mantendo o matiz (o NPI, `#495057`, dava 1,7:1).

A roda SVG é `aria-hidden`: toda a informação dela existe em HTML — os nove
botões, o painel do tipo e uma tabela completa de vantagens para leitor de tela.

## Deploy

Projeto Vercel próprio, build `vite build` → `dist`. O `vercel.json` só define
cache longo para `/models/` e `/draco/`; não há reescrita de `/api`, porque a
landing não fala com o backend — o CTA é um link absoluto, centralizado em
`src/config/links.js`. A pendência do Cloudflare descrita em `DEPLOY-FRONT.md`
não afeta esta página.

`public/fonts/` traz a `Press Start 2P` auto-hospedada (OFL, 12,5 kB): serve para
tirar dois handshakes com o Google do caminho crítico. Ver o README de lá.

`public/draco/` é o decodificador Draco copiado do pacote `three` instalado — a
versão precisa casar com a do `GLTFLoader` em uso. Se atualizar o `three`,
recopie de `node_modules/three/examples/jsm/libs/draco/gltf/`.
