<script setup>
import TypeIcon from './TypeIcon.vue'
import { typeInfos } from '../data/professorTypes'

// As etiquetas de tipo de um exemplar. Os tipos são a informação que sustenta
// toda decisão da batalha (a roda de vantagens), então aparecem na seleção, no
// preview e na ficha — e apareciam como o mesmo bloco copiado em cada uma.
defineProps({
  types: { type: Array, default: () => [] },
  size: { type: Number, default: 12 },
  // Prop e não classe de fora: um `justify-content` vindo do pai teria a mesma
  // especificidade do `scoped` daqui, e quem venceria dependeria da ordem de
  // importação dos estilos — que ninguém controla ao mexer na tela.
  align: {
    type: String,
    default: 'center',
    validator: (v) => ['center', 'start'].includes(v),
  },
})
</script>

<template>
  <span class="badges" :class="`badges--${align}`">
    <span
      v-for="t in typeInfos(types)"
      :key="t.id"
      class="badges__item"
      :style="{ background: t.color }"
    >
      <TypeIcon :type="t.id" :size="size" />
      {{ t.label }}
    </span>
  </span>
</template>

<style scoped>
.badges {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.badges--center {
  justify-content: center;
}

.badges--start {
  justify-content: flex-start;
}

.badges__item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 999px;
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  text-shadow: 1px 1px 0 rgba(0, 0, 0, 0.35);
}
</style>
