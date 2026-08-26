import { fileURLToPath, URL } from 'node:url'

import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

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
