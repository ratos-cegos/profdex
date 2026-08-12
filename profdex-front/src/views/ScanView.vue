<script setup>
import jsQR from 'jsqr'
import { onMounted, onUnmounted, ref, useTemplateRef } from 'vue'
import { useRouter } from 'vue-router'
import { useProfessorsStore } from '../stores/professors'
import { openBackCamera } from '../composables/useBackCamera'

const router = useRouter()
const store = useProfessorsStore()

const videoRef = useTemplateRef('qrVideo')
const canvasRef = useTemplateRef('qrCanvas')

const loading = ref(true)
const error = ref(null)
const foundProfessor = ref(null)
const capturing = ref(false)
const captured = ref(false)
const captureAvatarError = ref(false)
const aviso = ref(null)

let stream = null
let animFrame = null
let detector = null
let lastScannedData = null
let lastScannedAt = 0
let avisoTimer = null

// Aviso passageiro sobre a câmera: some sozinho para o scanner seguir usável.
function mostrarAviso(mensagem) {
  aviso.value = mensagem
  clearTimeout(avisoTimer)
  avisoTimer = setTimeout(() => (aviso.value = null), 5000)
}

// ── Detecta se o dado do QR é um token de captura ─────────────────────────
// Aceita: "capture:TOKEN" ou URL autorizada (mesma origem do app, ou uma das
// origens em VITE_QR_ORIGINS) com path /capture/TOKEN.
function extractCaptureToken(data) {
  if (!data) return null

  // Formato direto: "capture:TOKEN"
  const direct = data.trim().match(/^capture:(.+)$/i)
  if (direct) return direct[1].trim()

  // Formato URL: qualquer URL com /capture/TOKEN no path
  try {
    const url = new URL(data)
    const configuredOrigins = (import.meta.env.VITE_QR_ORIGINS || window.location.origin)
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean)
    // A comparação por `origin` (protocolo + host + porta) já garante que o QR
    // aponta para um domínio confiável — não é preciso além disso travar em
    // `https:`. Essa checagem extra bloqueava QUALQUER QR válido sempre que o
    // app não estava servido por HTTPS (dev local, rede interna via IP etc.),
    // porque `window.location.origin` nesses casos já é `http://...` e o QR
    // gerado para aquele ambiente também é `http://...` — mas a comparação de
    // protocolo rejeitava os dois antes mesmo de checar a origem.
    if (!configuredOrigins.includes(url.origin)) return null
    const match = url.pathname.match(/\/capture\/(.+)/)
    if (match) return match[1]
  } catch { /* não é URL */ }

  return null
}

// ── Processa dado lido pelo scanner ───────────────────────────────────────
async function onQRDetected(data) {
  const now = Date.now()
  // Debounce: ignora o mesmo código por 3 s
  if (data === lastScannedData && now - lastScannedAt < 3000) return
  lastScannedData = data
  lastScannedAt = now

  // ── Caminho 1: token de captura ──────────────────────────────────────────
  const token = extractCaptureToken(data)
  if (token && !capturing.value && !captured.value) {
    capturing.value = true
    captureAvatarError.value = false
    try {
      const result = await store.captureByToken(token)
      foundProfessor.value = result.professor
      captured.value = true
    } catch (e) {
      // Ficha já resgatada precisa de resposta na tela: sem isso o aluno fica
      // insistindo num papel que o app nunca vai aceitar de novo.
      if (e?.response?.status === 409) {
        mostrarAviso('Este QR já foi utilizado. Cada ficha vale uma captura.')
      }
      // token inválido — ignora silenciosamente, não trava o scanner
      lastScannedData = null
    } finally {
      capturing.value = false
    }
    return
  }
}

// ── Loop de scanning (BarcodeDetector ou jsQR) ────────────────────────────
function startScanLoop() {
  const video = videoRef.value
  if (!video) return

  const hasBarcodeDetector = 'BarcodeDetector' in window

  if (hasBarcodeDetector) {
    detector = new window.BarcodeDetector({ formats: ['qr_code'] })

    async function loopNative() {
      if (!stream) return
      try {
        const codes = await detector.detect(video)
        if (codes.length > 0) await onQRDetected(codes[0].rawValue)
      } catch { /* ignora erros de frame */ }
      animFrame = requestAnimationFrame(loopNative)
    }
    animFrame = requestAnimationFrame(loopNative)
  } else {
    const canvas = canvasRef.value
    const ctx = canvas.getContext('2d', { willReadFrequently: true })

    function loopJsQR() {
      if (!stream || !video.videoWidth) { animFrame = requestAnimationFrame(loopJsQR); return }
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      ctx.drawImage(video, 0, 0)
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: 'dontInvert',
      })
      if (code) onQRDetected(code.data)
      animFrame = requestAnimationFrame(loopJsQR)
    }
    animFrame = requestAnimationFrame(loopJsQR)
  }
}

