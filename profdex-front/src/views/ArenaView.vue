<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import ArenaPalco from '../components/ArenaPalco.vue'
import MoveButton from '../components/MoveButton.vue'
import { useBattle } from '../composables/useBattle.js'
import { useProfessorsStore } from '../stores/professors'
import { buildMoveset } from '../data/moves.js'
import {
  PLAYER_FALLBACK,
  PLAYER_KEY,
  TREINO_ENEMY_FALLBACK_NAME,
  TREINO_ENEMY_KEY,
} from '../data/treino.js'

const MAX_HP = 120

const router = useRouter()
const store = useProfessorsStore()

// Professor inimigo: FIXO (ver src/data/treino.js, que explica o porquê e é a
// mesma fonte que o hub de treino usa para anunciar contra quem se luta — antes
// os dois divergiam e o aluno via /arena/eron enfrentando o Gustavo).
//
// O `beforeEnter` da rota já carregou a lista, então dá para resolver aqui no
// setup — a batalha inteira (tipos, golpes, modelo) deriva deste objeto, e por
// isso ele precisa estar correto ANTES de useBattle() montar os combatentes.
// O literal é o fallback de quando a lista não veio (backend fora do ar): os
// dados que a batalha usa são slug e nome, então ela roda igual.
const enemyProfessor = store.findByKey(TREINO_ENEMY_KEY) || {
  id: TREINO_ENEMY_KEY,
  name: TREINO_ENEMY_FALLBACK_NAME,
  slug: TREINO_ENEMY_KEY,
  ...PLAYER_FALLBACK,
}

// O boneco do jogador. Sai da MESMA lista, pelo mesmo caminho: desde a tarefa
// 13 tipos e arte vêm do banco, e manter uma segunda fonte para o nosso lado
// faria o Gustavo da arena divergir do Gustavo da Profdex sem ninguém notar.
const playerProfessor = store.findByKey(PLAYER_KEY) || {
  id: PLAYER_KEY,
  name: TREINO_ENEMY_FALLBACK_NAME,
  slug: PLAYER_KEY,
  ...PLAYER_FALLBACK,
}

// ── Realidade aumentada: DESATIVADA por enquanto. O combate acontece sempre
// dentro do cenário do túnel binário (câmera/AR desligada). Para reativar,
// volte `arEnabled` para `true` e restaure o botão de alternar no template.
// A câmera em si é do ArenaPalco, que avisa aqui quando ela não abre.
const arEnabled = ref(false)
const arError = ref(null)

function onArIndisponivel(motivo) {
  // Sem câmera/permissão: cai para o cenário 3D em vez de travar o combate.
  arError.value = motivo
  arEnabled.value = false
}

// ── Tipos dos combatentes ───────────────────────────────────────────────────
// Os dois lados trazem os tipos (1–2) gravados na própria linha do banco.
const enemyTypes = enemyProfessor.types
const playerTypes = playerProfessor.types

// Os icones de tipo vao como prop `types` do BattleHpBar, nao concatenados no
// `name`: sao componentes SVG e nao sobrevivem a virar string. De quebra, o
// `aria-label` da barra de HP deixa de ler emoji em voz alta.

// Cada lado recebe um deck de 4 golpes, misturando seus tipos.
const playerMoves = buildMoveset(playerTypes)
const enemy = {
  name: enemyProfessor.name,
  types: enemyTypes,
  maxHp: MAX_HP,
  moves: buildMoveset(enemyTypes),
}
const player = {
  name: playerProfessor.name,
  types: playerTypes,
  maxHp: MAX_HP,
  moves: playerMoves,
}

const {
  playerHp,
  enemyHp,
  phase,
  message,
  enemyHit,
  playerHit,
  playerFainted,
  enemyFainted,
  playerStatus,
  enemyStatus,
  playerFeedback,
  enemyFeedback,
  isOver,
  start,
  useMove,
  flee,
} = useBattle({ player, enemy })

onMounted(start)

