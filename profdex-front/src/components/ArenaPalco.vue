<script setup>
import { computed, onMounted, onUnmounted, useTemplateRef, watch } from 'vue'
import BattleHpBar from './BattleHpBar.vue'
import DamagePopup from './DamagePopup.vue'
import { spritesDaBatalha } from '../composables/battleSprites.js'
import { openBackCamera } from '../composables/useBackCamera.js'
import { ehPixelArt } from '../data/professorArte.js'

/**
 * O palco de uma batalha por turnos: fundo, os dois lutadores e as barras de HP.
 *
 * Extraído do treino (`ArenaView.vue`), que é a referência aprovada — o PvP
 * tinha o seu próprio, com cada lado numa coluna flex e o sprite em `flex: 1`.
 * Naquele arranjo **o tamanho do personagem era o espaço que sobrava**: quem
 * tinha mais coisa na coluna ficava menor, e os dois lados apareciam em escalas
 * diferentes sem que ninguém tivesse escolhido isso.
 *
 * Aqui cada lutador tem um QUADRO absoluto em porcentagem do palco, e o sprite
 * preenche o quadro com `object-fit: contain`. O tamanho não depende de mais
 * nada na tela — é a regra que o resto deste arquivo existe para sustentar.
 *
 * Fora daqui, de propósito: comandos, timer, mensagem de turno, banco de
 * reservas e botões. O palco é igual nas duas telas por natureza; o que difere
 * entre treino e ranqueada são os comandos.
 *
 * @typedef {object} Lado
 * @property {object} professor Linha do professor (arte, `pixelArt`).
 * @property {string} name Rótulo da barra de HP, já montado pelo chamador.
 * @property {string[]} [types] Ids de tipo, desenhados antes do nome na barra.
 * @property {number} hp
 * @property {number} maxHp
 * @property {boolean} [hit] Tomou dano agora: pisca e treme.
 * @property {boolean} [fainted] Caiu: cinza, tombado.
 * @property {Array} [feedback] Popups de dano/cura deste lado.
 */
const props = defineProps({
  /** O oponente: ao fundo, à esquerda, de frente. */
  foe: { type: Object, required: true },
  /** Você: primeiro plano, à direita, de costas. */
  you: { type: Object, required: true },
  /**
   * Fundo pela câmera traseira em vez do ginásio. Só o treino liga — o PvP
   * simplesmente não passa a flag.
   */
  ar: { type: Boolean, default: false },
})

/** A câmera não abriu (permissão negada, aparelho sem ela): volte para o 3D. */
const emit = defineEmits(['ar-indisponivel'])

// Perspectiva clássica de turnos, num módulo puro para ser testável: você de
// costas, o rival de frente. O PvP usava o sprite de FRENTE nos dois lados e o
// jogador via a própria cara em primeiro plano.
const sprites = computed(() => spritesDaBatalha(props.you?.professor, props.foe?.professor))

const camVideo = useTemplateRef('camVideo')
let camStream = null

async function ligarCamera() {
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
    // Sem câmera/permissão: quem chamou volta para o cenário 3D em vez de
    // travar o combate numa tela preta.
    emit('ar-indisponivel', e?.message ?? 'Câmera indisponível')
  }
}

function desligarCamera() {
  if (camStream) {
    camStream.getTracks().forEach((t) => t.stop())
    camStream = null
  }
  if (camVideo.value) camVideo.value.srcObject = null
}

onMounted(() => {
  if (props.ar) ligarCamera()
})
watch(
  () => props.ar,
  (ligada) => (ligada ? ligarCamera() : desligarCamera()),
)
onUnmounted(desligarCamera)
</script>

