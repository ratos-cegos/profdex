import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import api from '../services/api'
import { applyAuthenticatedSession } from './auth-session'

export const useAuthStore = defineStore('auth', () => {
  const user = ref(null)
  const hasRestoredSession = ref(false)

  const isAuthenticated = computed(() => !!user.value)

  // Em produção contas nascem no login com Google e são concluídas em
  // /completar-cadastro (POST /auth/google/complete), que já devolve a sessão.
  // `register` só serve ao ambiente de desenvolvimento: o backend responde 404
  // sem `NODE_ENV=development`, e a rota /register nem existe no build.
  async function register(matricula, name, password) {
    const { data } = await api.post('/auth/register', { matricula, name, password })
    setSession(data)
  }

  async function login(matricula, password) {
    const { data } = await api.post('/auth/login', { matricula, password })
    setSession(data)
  }

  function logout() {
    user.value = null
    hasRestoredSession.value = true
    // Mesmo evento do 401: derruba recursos presos à sessão (ex.: o socket de
    // presença do lobby de batalha) sem acoplar este store aos interessados.
    window.dispatchEvent(new CustomEvent('auth:expired'))
    return api.post('/auth/logout').catch(() => {})
  }

  function setSession(data) {
    // O login já criou a sessão no servidor. Marcar a restauração
    // aqui evita que o primeiro clique dispare /auth/me novamente e apague o
    // usuário quando a navegação acontece logo após a autenticação.
    applyAuthenticatedSession(user, hasRestoredSession, data)
  }

  async function restoreSession() {
    if (hasRestoredSession.value) return
    try {
      const { data } = await api.get('/auth/me')
      user.value = data.user
    } catch {
      user.value = null
    } finally {
      hasRestoredSession.value = true
    }
  }

  function expireSession() {
    user.value = null
    hasRestoredSession.value = true
  }

  window.addEventListener('auth:expired', expireSession)

  return { user, isAuthenticated, register, login, logout, restoreSession }
})
