<script setup>
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import api from '../services/api'
import { useAuthStore } from '../stores/auth'
import {
  MATRICULA_MAX_DIGITOS,
  mensagemDaApi,
  normalizarMatricula,
  validarMatricula,
} from '../services/matricula-rules'
import {
  SENHA_CURTA_MSG,
  SENHA_PLACEHOLDER,
  senhaTemTamanhoMinimo,
} from '../services/password-rules'

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
// O aviso na tela é da matrícula? Só esse some quando o campo é consertado —
// o de ticket expirado ou de servidor fora do ar continua valendo.
const erroEhDaMatricula = ref(false)

onMounted(() => {
  ticket.value = route.query.ticket ?? ''
  email.value = route.query.email ?? ''
  nome.value = route.query.nome ?? ''
  if (!ticket.value) {
    errorMsg.value = 'Link inválido. Comece o login pelo Google novamente.'
  }
})

/**
 * Mostra no campo o valor que vai ser gravado: `2023.123-45` vira `202312345`
 * ao sair dele. O aluno confere ali o número que vai digitar na bancada, e o
 * e-mail que o autofill do teclado pôs no campo continua visível, com o erro.
 */
function normalizarCampo() {
  const normalizada = normalizarMatricula(matricula.value)
  if (!normalizada) return
  matricula.value = normalizada
  if (erroEhDaMatricula.value && !validarMatricula(normalizada)) {
    errorMsg.value = ''
    erroEhDaMatricula.value = false
  }
}

function mostrarErro(mensagem, daMatricula = false) {
  errorMsg.value = mensagem
  erroEhDaMatricula.value = daMatricula
}

async function submit() {
  if (!ticket.value || !matricula.value || !nome.value || !senha.value) return

  const matriculaNormalizada = normalizarMatricula(matricula.value)
  const erroDaMatricula = validarMatricula(matriculaNormalizada)
  if (erroDaMatricula) {
    mostrarErro(erroDaMatricula, true)
    return
  }
  matricula.value = matriculaNormalizada

  if (!senhaTemTamanhoMinimo(senha.value)) {
    mostrarErro(SENHA_CURTA_MSG)
    return
  }

  loading.value = true
  mostrarErro('')
  try {
    const { data } = await api.post('/auth/google/complete', {
      ticket: ticket.value,
      matricula: matriculaNormalizada,
      name: nome.value.trim(),
      password: senha.value,
    })
    // O backend já devolveu o cookie de sessão junto.
    auth.user = data.user
    router.push({ name: 'profdex' })
  } catch (err) {
    const serverDown = !err.response || err.response.status >= 500
    mostrarErro(
      serverDown
        ? 'Servidor indisponível. Tente de novo em instantes.'
        : mensagemDaApi(err, 'Não foi possível concluir o cadastro.'),
    )
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
        <!--
          `autocomplete="username"` fica: é ele que faz o gerenciador de senhas
          guardar a MATRÍCULA junto da senha, para o login de depois. O preço é
          a faixa do teclado oferecer o e-mail do Google aqui — e quem barra
          isso é a validação (daqui e do servidor), não o atributo.
          `inputmode="numeric"` abre o teclado de números, que é o que a
          bancada do quiz também usa. Sem `pattern`, de propósito: a validação
          nativa do navegador barraria `2023.123-45` com uma mensagem genérica
          antes de a normalização rodar.
        -->
        <label class="campo">
          <span class="campo__label">Matrícula</span>
          <input
            v-model="matricula"
            class="campo__input"
            type="text"
            inputmode="numeric"
            placeholder="SÓ OS NÚMEROS"
            autocomplete="username"
            autocapitalize="off"
            autocorrect="off"
            spellcheck="false"
            :maxlength="MATRICULA_MAX_DIGITOS * 2"
            @blur="normalizarCampo"
          />
          <span class="campo__ajuda">
            É o número que você vai digitar na bancada do quiz. Confira antes
            de criar a conta.
          </span>
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
            :placeholder="SENHA_PLACEHOLDER"
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
  min-height: 0;
  overflow-y: auto;
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
