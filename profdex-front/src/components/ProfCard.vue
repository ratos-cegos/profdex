<script setup>
import { computed, ref } from 'vue'
import { spriteFrenteDe } from '../data/professorArte.js'

const props = defineProps({
  professor: {
    type: Object,
    required: true,
  },
  index: {
    type: Number,
    required: true,
  },
  /**
   * Professor raro (tarefa 15). Puramente cosmético — selo ✦ e moldura
   * dourada. O raro NÃO é mecanicamente mais forte: variante, deck e IVs saem
   * do mesmo sorteio, porque o PvP é ranqueado por Elo e um raro superior faria
   * o ranking medir quem respondeu quiz, não quem joga melhor (decisão 13).
   */
  rare: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['details'])

const imgError = ref(false)
// A arte vem do professor (banco), não de uma convenção de nome de arquivo:
// o cartoon e o rosto caíram para a sprite de frente na tarefa 13.
const cartoonSrc = computed(() => spriteFrenteDe(props.professor))
</script>

<template>
  <!-- O card INTEIRO abre a ficha, não só a foto: numa grade de celular o
       alvo de toque era o círculo de 64px, e tocar no nome ou no status não
       fazia nada. Só o capturado é botão — os outros não têm ficha a abrir. -->
  <component
    :is="professor.captured ? 'button' : 'div'"
    class="prof-card"
    :class="{
      'prof-card--captured': professor.captured,
      'prof-card--discovered': professor.discovered && !professor.captured,
      'prof-card--unknown': !professor.discovered,
      'prof-card--rare': rare,
    }"
    :type="professor.captured ? 'button' : undefined"
    :aria-label="professor.captured ? `Ver ficha de ${professor.name}` : undefined"
    @click="professor.captured && emit('details', professor)"
  >
    <div class="prof-card__inner">
      <div class="prof-card__num pixel">
        <span v-if="rare" class="prof-card__selo" title="Professor raro">✦</span>
        <template v-else>#{{ String(index + 1).padStart(3, '0') }}</template>
      </div>

      <div class="prof-card__avatar">
        <template v-if="professor.captured">
          <img
            v-if="!imgError"
            :src="cartoonSrc"
            :alt="professor.name"
            class="avatar-img"
            @error="imgError = true"
          />
          <div v-else class="avatar-fallback">
            {{ professor.name[0] }}
          </div>
          <div class="captured-badge">✓</div>
        </template>

        <template v-else-if="professor.discovered">
          <div class="avatar-silhouette" aria-label="Professor descoberto">
            <span class="avatar-person" aria-hidden="true" />
          </div>
          <div class="discovered-badge">!</div>
        </template>

        <template v-else>
          <div class="avatar-unknown" aria-label="Professor ainda não descoberto">
            <span class="avatar-person avatar-person--unknown" aria-hidden="true" />
            <span class="unknown-badge pixel" aria-hidden="true">?</span>
          </div>
        </template>
      </div>

      <div class="prof-card__name">
        <span v-if="professor.captured">{{ professor.name }}</span>
        <span v-else-if="professor.discovered">{{ professor.name }}</span>
        <span v-else class="pixel" style="font-size: 8px; color: var(--text-muted)">???</span>
      </div>

      <div class="prof-card__status pixel">
        <!-- Vários exemplares do mesmo professor: cada ficha de QR resgatada
             traz uma combinação de tipos e um deck próprios. -->
        <span v-if="professor.capturedCount > 1" class="status-captured">
          ×{{ professor.capturedCount }} CAPTURADOS
        </span>
        <span v-else-if="professor.captured" class="status-captured">CAPTURADO</span>
        <span v-else-if="professor.discovered" class="status-discovered">ENCONTRADO</span>
        <span v-else class="status-unknown">???</span>
      </div>
    </div>
  </component>
</template>

<style scoped>
.prof-card {
  border-radius: var(--radius-lg);
  border: 2px solid var(--border);
  background: var(--bg-card);
  overflow: hidden;
  transition: transform 0.15s, border-color 0.15s, box-shadow 0.15s;
}

.prof-card--captured {
  border-color: var(--success-text);
}

/* Raro: moldura dourada que vence a verde de "capturado". A diferença é só
   cosmética — em batalha ele é um exemplar como qualquer outro. */
.prof-card--rare {
  border-color: var(--raro);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--raro) 35%, transparent);
}

.prof-card__selo {
  color: var(--raro);
  font-size: 11px;
}

.prof-card__inner {
  padding: 14px 10px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.prof-card__num {
  font-size: 7px;
  color: var(--text-muted);
  align-self: flex-start;
}

.prof-card--captured .prof-card__num {
  color: var(--yellow);
}

.prof-card__avatar {
  width: 72px;
  height: 72px;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Card de professor capturado é o botão que abre a ficha. O reset devolve o
   que o <button> tira: largura da célula da grade, cor e alinhamento do texto. */
button.prof-card {
  display: block;
  width: 100%;
  padding: 0;
  color: inherit;
  text-align: inherit;
  font: inherit;
}

button.prof-card:hover {
  transform: translateY(-2px);
}

button.prof-card:active {
  transform: scale(0.97);
}

button.prof-card:focus-visible {
  outline: 2px solid var(--yellow);
  outline-offset: 2px;
}

.avatar-img {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  object-fit: cover;
  /* Ancorado no TOPO, não no centro. Desde que a arte passou a vir do cadastro
     (tarefa 13), a sprite de frente é o professor de CORPO INTEIRO — a da
     Tânia tem 289×600. Num círculo de 64px, `cover` centralizado recorta
     justamente a faixa do meio e entrega um avatar de tronco, sem rosto.
     Nos cartoons quase quadrados (Mário, Eron) não há corte vertical, então
     isto não muda nada para eles. */
  object-position: top;
  border: 2px solid var(--yellow);
}

.avatar-fallback {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 900;
  font-size: 28px;
  background: var(--unifil-orange);
  color: var(--text-primary);
  text-shadow: 1px 1px 0 rgba(0,0,0,0.3);
  border: 2px solid var(--yellow);
}

.avatar-silhouette {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: var(--surface);
  border: 2px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: center;
}

.avatar-unknown {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: var(--surface);
  border: 2px dashed var(--border);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
}

.avatar-person {
  position: relative;
  width: 38px;
  height: 42px;
  opacity: 0.72;
}

.avatar-person::before {
  content: '';
  position: absolute;
  top: 1px;
  left: 50%;
  width: 17px;
  height: 17px;
  border-radius: 50%;
  background: var(--text-muted);
  transform: translateX(-50%);
}

.avatar-person::after {
  content: '';
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  height: 22px;
  border-radius: 18px 18px 8px 8px;
  background: var(--text-muted);
}

.avatar-person--unknown {
  opacity: 0.34;
}

.unknown-badge {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 22px;
  height: 22px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--bg-surface);
  color: var(--yellow);
  border: 2px solid var(--border);
  font-size: 10px;
}

.captured-badge {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 22px;
  height: 22px;
  background: var(--success-bg);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  color: var(--success-text);
  border: 1px solid var(--success-text);
  font-weight: 900;
}

.discovered-badge {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 22px;
  height: 22px;
  background: var(--red);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  color: white;
  font-weight: 900;
  animation: pulse 1.5s ease-in-out infinite;
}

.prof-card__name {
  font-size: 12px;
  font-weight: 700;
  text-align: center;
  min-height: 18px;
}


.prof-card__status {
  font-size: 7px;
  letter-spacing: 0.5px;
}

.status-captured { color: var(--success-text); }
.status-discovered { color: var(--red-light); }
.status-unknown { color: var(--text-muted); }

</style>