// ── Inicia câmera ─────────────────────────────────────────────────────────
onMounted(async () => {
  // A lista de professores é opcional para o scanner funcionar (só é usada para
  // casar slugs lidos). Rodamos sem `await`: se o back-end estiver fora do ar,
  // a falha não pode impedir a câmera de abrir.
  if (!store.professors.length) store.fetch().catch(() => {})

  // getUserMedia exige contexto seguro: só existe em HTTPS ou em localhost. Ao
  // abrir o app por um IP de rede via HTTP a API nem é exposta — avisamos em vez
  // de travar no loader de "abrindo câmera".
  if (!navigator.mediaDevices?.getUserMedia) {
    error.value = 'A câmera precisa de HTTPS ou localhost. Abra o app por uma conexão segura.'
    loading.value = false
    return
  }

  try {
    stream = await openBackCamera({
      width: { ideal: 1280 },
      height: { ideal: 720 },
    })
    const video = videoRef.value
    video.srcObject = stream
    video.setAttribute('playsinline', '')
    video.setAttribute('muted', '')
    await video.play()
    loading.value = false
    startScanLoop()
  } catch (e) {
    error.value = e.message ?? 'Sem acesso à câmera'
    loading.value = false
  }
})

// ── Limpeza ───────────────────────────────────────────────────────────────
onUnmounted(() => {
  if (animFrame) cancelAnimationFrame(animFrame)
  if (stream) stream.getTracks().forEach((t) => t.stop())
  stream = null
  clearTimeout(avisoTimer)
})
</script>

