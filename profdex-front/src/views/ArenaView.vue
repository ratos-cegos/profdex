<script setup>
import { onMounted, onUnmounted, ref, useTemplateRef } from 'vue'
import { useRouter } from 'vue-router'
import BattleHpBar from '../components/BattleHpBar.vue'
import BinaryTunnelScene from '../components/BinaryTunnelScene.vue'
import { useBattle } from '../composables/useBattle.js'
import { openBackCamera } from '../composables/useBackCamera.js'
import { useProfessorsStore } from '../stores/professors'
import { buildMoveset } from '../data/moves.js'
import {
  typesForProfessor,
  typeInfos,
  PROFESSOR_TYPES,
  PLAYER_KEY,
} from '../data/professorTypes.js'
import {
  PLAYER_SPRITE_URL,
  spriteUrlForProfessor,
} from '../data/professorSprites.js'

const MAX_HP = 120

const router = useRouter()
const store = useProfessorsStore()

// Professor inimigo: FIXO no Eron por enquanto — a arena sempre abre a batalha
// contra ele, independente do professor que veio em /arena/:id.
// Para voltar a usar o professor da rota, troque o `ENEMY_KEY` por
// `route.params.id` (o findByKey aceita UUID, slug e nome) e restaure o
// `useRoute()` no import de vue-router.
//
// O `beforeEnter` da rota já carregou a lista, então dá para resolver aqui no
// setup — a batalha inteira (tipos, golpes, modelo) deriva deste objeto, e por
// isso ele precisa estar correto ANTES de useBattle() montar os combatentes.
// O literal é o fallback de quando a lista não veio (backend fora do ar): os
// dados do Eron que a batalha usa são slug e nome, então ela roda igual.
const ENEMY_KEY = 'eron'
const enemyProfessor = store.findByKey(ENEMY_KEY) || {
  id: ENEMY_KEY,
  name: 'Eron',
  slug: ENEMY_KEY,
}

// ── Realidade aumentada: DESATIVADA por enquanto. O combate acontece sempre
// dentro do cenário do túnel binário (câmera/AR desligada). Para reativar,
// volte `arEnabled` para `true` e restaure o botão de alternar no template.
const arEnabled = ref(false)
const arError = ref(null)
const camVideo = useTemplateRef('camVideo')
let camStream = null

async function startCamera() {
  arError.value = null
  try {
    camStream = await openBackCamera()
    const v = camVideo.value
    if (v) {
      v.srcObject = camStream
      v.setAttribute('playsinline', '')
      v.muted = true
      await v.play()
    }
  } catch (e) {
    // Sem câmera/permissão: cai para o cenário 3D em vez de travar o combate.
    arError.value = e?.message ?? 'Câmera indisponível'
    arEnabled.value = false
  }
}

function stopCamera() {
  if (camStream) {
    camStream.getTracks().forEach((t) => t.stop())
    camStream = null
  }
  if (camVideo.value) camVideo.value.srcObject = null
}

onMounted(() => {
  if (arEnabled.value) startCamera()
})
onUnmounted(stopCamera)

// ── Tipos dos combatentes ───────────────────────────────────────────────────
// Jogador: controlamos o Gustavo (Arquitetura). Inimigo: tipos (1–2) do
// professor vindo da rota, resolvidos pela planilha (fallback determinístico).
const enemyTypes = typesForProfessor(enemyProfessor)
const playerTypes = PROFESSOR_TYPES[PLAYER_KEY]

const enemyTypeIcons = typeInfos(enemyTypes).map((t) => t.icon).join('')
const playerTypeIcons = typeInfos(playerTypes).map((t) => t.icon).join('')

// Cada lado recebe um deck de 4 golpes, misturando seus tipos.
const playerMoves = buildMoveset(playerTypes)
const enemy = {
  name: enemyProfessor.name,
  types: enemyTypes,
  maxHp: MAX_HP,
  moves: buildMoveset(enemyTypes),
}
const player = {
  name: 'Gustavo',
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
  playerStatus,
  enemyStatus,
  isOver,
  start,
  useMove,
  flee,
} = useBattle({ player, enemy })

