<script setup>
import { computed, ref } from 'vue'
import BottomSheet from './BottomSheet.vue'
import { CATEGORY, EFFECT, STAT_LABEL } from '../data/moves.js'
import { getType, typeMultiplier } from '../data/types.js'

const props = defineProps({
  move: { type: Object, required: true },
  opponentTypes: { type: Array, default: () => [] },
  disabled: Boolean,
  /**
   * Modo consulta: não há batalha em curso, então escolher o golpe não
   * significa nada. Usado na ficha do professor, onde o movepool é catálogo.
   * O toque abre o detalhe em vez de emitir um `select` que ninguém escuta.
   */
  readonly: Boolean,
})
const emit = defineEmits(['select'])

function onPrimary() {
  if (props.readonly) detailsOpen.value = true
  else emit('select', props.move)
}
const detailsOpen = ref(false)
const type = computed(() => getType(props.move.type))
const multiplier = computed(() => typeMultiplier(props.move.type, props.opponentTypes))
const categoryIcon = computed(
  () =>
    ({
      [CATEGORY.ATAQUE]: '⚔',
      [CATEGORY.DEFESA]: '🛡',
      [CATEGORY.BUFF]: '▲',
      [CATEGORY.DEBUFF]: '▼',
      [CATEGORY.STATUS]: '◉',
      [CATEGORY.CURA]: '✚',
    })[props.move.category] ?? '•',
)
const effectivenessLabel = computed(() => {
  if (multiplier.value >= 4) return '↑↑ ×4'
  if (multiplier.value > 1) return '↑ SUPER'
  if (multiplier.value <= 0.25) return '↓↓ ×¼'
  if (multiplier.value < 1) return '↓ FRACO'
  return ''
})

function effectText(effect) {
  const percent = (value) => `${Math.round(value * 100)}%`
  const labels = {
    [EFFECT.PARALYZE]: `Pode travar (${percent(effect.chance)})`,
    [EFFECT.CONFUSE]: `Pode confundir (${percent(effect.chance)})`,
    [EFFECT.DOT]: `Dano contínuo por ${effect.turns} turnos`,
    [EFFECT.RECOIL]: `Causa ${percent(effect.fraction)} de recuo`,
    [EFFECT.MULTI_HIT]: `${effect.min} a ${effect.max} acertos`,
    [EFFECT.MULTI_HIT_FIXED]: `${effect.hits} acertos`,
    [EFFECT.IGNORE_DEFENSE]: 'Ignora a Defesa',
    [EFFECT.GROW]: `Poder aumenta ${effect.inc} a cada uso`,
    [EFFECT.ACCURACY_GAIN]: 'Precisão aumenta a cada uso',
    [EFFECT.COMBO_BONUS]: 'Bônus com efeitos ativos',
    [EFFECT.WEAK_POINT]: 'Bônus quando super eficaz',
    [EFFECT.STAT_GROW_PER_TURN]: `${STAT_LABEL[effect.stat] ?? effect.stat} sobe por turno`,
    [EFFECT.HEAL]: `Recupera ${percent(effect.fraction)} da vida`,
    [EFFECT.CLEANSE]: 'Remove condições negativas',
    [EFFECT.RESET_DEBUFFS]: 'Remove reduções de atributo',
    [EFFECT.SHIELD]: 'Protege contra o próximo golpe',
    [EFFECT.DEBUFF_IMMUNE]: `Imune a reduções por ${effect.turns} turnos`,
    [EFFECT.FORCE_MISS]: 'Faz o próximo ataque rival errar',
    [EFFECT.UNDO_DAMAGE]: 'Desfaz o último dano',
    [EFFECT.REPEAT_LAST]: 'Repete o último ataque',
  }
  if (effect.kind === EFFECT.STAT_CHANGE) {
    return `${effect.delta > 0 ? 'Aumenta' : 'Reduz'} ${STAT_LABEL[effect.stat] ?? effect.stat}`
  }
  return labels[effect.kind] ?? 'Efeito especial'
}
</script>

