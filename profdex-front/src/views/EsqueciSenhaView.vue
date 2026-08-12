<script setup>
import { ref } from 'vue'
import api from '../services/api'

const identifier = ref('')
const loading = ref(false)
const enviado = ref(false)

async function submit() {
  if (!identifier.value.trim()) return
  loading.value = true
  try {
    await api.post('/auth/forgot-password', { identifier: identifier.value.trim() })
  } catch {
    // Ignorado de propósito: a tela mostra a mesma coisa em qualquer caso.
  } finally {
    loading.value = false
    // O servidor responde igual exista a conta ou não — a tela faz o mesmo,
    // senão daria para descobrir quais matrículas estão cadastradas.
    enviado.value = true
  }
}
</script>

<template>
  <div class="auth-page">
    <header class="auth-header">
      <h1 class="pixel auth-title">ESQUECI A SENHA</h1>
    </header>

    <main class="auth-body">
      <template v-if="!enviado">
        <p class="intro">
          Informe sua matrícula ou e-mail institucional. Se houver uma conta com
          e-mail cadastrado, enviaremos um link para criar uma nova senha.
        </p>

        <form class="form" @submit.prevent="submit">
          <label class="campo">
            <span class="campo__label">Matrícula ou e-mail</span>
            <input
              v-model="identifier"
              class="campo__input"
              type="text"
              placeholder="MATRÍCULA OU E-MAIL"
              autocomplete="username"
            />
          </label>

          <button class="botao" type="submit" :disabled="loading">
            {{ loading ? 'ENVIANDO...' : 'ENVIAR LINK' }}
          </button>
        </form>
      </template>

      <div v-else class="sucesso" role="status">
        <p class="sucesso__titulo">Se a conta existir, o e-mail já está a caminho.</p>
        <p class="sucesso__texto">
          Confira sua caixa de entrada e o spam. O link vale por 30 minutos e só
          pode ser usado uma vez.
        </p>
        <p class="sucesso__texto">
          Não recebeu? A conta pode não ter e-mail cadastrado — nesse caso,
          procure a organização do evento.
        </p>
      </div>

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
  gap: 10px;
}

.sucesso__titulo {
  margin: 0;
  font-size: 14px;
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
