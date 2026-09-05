<script setup>
import { useRouter } from 'vue-router'
import BottomNav from '../components/BottomNav.vue'
import AppHeader from '../components/AppHeader.vue'
import BotaoInstalar from '../components/BotaoInstalar.vue'
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
