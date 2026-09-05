<script setup>
// O retrato de um professor, com o fallback que todo uso precisa: nem todo
// professor do banco tem arte pronta, e um <img> quebrado no meio da seleção de
// time é pior do que um espaço vazio.
//
// Existia como o mesmo trecho repetido nove vezes entre a seleção, o preview, o
// banco de reservas e a ficha — cada cópia com o seu próprio `@error` inline.
defineProps({
  slug: { type: String, required: true },
  name: { type: String, default: '' },
})

// `visibility` e não `display`: o espaço reservado continua ocupado, então a
// grade não se reorganiza quando uma arte falta.
function esconder(event) {
  event.currentTarget.style.visibility = 'hidden'
}
</script>

<template>
  <img :src="`/professors/${slug}-face.png`" :alt="name" decoding="async" @error="esconder" />
</template>