onMounted(start)

// Cada lado usa a arte do seu dono: o inimigo é o professor vindo da rota
// (Eron, Mário, ...) e o jogador é sempre o Gustavo.
//
// Sprite 2D e não .glb — os modelos passam de 25 MB cada (o do Gustavo, 74 MB)
// e dois deles na mesma tela estouravam a memória da aba no celular.
// Ver docs/BUG-BATALHA-TRAVANDO.md.
const enemySpriteSrc = spriteUrlForProfessor(enemyProfessor)
const playerSpriteSrc = PLAYER_SPRITE_URL

// AR ancorado (WebXR) e AR Quick Look (iOS) DESATIVADOS por enquanto — a arena
// roda só no cenário 3D. O código foi removido; ver histórico do git para
// restaurar `useArenaAR`/`pollARSupport` quando o AR voltar.

function goBack() {
  router.push({ name: 'batalha', query: { profId: enemyProfessor.id } })
}
</script>

<template>
  <main class="arena">
    <!-- Palco: inimigo ao fundo (de frente) e jogador em primeiro plano (de costas) -->
    <div class="arena__stage" :class="{ 'arena__stage--ar': arEnabled }">
      <!-- Fundo do combate: câmera (AR) ou o cenário do túnel binário -->
      <video
        v-show="arEnabled"
        ref="camVideo"
        class="arena__camera"
        autoplay
        playsinline
        muted
      />
      <BinaryTunnelScene v-if="!arEnabled" class="arena__scenario" :speed="4" />

      <img
        class="arena__model arena__model--enemy"
        :class="{ 'arena__model--hit': enemyHit }"
        :src="enemySpriteSrc"
        :alt="`Prof. ${enemyProfessor.name} em batalha`"
        decoding="async"
      />
      <img
        class="arena__model arena__model--player"
        :class="{ 'arena__model--hit': playerHit }"
        :src="playerSpriteSrc"
        alt="Seu personagem"
        decoding="async"
      />
    </div>

    <!-- HUD sobreposto ao palco -->
    <div class="arena__hud" :class="{ 'arena__hud--player-hit': playerHit }">
      <button class="arena__back" type="button" @click="goBack">←</button>

      <!-- Barra do inimigo (topo esquerdo, como no esboço) -->
      <BattleHpBar
        class="arena__enemy-bar"
        :name="`${enemyTypeIcons} Prof. ${enemy.name}`"
        :hp="enemyHp"
        :max-hp="enemy.maxHp"
        :avatar-src="`/professors/${enemyProfessor.slug}-cartoon.png`"
      />
      <span v-if="enemyStatus" class="arena__status arena__status--enemy">
        {{ enemyStatus }}
      </span>

      <!-- Barra do jogador (acima do painel de comandos) -->
      <BattleHpBar
        class="arena__player-bar"
        :name="`${playerTypeIcons} ${player.name}`"
        :hp="playerHp"
        :max-hp="player.maxHp"
      />
      <span v-if="playerStatus" class="arena__status arena__status--player">
        {{ playerStatus }}
      </span>

      <!-- Painel de comandos: mensagem + golpes + fugir -->
      <section class="battle-panel" aria-label="Comandos de batalha">
        <div class="battle-panel__message pixel" aria-live="polite">
          {{ message }}
        </div>

        <div v-if="phase === 'player-turn'" class="battle-panel__moves">
          <button
            v-for="move in playerMoves"
            :key="move.id"
            class="move-btn"
            type="button"
            @click="useMove(move)"
          >
            <span class="pixel move-btn__name">{{ move.name }}</span>
            <span class="pixel move-btn__meta">{{ move.raw }}</span>
          </button>
        </div>

        <div v-else-if="isOver" class="battle-panel__end">
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

