<script setup>
import { ref } from 'vue'
import { atualizarAgora, temAtualizacao } from '../composables/usePwa'

// Aviso discreto de versão nova. NÃO recarrega sozinho: uma recarga automática
// no meio de uma batalha PvP derruba a partida, porque o estado do combate vive
// na memória do servidor e não sobrevive à reconexão do socket.
//
// Fica no App, acima de todas as rotas, porque a atualização pode chegar em
// qualquer tela.

const dispensado = ref(false)

function atualizar() {
  // `true` = recarrega a página assim que o SW novo assume o controle.
  void atualizarAgora(true)
}
</script>

<template>
  <div v-if="temAtualizacao && !dispensado" class="aviso" role="status">
    <span class="aviso__texto">Nova versão disponível</span>
    <button class="aviso__acao" type="button" @click="atualizar">Atualizar</button>
    <button class="aviso__fechar" type="button" aria-label="Dispensar" @click="dispensado = true">
      ✕
    </button>
  </div>
</template>

<style scoped>
/* Acima da barra inferior de navegação, para não cobrir os botões — e com a
   safe area do iOS somada, senão fica sob a home indicator. */
.aviso {
  position: fixed;
  right: 12px;
  bottom: calc(var(--nav-height, 64px) + 12px + env(safe-area-inset-bottom));
  left: 12px;
  z-index: 90;
  display: flex;
  align-items: center;
  gap: 10px;
  max-width: 456px;
  margin: 0 auto;
  padding: 10px 12px;
  border: 1px solid var(--unifil-gold);
  border-radius: var(--radius);
  background: var(--surface);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
}

.aviso__texto {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  color: var(--text);
}

.aviso__acao {
  min-height: 36px;
  padding: 0 12px;
  border: 1px solid var(--unifil-gold);
  border-radius: var(--radius);
  background: transparent;
  color: var(--unifil-gold);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.aviso__fechar {
  width: 36px;
  height: 36px;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--text-muted);
  font-size: 14px;
  cursor: pointer;
}

.aviso__acao:focus-visible,
.aviso__fechar:focus-visible {
  outline: 2px solid var(--unifil-gold);
  outline-offset: 2px;
}
</style>
