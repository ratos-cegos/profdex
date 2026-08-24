<script setup>
import HeroSection from '@/sections/HeroSection.vue'
import HowItWorksSection from '@/sections/HowItWorksSection.vue'
import TypeWheelSection from '@/sections/TypeWheelSection.vue'
import BattleSection from '@/sections/BattleSection.vue'
// import BattleVideoSection from '@/sections/BattleVideoSection.vue' — ver o
// comentário na seção comentada abaixo, no <template>.
import ModelSection from '@/sections/ModelSection.vue'
import PvpSection from '@/sections/PvpSection.vue'
import ScoreSection from '@/sections/ScoreSection.vue'
import ProfessorsSection from '@/sections/ProfessorsSection.vue'
import CtaSection from '@/sections/CtaSection.vue'
import CreditsSection from '@/sections/CreditsSection.vue'
import SiteNav from '@/sections/SiteNav.vue'
import SiteFooter from '@/sections/SiteFooter.vue'
</script>

<template>
  <a class="skip-link" href="#conteudo">Pular para o conteúdo</a>

  <!-- A barra fica FORA do <main>: é navegação da página inteira, não
       conteúdo dela. Vem antes do hero na ordem de leitura e de tabulação,
       logo depois do skip-link — que é exatamente onde quem usa teclado
       espera encontrar a navegação. -->
  <SiteNav />

  <HeroSection />

  <main id="conteudo">
    <!-- A ordem conta a história na sequência em que o aluno vive: primeiro
         como se joga, depois o sistema que dá profundidade (tipos), depois a
         batalha, e só então o 3D — que é "ver o professor de perto", o passo
         seguinte natural de quem acabou de ver o combate. Competição, placar e
         coleção fecham, e o CTA vem quando já há motivo para clicar. -->
    <HowItWorksSection />
    <TypeWheelSection />
    <BattleSection />
    <!-- Seção do vídeo desligada até o vídeo existir. Um player de story 9:16
         com play desabilitado e badge "Em breve" promete algo que a página
         ainda não entrega — e ocupa a posição de maior atenção, logo depois da
         batalha. O componente e o copy continuam prontos (BattleVideoSection.vue
         tem a nota de integração passo a passo); para religar, descomente esta
         linha e o import lá em cima. -->
    <!-- <BattleVideoSection /> -->
    <ModelSection />
    <PvpSection />
    <ScoreSection />
    <ProfessorsSection />
    <CtaSection />
    <!-- Créditos por último, depois do CTA: são fatos sobre quem fez, e quem
         chega aqui já passou por todos os motivos para clicar. -->
    <CreditsSection />
  </main>

  <SiteFooter />
</template>

<style scoped>
/* Link de pulo: invisível até receber foco pelo teclado. */
.skip-link {
  position: absolute;
  left: var(--space-3);
  top: -100px;
  z-index: 10;
  padding: var(--space-2) var(--space-3);
  background: var(--surface);
  border: 3px solid var(--unifil-gold);
  color: var(--text-primary);
  font-family: var(--font-pixel);
  font-size: 10px;
  transition: top var(--dur-fast) ease;
}

.skip-link:focus {
  top: var(--space-3);
}
</style>
