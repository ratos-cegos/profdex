<script setup>
// As pílulas de efeito ativo de um lado do palco: status, estágios de atributo
// e escudo.
//
// Por que fora do `BattleHpBar` e posicionado em cima dele: a altura do painel é
// um TOKEN global (`--palco-barra-altura`, em style.css), calculado a partir das
// três linhas que ele tem. Uma quarta linha mudaria o token, e o token é o que
// posiciona tudo que se ancora na barra. O comentário dele já dizia que existe
// "para o chip de status poder ser empilhado ACIMA da barra" — este é o chip, em
// plural.
//
// Absoluto e `pointer-events: none`: não entra no fluxo, não muda a altura de
// nada e não rouba toque dos botões de golpe.

defineProps({
  /** `[{ id, rotulo, tom }]` — ver `data/battle-efeitos.js`. */
  efeitos: { type: Array, default: () => [] },
})
</script>

<template>
  <div v-if="efeitos.length" class="efeitos" aria-live="polite">
    <span
      v-for="efeito in efeitos"
      :key="efeito.id"
      class="pixel efeitos__chip"
      :class="`efeitos__chip--${efeito.tom}`"
    >
      {{ efeito.rotulo }}
    </span>
  </div>
</template>

<style scoped>
.efeitos {
  position: absolute;
  z-index: 3;
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
  /* Não rouba o toque: o palco inteiro fica embaixo dos botões de golpe. */
  pointer-events: none;
}

.efeitos__chip {
  padding: 2px 5px;
  border-radius: 100px;
  font-size: 6px;
  line-height: 1.5;
  white-space: nowrap;
  background: rgba(0, 0, 0, 0.72);
  border: 1px solid currentColor;
}

/* Bom e ruim do ponto de vista de QUEM TEM o efeito, e a mesma cor nos dois
   lados: o chip do treino era vermelho fixo, então um buff de ataque e uma
   paralisia apareciam iguais. */
.efeitos__chip--bom {
  color: var(--ds-green-glow);
}

.efeitos__chip--ruim {
  color: var(--error);
}
</style>
