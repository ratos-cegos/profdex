<script setup>
// As pílulas de efeito ativo de um lado do palco: status, estágios de atributo,
// escudo e golpes acumulativos.
//
// No modo `inline` elas moram na TERCEIRA linha do painel de HP (BattleHpBar),
// uma faixa de altura fixa: o painel tem 62px (`--palco-barra-altura`) e o palco
// põe o sprite do rival logo abaixo dele. Quebrar linha fazia o painel crescer
// até ~127px num celular de 360px e cobrir a cabeça do professor.
//
// Por isso UMA linha só: as etiquetas que cabem aparecem, e as demais viram um
// selo "+N" (com a lista no `title`/`aria-label`). O texto completo de cada
// efeito continua no LOG da batalha. Quem decide quantas cabem é uma função pura
// (`efeitosQueCabem.js`); aqui só se mede.
//
// `pointer-events: none`: a faixa não rouba toque dos botões de golpe.

import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { quantasCabem } from '../composables/efeitosQueCabem'

const props = defineProps({
  /** `[{ id, rotulo, tom, detalhe? }]` — ver `data/battle-efeitos.js`. */
  efeitos: { type: Array, default: () => [] },
  /** Faixa de uma linha dentro do painel de HP. */
  inline: { type: Boolean, default: false },
})

/** Espaço entre etiquetas, o mesmo do CSS (`gap`). */
const GAP = 3

const faixa = ref(null)
const medidor = ref(null)
const quantas = ref(Infinity)
/** Largura máxima de uma etiqueta: a faixa menos o "+N", quando ele existe. */
const maxDaEtiqueta = ref(null)

const mostradas = computed(() =>
  props.inline ? props.efeitos.slice(0, quantas.value) : props.efeitos,
)
const ocultas = computed(() => props.efeitos.slice(mostradas.value.length))
const rotuloDasOcultas = computed(() =>
  ocultas.value.map((e) => e.detalhe ?? e.rotulo).join(', '),
)

/**
 * Mede as etiquetas numa cópia invisível (todas, mais um "+N") e decide quantas
 * cabem na largura da faixa. A cópia existe porque as que já estão escondidas
 * não têm largura para medir.
 */
function medir() {
  if (!props.inline) return
  const f = faixa.value
  const m = medidor.value
  if (!f || !m) return
  const larguras = [...m.querySelectorAll('[data-chip]')].map((el) => el.offsetWidth)
  const larguraDoMais = m.querySelector('[data-mais]')?.offsetWidth ?? 0
  const disponivel = f.clientWidth
  let k = quantasCabem(larguras, disponivel, { gap: GAP, larguraDoMais })
  // Nem a primeira cabe inteira (ex.: "Bloqueio · próximo golpe" num celular
  // pequeno): ela aparece encurtada com reticências em vez de sumir no "+N" —
  // um efeito à vista vale mais que nenhum.
  if (k === 0 && larguras.length) k = 1
  quantas.value = k
  const sobra = k < larguras.length ? larguraDoMais + GAP : 0
  maxDaEtiqueta.value = disponivel > 0 ? Math.max(0, disponivel - sobra) : null
}

let observador = null

onMounted(() => {
  medir()
  if (typeof ResizeObserver !== 'undefined' && faixa.value) {
    observador = new ResizeObserver(() => medir())
    observador.observe(faixa.value)
  }
})

onBeforeUnmount(() => observador?.disconnect())

// Os rótulos mudam a cada turno ("Travado · 3t" → "· 2t"): mede de novo depois
// de o DOM refletir a lista nova.
watch(
  () => props.efeitos.map((e) => e.rotulo).join('|'),
  () => nextTick(medir),
)
</script>

<template>
  <div
    v-if="inline || efeitos.length"
    ref="faixa"
    class="efeitos"
    :class="{ 'efeitos--inline': inline }"
    :style="maxDaEtiqueta != null ? { '--max-etiqueta': `${maxDaEtiqueta}px` } : null"
    aria-live="polite"
  >
    <span
      v-for="efeito in mostradas"
      :key="efeito.id"
      class="pixel efeitos__chip"
      :class="`efeitos__chip--${efeito.tom}`"
      :title="efeito.detalhe ?? efeito.rotulo"
    >
      {{ efeito.rotulo }}
    </span>
    <span
      v-if="ocultas.length"
      class="pixel efeitos__chip efeitos__chip--mais"
      :title="rotuloDasOcultas"
    >
      <span aria-hidden="true">+{{ ocultas.length }}</span>
      <!-- `aria-label` num <span> sem papel costuma ser ignorado pelo leitor de
           tela: a lista vai como texto, só que fora da vista. -->
      <span class="efeitos__so-leitor">e mais {{ ocultas.length }}: {{ rotuloDasOcultas }}</span>
    </span>

    <!-- Cópia invisível para medir: todas as etiquetas e o maior "+N" possível. -->
    <div v-if="inline" ref="medidor" class="efeitos__medidor" aria-hidden="true">
      <span
        v-for="efeito in efeitos"
        :key="efeito.id"
        data-chip
        class="pixel efeitos__chip"
      >
        {{ efeito.rotulo }}
      </span>
      <span data-mais class="pixel efeitos__chip">+{{ efeitos.length }}</span>
    </div>
  </div>
</template>

<style scoped>
.efeitos {
  position: absolute;
  z-index: 3;
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
  /* Não rouba o toque: o palco inteiro fica embaixo dos botões de golpe. */
  pointer-events: none;
}

/* A faixa do painel: uma linha, 13px, sem empurrar a largura do painel (é o
   painel que dá a largura a ela, não o contrário — senão medir e encolher
   viraria um laço). */
.efeitos--inline {
  position: relative;
  z-index: auto;
  flex-wrap: nowrap;
  align-items: center;
  height: 13px;
  width: 0;
  min-width: 100%;
  overflow: hidden;
}

/* 1 + 1 + 9 + 1 + 1 = 13px: borda, respiro e a linha da fonte. */
.efeitos__chip {
  display: inline-block;
  flex-shrink: 0;
  box-sizing: border-box;
  height: 13px;
  max-width: var(--max-etiqueta, 100%);
  overflow: hidden;
  text-overflow: ellipsis;
  padding: 1px 4px;
  border-radius: 100px;
  font-size: 6px;
  line-height: 9px;
  white-space: nowrap;
  background: rgba(0, 0, 0, 0.72);
  border: 1px solid currentColor;
}

/* Bom e ruim do ponto de vista de QUEM TEM o efeito, e a mesma cor nos dois
   lados: o chip do treino era vermelho fixo, então um buff de ataque e uma
   paralisia apareciam iguais. */
.efeitos__chip--bom {
  color: var(--ds-green-glow);
}

.efeitos__chip--ruim {
  color: var(--error);
}

/* O "+N" é neutro: não é bom nem ruim, é "tem mais no LOG". */
.efeitos__chip--mais {
  color: var(--text-muted);
}

.efeitos__so-leitor {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  clip-path: inset(50%);
  white-space: nowrap;
}

.efeitos__medidor {
  position: absolute;
  top: 0;
  left: 0;
  display: flex;
  gap: 3px;
  visibility: hidden;
  white-space: nowrap;
}

/* Na cópia de medir, a largura NATURAL — cortada, ela mentiria sobre caber. */
.efeitos__medidor .efeitos__chip {
  max-width: none;
}
</style>
