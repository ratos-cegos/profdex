<script setup>
import AppHeader from '../components/AppHeader.vue'
import { getLandingCreditsUrl } from '../services/public-links.js'

const landingCreditsUrl = getLandingCreditsUrl()
</script>

<template>
  <div class="about-page">
    <AppHeader title="QUEM SOMOS" subtitle="PROFDEX + UNIFIL">
      <template #left>
        <RouterLink class="about-page__back" to="/" aria-label="Voltar para o início">←</RouterLink>
      </template>
    </AppHeader>

    <main class="about-page__main page">
      <section class="about-page__intro">
        <p>
          O ProfDex é uma experiência mobile-first criada para a Semana Tecnológica da UNIFIL. O
          projeto aproxima alunos e professores por meio de exploração, captura por QR, realidade
          aumentada e batalhas por turnos.
        </p>
      </section>

      <section id="equipe" class="about-page__section" tabindex="-1">
        <span class="pixel about-page__eyebrow">EQUIPE</span>
        <h2>Pessoas por trás do ProfDex</h2>
        <p>
          Desenvolvimento, arte, pesquisa e coordenação trabalham em conjunto para levar o projeto
          ao evento.
        </p>
        <div class="about-page__pending" role="status">
          <span aria-hidden="true">⌛</span>
          <div>
            <strong>Créditos nominais em validação</strong>
            <p>Nomes, papéis e fotos serão publicados após a confirmação institucional.</p>
          </div>
        </div>
      </section>

      <section class="about-page__section">
        <span class="pixel about-page__eyebrow">PESQUISA</span>
        <h2>Grupo de pesquisa</h2>
        <p>
          O ProfDex integra ensino, pesquisa e extensão ao transformar tecnologias web, jogos e
          realidade aumentada em uma experiência de aprendizagem no campus.
        </p>
        <div class="about-page__pending" role="status">
          <span aria-hidden="true">⌛</span>
          <div>
            <strong>Identificação oficial pendente</strong>
            <p>
              Nome do grupo, linha de pesquisa, docentes responsáveis e link oficial aguardam
              validação da UNIFIL.
            </p>
          </div>
        </div>
      </section>

      <section class="about-page__section about-page__section--event">
        <span class="pixel about-page__eyebrow">EVENTO</span>
        <h2>Semana Tecnológica 2026</h2>
        <p>
          Uma iniciativa acadêmica ligada aos cursos de tecnologia da UNIFIL, criada para incentivar
          encontros, descoberta e experimentação.
        </p>
      </section>
    </main>

    <footer class="about-page__footer">
      <span>ProfDex · Semana Tecnológica 2026</span>
      <a :href="landingCreditsUrl">Equipe e pesquisa →</a>
    </footer>
  </div>
</template>

<style scoped>
.about-page {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg);
  color: var(--text);
}
.about-page__back {
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.28);
  color: white;
  font-size: 20px;
  text-decoration: none;
}
.about-page__main {
  padding: 18px 16px 28px;
  display: grid;
  align-content: start;
  gap: 16px;
}
.about-page__intro,
.about-page__section {
  padding: 20px;
  border: 2px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface);
}
.about-page__intro {
  background: linear-gradient(145deg, #2c2d31, #17181b);
}
.about-page p {
  color: var(--text-muted);
  font-size: 13px;
  line-height: 1.65;
}
.about-page__eyebrow {
  display: block;
  margin-bottom: 8px;
  color: var(--unifil-gold);
  font-size: 7px;
}
.about-page h2 {
  margin-bottom: 10px;
  font-size: 18px;
  line-height: 1.25;
}
.about-page__pending {
  display: flex;
  gap: 12px;
  margin-top: 16px;
  padding: 14px;
  border: 1px dashed var(--unifil-gold);
  border-radius: var(--radius);
  background: var(--bg-deep);
}
.about-page__pending > span {
  flex: 0 0 auto;
  font-size: 22px;
}
.about-page__pending strong {
  color: var(--text-primary);
  font-size: 12px;
}
.about-page__pending p {
  margin-top: 5px;
  font-size: 11px;
}
.about-page__section--event {
  border-color: color-mix(in srgb, var(--unifil-gold) 65%, var(--border));
}
.about-page__footer {
  flex: 0 0 auto;
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px calc(14px + env(safe-area-inset-bottom));
  border-top: 1px solid var(--border);
  background: var(--surface);
  color: var(--text-muted);
  font-size: 10px;
}
.about-page__footer a {
  color: var(--unifil-gold);
}
#equipe:focus {
  outline: 2px solid var(--unifil-gold);
  outline-offset: -4px;
}
</style>
