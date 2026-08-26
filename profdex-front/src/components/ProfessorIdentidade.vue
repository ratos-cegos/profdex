<script setup>
defineProps({ description: String, stats: Array })
defineEmits(['open-ar'])
</script>
<template><div class="about"><section class="about__card"><h2 class="pixel">SOBRE</h2><p>{{ description }}</p></section><section class="about__card"><h2 class="pixel">ATRIBUTOS BASE</h2><ul class="stats"><li v-for="stat in stats" :key="stat.key"><span class="pixel">{{ stat.label }}</span><div><i :style="{ width: `${(stat.value / stat.max) * 100}%`, background: stat.color }" /></div><b>{{ stat.value }}</b></li></ul></section><button class="about__ar pixel" type="button" @click="$emit('open-ar')">VER EM RA</button></div></template>
<style scoped>
.about{display:grid;gap:14px;padding:16px}.about__card{padding:16px;border:2px solid var(--border);border-radius:var(--radius-lg);background:var(--surface)}.about h2{margin-bottom:12px;color:var(--unifil-gold);font-size:8px}.about p{color:var(--text-muted);font-size:13px;line-height:1.65}.stats{display:grid;gap:10px;list-style:none}.stats li{display:grid;grid-template-columns:72px 1fr 32px;align-items:center;gap:8px}.stats span{color:var(--text-muted);font-size:6px}.stats div{height:8px;overflow:hidden;border-radius:4px;background:var(--bg-deep)}.stats i{display:block;height:100%}.stats b{font-size:11px;text-align:right}.about__ar{min-height:48px;border:2px solid var(--unifil-gold);border-radius:var(--radius);background:var(--unifil-orange);color:white;font-size:8px}
</style>
