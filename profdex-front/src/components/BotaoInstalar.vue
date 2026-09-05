<script setup>
import { computed, ref } from 'vue'
import { ehIos, estaInstalado, instalar, podeInstalar } from '../composables/usePwa'

// Convite para instalar o app na tela de início.
//
// Vale a pena aqui pelo que o evento é: o aluno anda pelo campus com o app
// aberto, a câmera do scanner e da arena ocupa a tela toda (standalone ganha a
// altura da barra do navegador) e a rede é ruim (o shell fica em cache).
//
// Dois caminhos porque os sistemas são diferentes: no Android o navegador
// oferece um diálogo nativo; o iOS não expõe nada e a instalação é manual, pelo
// menu Compartilhar. Um botão que não faz nada no iPhone seria pior que a
// instrução escrita.

const instrucaoIos = ref(false)
const iosSemInstalar = computed(() => ehIos() && !estaInstalado())
const visivel = computed(() => !estaInstalado() && (podeInstalar.value || iosSemInstalar.value))

async function aoClicar() {
  if (podeInstalar.value) {
    await instalar()
    return
  }
  instrucaoIos.value = !instrucaoIos.value
}
</script>

<template>
  <div v-if="visivel" class="instalar">
    <button class="instalar__botao" type="button" @click="aoClicar">
      <span aria-hidden="true">⬇</span>
      Instalar o ProfDex
    </button>

    <p v-if="instrucaoIos" class="instalar__ajuda">
      No iPhone: toque em <strong>Compartilhar</strong> (o quadrado com a seta) e escolha
      <strong>Adicionar à Tela de Início</strong>.
    </p>
  </div>
</template>

<style scoped>
.instalar {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.instalar__botao {
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 0 16px;
  border: 1px solid var(--unifil-gold);
  border-radius: var(--radius);
  background: transparent;
  color: var(--unifil-gold);
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}

.instalar__botao:focus-visible {
  outline: 2px solid var(--unifil-gold);
  outline-offset: 2px;
}

.instalar__ajuda {
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-muted);
}

.instalar__ajuda strong {
  color: var(--text);
}
</style>