<template>
  <div class="scan-view" :class="{ flash: captured }">
    <!-- Stream da câmera -->
    <video ref="qrVideo" class="scan-video" autoplay playsinline muted />
    <!-- Canvas oculto para jsQR fallback -->
    <canvas ref="qrCanvas" class="scan-canvas-hidden" />

    <!-- Overlay de UI -->
    <div class="scan-ui">
      <header class="scan-topbar">
        <button
          class="back-btn"
          type="button"
          aria-label="Voltar ao ProfDex"
          @click="router.push({ name: 'profdex' })"
        >
          <span aria-hidden="true">‹</span>
          <span>Voltar</span>
        </button>
        <div class="scan-heading">
          <span class="pixel scan-title">SCANNER</span>
          <span v-if="!loading && !error" class="camera-status">
            <span class="status-dot" aria-hidden="true" />
            Câmera ativa
          </span>
        </div>
        <span class="topbar-spacer" aria-hidden="true" />
      </header>

      <!-- Carregando câmera -->
      <div v-if="loading" class="scan-center" role="status" aria-live="polite">
        <div class="scan-loader" aria-label="Abrindo câmera">
          <div class="loader-pokeball">
            <img class="eagle-ball-icon" src="/eagle-ball.png" alt="" aria-hidden="true" />
          </div>
          <span class="pixel state-title">ABRINDO CÂMERA</span>
          <span class="state-copy">Autorize o acesso quando o navegador solicitar.</span>
        </div>
      </div>

      <!-- Erro -->
      <div v-else-if="error" class="scan-center" role="alert">
        <div class="error-card">
          <span class="error-symbol pixel" aria-hidden="true">!</span>
          <p class="pixel state-title">CÂMERA INDISPONÍVEL</p>
          <p class="state-copy">{{ error }}</p>
          <button class="btn btn-primary" type="button" @click="router.push({ name: 'profdex' })">
            <span class="pixel">VOLTAR</span>
          </button>
        </div>
      </div>

      <template v-else>
        <!-- Capturando via token (chamada API em andamento) -->
        <div v-if="capturing" class="scan-center" role="status" aria-live="polite">
          <div class="discovering-card">
            <div class="loader-pokeball discovering-ball">
              <img class="eagle-ball-icon" src="/eagle-ball.png" alt="" aria-hidden="true" />
            </div>
            <p class="pixel state-title state-title--accent">CAPTURANDO!</p>
          </div>
        </div>

        <!-- Captura concluída -->
        <div v-else-if="captured && foundProfessor" class="scan-bottom">
          <div class="capture-card animate-fade-in">
            <div class="capture-emoji">🎉</div>
            <p class="pixel capture-title">CAPTURADO!</p>
            <div class="capture-avatar">
              <img
                v-if="!captureAvatarError"
                :src="`/professors/${foundProfessor.slug}-cartoon.png`"
                :alt="foundProfessor.name"
                class="capture-img"
                @error="captureAvatarError = true"
              />
              <div v-else class="capture-fallback">{{ foundProfessor.name[0] }}</div>
            </div>
            <span class="capture-name">Prof. {{ foundProfessor.name }}</span>
            <p class="capture-copy">
              Adicionado ao seu ProfDex!
            </p>
            <button class="btn btn-primary capture-action" type="button" @click="router.push({ name: 'profdex' })">
              <span class="pixel">VER PROFDEX</span>
            </button>
          </div>
        </div>

        <!-- Viewfinder + hint quando nada foi detectado ainda -->
        <div v-else-if="!foundProfessor" class="scan-hint">
          <div class="viewfinder" aria-hidden="true">
            <div class="vf-corner vf-tl" /><div class="vf-corner vf-tr" />
            <div class="vf-corner vf-bl" /><div class="vf-corner vf-br" />
            <div class="vf-line" />
            <div class="target-center" />
          </div>

          <div class="hint-content">
            <div class="hint-status" aria-hidden="true">
              <span class="hint-status-dot" />
              QR
            </div>
            <div class="hint-copy">
              <p v-if="aviso" class="pixel hint-title hint-title--warn">QR JÁ USADO</p>
              <p v-else class="pixel hint-title">APONTE PARA O QR CODE</p>
              <p class="hint-subtitle">
                {{ aviso ?? 'Mantenha o código inteiro dentro da mira.' }}
              </p>
            </div>
          </div>
        </div>

      </template>
    </div>
  </div>
</template>

<style scoped>
.scan-view {
  position: fixed;
  inset: 0;
  min-height: 100vh;
  min-height: 100dvh;
  overflow: hidden;
  isolation: isolate;
  background: var(--bg-deep);
}

.scan-view.flash {
  animation: captureFlash 0.8s ease forwards;
}

.scan-video {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  contain: strict;
}

.scan-canvas-hidden { display: none; }

.scan-ui {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  pointer-events: none;
  z-index: 10;
  background:
    linear-gradient(to bottom, rgba(18, 20, 24, 0.88) 0, transparent 22%),
    linear-gradient(to top, rgba(18, 20, 24, 0.84) 0, transparent 30%);
}

/* ── Topbar ── */
.scan-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 64px;
  padding: calc(8px + env(safe-area-inset-top)) 16px 8px;
  pointer-events: auto;
  flex-shrink: 0;
}
.back-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  min-width: 82px;
  min-height: 44px;
  padding: 0 12px 0 8px;
  color: white;
  background: rgba(26, 26, 26, 0.92);
  border: 2px solid rgba(255, 255, 255, 0.28);
  border-radius: var(--radius);
  font-size: 13px;
  pointer-events: auto;
  touch-action: manipulation;
}
.back-btn > span:first-child {
  font-size: 26px;
  line-height: 0;
  transform: translateY(-1px);
}
.scan-heading {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
}
.scan-title {
  font-size: 11px;
  color: white;
  text-shadow: 2px 2px 0 rgba(0, 0, 0, 0.65);
}
.camera-status {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: rgba(255, 255, 255, 0.82);
  font-size: 10px;
  font-weight: 700;
}
.status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--success-text);
  box-shadow: 0 0 0 3px rgba(130, 209, 107, 0.18);
}
.topbar-spacer { width: 82px; }

