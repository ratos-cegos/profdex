<script setup>
import { computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import AvisoAtualizacao from './components/AvisoAtualizacao.vue'
import AvisoPixel from './components/AvisoPixel.vue'
import ConvitePilha from './components/ConvitePilha.vue'
import { rotaSilenciada } from './services/convite-pilha'
import { useAuthStore } from './stores/auth'
import { useBattleStore } from './stores/battle'

const auth = useAuthStore()
const battle = useBattleStore()
const route = useRoute()

// Nenhum aviso de batalha no `/admin` (painel e bancada do quiz no tablet do
// estande). O store continua recebendo; só não desenha. Ver convite-pilha.js.
const silenciado = computed(() => rotaSilenciada(route.path))

// Socket de batalha logo após o login, e não só dentro da área de batalha:
// sem isso o convite só alcançava quem estava naquela tela, e morria em 60s
// sem o aluno saber que existiu. O que NÃO muda é a lista de jogadores, que
// continua sob demanda (`lobby:subscribe` ao abrir o modal) — era ela que
// escalava mal, não a conexão. Ver docs/CARGA-PVP.md.
//
// A queda é do outro lado: `auth:expired` (logout ou 401) derruba o socket, e
// o store já escuta esse evento.
watch(
  () => auth.isAuthenticated,
  (logado) => {
    if (logado) battle.connect()
  },
  { immediate: true },
)
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

  <!-- Fora do RouterView: a atualização e o convite podem chegar em qualquer
       tela, e não podem sumir na transição de rota. -->
  <AvisoAtualizacao />

  <!-- Desafios e avisos de batalha: uma coluna só no topo, para os dois nunca
       se sobreporem. A coluna não recebe toque; só as cartas, então a tela
       embaixo continua usável. -->
  <div v-if="!silenciado" class="notificacoes">
    <ConvitePilha />
    <AvisoPixel />
  </div>
</template>

<style>
.notificacoes {
  position: fixed;
  top: calc(8px + env(safe-area-inset-top));
  left: 50%;
  transform: translateX(-50%);
  /* Acima do conteúdo das telas, abaixo dos modais (z-index 20). */
  z-index: 15;
  width: min(440px, calc(100% - 16px));
  display: flex;
  flex-direction: column;
  gap: 8px;
  pointer-events: none;
}
</style>