<template>
  <div class="move-wrap">
    <button
      class="move"
      type="button"
      :disabled="disabled"
      :aria-label="readonly ? `Detalhes de ${move.name}` : undefined"
      :style="{ '--move-color': type?.color ?? 'var(--border)' }"
      @click="onPrimary"
    >
      <span class="move__head">
        <span class="pixel move__name">{{ move.name }}</span>
        <span class="move__category" :title="move.category" aria-hidden="true">{{
          categoryIcon
        }}</span>
      </span>
      <span class="move__decision">
        <span class="move__type">{{ type?.icon }} {{ type?.label ?? move.type }}</span>
        <span>POW {{ move.power ?? '—' }}</span>
        <span>ACC {{ Math.round((move.accuracy ?? 1) * 100) }}%</span>
      </span>
      <span v-if="effectivenessLabel" class="pixel move__effectiveness">{{
        effectivenessLabel
      }}</span>
    </button>
    <button
      class="move__info"
      type="button"
      :aria-label="`Detalhes de ${move.name}`"
      @click="detailsOpen = true"
    >
      i
    </button>

    <BottomSheet
      v-if="detailsOpen"
      :title="move.name"
      placement="center"
      @close="detailsOpen = false"
    >
      <div class="move-detail">
        <p>{{ move.description }}</p>
        <p class="move-detail__raw">{{ move.raw }}</p>
        <ul v-if="move.effects?.length">
          <li v-for="(effect, index) in move.effects" :key="`${effect.kind}-${index}`">
            {{ effectText(effect) }}
          </li>
        </ul>
      </div>
    </BottomSheet>
  </div>
</template>

<style scoped>
.move-wrap {
  position: relative;
  min-width: 0;
}
.move {
  width: 100%;
  min-height: 82px;
  display: flex;
  flex-direction: column;
  gap: 7px;
  align-items: stretch;
  padding: 10px 38px 10px 10px;
  border: 2px solid color-mix(in srgb, var(--move-color) 65%, var(--border));
  border-radius: var(--radius);
  background: var(--bg-card);
  color: var(--text);
  text-align: left;
  user-select: none;
  -webkit-touch-callout: none;
}
.move:disabled {
  opacity: 0.45;
  cursor: default;
}
.move__head,
.move__decision {
  display: flex;
  align-items: center;
  gap: 6px;
}
.move__head {
  justify-content: space-between;
}
.move__name {
  font-size: 7px;
  line-height: 1.45;
}
.move__category {
  font-size: 14px;
  color: var(--move-color);
}
.move__decision {
  flex-wrap: wrap;
  font-size: 8px;
  color: var(--text-muted);
}
.move__type {
  padding: 2px 5px;
  border-radius: 999px;
  color: white;
  background: color-mix(in srgb, var(--move-color) 72%, #111);
}
.move__effectiveness {
  color: var(--unifil-gold);
  font-size: 6px;
  line-height: 1.4;
}
.move__info {
  position: absolute;
  right: 7px;
  top: 7px;
  z-index: 2;
  width: 32px;
  height: 32px;
  border: 1px solid var(--move-color);
  border-radius: 50%;
  background: var(--bg-deep);
  color: white;
  font-weight: 900;
}
.move-detail {
  display: grid;
  gap: 12px;
  font-size: 13px;
  line-height: 1.55;
}
.move-detail__raw {
  padding: 10px;
  border-radius: var(--radius);
  background: var(--bg-deep);
  color: var(--unifil-gold);
}
.move-detail ul {
  display: grid;
  gap: 7px;
  padding-left: 20px;
  color: var(--text-muted);
}
@media (max-width: 340px) {
  .move {
    min-height: 88px;
    padding-left: 8px;
  }
  .move__decision {
    font-size: 7px;
  }
}
</style>