// Os dois lados do palco. Cada um usa a arte do seu dono: o inimigo é o
// professor vindo da rota (Eron, Mário, ...) e o jogador é sempre o Gustavo.
//
// Sprite 2D e não .glb — os modelos passam de 25 MB cada (o do Gustavo, 74 MB)
// e dois deles na mesma tela estouravam a memória da aba no celular.
// Ver docs/BUG-BATALHA-TRAVANDO.md. Quem resolve frente/costas é o palco.
const ladoInimigo = computed(() => ({
  professor: enemyProfessor,
  name: enemy.name,
  types: enemyTypes,
  hp: enemyHp.value,
  maxHp: enemy.maxHp,
  hit: enemyHit.value,
  fainted: enemyFainted.value,
  feedback: enemyFeedback.value,
}))

const ladoJogador = computed(() => ({
  professor: playerProfessor,
  name: player.name,
  types: playerTypes,
  hp: playerHp.value,
  maxHp: player.maxHp,
  hit: playerHit.value,
  fainted: playerFainted.value,
  feedback: playerFeedback.value,
}))

// AR ancorado (WebXR) e AR Quick Look (iOS) DESATIVADOS por enquanto — a arena
// roda só no cenário 3D. O código foi removido; ver histórico do git para
// restaurar `useArenaAR`/`pollARSupport` quando o AR voltar.

function goBack() {
  router.push({ name: 'batalha', query: { profId: enemyProfessor.id } })
}
</script>

<template>
  <main class="arena" :class="{ 'arena--defeat': playerFainted, 'arena--victory': enemyFainted }">
    <!-- Palco compartilhado com o PvP: inimigo ao fundo (de frente), jogador em
         primeiro plano (de costas) e as barras de HP sobrepostas. -->
    <ArenaPalco
      :foe="ladoInimigo"
      :you="ladoJogador"
      :ar="arEnabled"
      @ar-indisponivel="onArIndisponivel"
    />

    <!-- HUD sobreposto ao palco -->
    <div
      class="arena__hud"
      :class="{
        'arena__hud--defeat': playerFainted,
        'arena__hud--victory': enemyFainted,
      }"
    >
      <button class="arena__back" type="button" @click="goBack">←</button>

      <!-- Sem isto, um aluno passa a tarde aqui achando que sobe de Elo: a
           tela é idêntica à do PvP e nada dizia que não valia nada. -->
      <p class="arena__selo pixel">TREINO — NÃO VALE RANKING</p>

      <span v-if="enemyStatus" class="arena__status arena__status--enemy">
        {{ enemyStatus }}
      </span>
      <span v-if="playerStatus" class="arena__status arena__status--player">
        {{ playerStatus }}
      </span>

      <!-- Painel de comandos: mensagem + golpes + fugir -->
      <section class="battle-panel" aria-label="Comandos de batalha">
        <div class="battle-panel__message pixel" aria-live="polite">
          {{ message }}
        </div>

        <div v-if="phase === 'player-turn'" class="battle-panel__moves">
          <MoveButton
            v-for="move in playerMoves"
            :key="move.id"
            :move="move"
            :opponent-types="enemyTypes"
            @select="useMove"
          />
        </div>

        <div v-else-if="isOver" class="battle-panel__end">
          <p
            class="pixel battle-panel__result"
            :class="{
              'battle-panel__result--defeat': phase === 'defeat',
              'battle-panel__result--victory': phase === 'victory',
            }"
          >
            {{
              phase === 'defeat'
                ? 'VOCÊ FOI DERROTADO'
                : phase === 'victory'
                  ? 'VOCÊ VENCEU!'
                  : 'BATALHA ENCERRADA'
            }}
          </p>
          <p class="battle-panel__treino">
            Foi um treino: seu Elo e suas estatísticas não mudaram.
          </p>
          <button class="btn btn-primary pixel" type="button" @click="goBack">
            {{ phase === 'victory' ? 'Vitória! Voltar' : 'Voltar' }}
          </button>
        </div>

        <button
          v-if="!isOver"
          class="flee-btn pixel"
          type="button"
          :disabled="phase !== 'player-turn'"
          @click="flee"
        >
          Fugir
        </button>
      </section>
    </div>
  </main>