/* ── Centro ── */
.scan-center {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}
.scan-loader, .discovering-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
  text-align: center;
}
.loader-pokeball {
  width: 60px; height: 60px;
  animation: spin 1s linear infinite;
}
.discovering-ball {
  width: 72px; height: 72px;
  animation-duration: 0.5s;
}
.state-title {
  color: white;
  font-size: 9px;
  line-height: 1.5;
}
.state-title--accent { color: var(--yellow); }
.state-copy {
  max-width: 280px;
  color: rgba(255, 255, 255, 0.76);
  font-size: 13px;
  line-height: 1.5;
  text-align: center;
  text-wrap: pretty;
}
.error-card {
  max-width: 360px;
  background: rgba(26, 26, 26, 0.97);
  border: 2px solid var(--red);
  border-radius: var(--radius-lg);
  padding: 28px 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  text-align: center;
  pointer-events: auto;
  width: 100%;
}
.error-symbol {
  width: 48px;
  height: 48px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--red);
  color: white;
  font-size: 20px;
}

/* ── Viewfinder ── */
.scan-hint {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: clamp(20px, 4vh, 34px);
  min-height: 0;
  padding: 8px 16px calc(18px + env(safe-area-inset-bottom));
}
.viewfinder {
  --scan-size: clamp(220px, 68vw, 286px);

  position: relative;
  width: var(--scan-size);
  height: var(--scan-size);
  flex: 0 1 auto;
  contain: layout paint;
  border-radius: 6px;
  background: radial-gradient(circle at center, transparent 0 58%, rgba(2, 4, 10, 0.14) 100%);
}
.vf-corner {
  position: absolute;
  width: 44px; height: 44px;
  border-color: var(--yellow);
  border-style: solid;
  border-width: 0;
  filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.8));
}
.vf-tl { top: 0; left: 0; border-top-width: 4px; border-left-width: 4px; }
.vf-tr { top: 0; right: 0; border-top-width: 4px; border-right-width: 4px; }
.vf-bl { bottom: 0; left: 0; border-bottom-width: 4px; border-left-width: 4px; }
.vf-br { bottom: 0; right: 0; border-bottom-width: 4px; border-right-width: 4px; }
.vf-line {
  position: absolute;
  top: 10%; left: 12px; right: 12px;
  height: 2px;
  background: linear-gradient(90deg, transparent, var(--yellow) 18% 82%, transparent);
  box-shadow: 0 0 10px rgba(237, 175, 104, 0.55);
  animation: scan-line 2.6s cubic-bezier(0.22, 1, 0.36, 1) infinite alternate;
}
@keyframes scan-line {
  from { transform: translateY(0); opacity: 0.65; }
  to { transform: translateY(calc(var(--scan-size) - 36px)); opacity: 1; }
}
.target-center {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 8px;
  height: 8px;
  border: 2px solid rgba(255, 255, 255, 0.9);
  transform: translate(-50%, -50%);
}
.hint-content {
  background: rgba(26, 26, 26, 0.94);
  border: 2px solid rgba(255, 255, 255, 0.22);
  border-radius: var(--radius-lg);
  padding: 14px;
  width: min(100%, 420px);
  display: flex;
  align-items: center;
  gap: 14px;
}
.hint-status {
  width: 50px;
  height: 44px;
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  gap: 5px;
  border: 2px solid var(--yellow-dark);
  border-radius: var(--radius);
  background: var(--yellow);
  color: var(--bg-deep);
  font-size: 11px;
  font-weight: 900;
}
.hint-status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--red);
}
.hint-copy { min-width: 0; }
.hint-title { margin-bottom: 6px; font-size: 8px; color: var(--yellow); }
.hint-title--warn { color: var(--red-light); }
.hint-subtitle { font-size: 12px; color: white; line-height: 1.45; text-wrap: pretty; }

