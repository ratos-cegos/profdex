<script setup>
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import api from '../services/api'

const route = useRoute()
const router = useRouter()

const token = ref('')
const senha = ref('')
const confirmacao = ref('')
const loading = ref(false)
const errorMsg = ref('')
const pronto = ref(false)

onMounted(() => {
  token.value = route.query.token ?? ''
  if (!token.value) {
    errorMsg.value = 'Link inválido. Peça um novo e-mail de redefinição.'
  }
})

async function submit() {
  if (!token.value) return
  if (senha.value.length < 12) {
    errorMsg.value = 'A senha precisa ter ao menos 12 caracteres.'
    return
  }
  if (senha.value !== confirmacao.value) {
    errorMsg.value = 'As senhas não conferem.'
    return
  }

  loading.value = true
  errorMsg.value = ''
  try {
    await api.post('/auth/reset-password', {
      token: token.value,
      password: senha.value,
    })
    pronto.value = true
    setTimeout(() => router.push({ name: 'login' }), 2500)
  } catch (err) {
    const serverDown = !err.response || err.response.status >= 500
    errorMsg.value = serverDown
      ? 'Servidor indisponível. Tente de novo em instantes.'
      : (err.response.data?.message ?? 'Link inválido ou expirado.')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="auth-page">
    <header class="auth-header">
      <h1 class="pixel auth-title">NOVA SENHA</h1>
    </header>

    <main class="auth-body">
      <div v-if="pronto" class="sucesso" role="status">
        <p class="sucesso__titulo">Senha alterada!</p>
        <p class="sucesso__texto">Levando você para o login…</p>
      </div>

      <form v-else class="form" @submit.prevent="submit">
        <label class="campo">
          <span class="campo__label">Nova senha</span>
          <input
            v-model="senha"
            class="campo__input"
            type="password"
            placeholder="MÍNIMO 12 CARACTERES"
            autocomplete="new-password"
          />
        </label>

        <label class="campo">
          <span class="campo__label">Repita a senha</span>
          <input
            v-model="confirmacao"
            class="campo__input"
            type="password"
            placeholder="CONFIRME"
            autocomplete="new-password"
          />
        </label>

        <p v-if="errorMsg" class="erro" role="alert">{{ errorMsg }}</p>

        <button class="botao" type="submit" :disabled="loading || !token">
          {{ loading ? 'SALVANDO...' : 'SALVAR SENHA' }}
        </button>
      </form>

      <RouterLink to="/esqueci-senha" class="voltar">
        Precisa de um novo link?
      </RouterLink>
    </main>
  </div>
</template>

<style scoped>
.auth-page {
  min-height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg);
  color: var(--text);
}

.auth-header {
  background: linear-gradient(160deg, var(--red-dark), var(--red));
  padding: 32px 20px 24px;
  text-align: center;
}

.auth-title {
  margin: 0;
  font-size: 16px;
  color: #fff;
  text-shadow: 2px 2px 0 rgba(0, 0, 0, 0.3);
}

.auth-body {
  flex: 1;
  padding: 20px 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.campo {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.campo__label {
  font-size: 12px;
  color: var(--text-muted);
}

.campo__input {
  min-height: 46px;
  padding: 0 12px;
  border-radius: var(--radius);
  background: var(--bg-surface);
  color: var(--text);
  border: 2px solid var(--border);
  font-size: 14px;
}

.campo__input:focus {
  outline: none;
  border-color: var(--yellow);
}

.erro {
  margin: 0;
  padding: 10px 12px;
  border-radius: var(--radius);
  background: var(--bg-card);
  border: 1px solid var(--red-light);
  color: var(--red-light);
  font-size: 13px;
}

.botao {
  min-height: 50px;
  border-radius: var(--radius);
  background: var(--red-dark);
  color: #fff;
  border: 2px solid var(--red-light);
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
}

.botao:disabled {
  opacity: 0.5;
  cursor: default;
}

.sucesso {
  padding: 16px;
  border-radius: var(--radius-lg);
  background: var(--bg-card);
  border: 2px solid var(--ds-green);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.sucesso__titulo {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
}

.sucesso__texto {
  margin: 0;
  font-size: 12px;
  color: var(--text-muted);
}

.voltar {
  text-align: center;
  font-size: 12px;
  color: var(--text-muted);
  text-decoration: none;
}
</style>