<template>
  <div class="palco" :class="{ 'palco--ar': ar }">
    <!-- Fundo do combate: câmera (AR) ou o ginásio da UNIFIL -->
    <video v-show="ar" ref="camVideo" class="palco__camera" autoplay playsinline muted />
    <!-- Tela deitada (desktop): a versão panorâmica do ginásio. A retrato,
         esticada em tela larga, virava um borrão ampliado. -->
    <picture v-if="!ar">
      <source media="(min-aspect-ratio: 1/1)" srcset="/cenarios/ginasio-unifil-desktop.jpg" />
      <img
        class="palco__cenario"
        src="/cenarios/ginasio-unifil.jpg"
        alt=""
        aria-hidden="true"
        decoding="async"
        fetchpriority="high"
      />
    </picture>
    <img class="palco__marca" src="/marca/logotipo-branco.png" alt="UNIFIL" />

    <div class="palco__quadro palco__quadro--foe">
      <img
        class="palco__sprite"
        :class="{
          'palco__sprite--hit': foe.hit,
          'palco__sprite--fainted': foe.fainted,
          'palco__sprite--pixel': ehPixelArt(foe.professor),
        }"
        :src="sprites.foe"
        :alt="`Prof. ${foe.name} em batalha`"
        decoding="async"
      />
      <DamagePopup v-for="item in foe.feedback ?? []" :key="item.id" v-bind="item" />
    </div>

    <div class="palco__quadro palco__quadro--you">
      <img
        class="palco__sprite"
        :class="{
          'palco__sprite--hit': you.hit,
          'palco__sprite--fainted': you.fainted,
          'palco__sprite--pixel': ehPixelArt(you.professor),
        }"
        :src="sprites.you"
        alt="Seu personagem"
        decoding="async"
      />
      <DamagePopup v-for="item in you.feedback ?? []" :key="item.id" v-bind="item" />
    </div>

    <!-- Clarão vermelho quando VOCÊ toma dano. Mora no palco, acima dos
         lutadores e abaixo das barras: por cima delas, a pancada tingiria de
         vermelho justamente o número que o jogador está tentando ler. -->
    <div v-if="you.hit" class="palco__flash" />

    <!-- Barras SOBREPOSTAS ao palco, não empilhadas em coluna com o sprite: é o
         empilhamento que fazia o personagem do rival encolher no PvP. -->
    <BattleHpBar
      class="palco__barra palco__barra--foe"
      :name="`Prof. ${foe.name}`"
      :types="foe.types ?? []"
      :hp="foe.hp"
      :max-hp="foe.maxHp"
      :avatar-src="sprites.foe"
    />
    <BattleHpBar
      class="palco__barra palco__barra--you"
      :name="you.name"
      :types="you.types ?? []"
      :hp="you.hp"
      :max-hp="you.maxHp"
    />
  </div>
</template>

<style scoped>
/*
 * O palco cobre a tela inteira e a faixa de comandos se SOBREPÕE ao rodapé
 * dele — é assim no treino, e é o que mantém os lutadores grandes.
 *
 * `--palco-recuo` é a única folga que uma tela pode pedir: quem tem faixa mais
 * alta que a do treino (o PvP, que ainda carrega o banco de reservas e o botão
 * de troca) sobe o palco por essa DIFERENÇA. Encolher o palco pela faixa
 * inteira devolveria o defeito que esta extração conserta — dois personagens
 * pequenos, do tamanho do que sobrou.
 */
.palco {
  position: absolute;
  inset: 0 0 var(--palco-recuo, 0) 0;
  /* z-index explícito -> o palco vira um contexto de empilhamento próprio,
    prendendo os lutadores (z-index:1) abaixo do HUD da view (z-index:2). Assim
    os bonecos nunca cobrem os botões/textos. */
  z-index: 0;
  /* Cor de espera enquanto a foto do ginásio não carrega. Escura de propósito:
     o palco pisca do escuro para a quadra, e não do claro para o escuro. */
  background: var(--bg-deep);
}

/* Escurecimento por cima da quadra. A foto é clara e alaranjada; sem isto, o
   texto branco do HUD e a silhueta dos bonecos brigam com o piso. Mais forte
   nas pontas (onde ficam as barras de HP e a faixa de comandos) e quase
   transparente no miolo, que é onde a quadra precisa aparecer. */
.palco::after {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  background: linear-gradient(
    180deg,
    rgba(10, 12, 16, 0.62) 0%,
    rgba(10, 12, 16, 0.22) 26%,
    rgba(10, 12, 16, 0.12) 52%,
    rgba(10, 12, 16, 0.55) 100%
  );
}

/* Com a câmera ligada o fundo de espera vira preto puro, para o feed não
   aparecer sobre um azul-escuro nas bordas enquanto negocia resolução. */
.palco--ar {
  background: #000;
}

/* Camada de fundo: feed da câmera (AR) */
.palco__camera {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  z-index: 0;
}

/* Camada de fundo: o ginásio da UNIFIL (AR desligada).
 *
 * `height: 120%` ancorado embaixo, e não `inset: 0`, para ENQUADRAR a foto: ela
 * é um retrato de corpo inteiro do ginásio (arquibancada em cima, quadra
 * embaixo) e, mostrada inteira, deixaria a linha da quadra por volta de 43% da
 * tela — com o oponente (que ocupa 10%–34%) flutuando na arquibancada.
 *
 * Cortando ~17% do topo, a quadra começa por volta de 32%: o oponente fica com
 * os pés na linha de fundo e o jogador, no meio da quadra. Sobra arquibancada e
 * placar o bastante para o lugar continuar reconhecível.
 */
