<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import BottomNav from '../components/BottomNav.vue'
import AppHeader from '../components/AppHeader.vue'
import BotaoInstalar from '../components/BotaoInstalar.vue'
import {
  MATRICULA_MAX_DIGITOS,
  mensagemDaApi,
  normalizarMatricula,
  validarMatricula,
} from '../services/matricula-rules.js'
import { getLandingCreditsUrl } from '../services/public-links.js'
import { useAuthStore } from '../stores/auth.js'

const router = useRouter()
const auth = useAuthStore()
const landingCreditsUrl = getLandingCreditsUrl()

async function leave() {
  if (!window.confirm('Deseja mesmo sair da sua conta?')) return
  await auth.logout()
  router.replace({ name: 'home' })
}

// ── Corrigir a matrícula ────────────────────────────────────────────────────
// A matrícula é digitada uma vez, no cadastro, e um dígito trocado é aceito em
// silêncio: o aluno aparece na bancada como "não encontrado", ou pior, como
// outra pessoa. Quem sabe o valor certo é o dono — daí o autoatendimento.
const editandoMatricula = ref(false)
const novaMatricula = ref('')
const senhaAtual = ref('')
const salvandoMatricula = ref(false)
const erroMatricula = ref('')
const okMatricula = ref('')

function abrirTrocaDeMatricula() {
  novaMatricula.value = auth.user?.matricula ?? ''
  senhaAtual.value = ''
  erroMatricula.value = ''
  okMatricula.value = ''
  editandoMatricula.value = true
}

function cancelarTrocaDeMatricula() {
  editandoMatricula.value = false
  senhaAtual.value = ''
  erroMatricula.value = ''
}

async function salvarMatricula() {
  if (!novaMatricula.value.trim() || !senhaAtual.value) {
    erroMatricula.value = 'Preencha a matrícula nova e a sua senha atual.'
    return
  }

  // A mesma regra do cadastro (services/matricula-rules.js): só dígitos, que é
  // o que a bancada consegue digitar. O servidor recusa do mesmo jeito; aqui só
  // se antecipa a mensagem.
  const matricula = normalizarMatricula(novaMatricula.value)
  const erroDoValor = validarMatricula(matricula)
  if (erroDoValor) {
    erroMatricula.value = erroDoValor
    return
  }
  novaMatricula.value = matricula

  salvandoMatricula.value = true
  erroMatricula.value = ''
  try {
    await auth.changeMatricula(matricula, senhaAtual.value)
    editandoMatricula.value = false
    senhaAtual.value = ''
    // O valor que o SERVIDOR gravou, não o digitado: é ele que a bancada acha.
    okMatricula.value = `Matrícula atualizada para ${auth.user?.matricula ?? matricula}. É com ela que você entra a partir de agora.`
  } catch (e) {
    // A mensagem do servidor é a que importa: senha errada (401) e matrícula
    // já cadastrada (409) precisam ser distinguíveis pelo aluno.
    erroMatricula.value = mensagemDaApi(e, 'Não foi possível corrigir a matrícula.')
  } finally {
    salvandoMatricula.value = false
  }
}
</script>

<template>
  <div class="profile">
    <AppHeader title="PERFIL" subtitle="TREINADOR"
      ><template #left><span aria-hidden="true">👤</span></template></AppHeader
    >
    <main class="profile__main page">
      <section class="profile-card">
        <span class="profile-card__avatar" aria-hidden="true">{{
          auth.user?.name?.[0]?.toUpperCase() ?? 'P'
        }}</span>
        <div>
          <h2>{{ auth.user?.name }}</h2>
          <p>{{ auth.user?.matricula ?? 'Conta ProfDex' }}</p>
        </div>
      </section>
      <!-- Sem seção em volta: o botão traz o próprio rótulo e some sozinho
           quando o app já está instalado (ver BotaoInstalar) — um cabeçalho
           fixo ficaria com título e nada embaixo. Fica no perfil, e não numa
           tela do fluxo principal, porque instalar é algo que se faz uma vez. -->
      <BotaoInstalar />

      <!-- Só para contas administrativas (@unifil.br). O v-if é navegação, não
           segurança: quem barra de verdade é o AdminGuard, que confere o papel
           no banco a cada request. -->
      <section v-if="auth.user?.role === 'admin'" class="profile__admin">
        <h2 class="pixel">ADMINISTRAÇÃO</h2>
        <p>Métricas do evento, quiz da bancada, errata e fichas de captura.</p>
        <button
          class="profile__admin-botao"
          type="button"
          @click="router.push({ name: 'admin-metricas' })"
        >
          Abrir painel administrativo
        </button>
      </section>

      <section class="profile__account">
        <h2 class="pixel">CONTA</h2>

        <p>
          Sua matrícula é <strong>{{ auth.user?.matricula ?? '—' }}</strong
          >. É ela que a bancada usa para te encontrar no quiz.
        </p>

        <p v-if="okMatricula" class="profile__aviso profile__aviso--ok">{{ okMatricula }}</p>

        <button
          v-if="!editandoMatricula"
          class="profile__acao"
          type="button"
          @click="abrirTrocaDeMatricula"
        >
          Corrigir matrícula
        </button>

        <form v-else class="profile__form" @submit.prevent="salvarMatricula">
          <!-- Dito antes de salvar, e não depois: a matrícula É a credencial de
               login, e quem trocar sem saber disso fica de fora na tentativa
               seguinte. -->
          <p class="profile__nota">
            Atenção: o login passa a ser a <strong>matrícula nova</strong>. A antiga deixa de
            funcionar.
          </p>

          <label class="profile__campo">
            <span>Matrícula nova</span>
            <input
              v-model="novaMatricula"
              type="text"
              inputmode="numeric"
              autocomplete="off"
              autocapitalize="off"
              autocorrect="off"
              spellcheck="false"
              :maxlength="MATRICULA_MAX_DIGITOS * 2"
              required
            />
          </label>

          <label class="profile__campo">
            <span>Sua senha atual</span>
            <input
              v-model="senhaAtual"
              type="password"
              autocomplete="current-password"
              required
            />
          </label>

          <p v-if="erroMatricula" class="profile__aviso profile__aviso--erro">
            {{ erroMatricula }}
          </p>

          <div class="profile__form-acoes">
            <button
              class="profile__acao"
              type="button"
              :disabled="salvandoMatricula"
              @click="cancelarTrocaDeMatricula"
            >
              Cancelar
            </button>
            <button class="profile__acao profile__acao--principal" type="submit" :disabled="salvandoMatricula">
              {{ salvandoMatricula ? 'Salvando…' : 'Salvar matrícula' }}
            </button>
          </div>
        </form>

        <p>Sair encerra a sessão e desconecta você do lobby de batalha.</p>
        <button class="profile__logout" type="button" aria-label="Sair da conta" @click="leave">
          Sair da conta
        </button>
      </section>
      <!-- A landing é outro build Vite. Um RouterLink tentaria resolver o
           endereço dentro deste app e manteria o usuário na view antiga. -->
      <a class="profile__about" :href="landingCreditsUrl"> Quem somos · equipe e pesquisa → </a>
    </main>
    <BottomNav />
  </div>
