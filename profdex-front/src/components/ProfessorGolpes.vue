<script setup>
import MoveButton from './MoveButton.vue'
defineProps({ moves: { type: Array, default: () => [] } })
</script>
<template><div class="pool"><p>Movepool disponível para os tipos deste professor.</p><MoveButton v-for="move in moves" :key="move.id" :move="move" @select="()=>{}" /></div></template>
<style scoped>.pool{display:grid;grid-template-columns:1fr 1fr;align-content:start;gap:9px;padding:16px}.pool>p{grid-column:1/-1;margin-bottom:5px;color:var(--text-muted);font-size:12px;line-height:1.5}@media(max-width:340px){.pool{gap:6px;padding:12px}}</style>
