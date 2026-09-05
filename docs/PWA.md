# PWA — o ProfDex instalável

O app é instalável na tela de início. Não é enfeite: três coisas do evento
dependem disso.

- **O aluno anda pelo campus com o app aberto.** Um atalho na home evita
  reabrir o navegador, procurar a aba e — quando a sessão está viva — passar
  pelo login de novo.
- **A câmera ocupa a tela inteira.** O scanner de QR e a arena de AR usam toda a
  altura disponível; em `standalone` o app ganha os ~60px da barra do navegador.
- **A rede do evento é ruim.** Com o shell em cache, o app abre e mostra o
  próprio estado de erro ("SEM CONEXÃO") em vez da página em branco do
  navegador.

Tudo é configurado por `vite-plugin-pwa` em `profdex-front/vite.config.js`.

## Manifest

| Campo | Valor | Por quê |
|---|---|---|
| `start_url` | `/profdex` | `/` redireciona quem já tem sessão — seria uma navegação a mais em toda abertura |
| `scope` | `/` | o app usa `/scan`, `/batalha`, `/admin`… |
| `display` | `standalone` | é o que devolve a altura da barra do navegador |
| `orientation` | `portrait` | o app inteiro é desenhado para retrato |
| `theme_color` | `#995200` | `--unifil-orange` de `src/style.css` |
| `background_color` | `#121418` | `--bg-deep`, o fundo real do app |

⚠️ **`theme_color` tem um valor só.** Ele aparece em três lugares — o manifest,
a `<meta name="theme-color">` do `index.html` e o token do CSS. Era `#CC0000`
(do vermelho antigo) no HTML enquanto o app já usava laranja, e a barra do
navegador destoava do cabeçalho.

## Ícones

Gerados a partir de `public/eagle-ball.png` por
`profdex-front/scripts/build-pwa-icons.cjs`, que reaproveita o decode/encode de
PNG de `build-icons.cjs` (nearest-neighbor — a arte é pixel art e qualquer
interpolação suave borra a borda dura).

```sh
node scripts/build-pwa-icons.cjs
```

| Arquivo | Uso |
|---|---|
| `icons/pwa-192.png`, `icons/pwa-512.png` | ícone normal, fundo transparente |
| `icons/pwa-maskable-512.png` | **20% de margem** de cada lado: o Android recorta o ícone na forma do launcher (círculo, squircle, gota) e sem a safe zone a asa da águia é cortada |
| `icons/apple-touch-icon.png` (180) | **o iOS ignora os ícones do manifest** — sem o `<link rel="apple-touch-icon">` no `index.html`, o atalho sai como um retrato da página |

## Service worker

Precache **só do shell**: HTML, JS, CSS e os ícones da interface (~2,4 MB, 108
entradas).

Ficam **fora** do precache:

- `public/models/*.glb` — 28 MB, 28 MB e 74 MB. Precachear estoura o
  armazenamento do celular e trava a instalação.
- `public/professors/*-marker.png` — um deles tem 4 MB e só é usado na tela de
  AR.
- `public/markers.mind` — 1,6 MB, mesmo caso.

`maximumFileSizeToCacheInBytes` fica em 3 MB como rede de segurança: um asset
novo acima disso derruba o build em vez de inchar a instalação em silêncio.

### Runtime caching

| Padrão | Estratégia | Por quê |
|---|---|---|
| `/api/**` e `**/socket.io/**` | `NetworkOnly` | a sessão é por **cookie**: uma resposta servida do cache mostraria dados de outra conta depois de uma troca de usuário, e o WebSocket nem funcionaria |
| `/professors/*.png`, `/marca/*.png` | `CacheFirst` (30 dias, 120 entradas) | são ~90 KB cada e não mudam durante o evento |

## Atualização

`registerType: 'prompt'`. Quando o SW baixa uma versão nova, o
`AvisoAtualizacao.vue` mostra uma faixa discreta e **espera o toque do aluno**.

Recarregar sozinho está fora de questão: o estado de uma batalha PvP vive na
memória do servidor (ver [BATALHA-PVP.md](./BATALHA-PVP.md)) e uma recarga no
meio do combate derruba a partida.

## Instalação

`BotaoInstalar.vue`, exibido no `/perfil`. Dois caminhos porque os sistemas são
diferentes:

- **Android/Chrome** dispara `beforeinstallprompt`. O evento é capturado e
  guardado (`src/composables/usePwa.js`); o `preventDefault()` é necessário,
  senão o Chrome mostra o banner dele e ficam dois convites competindo.
- **iOS** não dispara nada — a instalação é manual, pelo menu Compartilhar. O
  botão então abre a instrução escrita, que é melhor que um botão inerte.

O convite some quando o app já está em `display-mode: standalone`.

## Vercel

O rewrite `/(.*) → /index.html` do `vercel.json` **não** engole
`/manifest.webmanifest` nem `/sw.js`: arquivos estáticos existentes têm
precedência sobre rewrites na Vercel. O que o `vercel.json` acrescenta são
cabeçalhos: `Cache-Control: max-age=0, must-revalidate` no `sw.js` (um service
worker em cache prende o app numa versão velha) e o `Content-Type` correto do
manifest.

> **Teste em preview antes do evento.** Abra o preview da Vercel, confira em
> DevTools → Application que o manifest carrega, que o SW registra e que
> **nenhuma resposta de `/api` vem do cache**.

## Desenvolvimento

O SW fica **desligado** em dev (`devOptions.enabled: false`): um service worker
ativo no `npm run dev` serve bundle velho depois de cada edição e faz parecer
que o HMR quebrou. Para testar o comportamento real:

```sh
npm run build && npm run preview
```

Contexto seguro não é problema novo: câmera e AR já exigem HTTPS, então em
produção nada muda. Para testar no celular pela rede local, use `HTTPS=1` (ver o
comentário em `vite.config.js`).
