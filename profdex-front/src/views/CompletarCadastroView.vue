<script setup>
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import api from '../services/api'
import { useAuthStore } from '../stores/auth'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

// O ticket vem na URL porque quem nos trouxe aqui foi um redirect do backend,
// depois do retorno do Google. Ele vale 15min e só serve para este cadastro.
const ticket = ref('')
const email = ref('')
const matricula = ref('')
const nome = ref('')
const senha = ref('')

const loading = ref(false)
const errorMsg = ref('')

onMounted(() => {
  ticket.value = route.query.ticket ?? ''
  email.value = route.query.email ?? ''
  nome.value = route.query.nome ?? ''
  if (!ticket.value) {
    errorMsg.value = 'Link inválido. Comece o login pelo Google novamente.'
  }
})

async function submit() {
  if (!ticket.value || !matricula.value || !nome.value || !senha.value) return
  if (senha.value.length < 12) {
    errorMsg.value = 'A senha precisa ter ao menos 12 caracteres.'
    return
  }

  loading.value = true
  errorMsg.value = ''
  try {
    const { data } = await api.post('/auth/google/complete', {
      ticket: ticket.value,
      matricula: matricula.value.trim(),
      name: nome.value.trim(),
      password: senha.value,
    })
    // O backend já devolveu o cookie de sessão junto.
    auth.user = data.user
    router.push({ name: 'profdex' })
  } catch (err) {
    const serverDown = !err.response || err.response.status >= 500
    errorMsg.value = serverDown
      ? 'Servidor indisponível. Tente de novo em instantes.'
      : (err.response.data?.message ?? 'Não foi possível concluir o cadastro.')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="auth-page">
    <header class="auth-header">
      <h1 class="pixel auth-title">QUASE LÁ</h1>
      <p v-if="email" class="auth-sub">{{ email }}</p>
    </header>

    <main class="auth-body">
      <p class="intro">
        Seu e-mail institucional foi confirmado. Falta só ligar a conta à sua
        matrícula.
      </p>

      <form class="form" @submit.prevent="submit">
        <label class="campo">
          <span class="campo__label">Matrícula</span>
          <input
            v-model="matricula"
            class="campo__input"
            type="text"
            placeholder="SUA MATRÍCULA"
            autocomplete="username"
          />
        </label>

        <label class="campo">
          <span class="campo__label">Nome completo</span>
          <input
            v-model="nome"
            class="campo__input"
            type="text"
            placeholder="NOME COMPLETO"
            autocomplete="name"
          />
        </label>

        <label class="campo">
          <span class="campo__label">Senha</span>
          <input
            v-model="senha"
            class="campo__input"
            type="password"
            placeholder="MÍNIMO 12 CARACTERES"
            autocomplete="new-password"
          />
          <span class="campo__ajuda">
            Serve para entrar por matrícula, sem depender do Google.
          </span>
        </label>

        <p v-if="errorMsg" class="erro" role="alert">{{ errorMsg }}</p>

        <button class="botao" type="submit" :disabled="loading || !ticket">
          {{ loading ? 'CRIANDO...' : 'CRIAR CONTA' }}
        </button>
      </form>

      <RouterLink to="/login" class="voltar">← Voltar ao login</RouterLink>
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
  font-size: 18px;
  color: #fff;
  text-shadow: 2px 2px 0 rgba(0, 0, 0, 0.3);
}

.auth-sub {
  margin: 10px 0 0;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.85);
  word-break: break-all;
}

.auth-body {
  flex: 1;
  padding: 20px 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.intro {
  margin: 0;
  font-size: 13px;
  color: var(--text-muted);
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

.campo__ajuda {
  font-size: 11px;
  color: var(--text-muted);
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

.voltar {
  text-align: center;
  font-size: 12px;
  color: var(--text-muted);
  text-decoration: none;
}
</style>
