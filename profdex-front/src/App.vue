<script setup>
import AvisoAtualizacao from './components/AvisoAtualizacao.vue'
</script>

<template>
  <!-- `mode="out-in"` evita as duas telas empilhadas durante a troca: como cada
       view desenha o próprio cabeçalho e a própria barra inferior, sobrepô-las
       faria a navegação piscar duplicada. -->
  <RouterView v-slot="{ Component }">
    <Transition name="tela" mode="out-in">
      <component :is="Component" />
    </Transition>
  </RouterView>

  <!-- Fora do RouterView: a atualização pode chegar em qualquer tela, e o aviso
       não pode sumir na transição de rota. -->
  <AvisoAtualizacao />
</template>
