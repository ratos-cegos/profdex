<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

// A bancada abre em aba nova de propósito: o tablet do estande fica nela o dia
// todo, e quem administra continua com o painel aberto do outro lado.
function abrirBancada() {
  const url = router.resolve({ name: 'admin-quiz-bancada' }).href
  window.open(url, '_blank', 'noopener')
}

const abas = [
  { name: 'admin-metricas', label: 'Métricas' },
  { name: 'admin-quiz', label: 'Quiz' },
]

const atual = computed(() => route.name)
</script>

<template>
  <div class="admin">
    <header class="admin__topo">
      <div class="admin__marca">
        <span class="pixel admin__eyebrow">PROFDEX</span>
        <strong class="pixel admin__titulo">ADMIN</strong>
      </div>

      <div class="admin__acoes">
        <button class="botao botao--fantasma" type="button" @click="abrirBancada">
          Abrir bancada ↗
        </button>
        <RouterLink :to="{ name: 'profdex' }" class="botao botao--fantasma">
          Voltar ao app
        </RouterLink>
        <span v-if="auth.user" class="admin__quem">{{ auth.user.name }}</span>
      </div>
    </header>

    <nav class="abas" aria-label="Seções do painel">
      <RouterLink
        v-for="aba in abas"
        :key="aba.name"
        :to="{ name: aba.name }"
        class="aba"
        :class="{ 'aba--ativa': atual === aba.name }"
      >
        {{ aba.label }}
      </RouterLink>
    </nav>

    <main class="admin__conteudo">
      <RouterView />
    </main>
  </div>
</template>

<style scoped>
.admin {
  min-height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg);
}

.admin__topo {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  padding: 14px 18px;
  background: linear-gradient(160deg, var(--red-dark), var(--red));
}

.admin__eyebrow {
  display: block;
  font-size: 8px;
  color: var(--yellow);
}

.admin__titulo {
  font-size: 16px;
  color: #fff;
  text-shadow: 2px 2px 0 rgba(0, 0, 0, 0.3);
}

.admin__acoes {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.admin__quem {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.85);
}

.botao {
  min-height: 36px;
  padding: 0 12px;
  display: inline-flex;
  align-items: center;
  border-radius: var(--radius);
  font-size: 12px;
  text-decoration: none;
  cursor: pointer;
}

.botao--fantasma {
  background: rgba(0, 0, 0, 0.25);
  color: rgba(255, 255, 255, 0.9);
  border: 1px solid rgba(255, 255, 255, 0.25);
}

.abas {
  display: flex;
  gap: 4px;
  padding: 0 12px;
  background: var(--bg-surface);
  border-bottom: 1px solid var(--border);
  overflow-x: auto;
}

.aba {
  padding: 12px 14px;
  font-size: 13px;
  color: var(--text-muted);
  text-decoration: none;
  border-bottom: 3px solid transparent;
  white-space: nowrap;
}

.aba--ativa {
  color: var(--text);
  border-bottom-color: var(--yellow);
}

.admin__conteudo {
  flex: 1;
  min-height: 0;
}
</style>
