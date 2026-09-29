<script setup>
import PixelIcon from './PixelIcon.vue'
import { useAvisosStore } from '../stores/avisos'

// Aviso curto do ecossistema de batalha (stores/avisos.js): cooldown,
// bloqueio, recusa do rival, falha de conexão. Mesma linguagem da pilha de
// desafios, logo abaixo dela; some sozinho, fecha no toque e nunca bloqueia
// a tela.
const avisos = useAvisosStore()
</script>

<template>
  <TransitionGroup tag="div" name="aviso" class="avisos" role="status" aria-live="polite">
    <button
      v-for="aviso in avisos.avisos"
      :key="aviso.id"
      class="aviso"
      :class="`aviso--${aviso.tipo}`"
      type="button"
      :style="{ '--duracao': `${aviso.duracao}ms` }"
      :aria-label="`${aviso.texto} Tocar para fechar.`"
      @click="avisos.fechar(aviso.id)"
    >
      <PixelIcon class="aviso__icone" :nome="aviso.icone" :escala="2" />
      <span class="aviso__texto">
        <span class="pixel aviso__titulo">{{ aviso.titulo }}</span>
        <span>{{ aviso.texto }}</span>
      </span>
      <PixelIcon class="aviso__fechar" nome="fechar" :escala="1" />
      <span class="aviso__tempo" aria-hidden="true" />
    </button>
  </TransitionGroup>
</template>

<style scoped>
.avisos {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.aviso {
  --cor: var(--error);
  position: relative;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 12px 12px;
  overflow: hidden;
  pointer-events: auto;
  border: 3px solid var(--cor);
  border-radius: 4px;
  background: var(--surface);
  box-shadow:
    inset 2px 2px 0 color-mix(in srgb, var(--cor) 45%, transparent),
    0 8px 18px rgb(0 0 0 / 45%);
  color: var(--text-primary);
  font-family: var(--font-body);
  font-size: 13px;
  line-height: 1.35;
  text-align: left;
}

.aviso--espera {
  --cor: var(--unifil-gold);
}

.aviso--bloqueado {
  --cor: var(--silver-hi);
}

.aviso--info {
  --cor: var(--unifil-orange);
}

.aviso:focus-visible {
  outline: 3px solid var(--unifil-gold);
  outline-offset: 2px;
}

.aviso__texto {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  overflow-wrap: anywhere;
}

.aviso__titulo {
  color: var(--cor);
  font-size: 8px;
}

.aviso__fechar {
  color: var(--text-muted);
}

/* Quanto falta para o aviso sumir: uma régua que encolhe em quadros. */
.aviso__tempo {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 3px;
  background: var(--cor);
  transform-origin: left;
}

@media (prefers-reduced-motion: no-preference) {
  .aviso__tempo {
    animation: aviso-tempo var(--duracao) steps(10, end) forwards;
  }

  .aviso-enter-active,
  .aviso-leave-active {
    transition:
      transform var(--dur-base) var(--ease-pixel),
      opacity var(--dur-base) steps(3, end);
  }

  .aviso-enter-from {
    transform: translateY(-10px);
    opacity: 0;
  }

  .aviso-leave-to {
    transform: translateX(40%);
    opacity: 0;
  }

  .aviso-move {
    transition: transform var(--dur-base) var(--ease-pixel);
  }
}

@keyframes aviso-tempo {
  to {
    transform: scaleX(0);
  }
}
</style>
