import { fileURLToPath, URL } from 'node:url'

import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import { VitePWA } from 'vite-plugin-pwa'

// Cor da marca (`--unifil-orange` em src/style.css) e o fundo do app
// (`--bg-deep`). Ficam aqui como literais porque o manifest é gerado em tempo
// de build, fora do CSS — mas o valor tem de ser UM SÓ: o `theme-color` do
// index.html usa o mesmo.
const COR_MARCA = '#995200'
const COR_FUNDO = '#121418'

// https://vite.dev/config/
export default defineConfig(async ({ mode }) => {
  // `loadEnv` com prefixo vazio lê também variáveis sem `VITE_` (que não são
  // expostas ao navegador), como o alvo do proxy abaixo.
  const env = loadEnv(mode, process.cwd(), '')

  // Backend que o dev server usa ao repassar `/api`. Por padrão, o backend
  // local (`npm run start:dev` em profdex-back), que usa o MESMO modelo de
  // sessão por cookie deste front.
  //
  // IMPORTANTE: o navegador NUNCA deve falar direto com outro domínio em dev. O
  // cookie de sessão é `SameSite=Lax`, então só é enviado em requisições
  // same-site. Chamar o Railway a partir do localhost é cross-site: o cookie não
  // vai junto e toda rota autenticada volta 401 (a tela mostra "SEM CONEXÃO").
  // Por isso o front fala com o próprio dev server (`/api`) e o Vite repassa para
  // o backend aqui — a sessão continua first-party.
  //
  // Obs.: o Railway publicado ainda roda a versão ANTIGA (auth por Bearer token),
  // incompatível com este front. Só aponte para lá depois de publicar este
  // backend por cookie: DEV_API_PROXY_TARGET=https://profdex-production.up.railway.app
  const apiProxyTarget = env.DEV_API_PROXY_TARGET || 'http://localhost:3000'

  // `HTTPS=1` (em `.env.local`) faz o dev server servir por HTTPS com um
  // certificado autoassinado. Isso só é necessário para testar no CELULAR: a
  // câmera (`getUserMedia`, usada no scanner de QR e na arena AR) exige contexto
  // seguro, e abrir o app por `http://<ip-da-rede>:5173` não é contexto seguro.
  // No desktop, `localhost` já conta como seguro — pode deixar desligado.
  //
  // O certificado é autoassinado, então o navegador do celular mostra um aviso
  // na primeira visita. Basta avançar ("Avançado" → "Ir para o site").
  const useHttps = env.HTTPS === '1'
  const sslPlugins = useHttps
    ? [(await import('@vitejs/plugin-basic-ssl')).default()]
    : []

  return {
    plugins: [
      ...sslPlugins,
      vue({
        template: {
          compilerOptions: {
            // Diz ao Vue quais tags NÃO são componentes Vue, para não tentar
            // resolvê-las e não emitir warnings no console:
            //  - `model-viewer`: web-component nativo da lib de AR
            //  - `Tres*`: tags do TresJS resolvidas pelo renderer próprio dele
            //    (o `<TresCanvas>` em si continua sendo um componente Vue real)
            isCustomElement: (tag) =>
              tag === 'model-viewer' || (tag.startsWith('Tres') && tag !== 'TresCanvas'),
          },
        },
      }),
      vueDevTools(),
      // ── PWA ───────────────────────────────────────────────────────────────
      // Instalável importa por três razões concretas do evento: o aluno anda
      // pelo campus (atalho na home evita re-login e a barra do navegador), a
      // câmera ocupa a tela toda (standalone ganha área útil) e a rede é ruim
      // (o shell em cache abre offline em vez de página em branco).
      VitePWA({
        // `prompt`, não `autoUpdate`: recarregar sozinho no meio de uma batalha
        // PvP derruba a partida (o estado do Socket.IO é em memória).
        registerType: 'prompt',
        includeAssets: ['favicon.ico', 'icons/apple-touch-icon.png'],
        manifest: {
          name: 'ProfDex',
          short_name: 'ProfDex',
          description:
            'Capture professores da UNIFIL, monte sua coleção e batalhe no evento.',
          lang: 'pt-BR',
          categories: ['education', 'games'],
          // `/profdex`, e não `/`: quem já tem sessão é redirecionado de `/`, e
          // isso custaria uma navegação a mais em cada abertura do app.
          start_url: '/profdex',
          scope: '/',
          display: 'standalone',
          orientation: 'portrait',
          background_color: COR_FUNDO,
          theme_color: COR_MARCA,
          icons: [
            { src: '/icons/pwa-192.png', sizes: '192x192', type: 'image/png' },
            { src: '/icons/pwa-512.png', sizes: '512x512', type: 'image/png' },
            {
              // Com 20% de safe zone: o Android recorta o ícone na forma do
              // launcher, e sem a margem a asa da águia é cortada.
              src: '/icons/pwa-maskable-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          // Só o SHELL: HTML, JS, CSS e os ícones da interface. Os retratos dos
          // professores ficam de fora e vêm por runtime caching (abaixo) — são
          // ~90KB cada e crescem a cada professor novo, então precacheá-los
          // faria a instalação pesar mais a cada evento.
          globPatterns: ['**/*.{js,css,html,woff2}', 'favicon.ico', 'icons/*.png'],
          // Os modelos 3D pesam 28MB, 28MB e 74MB. Precachear isso estoura o
          // armazenamento do celular e trava a instalação — eles continuam
          // vindo da rede, sob demanda, como hoje. Os markers de AR (um deles
          // tem 4MB) saem pelo mesmo motivo e só são usados na tela de AR.
          globIgnores: [
            '**/models/**',
            '**/*.glb',
            '**/markers.mind',
            '**/professors/*-marker.png',
          ],
          // Rede de segurança: qualquer asset novo acima disto fica de fora do
          // precache em vez de inchar a instalação sem ninguém perceber.
          maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
          navigateFallbackDenylist: [/^\/api/, /^\/landing/],
          runtimeCaching: [
            {
              // Sessão por cookie + WebSocket não podem passar por cache: uma
              // resposta servida do SW mostraria dados de outro aluno depois de
              // uma troca de conta, e o Socket.IO nem funcionaria.
              urlPattern: ({ url }) =>
                url.pathname.startsWith('/api') ||
                url.pathname.includes('/socket.io'),
              handler: 'NetworkOnly',
            },
            {
              // Retratos dos professores e a marca: é o que mais pesa na
              // primeira abertura da dex, e na prática nunca mudam durante o
              // evento. Os markers de AR não entram — 4MB não cabem num cache
              // que o navegador pode despejar a qualquer momento.
              urlPattern: ({ url }) =>
                /^\/(professors|marca)\/.*\.(png|jpg|webp)$/.test(url.pathname) &&
                !url.pathname.endsWith('-marker.png'),
              handler: 'CacheFirst',
              options: {
                cacheName: 'profdex-imagens',
                expiration: { maxEntries: 120, maxAgeSeconds: 30 * 24 * 60 * 60 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
          ],
        },
        devOptions: {
          // Desligado em dev: um SW ativo no `npm run dev` serve bundle velho
          // depois de cada edição e faz parecer que o HMR quebrou.
          enabled: false,
        },
      }),
    ],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      host: true,
      allowedHosts: true,
      proxy: {
        // Paridade com produção: lá o nginx de borda serve a landing em
        // /landing/ (mesmo domínio do app). Sem este repasse, um link para
        // /landing só funcionaria depois do deploy — e a landing tem base
        // '/landing/' também em dev, então o caminho chega inteiro, sem
        // reescrita. Requer o dev server da landing no ar
        // (`npm run dev:landing` na raiz, ou `npm run dev:all`).
        '/landing': {
          target: 'http://localhost:5174',
          changeOrigin: false,
          // HMR da landing: o WebSocket do Vite dela também passa por aqui.
          ws: true,
        },
        '/api': {
          target: apiProxyTarget,
          changeOrigin: true,
          secure: true,
          // Repassa também o upgrade de WebSocket: o Socket.IO do lobby de
          // batalha faz handshake em /api/socket.io (sob /api por causa do
          // `path` do cookie de sessão).
          ws: true,
        },
      },
    },
  }
})
