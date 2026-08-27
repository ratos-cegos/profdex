<script setup>
defineProps({ message: { type: String, default: 'Não foi possível carregar os dados.' } })
defineEmits(['retry'])
</script>
<template>
  <div class="state" role="alert">
    <span class="pixel state__icon">!</span>
    <h2 class="pixel">SEM CONEXÃO</h2>
    <p>{{ message }}</p>
    <button class="btn btn-primary" type="button" @click="$emit('retry')">
      <span class="pixel">TENTAR NOVAMENTE</span>
    </button>
  </div>
</template>
<style scoped>
.state {
  min-height: 260px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 24px;
  text-align: center;
}
.state__icon {
  width: 48px;
  height: 48px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--error);
  color: white;
}
.state h2 {
  font-size: 9px;
}
.state p {
  max-width: 320px;
  color: var(--text-muted);
  font-size: 13px;
  line-height: 1.5;
}
.state button {
  max-width: 300px;
}
</style>
