import { ref } from 'vue'
import { defineStore } from 'pinia'
import api from '../services/api'

// Coleta de métricas de uso.
//
// Duas regras guiam o desenho:
//
// 1. TEMPO SÓ CONTA COM A ABA VISÍVEL. Quem esquece o app aberto a noite toda
//    não pode aparecer como o aluno mais engajado do evento — sem isso a
//    métrica de tempo vira ruído e o ranking mede paciência, não uso.
// 2. NADA DE UM REQUEST POR INTERAÇÃO. Os eventos vão para uma fila e sobem em
//    lote; com centenas de alunos ativos, um POST por clique somaria carga
//    justamente nos picos em que o PvP já sofre (ver docs/CARGA-PVP.md).
//
// As interações que valem muitos pontos (captura, batalha) são registradas pelo
// SERVIDOR, não por aqui — o cliente não é fonte confiável para isso.

const HEARTBEAT_MS = 60_000
const FLUSH_MS = 10_000
const MAX_QUEUE = 50

export const useMetricsStore = defineStore('metrics', () => {
  const sessionId = ref(null)

  let queue = []
  let heartbeatTimer = null
  let flushTimer = null

  // Tempo ativo acumulado desde o último heartbeat.
  let activeMs = 0
  let visibleSince = null

  const isVisible = () => document.visibilityState === 'visible'

  /** Fecha a janela de tempo visível em aberto e soma ao acumulado. */
  function accumulate() {
    if (visibleSince === null) return
    activeMs += Date.now() - visibleSince
    visibleSince = isVisible() ? Date.now() : null
  }

  function onVisibilityChange() {
    if (isVisible()) {
      visibleSince = Date.now()
    } else {
      accumulate()
      visibleSince = null
      // Sair da aba é o momento mais provável de o app ser descartado:
      // aproveita para não perder a fila.
      void flush()
    }
  }

  async function start() {
    if (sessionId.value) return
    try {
      const { data } = await api.post('/metrics/session')
      sessionId.value = data.sessionId
    } catch {
      return // sem sessão de métrica o app segue normalmente
    }

    activeMs = 0
    visibleSince = isVisible() ? Date.now() : null

    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('pagehide', handleExit)

    heartbeatTimer = setInterval(() => void heartbeat(), HEARTBEAT_MS)
    flushTimer = setInterval(() => void flush(), FLUSH_MS)
  }

  async function heartbeat() {
    if (!sessionId.value) return
    accumulate()
    const delta = Math.round(activeMs)
    activeMs = 0

    try {
      const { data } = await api.post('/metrics/session/heartbeat', {
        sessionId: sessionId.value,
        activeMs: delta,
      })
      // O servidor reiniciou e não conhece mais esta sessão: abre outra.
      if (!data.ok) {
        sessionId.value = null
        await start()
      }
    } catch {
      // rede instável não deve quebrar nada; o delta se perde e a vida segue
    }
  }

  /** Enfileira uma interação. `type` precisa existir no catálogo do servidor. */
  function track(type, { durationMs, metadata } = {}) {
    if (!sessionId.value) return
    if (queue.length >= MAX_QUEUE) queue.shift() // descarta o mais antigo
    queue.push({
      type,
      occurredAt: new Date().toISOString(),
      ...(Number.isFinite(durationMs) ? { durationMs: Math.round(durationMs) } : {}),
      ...(metadata ? { metadata } : {}),
    })
  }

  async function flush() {
    if (!sessionId.value || !queue.length) return
    const events = queue
    queue = []
    try {
      await api.post('/metrics/events', { sessionId: sessionId.value, events })
    } catch {
      // devolve para a fila, respeitando o teto
      queue = [...events, ...queue].slice(-MAX_QUEUE)
    }
  }

  /**
   * Saída da página. `sendBeacon` é o único envio que o navegador garante
   * durante o descarregamento — um POST normal seria cancelado.
   */
  function handleExit() {
    accumulate()
    if (!sessionId.value) return

    const base = api.defaults.baseURL || ''
    const payload = (url, body) => {
      const blob = new Blob([JSON.stringify(body)], { type: 'application/json' })
      navigator.sendBeacon(`${base}${url}`, blob)
    }

    if (queue.length) {
      payload('/metrics/events', { sessionId: sessionId.value, events: queue })
      queue = []
    }
    if (activeMs > 0) {
      payload('/metrics/session/heartbeat', {
        sessionId: sessionId.value,
        activeMs: Math.round(activeMs),
      })
      activeMs = 0
    }
    payload('/metrics/session/end', { sessionId: sessionId.value })
  }

  /** Logout ou expiração: encerra a sessão de uso de forma limpa. */
  async function stop() {
    if (!sessionId.value) return
    accumulate()
    await heartbeat()
    await flush()

    const id = sessionId.value
    sessionId.value = null
    clearInterval(heartbeatTimer)
    clearInterval(flushTimer)
    heartbeatTimer = null
    flushTimer = null
    document.removeEventListener('visibilitychange', onVisibilityChange)
    window.removeEventListener('pagehide', handleExit)

    await api.post('/metrics/session/end', { sessionId: id }).catch(() => {})
  }

  window.addEventListener('auth:expired', () => {
    void stop()
  })

  return { sessionId, start, stop, track, flush }
})
