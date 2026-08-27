<script setup>
import { finalCta } from '@/content/copy.js'
import { APP_LOGIN_URL } from '@/config/links.js'
import PixelButton from '@/components/PixelButton.vue'
import { useReveal } from '@/composables/useReveal.js'

const { el } = useReveal()
</script>

<template>
  <section class="cta" aria-labelledby="cta-title">
    <div class="container">
      <div ref="el" class="cta__box gba-frame">
        <p class="section-kicker">{{ finalCta.kicker }}</p>
        <h2 id="cta-title" class="section-title">{{ finalCta.title }}</h2>
        <p class="cta__desc">{{ finalCta.desc }}</p>

        <PixelButton :href="APP_LOGIN_URL">{{ finalCta.cta }}</PixelButton>

        <div class="cta__domains">
          <p class="cta__domains-title">{{ finalCta.domainsIntro }}</p>
          <ul>
            <li v-for="d in finalCta.domains" :key="d.domain">
              <code>{{ d.domain }}</code>
              <span>{{ d.role }}</span>
            </li>
          </ul>
        </div>

        <p class="cta__platform">{{ finalCta.platformNote }}</p>
      </div>
    </div>
  </section>
</template>

<style scoped>
.cta {
  padding-block: var(--space-6);
}

.cta__box {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
  text-align: center;
}

.cta__desc {
  max-width: 52ch;
  color: var(--text-muted);
  font-size: var(--fs-body);
}

.cta__box :deep(.btn-pixel) {
  margin-top: var(--space-2);
  min-width: 240px;
}

.cta__domains {
  margin-top: var(--space-3);
  width: 100%;
  max-width: 460px;
}

.cta__domains-title {
  font-family: var(--font-pixel);
  font-size: 9px;
  color: var(--unifil-gold);
  line-height: 1.6;
  margin-bottom: var(--space-2);
}

.cta__domains ul {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.cta__domains li {
  display: flex;
  flex-direction: column;
  gap: 2px;
  align-items: center;
  padding: var(--space-2);
  background: var(--bg-deep);
  border: 2px solid var(--surface-border);
  border-radius: var(--radius);
}

.cta__domains code {
  font-family: var(--font-pixel);
  font-size: 10px;
  color: var(--text-primary);
  line-height: 1.6;
}

.cta__domains span {
  font-size: 13px;
  color: var(--text-muted);
}

.cta__platform {
  font-family: var(--font-pixel);
  font-size: var(--fs-body-sm);
  line-height: 1.7;
  color: var(--text-muted);
}
</style>
