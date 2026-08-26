<template>
  <!-- eslint-disable vue/no-deprecated-slot-attribute -- model-viewer uses native web-component slots. -->
  <div class="ar-viewer">

    <!-- Aparece enquanto o modelo carrega -->
    <Transition name="fade">
      <div v-if="isLoading" class="ar-loading">
        <div class="ar-loading__spinner" />
        <span>Carregando modelo... {{ Math.round(loadProgress * 100) }}%</span>
      </div>
    </Transition>

    <!-- O elemento principal da lib — renderiza o modelo 3D -->
    <!-- `ar` fica sempre ligado: é ele que autoriza o model-viewer a escolher um
         modo (webxr / scene-viewer / quick-look). Amarrar o atributo ao nosso
         `arStatus` criava um impasse — assim que a sondagem falhava uma vez, o
         atributo saía do DOM e o AR nunca mais podia ser reativado.
         `ios-src` é opcional: sem ele o model-viewer gera o USDZ a partir do
         GLB para o Quick Look (necessário só em navegadores iOS de terceiros). -->
    <model-viewer ref="viewerRef" :src="config.src" :poster="config.poster" :alt="config.alt ?? 'Modelo 3D'"
      :ios-src="config.iosSrc" ar ar-modes="webxr scene-viewer quick-look"
      :ar-placement="config.arPlacement ?? 'floor'" :auto-rotate="config.autoRotate ?? false"
      :camera-controls="config.cameraControls ?? true" shadow-intensity="1" shadow-softness="0.8" exposure="1"
      ar-scale="auto" ar-usdz-max-texture-size="2048" touch-action="pan-y" class="ar-viewer__canvas">
      <!-- Hotspots: pontos clicáveis sobre o modelo -->
      <template v-if="config.hotspots">
        <button v-for="hs in config.hotspots" :key="hs.id" :slot="hs.slot" :data-position="hs.position"
          :data-normal="hs.normal" class="hotspot" :class="{ 'hotspot--active': activeHotspot === hs.id }"
          @click="openHotspot(hs.id)">
          <span class="hotspot__dot" />

          <!-- Tooltip que aparece ao clicar no hotspot -->
          <Transition name="tooltip">
            <div v-if="activeHotspot === hs.id" class="hotspot__tooltip">
              <strong>{{ hs.label }}</strong>
              <p v-if="hs.description">{{ hs.description }}</p>
              <button class="hotspot__close" @click.stop="closeHotspot">✕</button>
            </div>
          </Transition>
        </button>
      </template>

      <!-- Botão que abre a câmera AR -->
      <div slot="ar-button" class="ar-button-wrapper">
        <button class="ar-button" :disabled="arStatus === 'not-supported'">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M2 12L12 2l10 10-10 10z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
          <span>{{ arStatus === 'not-supported' ? 'AR não disponível' : 'Ver em RA' }}</span>
        </button>
      </div>
    </model-viewer>

    <div v-if="photoMeta" class="ar-photo-actions" aria-label="Opções da foto em realidade aumentada">
      <button
        class="ar-photo-button"
        type="button"
        :disabled="isLoading || isCapturing"
        aria-label="Tirar foto"
        @click="capturePhoto(false)"
      >
        <span aria-hidden="true">📷</span>
        <span>{{ isCapturing ? 'Gerando…' : preparedPhoto ? 'Nova foto' : 'Foto' }}</span>
      </button>
      <button
        v-if="preparedPhoto"
        class="ar-photo-button ar-photo-button--share"
        type="button"
        :disabled="isCapturing"
        aria-label="Compartilhar foto"
        @click="deliverPreparedPhoto(false)"
      >
        <span aria-hidden="true">↗</span>
        <span>Compartilhar</span>
      </button>
      <button
        class="ar-photo-button ar-photo-button--download"
        type="button"
        :disabled="isLoading || isCapturing"
        aria-label="Tirar foto e baixar"
        @click="downloadPhoto"
      >
        <span aria-hidden="true">↓</span>
        <span>Baixar</span>
      </button>
    </div>

    <div v-if="errorMessage" class="ar-message ar-message--error" role="alert">
      {{ errorMessage }}
    </div>

    <div v-else-if="!isLoading && arStatus === 'not-supported'" class="ar-message">
      O modelo 3D está disponível, mas este navegador não oferece realidade aumentada.
    </div>

    <p v-if="photoFeedback" class="ar-photo-feedback" aria-live="polite">
      {{ photoFeedback }}
    </p>

    <!-- Badge que aparece quando a câmera AR está ativa -->
    <Transition name="fade">
      <div v-if="arStatus === 'ar-active'" class="ar-status-badge">
        <span class="ar-status-badge__dot" />
        AR ativo — aponte para o chão
      </div>
    </Transition>
  </div>