</template>

<style scoped>
.arena {
  position: relative;
  height: 100%;
  overflow: hidden;
  background: var(--bg-deep);
}

/* O palco (fundo, os dois lutadores e as barras de HP) é o ArenaPalco.vue —
   compartilhado com a arena do PvP. O que sobra aqui é o HUD do treino. */

.arena__hud {
  position: absolute;
  inset: 0;
  z-index: 2; /* acima do palco (z-index:0) e dos modelos -> botões/textos na frente */
  display: flex;
  flex-direction: column;
  pointer-events: none;
  /* só os controles recebem toque; o resto deixa girar o modelo */
}

.arena__hud > * {
  pointer-events: auto;
}

.arena__hud--defeat::after,
.arena__hud--victory::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  animation: result-pulse 2.4s ease-in-out infinite;
}

.arena__hud--defeat::after {
  background: radial-gradient(circle at center, transparent 34%, rgba(205, 32, 32, 0.42) 100%);
  box-shadow: inset 0 0 80px rgba(255, 48, 48, 0.48);
}

.arena__hud--victory::after {
  background: radial-gradient(circle at center, transparent 42%, rgba(255, 209, 102, 0.22) 100%);
  box-shadow: inset 0 0 70px rgba(255, 209, 102, 0.22);
}

@keyframes result-pulse {
  50% {
    opacity: 0.62;
  }
}

.arena__back {
  position: absolute;
  top: calc(12px + env(safe-area-inset-top));
  right: 12px;
  width: 38px;
  height: 38px;
  border-radius: var(--radius);
  background: rgba(0, 0, 0, 0.45);
  color: var(--text);
  border: 1px solid var(--border);
  font-size: 18px;
}

/* Logo ABAIXO da barra do inimigo, alinhado com ela: os dois ficam à esquerda,
   e o botão de voltar ocupa a direita. Fundo opaco porque a arena é usada sob
   luz forte e o texto fica sobre o cenário em movimento. */
.arena__selo {
  position: absolute;
  /* 12px do topo + ~56px da barra (avatar 40 + 8/8 de padding) + folga. */
  top: calc(76px + env(safe-area-inset-top));
  left: 12px;
  max-width: 62%;
  margin: 0;
  padding: 5px 8px;
  border: 1px solid var(--unifil-gold);
  border-radius: var(--radius);
  background: rgba(0, 0, 0, 0.72);
  color: var(--unifil-gold);
  font-size: 6px;
  line-height: 1.5;
  letter-spacing: 0.05em;
  pointer-events: none;
}

/* Botão de canto para alternar AR (abaixo do voltar) */
.arena__ar-toggle {
  position: absolute;
  top: calc(58px + env(safe-area-inset-top));
  right: 12px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 34px;
  padding: 0 12px;
  border-radius: 100px;
  background: rgba(0, 0, 0, 0.55);
  color: var(--text);
  border: 1px solid var(--border);
  font-size: 11px;
  font-weight: 700;
  white-space: nowrap;
}

.arena__ar-toggle--on {
  border-color: var(--ds-blue);
  color: var(--ds-blue-glow);
}

.arena__ar-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--text-muted);
}

.arena__ar-toggle--on .arena__ar-dot {
  background: var(--ds-blue-glow);
  box-shadow: 0 0 8px var(--ds-blue-glow);
}

.arena__ar-note {
  position: absolute;
  top: calc(100px + env(safe-area-inset-top));
  right: 12px;
  max-width: 60%;
  padding: 6px 10px;
  border-radius: var(--radius);
  background: rgba(0, 0, 0, 0.55);
  color: var(--text-muted);
  font-size: 10px;
  line-height: 1.4;
  text-align: right;
}

