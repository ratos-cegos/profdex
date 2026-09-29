<script setup>
import { computed } from 'vue'
import PixelIcon from '../PixelIcon.vue'
import { TIER_ICONE } from '../../data/pixelIcons'
import { useContagem } from '../../composables/useContagem'
import { formatarPontos, inicial } from './formato'

// Pódio dos três primeiros, na ordem de leitura de pódio de verdade: 2º · 1º ·
// 3º, com o campeão no meio e no degrau mais alto.
//
// Os nomes NÃO são cortados. Antes cada nome virava "Maria Eduar…" numa coluna
// de ~1/3 da tela; aqui ele quebra em quantas linhas precisar, e o degrau (que
// mede a posição) fica sempre alinhado embaixo, independente do tamanho do nome.
const props = defineProps({
  // Já ordenados, do 1º em diante. Pode ter menos de três.
  users: { type: Array, required: true },
  unidade: { type: String, required: true },
})

// Sempre três vagas: com 1 ou 2 jogadores a vaga vazia vira "aberta" e a
// composição continua de pé.
const slots = computed(() => [
  { position: 2, metal: 'prata', user: props.users[1] ?? null },
  { position: 1, metal: 'ouro', user: props.users[0] ?? null },
  { position: 3, metal: 'bronze', user: props.users[2] ?? null },
])

// Uma contagem por vaga, na ordem fixa dos slots (2º, 1º, 3º).
const contagens = [0, 1, 2].map((i) => useContagem(() => slots.value[i].user?.pontuacao ?? 0))

// Nome comprido desce um degrau de fonte antes de quebrar em três linhas.
const NOME_LONGO = 16
</script>

<template>
  <div class="podio" aria-label="Pódio dos três primeiros colocados">
    <article
      v-for="(slot, i) in slots"
      :key="slot.position"
      class="degrau"
      :class="[`degrau--${slot.metal}`, { 'degrau--vago': !slot.user, 'degrau--voce': slot.user?.destaque }]"
      :style="{ '--ordem': 3 - slot.position }"
    >
      <div class="degrau__topo">
        <PixelIcon class="degrau__medalha" :nome="`medalha-${slot.metal}`" :escala="3" />

        <div class="degrau__avatar" aria-hidden="true">
          <img v-if="slot.user?.url_da_foto" :src="slot.user.url_da_foto" alt="" />
          <span v-else class="pixel">{{ slot.user ? inicial(slot.user.nome) : '?' }}</span>
        </div>

        <template v-if="slot.user">
          <h2
            class="degrau__nome"
            :class="{ 'degrau__nome--longo': slot.user.nome.length > NOME_LONGO }"
            :title="slot.user.nomeCompleto"
            :aria-label="slot.user.nomeCompleto"
          >
            {{ slot.user.nome }}
          </h2>
          <p class="pixel degrau__pts">
            <span class="degrau__valor">{{ formatarPontos(contagens[i].value) }}</span>
            <span class="degrau__unidade">{{ unidade }}</span>
          </p>
          <p v-if="slot.user.tier || slot.user.detalhe" class="degrau__detalhe">
            <PixelIcon v-if="TIER_ICONE[slot.user.tier]" :nome="TIER_ICONE[slot.user.tier]" :escala="1" />
            <span>{{ [slot.user.tier, slot.user.detalhe].filter(Boolean).join(' · ') }}</span>
          </p>
        </template>
        <template v-else>
          <h2 class="degrau__nome degrau__nome--vago">Vaga aberta</h2>
        </template>
      </div>

      <div class="pixel degrau__bloco" :aria-label="`${slot.position}º lugar`">{{ slot.position }}</div>
    </article>
  </div>
</template>

<style scoped>
.podio {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  align-items: end;
  gap: var(--space-1);
  padding-top: var(--space-2);
  /* O chão do pódio: os três degraus apoiam na mesma linha. */
  border-bottom: 4px solid var(--unifil-orange);
  box-shadow: 0 2px 0 var(--bg-deep);
}