</template>

<style scoped>
.profile {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg);
}
.profile__header {
  padding: calc(18px + env(safe-area-inset-top)) 20px 26px;
  background: linear-gradient(160deg, var(--surface-border), var(--unifil-orange));
  color: white;
}
.profile__eyebrow {
  display: block;
  margin-bottom: 7px;
  color: var(--unifil-gold);
  font-size: 7px;
}
.profile__header h1 {
  font-size: 18px;
}
.profile__main {
  padding: 18px 16px;
  display: grid;
  align-content: start;
  gap: 16px;
}
.profile-card,
.profile__account,
.profile__admin {
  padding: 18px;
  border: 2px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface);
}
.profile-card {
  display: flex;
  align-items: center;
  gap: 14px;
}
.profile-card__avatar {
  width: 58px;
  height: 58px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--unifil-gold);
  color: var(--bg-deep);
  font-size: 24px;
  font-weight: 900;
}
.profile-card h2 {
  font-size: 18px;
}
.profile-card p,
.profile__account p,
.profile__admin p {
  margin-top: 5px;
  color: var(--text-muted);
  font-size: 12px;
  line-height: 1.5;
}
.profile__account h2,
.profile__admin h2 {
  color: var(--unifil-gold);
  font-size: 9px;
}
.profile__admin-botao {
  width: 100%;
  min-height: 48px;
  margin-top: 18px;
  border: 2px solid var(--unifil-gold);
  border-radius: var(--radius);
  background: transparent;
  color: var(--unifil-gold);
  font-weight: 800;
}
.profile__logout {
  width: 100%;
  min-height: 48px;
  margin-top: 18px;
  border: 2px solid var(--error);
  border-radius: var(--radius);
  background: transparent;
  color: var(--error);
  font-weight: 800;
}

/* ── Corrigir matrícula ───────────────────────────────────────────────────── */
.profile__acao {
  flex: 1;
  min-height: 44px;
  margin-top: 14px;
  padding: 0 14px;
  border: 2px solid var(--border);
  border-radius: var(--radius);
  background: transparent;
  color: var(--text);
  font-weight: 700;
}
.profile__acao--principal {
  border-color: var(--unifil-gold);
  color: var(--unifil-gold);
}
.profile__acao:disabled {
  opacity: 0.5;
}
.profile__form {
  display: grid;
  gap: 12px;
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid var(--border);
}
.profile__campo {
  display: grid;
  gap: 6px;
}
.profile__campo span {
  color: var(--text-muted);
  font-size: 11px;
}
.profile__campo input {
  min-height: 44px;
  padding: 0 12px;
  border: 2px solid var(--border);
  border-radius: var(--radius);
  background: var(--bg);
  color: var(--text);
  font-size: 15px;
}
.profile__form-acoes {
  display: flex;
  gap: 10px;
}
/* Os botões do formulário já vêm com a margem de cima do `.profile__acao`;
   dentro do grid ela empurraria a linha inteira. */
.profile__form-acoes .profile__acao {
  margin-top: 0;
}
.profile__nota {
  margin: 0;
  color: var(--yellow);
  font-size: 12px;
  line-height: 1.5;
}
.profile__aviso {
  margin: 10px 0 0;
  font-size: 12px;
  line-height: 1.5;
}
.profile__aviso--erro {
  color: var(--error);
}
.profile__aviso--ok {
  color: var(--success-text);
}
.profile__about {
  min-height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--unifil-gold);
  font-size: 12px;
  text-align: center;
}
</style>
