<script setup>
import { footer } from '@/content/copy.js'
import { COMP_URL, UNIFIL_URL } from '@/config/links.js'
import { asset } from '@/config/asset.js'
</script>

<template>
  <footer class="footer">
    <div class="container footer__inner">
      <div class="footer__brand">
        <img
          class="footer__ball"
          :src="asset('/logo-unifil.png')"
          alt=""
          width="52"
          height="40"
          loading="lazy"
        />
        <div>
          <p class="footer__project">{{ footer.project }}</p>
          <p class="footer__event">{{ footer.event }}</p>
        </div>
      </div>

      <nav class="footer__links" aria-label="Links do rodapé">
        <!-- Âncora interna, e por isso sem target="_blank": Créditos é a
             última seção DESTA página. Abrir a própria página numa aba nova
             seria mentira sobre para onde o link leva. -->
        <a href="#creditos">{{ footer.creditsLabel }}</a>
        <a :href="COMP_URL" target="_blank" rel="noopener noreferrer">{{ footer.compLabel }}</a>
        <a :href="UNIFIL_URL" target="_blank" rel="noopener noreferrer">{{ footer.siteLabel }}</a>
      </nav>
    </div>

    <p class="footer__colophon container">{{ footer.colophon }}</p>
  </footer>
</template>

<style scoped>
.footer {
  border-top: 6px solid var(--surface);
  background: var(--surface);
  padding-block: var(--space-4);
}

.footer__inner {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}

.footer__brand {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.footer__ball {
  flex-shrink: 0;
}

.footer__project {
  font-family: var(--font-pixel);
  font-size: 12px;
  color: var(--text-primary);
  line-height: 1.6;
}

.footer__event {
  font-size: 13px;
  color: var(--text-muted);
}

.footer__links {
  display: flex;
  gap: var(--space-3);
  flex-wrap: wrap;
}

.footer__links a {
  font-family: var(--font-pixel);
  font-size: var(--fs-body-sm);
  line-height: 1.7;
}

.footer__colophon {
  margin-top: var(--space-3);
  font-size: 13px;
  color: var(--text-muted);
}
</style>
