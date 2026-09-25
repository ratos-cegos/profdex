<script setup>
import ProfessorFace from './ProfessorFace.vue'

// Os reservas de um lado, na HUD da arena.
//
// Mostra foto E barra de HP dos dois lados. Não é vazamento: o time inteiro já
// foi revelado no team preview, e o HP de cada reserva foi visto em campo antes
// de ele sair — esconder não criaria segredo nenhum, só obrigaria o jogador a
// decorar o que viu. E é justamente esse número que decide se vale trocar.
defineProps({
  team: { type: Array, default: () => [] },
  /** captureId de quem está em campo. Só existe para o próprio time. */
  activeCaptureId: { type: String, default: null },
  /** O banco do rival fica alinhado ao outro lado da tela. */
  foe: { type: Boolean, default: false },
  /**
   * De quem é este banco ("VOCÊ"/"RIVAL"). Fica AQUI, e não na view, porque só
   * este componente sabe que um time de um só não desenha banco — um rótulo
   * posto do lado de fora sobraria sozinho na faixa.
   */
  rotulo: { type: String, default: '' },
})

const proporcao = (m) => (m.maxHp ? Math.max(0, m.hp) / m.maxHp : 0)
</script>

<template>
  <!-- Com um exemplar só não há banco: a barra principal já conta a história. -->
  <div v-if="team.length > 1" class="banco-wrap" :class="{ 'banco-wrap--foe': foe }">
    <span v-if="rotulo" class="pixel banco__rotulo">{{ rotulo }}</span>
    <ul class="banco" :class="{ 'banco--foe': foe }">
      <li
        v-for="(m, i) in team"
        :key="m.captureId ?? i"
        class="banco__item"
        :class="{
          'banco__item--caido': m.fainted,
          'banco__item--ativo': activeCaptureId && m.captureId === activeCaptureId,
        }"
        :title="m.professor.name"
      >
        <ProfessorFace class="banco__face" :professor="m.professor" />
        <span class="banco__hp">
          <span
            class="banco__hp-fill"
            :class="{ 'banco__hp-fill--baixo': proporcao(m) <= 0.3 }"
            :style="{ width: `${proporcao(m) * 100}%` }"
          />
        </span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
/* Rótulo e miniaturas na MESMA linha: desde a tarefa 16 o banco vive numa linha
   fina no topo da faixa de comandos, e não mais empilhado na coluna do sprite —
   era ele que roubava o tamanho do personagem. */
.banco-wrap {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.banco__rotulo {
  flex-shrink: 0;
  font-size: 6px;
  line-height: 1.4;
  color: var(--text-muted);
  letter-spacing: 0.04em;
}

.banco {
  display: flex;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.banco--foe {
  justify-content: flex-start;
}

.banco__item {
  width: 34px;
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 3px;
  border: 2px solid var(--border);
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.45);
}

.banco__item--ativo {
  border-color: var(--yellow);
}

/* Caído sai da conta do jogador: cinza e apagado, mas ainda visível — saber
   quantos já foram é metade da leitura da partida. */
.banco__item--caido {
  opacity: 0.4;
  filter: grayscale(1);
}

/* Retrato, não corpo inteiro. A sprite de frente é de corpo inteiro (proporção
   ~0.5), então `height: auto` num item de 34px devolvia uma tira de ~50px de
   altura — alta demais para a linha fina da faixa de comandos. `cover` + `top`
   recorta no rosto, a mesma escolha do avatar da barra de HP. */
.banco__face {
  width: 100%;
  height: 26px;
  display: block;
  object-fit: cover;
  object-position: top;
  image-rendering: pixelated;
}

.banco__hp {
  height: 4px;
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.2);
  overflow: hidden;
}

.banco__hp-fill {
  display: block;
  height: 100%;
  background: var(--ds-green);
  transition: width 0.3s ease;
}

.banco__hp-fill--baixo {
  background: var(--error);
}
</style>
