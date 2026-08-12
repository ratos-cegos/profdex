<script setup>
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { resolveApiBaseUrl } from '../services/api-base-url'

const router = useRouter()
const auth = useAuthStore()

// Constante de build: o `v-if` some do bundle de produção junto com o link.
const isDev = import.meta.env.DEV

// Precisa ser a URL absoluta do backend: o navegador sai da aplicação, vai ao
// Google e volta. Por isso não passa pelo cliente axios.
const googleLoginUrl = computed(() => {
  const base = resolveApiBaseUrl({
    isDevelopment: import.meta.env.DEV,
    configuredUrl: import.meta.env.VITE_API_URL,
  })
  return `${base}/auth/google`
})

const matricula = ref('')
const password = ref('')
const loading = ref(false)
const errorMsg = ref('')

async function submit() {
  if (!matricula.value || !password.value) return
  loading.value = true
  errorMsg.value = ''
  try {
    await auth.login(matricula.value.trim(), password.value)
    router.push({ name: 'profdex' })
  } catch (err) {
    // Sem resposta (rede) ou 5xx (proxy/back caído) = servidor fora do ar
    const serverDown = !err.response || err.response.status >= 500
    errorMsg.value = serverDown
      ? 'Servidor indisponível. Verifique se o backend está rodando.'
      : (err.response.data?.message ?? 'Credenciais inválidas')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="auth-page pk-pixel">
    <div class="auth-header">
      <RouterLink to="/" class="back-btn">← VOLTAR</RouterLink>
      <div class="auth-ball">
        <img class="eagle-ball-icon" src="/eagle-ball.png" alt="" aria-hidden="true" />
      </div>
      <h1 class="auth-title">LOGIN</h1>
    </div>

    <div class="auth-body pokemon-frame">
      <form class="form-group" @submit.prevent="submit">
        
        <div class="input-block">
          <label class="pk-label">Matrícula</label>
          <input
            v-model="matricula"
            type="text"
            placeholder="SUA MATRÍCULA"
            autocomplete="username"
            inputmode="text"
            class="pk-input"
          />
        </div>

        <div class="input-block">
          <label class="pk-label">Senha</label>
          <input
            v-model="password"
            type="password"
            placeholder="••••••••"
            autocomplete="current-password"
            class="pk-input"
          />
        </div>

        <div v-if="errorMsg" class="error-msg">{{ errorMsg }}</div>

        <button type="submit" class="btn-pokemon-action" :disabled="loading">
          <span v-if="loading" class="spinner-pixel" />
          <span>{{ loading ? 'ENTRANDO...' : 'ENTRAR' }}</span>
        </button>
      </form>

      <div class="auth-alt">
        <RouterLink to="/esqueci-senha" class="pk-link pk-link--small">
          Esqueci minha senha
        </RouterLink>
      </div>

      <!-- Login institucional e ÚNICA porta de cadastro. É um link, não fetch:
           o fluxo OAuth precisa de navegação de verdade até o Google e de
           volta. -->
      <div class="auth-divider"><span>ou</span></div>
      <a :href="googleLoginUrl" class="btn-google">
        <span class="btn-google__g">G</span>
        <span>Entrar com e-mail institucional</span>
      </a>
      <p class="auth-hint">Use seu @edu.unifil.br ou @unifil.br</p>

      <div class="auth-footer">
        Primeira vez? Entre com o e-mail institucional acima — a conta é criada
        na hora e você escolhe matrícula e senha para as próximas.
      </div>

      <!-- Atalho de desenvolvimento: o OAuth do Google não roda fora de
           localhost, então testar em outro aparelho da rede precisa de uma
           porta de cadastro direta. Sai do bundle de produção. -->
      <div v-if="isDev" class="auth-footer auth-footer--dev">
        <span>[dev] sem Google?</span>
        <RouterLink to="/register" class="pk-link">Cadastrar direto</RouterLink>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Importando a fonte no escopo do componente */
@import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap');

.pk-pixel {
  font-family: 'Press Start 2P', monospace !important;
}

.auth-page {
  height: 100%;
  display: flex;
  flex-direction: column;
  background-color: var(--bg-deep);
  color: var(--text-primary);
}

/* Login institucional e recuperação de senha */
.auth-alt {
  display: flex;
  justify-content: center;
  margin-top: 12px;
}

.pk-link--small {
  font-size: 9px;
}

.auth-divider {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 18px 0 12px;
  color: var(--text-muted, #888);
  font-size: 9px;
}

.auth-divider::before,
.auth-divider::after {
  content: '';
  flex: 1;
  height: 2px;
  background: currentColor;
  opacity: 0.35;
}

.btn-google {
  width: 100%;
  min-height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 0 14px;
  background: #fff;
  color: #202124;
  border: 3px solid #202124;
  border-radius: 4px;
  font-family: inherit;
  font-size: 9px;
  line-height: 1.5;
  text-align: center;
  text-decoration: none;
  cursor: pointer;
}

.btn-google:active {
  transform: translateY(2px);
}

.btn-google__g {
  font-size: 16px;
  font-weight: 900;
  color: #4285f4;
}

.auth-hint {
  margin: 8px 0 0;
  text-align: center;
  font-size: 8px;
  line-height: 1.6;
  color: var(--text-muted, #888);
}

/* Header Vermelho Sólido */
.auth-header {
  background: var(--unifil-orange);
  padding: 32px 20px 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  position: relative;
  border-bottom: 6px solid var(--surface);
}

.back-btn {
  position: absolute;
  top: 16px;
  left: 16px;
  color: var(--text-primary);
  font-size: 9px;
  text-decoration: none;
  text-shadow: 1px 1px 0 var(--surface);
}

/* Eagle Ball pixel art */
.auth-ball {
  width: 62px;
  height: 62px;
}

.auth-title {
  font-size: 18px;
  color: white;
  margin: 0;
  text-shadow: 3px 3px 0 var(--surface);
  letter-spacing: 1px;
}

/* Caixa de Diálogo Pokémon (Menu Interno) */
.auth-body {
  margin: 24px 16px;
  padding: 24px 16px;
  background: var(--surface);
  
  /* Borda dupla clássica (Frame Type 1) */
  border: 4px solid var(--unifil-orange);
  box-shadow: 
    inset 0 0 0 2px var(--unifil-gold),
    inset 0 0 0 4px var(--surface);
  border-radius: 4px;
  
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.input-block {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* Labels e Inputs Retro */
.pk-label {
  font-size: 10px;
  color: var(--unifil-gold);
  text-transform: uppercase;
}

.pk-input {
  font-family: 'Press Start 2P', monospace;
  font-size: 10px;
  background-color: var(--bg-deep);
  color: var(--text-primary);
  border: 2px solid var(--surface-border);
  padding: 12px;
  border-radius: 2px;
  outline: none;
  box-shadow: inset 2px 2px 0px rgba(0,0,0,0.5);
}

.pk-input:focus {
  border-color: var(--unifil-gold);
}

.pk-input::placeholder {
  color: var(--text-muted);
}

/* Mensagem de Erro */
.error-msg {
  font-size: 9px;
  color: var(--error);
  line-height: 1.4;
  border: 1px solid var(--error);
  background: var(--surface);
  padding: 8px;
}

/* Botão de Confirmação */
.btn-pokemon-action {
  width: 100%;
  background: var(--unifil-orange);
  border: 3px solid var(--surface-border);
  box-shadow: 
    inset -3px -3px 0 var(--surface-border),
    inset 3px 3px 0 var(--unifil-gold);
  padding: 14px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.btn-pokemon-action span {
  font-family: 'Press Start 2P', monospace;
  font-size: 11px;
  color: var(--text-primary);
  text-shadow: 2px 2px 0 var(--surface);
}

.btn-pokemon-action:active:not(:disabled) {
  background: var(--surface-border);
  box-shadow: inset 3px 3px 0px rgba(0,0,0,0.5);
}

.btn-pokemon-action:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* Loading Spinner em Pixel-art (Simula um quadradinho piscando/girando) */
.spinner-pixel {
  width: 8px;
  height: 8px;
  background-color: white;
  animation: blink 0.4s steps(2, start) infinite;
}

@keyframes blink {
  to { visibility: hidden; }
}

/* Rodapé e Links */
.auth-footer {
  text-align: center;
  font-size: 8px;
  color: var(--text-muted);
  line-height: 1.7;
}

/* Deliberadamente discreto e marcado com [dev]: ninguém deve confundir este
   atalho com a porta de entrada real do app. */
.auth-footer--dev {
  display: flex;
  gap: 8px;
  justify-content: center;
  align-items: center;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px dashed var(--text-muted);
  opacity: 0.75;
}

.pk-link {
  color: var(--unifil-gold);
  text-decoration: underline;
}

.pk-link:hover {
  color: var(--text-primary);
}
</style>