.palco__cenario {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  height: 120%;
  z-index: 0;
  object-fit: cover;
  object-position: center bottom;
}

/* Na foto panorâmica a linha de fundo da quadra fica na metade da imagem; com
   125% de altura ancorada embaixo ela sobe para ~37% da tela, perto dos pés do
   oponente, e o placar e a arquibancada continuam à vista. */
@media (min-aspect-ratio: 1/1) {
  .palco__cenario {
    height: 125%;
  }
}

.palco__marca {
  position: absolute;
  top: 3%;
  right: 4%;
  z-index: 1;
  width: clamp(64px, 19vw, 112px);
  height: auto;
  opacity: 0.64;
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.45));
}

/* ── Os dois quadros ─────────────────────────────────────────────────────────
 *
 * Enquadramento no estilo das batalhas por turnos clássicas: oponente ao fundo,
 * à esquerda e menor (parece mais distante); jogador em primeiro plano, à
 * direita e maior.
 *
 * As medidas são porcentagem do PALCO e de nada mais. Foram refeitas para os
 * sprites em pixel art, que são bem mais altos que largos (proporção ~0.55) —
 * com as medidas antigas, pensadas para os cartoons quase quadrados, os dois
 * bonecos se sobrepunham e o do jogador avançava por trás da faixa de comandos,
 * aparecendo nos vãos entre os botões. As faixas verticais agora não se cruzam:
 * oponente 10%–34%, jogador 35%–71%, e a faixa começa por volta de 72%.
 */
.palco__quadro {
  position: absolute;
  z-index: 1;
}

.palco__quadro--foe {
  top: 10%;
  left: 6%;
  width: 38%;
  height: 24%;
  /* Contorno vermelho discreto: drop-shadow segue a silhueta do sprite
     (o PNG é transparente), diferente de um border/outline retangular.
     --error é o vermelho real da paleta (--red do tema é marrom). */
  filter: drop-shadow(0 0 1px var(--error)) drop-shadow(0 0 2px var(--error));
}

/* Jogador à direita: a barra de HP dele é ancorada à esquerda (máx. 58% de
   largura), então o boneco ocupa a faixa livre da direita sem cobri-la. */
.palco__quadro--you {
  right: 3%;
  bottom: 29%;
  width: 42%;
  height: 36%;
  /* Mesmo contorno, em azul */
  filter: drop-shadow(0 0 1px var(--ds-blue-glow)) drop-shadow(0 0 2px var(--ds-blue-glow));
}

/* O sprite preenche o quadro e nada mais: `contain` preserva a proporção da
   arte, e `bottom center` alinha os professores PELO PÉ — sem isso, quem tem
   arte mais folgada no topo do PNG flutua acima do chão ao lado de quem não
   tem. É normalização por CSS, de propósito: repadronizar a arte de todo o
   elenco é trabalho manual sobre PNGs já impressos nas fichas. */
.palco__sprite {
  width: 100%;
  height: 100%;
  pointer-events: none;
  object-fit: contain;
  object-position: bottom center;
  transition:
    filter 0.6s ease,
    opacity 0.6s ease,
    transform 0.6s ease;
}

/* Pixel art ampliada sem suavização; `object-fit: contain` acima já preserva a
   proporção do sprite dentro do quadro. */
.palco__sprite--pixel {
  image-rendering: pixelated;
}

/* Flash + tremida no sprite que tomou dano */
.palco__sprite--hit {
  animation: shake 0.4s ease;
  filter: brightness(1.6) saturate(0.4);
}

.palco__sprite--fainted,
.palco__sprite--fainted.palco__sprite--hit {
  animation: none;
  filter: grayscale(1) brightness(0.6);
  opacity: 0.75;
  transform: translateY(8%) rotate(12deg);
}

.palco__flash {
  position: absolute;
  inset: 0;
  z-index: 1;
  pointer-events: none;
  background: rgba(255, 107, 107, 0.25);
}

/* ── Barras de HP, sobrepostas ──────────────────────────────────────────── */
.palco__barra {
  position: absolute;
  z-index: 2;
}

.palco__barra--foe {
  top: calc(12px + env(safe-area-inset-top));
  left: 12px;
  max-width: 62%;
}

/* Junto da faixa de comandos, que se sobrepõe ao rodapé do palco. */
.palco__barra--you {
  left: 12px;
  bottom: var(--palco-barra-jogador);
  max-width: 58%;
}

@media (prefers-reduced-motion: reduce) {
  .palco__sprite,
  .palco__sprite--hit {
    animation: none;
    transition: none;
  }
}
</style>
