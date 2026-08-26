<script setup>defineProps({ title: { type: String, default: 'NADA POR AQUI' }, message: { type: String, default: '' } })</script>
<template><div class="empty"><span aria-hidden="true">◇</span><h2 class="pixel">{{ title }}</h2><p>{{ message }}</p><slot/></div></template>
<style scoped>.empty{min-height:220px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:24px;color:var(--text-muted);text-align:center}.empty>span{font-size:36px;color:var(--unifil-gold)}.empty h2{font-size:9px}.empty p{font-size:13px;line-height:1.5}</style>
