<script setup>
import { ref } from 'vue'

const props = defineProps({
  professor: {
    type: Object,
    required: true,
  },
  index: {
    type: Number,
    required: true,
  },
})

const emit = defineEmits(['details'])

const imgError = ref(false)
const cartoonSrc = `/professors/${props.professor.slug}-cartoon.png`
</script>

<template>
  <div
    class="prof-card"
    :class="{
      'prof-card--captured': professor.captured,
      'prof-card--discovered': professor.discovered && !professor.captured,
      'prof-card--unknown': !professor.discovered,
    }"
  >
    <div class="prof-card__inner">
      <div class="prof-card__num pixel">
        #{{ String(index + 1).padStart(3, '0') }}
      </div>

      <component
        :is="professor.captured ? 'button' : 'div'"
        class="prof-card__avatar"
        :class="{ 'prof-card__avatar--clickable': professor.captured }"
        :type="professor.captured ? 'button' : undefined"
        :aria-label="professor.captured ? `Ver ficha de ${professor.name}` : undefined"
        @click="professor.captured && emit('details', professor)"
      >
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
      </component>

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
  </div>
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

/* Avatar de professor liberado vira botão para abrir a ficha */
.prof-card__avatar--clickable {
  background: transparent;
  padding: 0;
  border: none;
  border-radius: 50%;
  transition: transform 0.15s ease, filter 0.15s ease;
}

.prof-card__avatar--clickable:hover {
  transform: scale(1.06);
  filter: brightness(1.08);
}

.prof-card__avatar--clickable:active {
  transform: scale(0.97);
}

.avatar-img {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  object-fit: cover;
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
