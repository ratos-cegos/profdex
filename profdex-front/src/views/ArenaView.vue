<script setup>
import { onMounted, onUnmounted, ref, useTemplateRef } from 'vue'
import { useRouter } from 'vue-router'
import BattleHpBar from '../components/BattleHpBar.vue'
import BinaryTunnelScene from '../components/BinaryTunnelScene.vue'
import DamagePopup from '../components/DamagePopup.vue'
import MoveButton from '../components/MoveButton.vue'
import { useBattle } from '../composables/useBattle.js'
import { openBackCamera } from '../composables/useBackCamera.js'
import { useProfessorsStore } from '../stores/professors'
import { buildMoveset } from '../data/moves.js'
import { typesForProfessor, PROFESSOR_TYPES, PLAYER_KEY } from '../data/professorTypes.js'
import { ehPixelArt, PLAYER_SPRITE_URL, spriteUrlForProfessor } from '../data/professorSprites.js'
import { TREINO_ENEMY_FALLBACK_NAME, TREINO_ENEMY_KEY } from '../data/treino.js'

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
  <main class="arena" :class="{ 'arena--defeat': playerFainted, 'arena--victory': enemyFainted }">
    <!-- Palco: inimigo ao fundo (de frente) e jogador em primeiro plano (de costas) -->
    <div class="arena__stage" :class="{ 'arena__stage--ar': arEnabled }">
      <!-- Fundo do combate: câmera (AR) ou o cenário do túnel binário -->
      <video v-show="arEnabled" ref="camVideo" class="arena__camera" autoplay playsinline muted />
      <BinaryTunnelScene v-if="!arEnabled" class="arena__scenario" :speed="4" />
      <img class="arena__brand" src="/marca/logotipo-branco.png" alt="UNIFIL" />

      <div class="arena__fighter arena__fighter--enemy">
        <img
          class="arena__model"
          :class="{
            'arena__model--hit': enemyHit,
            'arena__model--fainted': enemyFainted,
            'arena__model--pixel': ehPixelArt(enemySpriteSrc),
          }"
          :src="enemySpriteSrc"
          :alt="`Prof. ${enemyProfessor.name} em batalha`"
          decoding="async"
        />
        <DamagePopup v-for="item in enemyFeedback" :key="item.id" v-bind="item" />
      </div>
      <div class="arena__fighter arena__fighter--player">
        <img
          class="arena__model"
          :class="{
            'arena__model--hit': playerHit,
            'arena__model--fainted': playerFainted,
            'arena__model--pixel': ehPixelArt(playerSpriteSrc),
          }"
          :src="playerSpriteSrc"
          alt="Seu personagem"
          decoding="async"
        />
        <DamagePopup v-for="item in playerFeedback" :key="item.id" v-bind="item" />
      </div>
    </div>

    <!-- HUD sobreposto ao palco -->
    <div
      class="arena__hud"
      :class="{
        'arena__hud--player-hit': playerHit,
        'arena__hud--defeat': playerFainted,
        'arena__hud--victory': enemyFainted,
      }"
    >
      <button class="arena__back" type="button" @click="goBack">←</button>

      <!-- Sem isto, um aluno passa a tarde aqui achando que sobe de Elo: a
           tela é idêntica à do PvP e nada dizia que não valia nada. -->
      <p class="arena__selo pixel">TREINO — NÃO VALE RANKING</p>

      <!-- Barra do inimigo (topo esquerdo, como no esboço) -->
      <BattleHpBar
        class="arena__enemy-bar"
        :name="`Prof. ${enemy.name}`"
        :types="enemyTypes"
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
        :name="player.name"
        :types="playerTypes"
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
  width: 100%;
  height: 100%;
  pointer-events: none;
  object-fit: contain;
  transition:
    filter 0.6s ease,
    opacity 0.6s ease,
    transform 0.6s ease;
}
.arena__fighter {
  position: absolute;
  z-index: 1;
}

.arena__brand {
  position: absolute;
  top: 3%;
  right: 4%;
  z-index: 1;
  width: clamp(64px, 19vw, 112px);
  height: auto;
  opacity: 0.64;
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.45));
}

/* Pixel art ampliada sem suavização; `object-fit: contain` acima já preserva a
   proporção do sprite dentro da caixa do palco. */
.arena__model--pixel {
  image-rendering: pixelated;
}

/* Inimigo: mais ao centro e menor -> parece mais fundo no túnel (perspectiva) */
/* Enquadramento no estilo das batalhas por turnos clássicas: oponente ao fundo,
   à esquerda e menor (parece mais distante no túnel); jogador em primeiro plano,
   à direita e maior.
   As caixas foram refeitas para os sprites em pixel art, que são bem mais altos
   que largos (proporção ~0.55) — com as medidas antigas, pensadas para os
   cartoons quase quadrados, os dois bonecos se sobrepunham e o do jogador
   avançava por trás do painel de comandos, aparecendo nos vãos entre os botões.
   As faixas verticais agora não se cruzam: oponente 10%–34%, jogador 35%–71%,
   e o painel começa por volta de 72%. */
.arena__fighter--enemy {
  top: 10%;
  left: 6%;
  width: 38%;
  height: 24%;
  /* Contorno vermelho discreto: drop-shadow segue a silhueta do sprite
     (o PNG é transparente), diferente de um border/outline retangular.
     --error é o vermelho real da paleta (--red do tema é marrom). */
  filter: drop-shadow(0 0 1px var(--error)) drop-shadow(0 0 2px var(--error));
}

/* Jogador: em primeiro plano, à direita, de costas — abaixado (mais para baixo) */
/* Jogador à direita: a barra de HP dele é ancorada à esquerda (máx. 58% de
   largura), então o boneco ocupa a faixa livre da direita sem cobri-la. */
.arena__fighter--player {
  right: 3%;
  bottom: 29%;
  width: 42%;
  height: 36%;
  /* Mesmo contorno, em azul */
  filter: drop-shadow(0 0 1px var(--ds-blue-glow)) drop-shadow(0 0 2px var(--ds-blue-glow));
}

/* Flash + tremida no modelo que tomou dano */
.arena__model--hit {
  animation: shake 0.4s ease;
  filter: brightness(1.6) saturate(0.4);
}

.arena__model--fainted,
.arena__model--fainted.arena__model--hit {
  animation: none;
  filter: grayscale(1) brightness(0.6);
  opacity: 0.75;
  transform: translateY(8%) rotate(12deg);
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

.arena__hud > * {
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
  transition:
    transform 0.1s,
    border-color 0.15s;
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
  .arena__model,
  .arena__model--hit,
  .arena__hud--defeat::after,
  .arena__hud--victory::after {
    animation: none;
    transition: none;
  }
}
</style>
