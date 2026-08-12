import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { useMetricsStore } from '../stores/metrics'
import { useProfessorsStore } from '../stores/professors'

// Teto para a espera do preload. O `api` não define timeout (axios usa 0 =
// infinito), então um backend lento ou fora do ar travaria a navegação para
// sempre — foi o estado real do Railway durante o deploy (deploys em Queued).
const PRELOAD_TIMEOUT_MS = 3000

// As telas de /arena/:id e /character-ar/:id resolvem o professor pelo
// parâmetro da rota logo no setup. Carregar a lista antes de entrar evita que
// um acesso direto (deep link / F5) caia no modelo padrão.
//
// A espera é limitada de propósito: o professor tem fallback (state da
// navegação → modelo padrão), então é melhor entrar na arena com o fallback do
// que deixar o jogador preso na tela anterior. Sem backend (dev offline) a
// tela volta a se comportar como antes desta mudança.
async function preloadProfessors() {
  const store = useProfessorsStore()
  await Promise.race([
    store.ensureLoaded().catch(() => {}),
    new Promise((resolve) => setTimeout(resolve, PRELOAD_TIMEOUT_MS)),
  ])
  return true
}

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('../views/HomeView.vue'),
    },
    {
      path: '/login',
      name: 'login',
      component: () => import('../views/LoginView.vue'),
      meta: { guest: true },
    },
    {
      // Em produção o cadastro é só pelo Google: quem não tem conta entra por
      // /auth/google e cai em /completar-cadastro. A rota continua existindo
      // como redirect porque links e atalhos antigos para /register circulam.
      //
      // Em desenvolvimento ela volta a ser a tela de cadastro, para testar o
      // app fora de `localhost` (onde o OAuth do Google não roda) sem depender
      // de túnel. `import.meta.env.DEV` é resolvido em tempo de build: no bundle
      // de produção a RegisterView nem entra no chunk.
      path: '/register',
      ...(import.meta.env.DEV
        ? {
            name: 'register',
            component: () => import('../views/RegisterView.vue'),
            meta: { guest: true },
          }
        : { redirect: { name: 'login' } }),
    },
    {
      path: '/profdex',
      name: 'profdex',
      component: () => import('../views/ProfdexView.vue'),
      meta: { auth: true },
    },
    {
      path: '/scan',
      name: 'scan',
      component: () => import('../views/ScanView.vue'),
      meta: { auth: true },
    },
    {
      path: '/capture',
      name: 'capture',
      redirect: { name: 'scan' },
      meta: { auth: true },
    },
    {
      path: '/batalha',
      name: 'batalha',
      component: () => import('../views/BatalhaView.vue'),
      meta: { auth: true },
    },
    {
      path: '/batalha/guia',
      name: 'battle-guide',
      component: () => import('../views/BattleGuideView.vue'),
      meta: { auth: true },
    },
    {
      // PvP: seleção às cegas do professor (após aceitar um convite)
      path: '/batalha/pvp/escolha',
      name: 'pvp-pick',
      component: () => import('../views/PvpPickView.vue'),
      meta: { auth: true },
    },
    {
      // PvP: arena por turnos (o estado vem do socket; F5 → resync do servidor)
      path: '/batalha/pvp/arena',
      name: 'pvp-arena',
      component: () => import('../views/PvpArenaView.vue'),
      meta: { auth: true },
    },
    {
      path: '/ranking',
      name: 'ranking',
      component: () => import('../views/RankingView.vue'),
      meta: { auth: true },
    },
    {
      // Retorno do login com Google para quem ainda não tem conta: o backend
      // redireciona para cá com o ticket na query. `guest` porque quem chega
      // aqui ainda não tem sessão.
      path: '/completar-cadastro',
      name: 'completar-cadastro',
      component: () => import('../views/CompletarCadastroView.vue'),
      meta: { guest: true },
    },
    {
      path: '/esqueci-senha',
      name: 'esqueci-senha',
      component: () => import('../views/EsqueciSenhaView.vue'),
      meta: { guest: true },
    },
    {
      // Destino do link enviado por e-mail (token na query).
      path: '/redefinir-senha',
      name: 'redefinir-senha',
      component: () => import('../views/RedefinirSenhaView.vue'),
      meta: { guest: true },
    },
    {
      // Bancada do quiz — quiosque para o tablet do estande. Fica FORA do
      // layout do painel de propósito: a tela é virada para o aluno e não
      // pode ter navegação administrativa por perto.
      // Declarada antes de /admin para o caminho mais específico vencer.
      path: '/admin/quiz/bancada',
      name: 'admin-quiz-bancada',
      component: () => import('../views/AdminQuizBoothView.vue'),
      meta: { auth: true, admin: true },
    },
    {
      // Área administrativa — só para contas @unifil.br. O `meta.admin` apenas
      // esconde as telas; quem manda de verdade é o AdminGuard do servidor,
      // que confere o papel no banco a cada request.
      path: '/admin',
      component: () => import('../views/AdminLayout.vue'),
      meta: { auth: true, admin: true },
      children: [
        { path: '', redirect: { name: 'admin-metricas' } },
        {
          path: 'metricas',
          name: 'admin-metricas',
          component: () => import('../views/AdminMetricsView.vue'),
        },
        {
          path: 'quiz',
          name: 'admin-quiz',
          component: () => import('../views/AdminQuizAttemptsView.vue'),
        },
      ],
    },
    {
      // Exemplo/laboratório do TresJS — sem guarda de auth para facilitar testar
      path: '/tres-demo',
      name: 'tres-demo',
      component: () => import('../views/TresDemoView.vue'),
    },
    {
      // Cenário do túnel binário (inspirado na imagem de referência)
      path: '/tunel-binario',
      name: 'binary-tunnel',
      component: () => import('../views/BinaryTunnelView.vue'),
    },
    {
      path: '/arena/:id',
      name: 'arena',
      component: () => import('../views/ArenaView.vue'),
      meta: { auth: true },
      props: true,
      beforeEnter: preloadProfessors,
    },
    {
      path: '/character-ar/:id',
      name: 'character-ar',
      component: () => import('../views/CharacterARView.vue'),
      meta: { auth: true },
      props: true,
      beforeEnter: preloadProfessors,
    },
    {
      // Ficha do professor (aberta ao clicar no ícone de um professor liberado)
      path: '/professor/:id',
      name: 'professor',
      component: () => import('../views/ProfessorView.vue'),
      meta: { auth: true },
      props: true,
      beforeEnter: preloadProfessors,
    },
  ],
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()
  await auth.restoreSession()

  if (to.meta.auth && !auth.isAuthenticated) {
    return { name: 'login' }
  }

  if (to.meta.guest && auth.isAuthenticated) {
    return { name: 'profdex' }
  }

  // Conveniência de navegação, não segurança: o backend recusa a rota de
  // qualquer jeito para quem não é admin.
  if (to.meta.admin && auth.user?.role !== 'admin') {
    return { name: 'profdex' }
  }
})

// ── Métricas de navegação ───────────────────────────────────────────────────
// Um `screen_view` por tela, com o tempo que o aluno ficou nela. Medir aqui, no
// router, cobre o app inteiro sem espalhar instrumentação por cada view.
let telaAtual = null
let telaDesde = 0

router.afterEach((to) => {
  const metrics = useMetricsStore()
  const auth = useAuthStore()

  // A sessão de uso nasce no primeiro acesso autenticado.
  if (auth.isAuthenticated) void metrics.start()

  const agora = Date.now()
  if (telaAtual && telaAtual !== to.name) {
    metrics.track('screen_view', {
      durationMs: agora - telaDesde,
      metadata: { screen: telaAtual },
    })
  }
  if (telaAtual !== to.name) {
    telaAtual = to.name
    telaDesde = agora
  }
})

export default router
