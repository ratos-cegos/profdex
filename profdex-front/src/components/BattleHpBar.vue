<script setup>
import { computed } from 'vue'
import TypeIcon from './TypeIcon.vue'
import EfeitosEmCampo from './EfeitosEmCampo.vue'
import { getType, legibleColor } from '../data/types.js'

const props = defineProps({
  name: { type: String, required: true },
  hp: { type: Number, required: true },
  maxHp: { type: Number, required: true },
  avatarSrc: { type: String, default: '' },
  // Ids dos tipos do combatente, desenhados antes do nome.
  //
  // Antes os icones eram emoji concatenados DENTRO de `name` pelo chamador
  // (`${icones} Prof. ${nome}`). Um componente nao sobrevive a um `.join('')`,
  // entao os tipos passaram a ser prop propria. Default vazio: quem nao passa
  // `types` renderiza exatamente como antes.
  types: { type: Array, default: () => [] },
  /** Status, estágios, escudos e golpes acumulativos do combatente em campo. */
  efeitos: { type: Array, default: () => [] },
})

const percent = computed(() =>
  props.maxHp > 0 ? Math.max(0, Math.min(100, (props.hp / props.maxHp) * 100)) : 0
)

// Ícones na cor do tipo, como em todas as outras superfícies de tipo do app.
//
// Aqui eram brancos (`color: var(--text-primary)` em `.hp-panel__types`) — a
// única tela que descartava a cor canônica, justamente a que o jogador olha o
// tempo inteiro durante a batalha.
//
// Usa `legibleColor` e não a `color` crua porque o painel fica sobre fundo
// escuro: `engenharia-software` é `#495057`, que dá 1,7:1 contra `--bg-deep` e
// simplesmente desaparece. `legibleColor` clareia preservando o matiz até bater
// 4,5:1. Fallback na cor de texto secundário para id desconhecido.
const typeSwatches = computed(() =>
  props.types.map((id) => ({
    id,
    color: legibleColor(getType(id)?.color ?? '#a8b8c0'),
  }))
)

// Verde > 50%, amarelo > 20%, vermelho no restante (igual Pokémon)
const barColor = computed(() => {
  if (percent.value > 50) return 'var(--ds-green-glow)'
  if (percent.value > 20) return 'var(--ds-orange-glow)'
  return 'var(--error)'
})

function hideBrokenImage(event) {
  event.currentTarget.style.display = 'none'
}
</script>

<template>
  <!-- Três linhas de ALTURA FIXA — nome, barra com os números, faixa de efeitos
       — somando os mesmos 62px de sempre (`--palco-barra-altura`). O palco põe o
       sprite do rival logo abaixo deste painel: se ele crescer, cobre a cabeça
       do professor. Era o que acontecia com as etiquetas quebrando linha. -->
  <div
    class="hp-panel"
    :class="{ 'hp-panel--empty': percent === 0, 'hp-panel--com-efeitos': efeitos.length }"
  >
    <div v-if="avatarSrc" class="hp-panel__avatar">
      <img :src="avatarSrc" :alt="name" @error="hideBrokenImage" />
    </div>
    <div class="hp-panel__info">
      <div class="hp-panel__row">
        <span v-if="typeSwatches.length" class="hp-panel__types">
          <TypeIcon
            v-for="t in typeSwatches"
            :key="t.id"
            :type="t.id"
            :size="12"
            :style="{ color: t.color }"
          />
        </span>
        <span class="pixel hp-panel__name">{{ name }}</span>
      </div>
      <div class="hp-panel__bar" role="progressbar" :aria-valuenow="hp" :aria-valuemax="maxHp"
        :aria-label="`HP de ${name}`">
        <span class="pixel hp-panel__hp-label">HP</span>
        <div class="hp-panel__track" :class="{ 'hp-panel__track--empty': percent === 0 }">
          <div class="hp-panel__fill" :style="{ width: percent + '%', background: barColor }" />
        </div>
        <!-- Na linha da barra, e não numa linha própria: a linha que sobrou é a
             das etiquetas de efeito, sem o painel crescer. -->
        <span class="pixel hp-panel__numbers">{{ hp }}/{{ maxHp }}</span>
      </div>
      <EfeitosEmCampo :efeitos="efeitos" inline />
    </div>
  </div>
</template>

<style scoped>
.hp-panel {
  display: flex;
  align-items: center;
  gap: 10px;
  background: rgba(18, 20, 24, 0.88);
  border: 2px solid var(--border);
  border-radius: var(--radius);
  padding: 8px 12px;
  min-width: 180px;
  box-shadow: 2px 2px 0 rgba(0, 0, 0, 0.35);
}

.hp-panel__avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  overflow: hidden;
  border: 2px solid var(--yellow);
  flex-shrink: 0;
  background: var(--bg-surface);
}

.hp-panel__avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  /* Topo: a sprite de frente é de corpo inteiro, e centralizar mostraria o
     tronco em vez do rosto. Ver o comentário em ProfCard.vue. */
  object-position: top;
}

/* Com efeitos, o painel ocupa a largura máxima que o palco permite (62% no
   rival, 58% no jogador): as etiquetas usam o espaço para os LADOS, nunca para
   baixo. A altura não muda. */
.hp-panel--com-efeitos {
  width: 100%;
}

/* 13 + 3 + 10 + 3 + 13 = 42px de coluna; com 8+8 de padding e 2+2 de borda, os
   62px de `--palco-barra-altura`. Mudou uma altura aqui, muda o token. */
.hp-panel__info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.hp-panel__row {
  display: flex;
  /* Era `space-between` com um filho so (portanto equivalente a `flex-start`).
     Com os icones de tipo ao lado do nome, `space-between` jogaria os dois para
     extremos opostos do painel. */
  justify-content: flex-start;
  align-items: center;
  gap: 6px;
  height: 13px;
  min-width: 0;
}

.hp-panel__types {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
  /* Sem `color` aqui: cada TypeIcon recebe a sua, via `typeSwatches`. */
}

.hp-panel__name {
  font-size: 9px;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.hp-panel__bar {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 10px;
}

.hp-panel__hp-label {
  font-size: 6px;
  color: var(--yellow);
}

.hp-panel__track {
  flex: 1;
  /* Barra curta não lê como vida: com o número dividindo a linha, ela não
     encolhe abaixo disto (o painel alarga, dentro do máximo do palco). */
  min-width: 48px;
  height: 8px;
  background: var(--bg-deep);
  border: 1px solid var(--border);
  border-radius: 4px;
  overflow: hidden;
}

.hp-panel__track--empty {
  background: var(--error);
  border-color: #ff8f8f;
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.28);
}

.hp-panel--empty .hp-panel__numbers {
  color: #ff9b9b;
}

.hp-panel__fill {
  height: 100%;
  border-radius: 3px;
  transition: width 0.5s ease, background 0.5s ease;
}

.hp-panel__numbers {
  flex-shrink: 0;
  font-size: 7px;
  line-height: 10px;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
</style>
