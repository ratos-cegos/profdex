<script setup>
// O retrato de um professor, com o fallback que todo uso precisa: nem todo
// professor do banco tem arte pronta, e um <img> quebrado no meio da seleção de
// time é pior do que um espaço vazio.
//
// Existia como o mesmo trecho repetido nove vezes entre a seleção, o preview, o
// banco de reservas e a ficha — cada cópia com o seu próprio `@error` inline.
//
// Recebe o PROFESSOR inteiro (e não o slug) desde a tarefa 13: a arte deixou de
// ser montada por convenção de nome de arquivo e passou a vir do banco.
import { computed } from 'vue'
import { spriteFrenteDe } from '../data/professorArte.js'

const props = defineProps({
  professor: { type: Object, required: true },
})

// O rosto e o cartoon caíram para a sprite de frente: são três arquivos da
// mesma pessoa, e exigir três uploads por professor multiplicava o trabalho do
// cadastro sem mudar o que o aluno vê num avatar de 40px.
const src = computed(() => spriteFrenteDe(props.professor))

// `visibility` e não `display`: o espaço reservado continua ocupado, então a
// grade não se reorganiza quando uma arte falta.
function esconder(event) {
  event.currentTarget.style.visibility = 'hidden'
}
</script>

<template>
  <img :src="src" :alt="professor.name" decoding="async" @error="esconder" />
</template>
