<script setup>
defineProps({ title: { type: String, required: true }, subtitle: { type: String, default: '' } })
</script>
<template>
  <header class="app-header">
    <slot name="left" />
    <div>
      <span v-if="subtitle" class="pixel app-header__subtitle">{{ subtitle }}</span>
      <h1 class="pixel">{{ title }}</h1>
    </div>
    <span class="app-header__right"
      ><slot name="right" /><img
        class="app-header__brand"
        src="/marca/logotipo-branco.png"
        alt="UNIFIL"
    /></span>
  </header>
</template>
<style scoped>
.app-header {
  flex: 0 0 auto;
  min-height: 84px;
  display: grid;
  grid-template-columns: minmax(44px, auto) 1fr minmax(68px, auto);
  align-items: center;
  gap: 12px;
  padding: calc(12px + env(safe-area-inset-top)) 16px 14px;
  background: linear-gradient(160deg, var(--surface-border), var(--unifil-orange));
  color: white;
}
.app-header > div {
  min-width: 0;
}
.app-header h1 {
  overflow: hidden;
  font-size: 17px;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.app-header__subtitle {
  display: block;
  margin-bottom: 5px;
  color: var(--unifil-gold);
  font-size: 7px;
}
.app-header__right {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}
.app-header__brand {
  width: 68px;
  height: auto;
  filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.24));
}
@media (max-width: 360px) {
  .app-header {
    grid-template-columns: minmax(44px, auto) 1fr 56px;
    gap: 8px;
  }
  .app-header__brand {
    width: 56px;
  }
}
</style>