.arena__stage {
  position: absolute;
  inset: 0;
  /* z-index explícito -> a etapa vira um contexto de empilhamento próprio,
    prendendo os modelos (z-index:1) abaixo do HUD (z-index:2). Assim os
    bonecos nunca cobrem os botões/textos. */
  z-index: 0;
  /* Piso da arena: gradiente sutil para dar profundidade */
  background:
    radial-gradient(ellipse 65% 18% at 32% 42%, rgba(237, 175, 104, 0.12), transparent),
    radial-gradient(ellipse 70% 16% at 72% 74%, rgba(237, 175, 104, 0.14), transparent),
    linear-gradient(180deg, var(--bg-deep) 0%, #1a1e26 55%, var(--bg-deep) 100%);
}

/* No modo AR o gradiente some para a câmera aparecer limpa */
.arena__stage--ar {
  background: #000;
}

/* Camada de fundo: feed da câmera (AR) */
.arena__camera {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  z-index: 0;
}

/* Camada de fundo: cenário do túnel binário (AR desligada) */
.arena__scenario {
  position: absolute;
  inset: 0;
  z-index: 0;
}

/* Sprites 2D dos combatentes. Ocupam o mesmo lugar dos antigos <model-viewer>;
   `contain` preserva a proporção da arte dentro daquela caixa. */
.arena__model {
  position: absolute;
  z-index: 1;
  pointer-events: none;
  object-fit: contain;
}

/* Inimigo: mais ao centro e menor -> parece mais fundo no túnel (perspectiva) */
.arena__model--enemy {
  top: 24%;
  left: 10%;
  width: 50%;
  height: 34%;
  /* Contorno vermelho discreto: drop-shadow segue a silhueta do sprite
     (o PNG é transparente), diferente de um border/outline retangular.
     --error é o vermelho real da paleta (--red do tema é marrom). */
  filter:
    drop-shadow(0 0 1px var(--error))
    drop-shadow(0 0 2px var(--error));
}

/* Jogador: em primeiro plano, à direita, de costas — abaixado (mais para baixo) */
.arena__model--player {
  right: -10%;
  bottom: 17%;
  width: 88%;
  height: 50%;
  /* Mesmo contorno, em azul */
  filter:
    drop-shadow(0 0 1px var(--ds-blue-glow))
    drop-shadow(0 0 2px var(--ds-blue-glow));
}

/* Flash + tremida no modelo que tomou dano */
.arena__model--hit {
  animation: shake 0.4s ease;
  filter: brightness(1.6) saturate(0.4);
}

.arena__hud {
  position: absolute;
  inset: 0;
  z-index: 2; /* acima do palco (z-index:0) e dos modelos -> botões/textos na frente */
  display: flex;
  flex-direction: column;
  pointer-events: none;
  /* só os controles recebem toque; o resto deixa girar o modelo */
}

.arena__hud>* {
  pointer-events: auto;
}

/* Flash vermelho na tela quando o jogador toma dano */
.arena__hud--player-hit::before {
  content: '';
  position: absolute;
  inset: 0;
  background: rgba(255, 107, 107, 0.25);
  pointer-events: none;
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

.arena__enemy-bar {
  position: absolute;
  top: calc(12px + env(safe-area-inset-top));
  left: 12px;
  max-width: 62%;
}

.arena__player-bar {
  position: absolute;
  left: 12px;
  bottom: 256px;
  max-width: 58%;
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

.arena__status--player {
  left: 12px;
  bottom: 232px;
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

.move-btn {
  min-height: 56px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  gap: 4px;
  padding: 8px 12px;
  border-radius: var(--radius);
  background: var(--bg-card);
  border: 2px solid var(--border);
  color: var(--text);
  transition: transform 0.1s, border-color 0.15s;
}

.move-btn:active {
  transform: scale(0.97);
  border-color: var(--yellow);
}

.move-btn__name {
  font-size: 8px;
  text-align: left;
}

.move-btn__meta {
  font-size: 6px;
  color: var(--text-muted);
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
}
</style>
