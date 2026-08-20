<script setup>
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const router = useRouter()
const auth = useAuthStore()

function start() {
  if (auth.isAuthenticated) {
    router.push({ name: 'profdex' })
  } else {
    router.push({ name: 'login' })
  }
}

const steps = [
  {
    icon: '/icons/passo1.png',
    title: 'Encontre o Estande ProfDex',
    desc: 'Procure a mesa do time ProfDex no evento. É de lá que sai tudo.',
  },
  {
    icon: '/icons/passo2.png',
    title: 'Rode o Quiz do Curso',
    desc: 'Na bancada, responda uma pergunta sobre o curso. Acertou, ganhou.',
  },
  {
    icon: '/icons/passo3.png',
    title: 'Receba o QR',
    desc: 'No acerto, um QR é sorteado da pilha — pode vir qualquer professor, de qualquer tipo.',
  },
  {
    icon: '/icons/passo4.png',
    title: 'Capture!',
    desc: 'Leia o QR no scanner do app e o professor entra na sua coleção.',
  },
]
</script>

<template>
  <div class="home pk-pixel">
    <div class="home__hero">
      <div class="home__ball">
        <img class="eagle-ball-icon" src="/eagle-ball.png" alt="" aria-hidden="true" />
      </div>
      <h1 class="home__title">PROF<span>DEX</span></h1>
      <p class="home__subtitle">Colecione seus professores!</p>
    </div>

    <div class="home__content pokemon-frame">
      <div class="home__section-title">Como Funciona</div>

      <div class="home__steps">
        <div v-for="(step, i) in steps" :key="i" class="step-box animate-fade-in">
          <img class="step-box__icon" :src="step.icon" alt="" aria-hidden="true" />
          <div class="step-box__body">
            <div class="step-box__num">{{ String(i + 1).padStart(2, '0') }}</div>
            <div class="step-box__title">{{ step.title }}</div>
            <div class="step-box__desc">{{ step.desc }}</div>
          </div>
        </div>
      </div>

      <div class="home__cta">
        <button class="btn-pokemon-action" @click="start">
          <span>COMEÇAR</span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Importando a fonte no lugar correto (fora do template) */
@import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap');

.pk-pixel {
  font-family: 'Press Start 2P', monospace !important;
}

/* Reset e Base da UI */
.home {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  background-color: var(--bg-deep);
  color: var(--text-primary);
}

/* Hero - Seção da Pokebola */
.home__hero {
  background: var(--unifil-orange);
  padding: 32px 24px 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  position: relative;
  border-bottom: 6px solid var(--surface);
}

/* Eagle Ball pixel art */
.home__ball {
  width: 88px;
  height: 88px;
}

/* Títulos do Hero */
.home__title {
  font-size: 22px;
  color: white;
  letter-spacing: 1px;
  margin: 0;
  text-shadow: 3px 3px 0 var(--surface);
}

.home__title span {
  color: var(--unifil-gold);
}

.home__subtitle {
  color: var(--text-primary);
  font-size: 9px;
  margin: 0;
  opacity: 0.9;
  text-transform: uppercase;
}

/* Caixa de Texto Estilo GBA */
.home__content {
  margin: 16px;
  padding: 20px 16px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  background: var(--surface);
  
  border: 4px solid var(--unifil-orange);
  box-shadow: 
    inset 0 0 0 2px var(--unifil-gold),
    inset 0 0 0 4px var(--surface);
  border-radius: 4px;
}

.home__section-title {
  font-size: 11px;
  color: var(--unifil-gold);
  text-transform: uppercase;
}

.home__steps {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.step-box {
  display: flex;
  /* Centralizado: com o icone a 56px e a coluna de texto em ~64px, ancorar no
     topo deixava o desenho "subindo" em relacao ao bloco de texto. */
  align-items: center;
  gap: 14px;
  padding-bottom: 14px;
  border-bottom: 2px dashed var(--surface-border);
}

.step-box:last-child {
  border-bottom: none;
}

/* Caixa de tamanho FIXO com `object-fit: contain`, e nao largura livre.
   As quatro artes vao de 0.73 a 1.34 de proporcao: com a largura solta, o
   passo4 ocupava ~41px e o passo2 ~75px, e a coluna de texto comecava 34px
   mais a direita em umas linhas do que em outras — visivel numa lista
   vertical. A caixa fixa alinha o texto; o `contain` garante que nenhuma arte
   seja esticada ou cortada, so centralizada dentro dela.
   76x56 comporta a mais larga na altura cheia. */
.step-box__icon {
  width: 76px;
  height: 56px;
  flex-shrink: 0;
  object-fit: contain;
  image-rendering: pixelated;
  user-select: none;
  pointer-events: none;
}

.step-box__num {
  font-size: 9px;
  color: var(--unifil-gold);
  margin-bottom: 6px;
}

.step-box__title {
  font-weight: bold;
  font-size: 11px;
  color: var(--text-primary);
  margin-bottom: 6px;
  text-transform: uppercase;
  line-height: 1.3;
}

.step-box__desc {
  font-size: 9px;
  color: var(--text-muted);
  line-height: 1.6;
}

/* Aparelhos estreitos (abaixo do iPhone SE/mini): o icone cede alguns pixels
   para a descricao nao quebrar em linhas de duas palavras. */
@media (max-width: 359px) {
  .step-box__icon {
    width: 64px;
    height: 48px;
  }

  .home__ball {
    width: 76px;
    height: 76px;
  }
}

/* Botão Vermelho */
.home__cta {
  padding-top: 8px;
}

.btn-pokemon-action {
  width: 100%;
  background: var(--unifil-orange);
  border: 3px solid var(--surface-border);
  box-shadow: 
    inset -3px -3px 0 var(--surface-border),
    inset 3px 3px 0 var(--unifil-gold);
  padding: 14px;
  cursor: pointer;
  transition: transform 0.1s ease;
}

.btn-pokemon-action span {
  font-family: 'Press Start 2P', monospace;
  font-size: 12px;
  color: var(--text-primary);
  text-shadow: 2px 2px 0 var(--surface);
  letter-spacing: 1px;
}

.btn-pokemon-action:active {
  transform: scale(0.98);
  background: var(--surface-border);
}
</style>
