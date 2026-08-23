<script setup>
import { battleVideo } from '@/content/copy.js'
import SectionShell from '@/components/SectionShell.vue'
import { useReveal } from '@/composables/useReveal.js'

// PONTO DE INTEGRAÇÃO — leia isto antes de ligar o vídeo de verdade.
//
// O arquivo ainda não existe, então esta seção é só o encaixe: moldura no
// formato de story (9:16), botão de play, badge de status e barra de
// controle já no padrão pixelado da casa. Quando o vídeo chegar:
//
//   1. Suba o arquivo (ideal: .mp4 + .webm, com poster em pixel art) e
//      registre a URL em src/config/links.js — o mesmo lugar de todo link
//      que sai da página —, nunca digitada aqui direto. Se o arquivo ficar
//      em public/, o caminho tem de passar por `asset()` (src/config/asset.js):
//      a página vive sob o prefixo /landing/, e um "/video.mp4" cravado
//      apontaria para a raiz do domínio, onde mora o app.
//   2. Troque a <div class="video-frame__placeholder"> abaixo por um
//      <video :poster="..." muted playsinline>, mantendo a MESMA classe no
//      wrapper (video-frame) para herdar moldura, aspect-ratio e o frame do
//      GBA de graça.
//   3. O botão de play e a barra de progresso já existem e já são clicáveis
//      na marcação — estão só com `disabled`/`aria-disabled` e sem handler.
//      Basta remover o estado desabilitado e ligar o `@click` real
//      (play/pause) e o `v-model`/`@timeupdate` da barra.
//   4. Tire o `battleVideo.badge` ("Em breve") do copy.js quando publicar.
const { el } = useReveal()
</script>

<template>
  <SectionShell :kicker="battleVideo.kicker" :title="battleVideo.title">
    <template #lede>{{ battleVideo.desc }}</template>

    <div ref="el" class="video-showcase">
      <div class="video-frame gba-frame">
        <p class="video-frame__badge">{{ battleVideo.badge }}</p>

        <!-- Troque este bloco por <video> quando o arquivo existir — ver a
             nota de integração no <script> acima. -->
        <div class="video-frame__placeholder">
          <div class="video-frame__scanlines" aria-hidden="true" />

          <button
            type="button"
            class="video-frame__play"
            disabled
            aria-disabled="true"
            :aria-label="battleVideo.playLabel"
          >
            <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true" focusable="false">
              <path d="M6 3l16 9-16 9V3z" fill="currentColor" />
            </svg>
          </button>
        </div>

        <div class="video-frame__controls">
          <button type="button" class="video-frame__icon-btn" disabled aria-disabled="true" aria-label="Reproduzir">
            <svg
              viewBox="0 0 24 24"
              width="14"
              height="14"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="square"
              stroke-linejoin="miter"
              aria-hidden="true"
              focusable="false"
            >
              <path d="M6 3l14 9-14 9V3z" fill="currentColor" stroke="none" />
            </svg>
          </button>

          <div class="video-frame__track" role="img" aria-label="Progresso do vídeo, 0%">
            <span class="video-frame__track-fill" />
          </div>

          <button type="button" class="video-frame__icon-btn" disabled aria-disabled="true" aria-label="Som">
            <svg
              viewBox="0 0 24 24"
              width="14"
              height="14"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="square"
              stroke-linejoin="miter"
              aria-hidden="true"
              focusable="false"
            >
              <path d="M4 9v6h4l6 5V4l-6 5H4z" fill="currentColor" stroke="none" />
              <path d="M17 9c1.2 1 1.2 5 0 6" />
            </svg>
          </button>

          <button
            type="button"
            class="video-frame__icon-btn"
            disabled
            aria-disabled="true"
            aria-label="Tela cheia"
          >
            <svg
              viewBox="0 0 24 24"
              width="14"
              height="14"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="square"
              stroke-linejoin="miter"
              aria-hidden="true"
              focusable="false"
            >
              <path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" />
            </svg>
          </button>
        </div>
      </div>

      <p class="video-showcase__caption">{{ battleVideo.placeholder }}</p>
    </div>
  </SectionShell>
</template>

<style scoped>
.video-showcase {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
}

/* Formato de story: 9:16, a mesma proporção do vídeo que vai entrar aqui —
   assim o layout já reserva o espaço certo e não pula quando o arquivo
   chegar. Largura travada em 320px: maior que isso e um vídeo vertical vira
   uma coluna estreita cercada de vão morto nas laterais. */
.video-frame {
  position: relative;
  width: min(100%, 320px);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.video-frame__badge {
  position: absolute;
  top: calc(-1 * var(--space-2));
  right: var(--space-3);
  padding: 4px 8px;
  background: var(--bg-deep);
  border: 2px solid var(--unifil-gold);
  border-radius: var(--radius);
  font-family: var(--font-pixel);
  font-size: 9px;
  color: var(--unifil-gold);
  letter-spacing: 0.5px;
  z-index: 1;
}

.video-frame__placeholder {
  position: relative;
  aspect-ratio: 9 / 16;
  display: grid;
  place-items: center;
  background: var(--bg-deep);
  border: 2px solid var(--surface-border);
  border-radius: var(--radius);
  overflow: hidden;
}

/* Textura de tela desligada — não é decoração gratuita, é o que diferencia
   "ainda não tem vídeo" de "vídeo quebrado". Mesma linguagem de scanline dos
   frames de TV/GBA, só que discreta o bastante para não competir com o
   ícone de play quando ele estiver por cima. */
.video-frame__scanlines {
  position: absolute;
  inset: 0;
  background: repeating-linear-gradient(
    to bottom,
    rgb(255 255 255 / 3%) 0 1px,
    transparent 1px 4px
  );
}

.video-frame__play {
  position: relative;
  z-index: 1;
  display: grid;
  place-items: center;
  width: 64px;
  height: 64px;
  padding: 0;
  padding-left: 4px;
  background: var(--unifil-orange);
  border: 3px solid var(--surface-border);
  box-shadow:
    inset -3px -3px 0 var(--surface-border),
    inset 3px 3px 0 var(--unifil-gold);
  border-radius: 0;
  color: var(--text-primary);
  cursor: not-allowed;
}

/* Estado desabilitado de verdade: o bisel de "botão físico" some, porque um
   controle que ninguém pode apertar não deveria prometer o clique. Volta
   sozinho quando o `disabled` sair da marcação, no dia em que o vídeo
   entrar. */
.video-frame__play:disabled {
  opacity: 0.55;
  box-shadow: none;
}

.video-frame__controls {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.video-frame__icon-btn {
  flex-shrink: 0;
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  padding: 0;
  background: var(--surface);
  border: 2px solid var(--surface-border);
  border-radius: var(--radius);
  color: var(--text-muted);
  cursor: not-allowed;
}

.video-frame__icon-btn:disabled {
  opacity: 0.6;
}

.video-frame__track {
  flex: 1;
  height: 8px;
  background: var(--bg-deep);
  border: 2px solid var(--surface-border);
  border-radius: 2px;
  overflow: hidden;
}

.video-frame__track-fill {
  display: block;
  height: 100%;
  width: 0%;
  background: var(--unifil-gold);
}

.video-showcase__caption {
  /* Largura em px, não em `ch`: a legenda deve ficar tão estreita quanto o
     próprio quadro do vídeo acima dela — um teto em caracteres, calibrado
     para outra fonte, é o mesmo erro que soltou o texto das outras seções. */
  max-width: 340px;
  text-align: center;
  font-size: var(--fs-body-sm);
  color: var(--text-muted);
}
</style>
