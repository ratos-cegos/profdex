<script setup>
import { ref } from 'vue'
import StarRating from './StarRating.vue'
import { IV_MAX } from '../data/professorAtributos.js'

defineProps({
  description: String,
  stats: Array,
  /** De onde os atributos saíram. `null` = o aluno ainda não tem um exemplar. */
  exemplar: { type: Object, default: null },
  sprite: String,
  spriteAlt: String,
  pixelArt: Boolean,
})
defineEmits(['open-ar'])

const spriteErro = ref(false)
// Três dos quatro atributos saem fracionados do motor (o bônus de IV é /15×5).
const numero = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 })
const formatar = (value) => numero.format(value)
</script>
<template>
  <div class="about">
    <section class="about__card">
      <h2 class="pixel">SOBRE</h2>
      <p>{{ description }}</p>
    </section>
    <section class="about__card">
      <h2 class="pixel">ATRIBUTOS</h2>
      <div class="exemplar">
        <span class="pixel">{{ exemplar ? 'MELHOR EXEMPLAR' : 'SEM EXEMPLAR' }}</span>
        <StarRating v-if="exemplar" :value="exemplar.stars" />
      </div>
      <p class="hint">
        {{
          exemplar
            ? `A barra é o IV do exemplar (0 a ${IV_MAX}); o número é o atributo dele em batalha.`
            : 'Você ainda não capturou este professor. Abaixo está o chassi de quem nasce sem IV.'
        }}
      </p>
      <ul class="stats">
        <li v-for="stat in stats" :key="stat.key">
          <span class="pixel">{{ stat.label }}</span>
          <div>
            <i :style="{ width: `${stat.fill * 100}%`, background: stat.color }" />
          </div>
          <b>{{ formatar(stat.value) }}</b>
        </li>
      </ul>
      <!-- A arte INTEIRA, não o recorte circular do cabeçalho: é o mesmo sprite
           que entra na arena, e a ficha é onde dá para olhar para ele. -->
      <figure v-if="sprite && !spriteErro" class="art">
        <img
          :src="sprite"
          :alt="spriteAlt"
          :class="{ 'art--pixel': pixelArt }"
          @error="spriteErro = true"
        />
      </figure>
    </section>
    <button class="about__ar pixel" type="button" @click="$emit('open-ar')">VER EM RA</button>
  </div>
</template>
<style scoped>
.about {
  display: grid;
  gap: 14px;
  padding: 16px;
}
.about__card {
  padding: 16px;
  border: 2px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface);
}
.about h2 {
  margin-bottom: 12px;
  color: var(--unifil-gold);
  font-size: 8px;
}
.about p {
  color: var(--text-muted);
  font-size: 13px;
  line-height: 1.65;
}
.exemplar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}
/* `> span.pixel`, não `span`: o nó raiz do StarRating é um span filho direto
   daqui e recebe o atributo de escopo DESTE componente — um seletor de elemento
   pintaria as estrelas vazias de dourado (mesmo tropeço de
   ProfessorExemplares). */
.exemplar > span.pixel {
  color: var(--unifil-gold);
  font-size: 7px;
}
/* `.about .hint`, não `.hint`: `.about p` acima é mais específico e ganharia o
   font-size, deixando a dica do mesmo tamanho do texto de SOBRE. */
.about .hint {
  margin-bottom: 12px;
  font-size: 11px;
}
.stats {
  display: grid;
  gap: 10px;
  list-style: none;
}
.stats li {
  display: grid;
  /* 44px na última coluna: o atributo sai fracionado ("102,3"), e 32px cortava. */
  grid-template-columns: 72px 1fr 44px;
  align-items: center;
  gap: 8px;
}
.stats span {
  color: var(--text-muted);
  font-size: 6px;
}
.stats div {
  height: 8px;
  overflow: hidden;
  border-radius: 4px;
  background: var(--bg-deep);
}
.stats i {
  display: block;
  height: 100%;
}
.stats b {
  font-size: 11px;
  text-align: right;
}
.art {
  margin-top: 14px;
  display: grid;
  place-items: center;
  padding: 12px;
  border-radius: var(--radius);
  background: var(--bg-deep);
}
/* `contain` e altura limitada: a arte tem proporções diferentes por professor,
   e o que não pode acontecer é ela ser cortada (o cabeçalho já faz isso) nem
   empurrar os atributos para fora da tela num celular. */
.art img {
  width: 100%;
  max-height: 260px;
  display: block;
  object-fit: contain;
}
.art--pixel {
  image-rendering: pixelated;
}
.about__ar {
  min-height: 48px;
  border: 2px solid var(--unifil-gold);
  border-radius: var(--radius);
  background: var(--unifil-orange);
  color: white;
  font-size: 8px;
}
</style>
