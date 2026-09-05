<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import {
  SENHA_CURTA_MSG,
  SENHA_PLACEHOLDER,
  senhaTemTamanhoMinimo,
} from '../services/password-rules'

const router = useRouter()
const auth = useAuthStore()

const name = ref('')
const matricula = ref('')
const password = ref('')
const loading = ref(false)
const errorMsg = ref('')

async function submit() {
  if (!name.value || !matricula.value || !password.value) return
  if (!senhaTemTamanhoMinimo(password.value)) {
    errorMsg.value = SENHA_CURTA_MSG
    return
  }
  loading.value = true
  errorMsg.value = ''
  try {
    await auth.register(matricula.value.trim(), name.value.trim(), password.value)
    router.push({ name: 'profdex' })
  } catch (err) {
    // Sem resposta (rede) ou 5xx (proxy/back caído) = servidor fora do ar
    const serverDown = !err.response || err.response.status >= 500
    errorMsg.value = serverDown
      ? 'Servidor indisponível. Verifique se o backend está rodando.'
      : (err.response.data?.message ?? 'Erro ao cadastrar')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="auth-page pk-pixel">
    <div class="auth-header">
      <RouterLink to="/login" class="back-btn">← VOLTAR</RouterLink>
      <div class="auth-ball">
        <img class="eagle-ball-icon" src="/eagle-ball.png" alt="" aria-hidden="true" />
      </div>
      <h1 class="auth-title">CADASTRO</h1>
    </div>

    <div class="auth-body pokemon-frame">
      <form class="form-group" @submit.prevent="submit">
        
        <div class="input-block">
          <label class="pk-label">Nome</label>
          <input 
            v-model="name" 
            type="text" 
            placeholder="SEU NOME COMPLETO" 
            autocomplete="name" 
            class="pk-input"
          />
        </div>

        <div class="input-block">
          <label class="pk-label">Matrícula</label>
          <input
            v-model="matricula"
            type="text"
            placeholder="SUA MATRÍCULA"
            autocomplete="username"
            class="pk-input"
          />
        </div>

        <div class="input-block">
          <label class="pk-label">Senha</label>
          <input
            v-model="password"
            type="password"
            :placeholder="SENHA_PLACEHOLDER"
            autocomplete="new-password"
            class="pk-input"
          />
        </div>

        <div v-if="errorMsg" class="error-msg">{{ errorMsg }}</div>

        <button type="submit" class="btn-pokemon-action" :disabled="loading">
          <span v-if="loading" class="spinner-pixel" />
          <span>{{ loading ? 'CADASTRANDO...' : 'CRIAR CONTA' }}</span>
        </button>
      </form>

      <div class="auth-footer">
        <span>Já tem conta?</span>
        <RouterLink to="/login" class="pk-link">Fazer login</RouterLink>
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

/* Caixa de Diálogo Pokémon (Menu Interno) com Scroll se a tela for pequena */
.auth-body {
  margin: 20px 16px;
  padding: 20px 16px;
  background: var(--surface);
  flex: 1;
  overflow-y: auto;
  
  /* Borda dupla clássica (Frame Type 1) */
  border: 4px solid var(--unifil-orange);
  box-shadow: 
    inset 0 0 0 2px var(--unifil-gold),
    inset 0 0 0 4px var(--surface);
  border-radius: 4px;
  
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.input-block {
  display: flex;
  flex-direction: column;
  gap: 6px;
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

/* Loading Spinner em Pixel-art */
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
  font-size: 9px;
  color: var(--text-muted);
  display: flex;
  gap: 8px;
  justify-content: center;
  align-items: center;
  line-height: 1.4;
  padding-top: 4px;
}

.pk-link {
  color: var(--unifil-gold);
  text-decoration: underline;
}

.pk-link:hover {
  color: var(--text-primary);
}
</style>