</template>

<script setup>
import '@google/model-viewer'
import { ref } from 'vue'
import { useModelViewer } from '@/composables/useModelViewer.js'
import { deliverArPhoto, frameArPhoto } from '@/services/ar-photo.js'
import { useMetricsStore } from '@/stores/metrics.js'

const props = defineProps({
  config: {
    type: Object,
    required: true,
    // config espera: { src, iosSrc?, poster?, alt?, arPlacement?,
    //                  autoRotate?, cameraControls?, hotspots? }
  },
  photoMeta: { type: Object, default: null },
})

const metrics = useMetricsStore()
const isCapturing = ref(false)
const photoFeedback = ref('')
const preparedPhoto = ref(null)

const {
  viewerRef,
  arStatus,
  isLoading,
  loadProgress,
  errorMessage,
  activeHotspot,
  openHotspot,
  closeHotspot,
} = useModelViewer(props.config)

async function capturePhoto(forceDownload) {
  const viewer = viewerRef.value
  if (!viewer?.toBlob || isCapturing.value || !props.photoMeta) return

  isCapturing.value = true
  photoFeedback.value = ''
  try {
    const source = await viewer.toBlob({ idealAspect: true, mimeType: 'image/png' })
    const framed = await frameArPhoto(source, props.photoMeta)
    preparedPhoto.value = framed
    if (forceDownload) {
      await deliverPreparedPhoto(true)
    } else {
      photoFeedback.value = 'Foto pronta! Agora compartilhe ou baixe.'
    }
  } catch (error) {
    photoFeedback.value = error?.message ?? 'Não foi possível tirar a foto.'
  } finally {
    isCapturing.value = false
  }
}

async function deliverPreparedPhoto(forceDownload) {
  if (!preparedPhoto.value || isCapturing.value) return

  photoFeedback.value = ''
  try {
    // Esta função nasce diretamente do clique em "Compartilhar". Assim a
    // chamada a navigator.share acontece com ativação transitória válida,
    // inclusive no Safari/iOS, apesar da captura do canvas ser assíncrona.
    const outcome = await deliverArPhoto(preparedPhoto.value, {
      name: props.photoMeta.name,
      forceDownload,
    })
    if (outcome === 'shared') photoFeedback.value = 'Foto enviada para compartilhar!'
    if (outcome === 'downloaded') photoFeedback.value = 'Foto baixada com sucesso!'
    if (outcome !== 'cancelled') metrics.track('foto_ar', { metadata: { delivery: outcome } })
  } catch (error) {
    photoFeedback.value = error?.message ?? 'Não foi possível entregar a foto.'
  }
}

function downloadPhoto() {
  if (preparedPhoto.value) return deliverPreparedPhoto(true)
  return capturePhoto(true)
}
</script>

<style scoped>
.ar-viewer {
  position: relative;
  width: 100%;
  height: 100%;
  border-radius: 16px;
  overflow: hidden;
  background: var(--bg-deep);
}

.ar-viewer__canvas {
  width: 100%;
  height: 100%;
  --poster-color: transparent;
}