.arena__ar-note--xr {
  top: calc(136px + env(safe-area-inset-top));
}

/* Botão de AR ancorado (WebXR) — abaixo do toggle de câmera */
.arena__ar-real {
  position: absolute;
  top: calc(96px + env(safe-area-inset-top));
  right: 12px;
  min-height: 34px;
  padding: 0 14px;
  border-radius: 100px;
  background: var(--ds-blue);
  color: var(--bg-deep);
  border: 1px solid var(--ds-blue-glow);
  font-size: 11px;
  font-weight: 700;
  white-space: nowrap;
}

/* Overlay do DOM durante a sessão imersiva. Sem AR ativo fica invisível e
   deixa o toque passar (pointer-events: none); só os controles recebem toque. */
.arena__xr-overlay {
  position: fixed;
  inset: 0;
  z-index: 3;
  pointer-events: none;
}

.arena__xr-hint {
  position: absolute;
  top: calc(16px + env(safe-area-inset-top));
  left: 50%;
  transform: translateX(-50%);
  max-width: 80%;
  padding: 8px 14px;
  border-radius: 100px;
  background: rgba(0, 0, 0, 0.7);
  color: var(--text);
  font-size: 12px;
  text-align: center;
}

.arena__xr-exit {
  position: absolute;
  bottom: calc(24px + env(safe-area-inset-bottom));
  left: 50%;
  transform: translateX(-50%);
  min-height: 44px;
  padding: 0 28px;
  border-radius: 100px;
  background: rgba(0, 0, 0, 0.7);
  color: var(--text);
  border: 1px solid var(--border);
  font-size: 13px;
  font-weight: 700;
  pointer-events: auto;
}

/* Chip de status (Travado/Confuso/Queimando) junto de cada barra */
.arena__status {
  position: absolute;
  z-index: 2;
  padding: 2px 8px;
  border-radius: 100px;
  background: rgba(0, 0, 0, 0.6);
  border: 1px solid var(--error);
  color: var(--error);
  font-size: 9px;
  font-weight: 700;
  white-space: nowrap;
}

.arena__status--enemy {
  top: calc(58px + env(safe-area-inset-top));
  left: 12px;
}

/* Logo abaixo da barra do jogador, que o palco ancora no mesmo token. */
.arena__status--player {
  left: 12px;
  bottom: calc(var(--palco-barra-jogador) - 24px);
}

/* Painel inferior: mensagem + grid 2x2 + fugir */
.battle-panel {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 12px calc(12px + env(safe-area-inset-bottom));
  background: linear-gradient(180deg, rgba(18, 20, 24, 0.55), var(--bg-deep) 32%);
}

.battle-panel__message {
  min-height: 44px;
  display: flex;
  align-items: center;
  padding: 10px 14px;
  border: 2px solid var(--yellow);
  border-radius: var(--radius);
  background: var(--bg-card);
  color: var(--text);
  font-size: 9px;
  line-height: 1.6;
}

.battle-panel__moves {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.flee-btn {
  align-self: center;
  min-height: 38px;
  padding: 0 26px;
  border-radius: var(--radius);
  background: transparent;
  border: 2px solid var(--error);
  color: var(--error);
  font-size: 8px;
}

.flee-btn:disabled {
  opacity: 0.4;
}

.battle-panel__end {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.battle-panel__result {
  margin: 0;
  font-size: 11px;
  line-height: 1.6;
  text-align: center;
}

/* O resultado é o momento em que o aluno mais supõe ter ganhado algo. */
.battle-panel__treino {
  margin: 0;
  color: var(--text-muted);
  font-size: 11px;
  line-height: 1.5;
  text-align: center;
}

.battle-panel__result--defeat {
  color: #ff9b9b;
}

.battle-panel__result--victory {
  color: #ffd166;
}

@media (prefers-reduced-motion: reduce) {
  .arena__hud--defeat::after,
  .arena__hud--victory::after {
    animation: none;
    transition: none;
  }
}
</style>
