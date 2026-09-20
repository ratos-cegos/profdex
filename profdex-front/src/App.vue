<script setup>
import { watch } from 'vue'
import AvisoAtualizacao from './components/AvisoAtualizacao.vue'
import ConviteBanner from './components/ConviteBanner.vue'
import { useAuthStore } from './stores/auth'
import { useBattleStore } from './stores/battle'

const auth = useAuthStore()
const battle = useBattleStore()

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
  <ConviteBanner />
</template>