.ar-photo-actions {
  position: absolute;
  right: 12px;
  bottom: 12px;
  z-index: 7;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ar-photo-button {
  min-width: 108px;
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 0 12px;
  border: 2px solid var(--unifil-gold);
  border-radius: 999px;
  background: rgba(18, 20, 24, 0.9);
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 800;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35);
}

.ar-photo-button--download {
  border-color: rgba(255, 255, 255, 0.5);
}

.ar-photo-button--share {
  border-color: #8ce99a;
}

.ar-photo-button:disabled {
  opacity: 0.55;
}

.ar-photo-feedback {
  position: absolute;
  top: 12px;
  right: 12px;
  left: 12px;
  z-index: 8;
  margin: 0;
  padding: 10px 12px;
  border: 1px solid var(--unifil-gold);
  border-radius: 10px;
  background: rgba(18, 20, 24, 0.92);
  color: var(--text-primary);
  font-size: 12px;
  line-height: 1.4;
  text-align: center;
}

.ar-loading {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  background: rgba(26, 26, 26, 0.92);
  z-index: 10;
  font-size: 14px;
  color: var(--text-muted);
}

.ar-loading__spinner {
  width: 36px;
  height: 36px;
  border: 3px solid var(--surface-border);
  border-top-color: var(--unifil-gold);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.ar-button-wrapper {
  display: flex;
  justify-content: center;
}

.ar-button {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  background: var(--surface);
  color: var(--text-primary);
  border: none;
  border-radius: 100px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s, transform 0.15s;
}

.ar-button:hover:not(:disabled) {
  background: var(--unifil-orange);
  transform: translateY(-1px);
}

.ar-button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.hotspot {
  position: relative;
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
}

.hotspot__dot {
  display: block;
  width: 16px;
  height: 16px;
  background: var(--surface);
  border: 2px solid var(--surface-border);
  border-radius: 50%;
  transition: transform 0.2s;
}

.hotspot--active .hotspot__dot,
.hotspot:hover .hotspot__dot {
  transform: scale(1.3);
  background: var(--unifil-orange);
}

.hotspot__tooltip {
  position: absolute;
  bottom: calc(100% + 10px);
  left: 50%;
  transform: translateX(-50%);
  background: var(--surface);
  border: 1px solid var(--surface-border);
  border-radius: 10px;
  padding: 10px 14px;
  min-width: 160px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
  text-align: left;
  z-index: 20;
}

.hotspot__tooltip strong {
  display: block;
  font-size: 13px;
  color: var(--text-primary);
  margin-bottom: 4px;
}

.hotspot__tooltip p {
  font-size: 12px;
  color: var(--text-muted);
  margin: 0;
  line-height: 1.4;
}

.hotspot__close {
  position: absolute;
  top: 6px;
  right: 8px;
  background: none;
  border: none;
  font-size: 11px;
  color: var(--text-muted);
  cursor: pointer;
}

.ar-status-badge {
  position: absolute;
  top: 16px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(0, 0, 0, 0.7);
  color: var(--text-primary);
  font-size: 13px;
  padding: 6px 14px;
  border-radius: 100px;
}

.ar-status-badge__dot {
  width: 8px;
  height: 8px;
  background: var(--success-bg);
  color: var(--success-text);
  border-radius: 50%;
  animation: pulse 1.5s infinite;
}

.ar-message {
  position: absolute;
  right: 12px;
  bottom: 12px;
  left: 12px;
  padding: 10px 12px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 10px;
  background: rgba(17, 17, 17, 0.86);
  color: var(--text-primary);
  font-size: 12px;
  line-height: 1.4;
  text-align: center;
  z-index: 5;
}

.ar-message--error {
  border-color: rgba(255, 90, 90, 0.55);
}

@keyframes pulse {

  0%,
  100% {
    opacity: 1;
  }

  50% {
    opacity: 0.4;
  }
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.25s;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.tooltip-enter-active,
.tooltip-leave-active {
  transition: opacity 0.15s, transform 0.15s;
}

.tooltip-enter-from,
.tooltip-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(4px);
}
</style>