.degrau {
  --metal: var(--silver-hi);
  --metal-lo: var(--silver-lo);
  --altura: 44px;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.degrau--ouro {
  --metal: var(--ds-orange-glow);
  --metal-lo: var(--ds-orange-shadow);
  --altura: 68px;
}

.degrau--bronze {
  --metal: var(--unifil-gold);
  --metal-lo: var(--bronze-lo);
  --altura: 30px;
}

.degrau__topo {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 0 2px var(--space-2);
  text-align: center;
}

.degrau__avatar {
  width: 56px;
  aspect-ratio: 1;
  display: grid;
  place-items: center;
  overflow: hidden;
  border: 2px solid var(--bg-deep);
  border-radius: 4px;
  background: var(--surface);
  box-shadow: var(--dex-bevel-sm);
  color: var(--metal);
  font-size: 18px;
}

.degrau--ouro .degrau__avatar {
  width: 68px;
  box-shadow: var(--dex-bevel);
  font-size: 22px;
}

.degrau__avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.degrau__nome {
  width: 100%;
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 800;
  line-height: 1.25;
  overflow-wrap: anywhere;
  hyphens: auto;
  text-wrap: balance;
}

.degrau__nome--longo {
  font-size: 12px;
}

.degrau__nome--vago {
  color: var(--text-muted);
  font-weight: 600;
}

.degrau__pts {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  color: var(--metal);
  font-variant-numeric: tabular-nums;
}

.degrau__valor {
  font-size: 11px;
}

.degrau--ouro .degrau__valor {
  font-size: 13px;
}

.degrau__unidade {
  color: var(--text-muted);
  font-size: 7px;
}

.degrau__detalhe {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 4px;
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 600;
  line-height: 1.3;
}

/* O degrau em si: bloco de metal com o bisel de 8 bits da casa (luz em
   cima-esquerda). A ALTURA é a informação — o campeão fica sempre mais alto,
   não importa o tamanho do nome de ninguém. */
.degrau__bloco {
  height: var(--altura);
  display: grid;
  place-items: start center;
  padding-top: 8px;
  border: 2px solid var(--bg-deep);
  border-bottom: 0;
  background: color-mix(in srgb, var(--metal) 22%, var(--surface));
  box-shadow:
    inset 2px 2px 0 color-mix(in srgb, var(--metal) 70%, transparent),
    inset -2px 0 0 var(--metal-lo);
  color: var(--metal);
  font-size: 14px;
  text-shadow: 2px 2px 0 var(--bg-deep);
  transform-origin: bottom;
}

.degrau--ouro .degrau__bloco {
  font-size: 18px;
}

.degrau--voce .degrau__avatar {
  outline: 2px solid var(--unifil-gold);
  outline-offset: 2px;
}

/* Vaga ainda não conquistada: tudo apagado, o degrau vira contorno. */
.degrau--vago .degrau__medalha {
  filter: grayscale(1);
  opacity: 0.3;
}

.degrau--vago .degrau__avatar {
  box-shadow: var(--dex-bevel-locked);
  color: var(--text-muted);
}

.degrau--vago .degrau__bloco {
  background: transparent;
  border: 2px dashed var(--surface-border);
  border-bottom: 0;
  box-shadow: none;
  color: var(--surface-border);
  text-shadow: none;
}

@media (max-width: 359px) {
  .degrau__avatar {
    width: 48px;
  }

  .degrau--ouro .degrau__avatar {
    width: 56px;
  }

  .degrau__nome,
  .degrau__nome--longo {
    font-size: 11px;
  }
}

/* O momento da tela: os degraus sobem em quadros — 3º, 2º e por último o
   campeão — e só então quem está em cima deles aparece. O estado final é o
   padrão; a animação só existe para quem aceita movimento. */
@media (prefers-reduced-motion: no-preference) {
  .degrau__bloco {
    animation: degrau-sobe var(--dur-base) var(--ease-pixel) both;
    animation-delay: calc(var(--ordem) * 90ms);
  }

  .degrau__topo {
    animation: degrau-surge 180ms steps(3, end) both;
    animation-delay: calc(var(--ordem) * 90ms + var(--dur-base));
  }

  .degrau--ouro:not(.degrau--vago) .degrau__medalha {
    animation: medalha-brilha 2.4s steps(2, end) calc(3 * 90ms + 0.6s) 3;
  }
}

@keyframes degrau-sobe {
  from {
    transform: scaleY(0);
  }
}

@keyframes degrau-surge {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
}

@keyframes medalha-brilha {
  50% {
    transform: translateY(-2px);
  }
}
</style>