/* ── Descoberto (slug QR) ── */
.scan-bottom {
  flex: 1;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: 0 16px calc(24px + env(safe-area-inset-bottom));
  pointer-events: auto;
}
.found-card {
  background: rgba(26, 26, 26, 0.96);
  border: 2px solid var(--yellow);
  border-radius: var(--radius-lg);
  padding: 20px;
  width: min(100%, 520px);
  display: flex;
  align-items: center;
  gap: 16px;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.35);
}
.found-avatar { flex-shrink: 0; width: 64px; height: 64px; }
.found-img {
  width: 64px; height: 64px;
  border-radius: 50%;
  object-fit: cover;
  border: 2px solid var(--yellow);
}
.found-fallback {
  width: 64px; height: 64px;
  border-radius: 50%;
  background: var(--red);
  display: flex; align-items: center; justify-content: center;
  font-size: 28px; font-weight: 900; color: white;
  border: 2px solid var(--yellow);
}
.found-info    { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.found-label   { font-size: 7px; color: var(--yellow); }
.found-name    { font-size: 18px; font-weight: 800; color: white; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.found-hint    { font-size: 12px; color: var(--text-muted); line-height: 1.5; }

/* ── Capturado (token QR) ── */
.capture-card {
  background: rgba(26, 26, 26, 0.98);
  border: 2px solid var(--yellow);
  border-radius: var(--radius-lg);
  padding: 28px 20px;
  width: min(100%, 420px);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.4);
}
.capture-emoji { font-size: 42px; animation: pulse 1s ease-in-out infinite; }
.capture-title { color: var(--yellow); font-size: 13px; letter-spacing: 2px; }
.capture-copy { color: rgba(255, 255, 255, 0.76); font-size: 12px; line-height: 1.6; text-align: center; }
.capture-action { margin-top: 4px; }
.capture-avatar { width: 96px; height: 96px; }
.capture-img {
  width: 96px; height: 96px;
  border-radius: 50%;
  object-fit: cover;
  border: 3px solid var(--yellow);
  box-shadow: 0 0 24px rgba(237, 175, 104, 0.35);
  animation: pulse 1s ease-in-out infinite;
}
.capture-fallback {
  width: 96px; height: 96px;
  border-radius: 50%;
  background: var(--red);
  display: flex; align-items: center; justify-content: center;
  font-size: 42px; font-weight: 900; color: white;
  border: 3px solid var(--yellow);
  animation: pulse 1s ease-in-out infinite;
}
.capture-name { font-size: 22px; font-weight: 800; color: white; }

@keyframes spin { to { transform: rotate(360deg); } }
@keyframes captureFlash {
  0%   { filter: brightness(1); }
  15%  { filter: brightness(3); }
  100% { filter: brightness(1); }
}

@media (max-width: 360px), (max-height: 680px) {
  .scan-topbar { padding-inline: 10px; }
  .back-btn { min-width: 72px; padding-right: 8px; }
  .topbar-spacer { width: 72px; }
  .viewfinder { --scan-size: min(62vw, 222px); }
  .scan-hint { gap: 16px; }
  .hint-content { padding: 10px; }
  .capture-card { gap: 10px; padding: 18px 16px; }
  .capture-avatar, .capture-img, .capture-fallback { width: 76px; height: 76px; }
  .capture-name { font-size: 18px; }
}

@media (orientation: landscape) and (max-height: 520px) {
  .scan-topbar {
    min-height: 52px;
    padding:
      calc(4px + env(safe-area-inset-top))
      calc(12px + env(safe-area-inset-right))
      4px
      calc(12px + env(safe-area-inset-left));
  }
  .back-btn { min-height: 40px; }
  .scan-hint {
    display: grid;
    grid-template-columns: minmax(190px, 58vh) minmax(260px, 360px);
    justify-content: center;
    align-content: center;
    gap: clamp(24px, 7vw, 72px);
    padding:
      4px
      calc(18px + env(safe-area-inset-right))
      calc(8px + env(safe-area-inset-bottom))
      calc(18px + env(safe-area-inset-left));
  }
  .viewfinder { --scan-size: min(58vh, 250px); }
  .hint-content { align-items: center; }
  .scan-bottom { align-items: center; padding-bottom: 8px; }
  .found-card { max-width: 560px; }
  .capture-card {
    display: grid;
    grid-template-columns: auto minmax(160px, 1fr);
    max-width: 560px;
    padding: 14px 18px;
  }
  .capture-emoji { display: none; }
  .capture-title, .capture-name, .capture-copy, .capture-action { grid-column: 2; }
  .capture-avatar { grid-column: 1; grid-row: 1 / span 4; }
}

@media (prefers-reduced-motion: reduce) {
  .scan-view.flash,
  .vf-line,
  .loader-pokeball,
  .capture-emoji,
  .capture-img,
  .capture-fallback {
    animation: none;
  }
  .vf-line { top: 50%; opacity: 0.8; }
}
</style>
