<script setup>
import { howItWorks, quiz } from '@/content/copy.js'
import SectionShell from '@/components/SectionShell.vue'
import { useReveal } from '@/composables/useReveal.js'

// Dois observadores nesta seção: um para a lista de passos (que entra em
// cascata, um passo por vez) e outro para a caixa do quiz. Custa dois
// IntersectionObserver e nenhuma dependência.
const { el: stepsEl } = useReveal()
const { el } = useReveal()

const pad = (n) => String(n).padStart(2, '0')
</script>

<template>
  <SectionShell :kicker="howItWorks.kicker" :title="howItWorks.title" tone="frame">
    <div class="how-body">
      <ol ref="stepsEl" class="steps reveal-stagger">
        <li
          v-for="(step, i) in howItWorks.steps"
          :key="step.title"
          class="step"
          :style="{ '--reveal-i': i }"
        >
          <span class="step-num" aria-hidden="true">{{ pad(i + 1) }}</span>
          <div class="step__body">
            <h3 class="step__title">{{ step.title }}</h3>
            <p class="step__desc">{{ step.desc }}</p>
          </div>
        </li>
      </ol>

      <!-- O quiz de bancada mora aqui e não numa seção própria: ele é o passo 2
           visto de perto, não uma funcionalidade separada. -->
      <aside ref="el" class="quiz gba-frame gba-frame--deep reveal-steps">
        <p class="section-kicker">{{ quiz.kicker }}</p>
        <h3 class="quiz__title">{{ quiz.title }}</h3>
        <p class="quiz__desc">{{ quiz.desc }}</p>

        <dl class="quiz__facts">
          <div v-for="fact in quiz.facts" :key="fact.label" class="quiz__fact">
            <dt>{{ fact.label }}</dt>
            <dd>{{ fact.value }}</dd>
          </div>
        </dl>
      </aside>
    </div>
  </SectionShell>
</template>

<style scoped>
/* Empilhado por padrão: no celular e no tablet, os passos e o quiz são dois
 * blocos de leitura sequenciais, na ordem em que o aluno os vive.
 *
 * A partir de 1024px isto vira duas colunas lado a lado (ver a media query no
 * fim do arquivo). O motivo de não fazer isto sempre: uma coluna de passos ao
 * lado de um quiz só cabe sem espremer se cada um tiver ~480px+, e abaixo de
 * 1024px isso força as duas a ficarem estreitas demais para o texto corrido. */
.how-body {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.steps {
  list-style: none;
  display: flex;
  flex-direction: column;
}

.step {
  display: flex;
  gap: var(--space-3);
  align-items: baseline;
  padding-block: var(--space-4);
  /* `2px dashed` é o separador da linguagem — mesmo da home do app. */
  border-bottom: 2px dashed var(--surface-border);
}

.step:first-child {
  padding-top: 0;
}

.step:last-child {
  border-bottom: none;
  padding-bottom: 0;
}

.step__body {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.step__title {
  font-family: var(--font-pixel);
  font-size: var(--fs-h3);
  line-height: 1.6;
}

.step__desc {
  font-family: var(--font-pixel);
  color: var(--text-muted);
  font-size: var(--fs-body-sm);
  line-height: 1.7;
  max-width: var(--maxw-prose);
}

.quiz {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

/* Lado a lado a partir de 1024px: a lista de passos vira a coluna estreita à
 * esquerda (ela é texto curto, uma lista de leitura vertical — não precisa da
 * largura do frame inteiro) e o quiz ganha uma coluna própria à direita, do
 * tamanho de um card de verdade em vez de uma faixa esticada abaixo dele. É a
 * mesma dupla de sempre, só que lida em paralelo, como as fichas de um
 * balcão — o layout que a bancada do evento já sugere. */
@media (min-width: 1024px) {
  .how-body {
    flex-direction: row;
    align-items: flex-start;
    gap: var(--space-5);
  }

  .steps {
    flex: 1 1 0;
    min-width: 0;
  }

  .quiz {
    flex: 1 1 0;
    min-width: 0;
    align-self: stretch;
    justify-content: center;
  }
}

.quiz__title {
  font-family: var(--font-pixel);
  font-size: var(--fs-h3);
  line-height: 1.6;
}

.quiz__desc {
  font-family: var(--font-pixel);
  color: var(--text-muted);
  font-size: var(--fs-body-sm);
  line-height: 1.7;
  max-width: var(--maxw-prose);
}

.quiz__facts {
  display: grid;
  gap: var(--space-3);
  margin-top: var(--space-2);
}

@media (min-width: 720px) {
  .quiz__facts {
    grid-template-columns: repeat(2, 1fr);
  }
}

.quiz__fact {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  padding-left: var(--space-3);
  border-left: 3px solid var(--unifil-orange);
}

.quiz__fact dt {
  font-family: var(--font-pixel);
  font-size: 9px;
  color: var(--unifil-gold);
  line-height: 1.6;
}

.quiz__fact dd {
  font-family: var(--font-pixel);
  font-size: var(--fs-body-sm);
  line-height: 1.7;
  color: var(--text-primary);
}

</style>
