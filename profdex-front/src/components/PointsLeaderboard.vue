<script setup>
import { computed } from 'vue'

const props = defineProps({
  users: {
    type: Array,
    required: true,
  },
  // Unidade da pontuação. O ranking do evento é de Elo de batalha, não de pontos.
  unidade: {
    type: String,
    default: 'pts',
  },
  // A RankingView já tem o próprio cabeçalho; evita título duplicado.
  mostrarCabecalho: {
    type: Boolean,
    default: true,
  },
})

// Nem todo jogador tem foto (alunos não têm retrato cadastrado); nesses casos
// mostramos a inicial no lugar de um <img> quebrado.
const inicial = (nome) => (nome || '?').trim().charAt(0).toUpperCase()

const sortedUsers = computed(() =>
  [...props.users].sort((a, b) => b.pontuacao - a.pontuacao),
)

// O pódio tem SEMPRE três lugares, na ordem 2º · 1º · 3º. Antes os vazios eram
// filtrados fora, e com 1 ou 2 jogadores a grade de 3 colunas ficava com um vão
// à direita e o card do campeão deixava de ser o do meio. Agora a vaga não
// preenchida vira um slot "aberto", e a composição se mantém em qualquer número
// de jogadores.
const podiumSlots = computed(() => {
  const users = sortedUsers.value
  return [
    { position: 2, metal: 'prata', lugar: 'esquerda', user: users[1] ?? null },
    { position: 1, metal: 'ouro', lugar: 'centro', user: users[0] ?? null },
    { position: 3, metal: 'bronze', lugar: 'direita', user: users[2] ?? null },
  ]
})

const MEDALHA = { ouro: '🥇', prata: '🥈', bronze: '🥉' }

const remainingUsers = computed(() => sortedUsers.value.slice(3))

const pointsFormatter = new Intl.NumberFormat('pt-BR')
const formatPoints = (points) => pointsFormatter.format(points)
</script>

<template>
  <section
    class="leaderboard"
    :aria-labelledby="mostrarCabecalho ? 'leaderboard-title' : undefined"
    :aria-label="mostrarCabecalho ? undefined : 'Ranking'"
  >
    <header v-if="mostrarCabecalho" class="leaderboard__header">
      <h1 id="leaderboard-title">Ranking de Pontos</h1>
      <p>Os melhores da temporada</p>
    </header>

    <div class="podium" aria-label="Pódio dos três primeiros colocados">
      <article
        v-for="(slot, i) in podiumSlots"
        :key="slot.position"
        class="podium-card"
        :class="[
          `podium-card--${slot.metal}`,
          `podium-card--${slot.lugar}`,
          { 'podium-card--vago': !slot.user },
        ]"
        :style="{ '--slot-index': i }"
      >
        <span class="podium-card__medalha" aria-hidden="true">{{ MEDALHA[slot.metal] }}</span>

        <div class="podium-card__avatar-wrap">
          <img
            v-if="slot.user?.url_da_foto"
            class="podium-card__avatar"
            :src="slot.user.url_da_foto"
            :alt="`Foto de ${slot.user.nome}`"
          />
          <span v-else class="pixel podium-card__inicial" aria-hidden="true">
            {{ slot.user ? inicial(slot.user.nome) : '?' }}
          </span>
        </div>

        <div class="podium-card__position" :aria-label="`${slot.position}º lugar`">
          {{ slot.position }}
        </div>

        <template v-if="slot.user">
          <h2>{{ slot.user.nome }}</h2>
          <p>{{ formatPoints(slot.user.pontuacao) }} <span>{{ unidade }}</span></p>
          <p v-if="slot.user.detalhe" class="podium-card__detalhe">{{ slot.user.detalhe }}</p>
        </template>
        <template v-else>
          <h2 class="podium-card__vazio">---</h2>
          <p class="podium-card__vazio">Vaga aberta</p>
        </template>
      </article>
    </div>

    <ol
      v-if="remainingUsers.length"
      class="ranking-list"
      :start="4"
      aria-label="Demais posições do ranking"
    >
      <li
        v-for="(user, index) in remainingUsers"
        :key="user.id"
        class="ranking-row"
        :class="{ 'ranking-row--destaque': user.destaque }"
        :style="{ '--row-index': index }"
      >
        <span class="ranking-row__position" aria-hidden="true">{{ index + 4 }}</span>
        <span class="ranking-row__name">
          {{ user.nome }}
          <small v-if="user.detalhe" class="ranking-row__detalhe">{{ user.detalhe }}</small>
        </span>
        <span class="ranking-row__points">
          {{ formatPoints(user.pontuacao) }} <small>{{ unidade }}</small>
        </span>
      </li>
    </ol>
  </section>
</template>

<style scoped>
.leaderboard {
  --gold: #f2c14e;
  --silver: #cbd2dc;
  --bronze: #c77b46;
  --accent: #8b5cf6;
  width: min(100%, 1120px);
  margin: 0 auto;
}

.leaderboard__header {
  margin-bottom: clamp(36px, 6vw, 72px);
  text-align: center;
}

.leaderboard__header h1 {
  color: #f7f8fb;
  font-size: clamp(2rem, 5vw, 4rem);
  font-weight: 900;
  letter-spacing: -0.055em;
  line-height: 1;
}

.leaderboard__header p {
  margin-top: 12px;
  color: #828896;
  font-size: clamp(0.95rem, 1.8vw, 1.25rem);
  font-weight: 600;
  letter-spacing: 0.01em;
}

.podium {
  display: grid;
  grid-template-columns: 1fr 1.12fr 1fr;
  align-items: end;
}

.podium-card {
  --metal: var(--silver);
  position: relative;
  min-width: 0;
  /* Altura fluida: alto o bastante para o pódio ter presença, baixo o bastante
     para sobrar tela para a lista num aparelho de 390x844. */
  min-height: clamp(178px, 42vw, 230px);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  padding: 30px 10px 18px;
  border: 1px solid color-mix(in srgb, var(--metal) 66%, transparent);
  background:
    radial-gradient(circle at 50% 10%, color-mix(in srgb, var(--metal) 9%, transparent), transparent 38%),
    linear-gradient(180deg, #11141b 0%, #0c0f15 100%);
  box-shadow: inset 0 1px color-mix(in srgb, var(--metal) 22%, transparent);
}

/* As bordas seguem a POSIÇÃO no pódio, não a ordem dos filhos: com menos de três
   jogadores o `:last-child` caía no card errado e a composição quebrava. */
.podium-card--esquerda {
  border-radius: 20px 0 0 0;
  border-right: 0;
}

.podium-card--direita {
  border-radius: 0 20px 0 0;
  border-left: 0;
}

.podium-card--ouro {
  --metal: var(--gold);
}

.podium-card--bronze {
  --metal: var(--bronze);
}

/* O campeão é sempre o do meio e sempre o mais alto. */
.podium-card--centro {
  z-index: 2;
  min-height: clamp(214px, 50vw, 276px);
  border-radius: 20px 20px 0 0;
  box-shadow:
    0 -10px 55px rgba(242, 193, 78, 0.08),
    inset 0 1px rgba(255, 232, 163, 0.45);
}

/* Vaga ainda não conquistada: mesma caixa, tudo apagado e borda tracejada. */
.podium-card--vago {
  border-style: dashed;
  border-color: #2b3140;
  background: linear-gradient(180deg, #0d1016 0%, #0a0d12 100%);
  box-shadow: none;
}

.podium-card--vago.podium-card--centro {
  box-shadow: none;
}

.podium-card__medalha {
  position: absolute;
  top: 8px;
  left: 50%;
  transform: translateX(-50%);
  font-size: clamp(0.9rem, 3.6vw, 1.15rem);
  filter: drop-shadow(0 2px 0 rgba(0, 0, 0, 0.45));
}

.podium-card--vago .podium-card__medalha {
  filter: grayscale(1);
  opacity: 0.28;
}

.podium-card__vazio {
  color: #4c5361 !important;
}

.podium-card__avatar-wrap {
  width: clamp(104px, 12vw, 142px);
  aspect-ratio: 1;
  display: grid;
  place-items: center;
  margin-bottom: 20px;
  padding: 5px;
  border: 2px solid var(--metal);
  border-radius: 50%;
  background: #10131a;
  box-shadow:
    0 0 0 5px color-mix(in srgb, var(--metal) 12%, transparent),
    0 16px 30px rgba(0, 0, 0, 0.35);
}

.podium-card--centro .podium-card__avatar-wrap {
  width: clamp(126px, 14vw, 164px);
  border-width: 3px;
}

.podium-card--vago .podium-card__avatar-wrap {
  border-style: dashed;
  border-color: #2b3140;
  box-shadow: none;
}

.podium-card--vago .podium-card__inicial,
.podium-card--vago .podium-card__position {
  color: #3c4353;
  text-shadow: none;
}

.podium-card__avatar {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  object-fit: cover;
  background: #20242d;
}

/* Fallback para quem não tem foto: inicial em bloco, no lugar de um <img> vazio. */
.podium-card__inicial {
  width: 100%;
  height: 100%;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: #20242d;
  color: var(--metal);
  font-size: clamp(1.1rem, 4vw, 1.6rem);
}

.podium-card__position {
  color: var(--metal);
  font-size: clamp(3rem, 6vw, 5.25rem);
  font-weight: 950;
  letter-spacing: -0.08em;
  line-height: 0.95;
  text-shadow: 0 4px 24px color-mix(in srgb, var(--metal) 24%, transparent);
}

.podium-card h2 {
  width: 100%;
  margin-top: 14px;
  overflow: hidden;
  color: #f5f6f8;
  font-size: clamp(1rem, 2.2vw, 1.55rem);
  font-weight: 850;
  letter-spacing: -0.025em;
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.podium-card p {
  margin-top: 7px;
  color: color-mix(in srgb, var(--metal) 75%, #a6aab2);
  font-size: clamp(0.95rem, 1.9vw, 1.25rem);
  font-weight: 700;
}

.podium-card p span,
.ranking-row__points small {
  font-size: 0.72em;
  font-weight: 700;
}

.podium-card__detalhe {
  margin-top: 2px;
  color: #a6aab2;
  font-size: clamp(0.62rem, 2.6vw, 0.78rem);
  font-weight: 700;
}

.ranking-list {
  overflow: hidden;
  border: 1px solid #252a35;
  border-top: 2px solid var(--accent);
  border-radius: 0 0 20px 20px;
  background: #0e1117;
  box-shadow: 0 30px 80px rgba(0, 0, 0, 0.25);
  list-style: none;
}

.ranking-row {
  min-height: 76px;
  display: grid;
  grid-template-columns: 92px 1fr auto;
  align-items: center;
  border-bottom: 1px solid #252a35;
}

.ranking-row:last-child {
  border-bottom: 0;
}

.ranking-row__position {
  align-self: stretch;
  display: grid;
  place-items: center;
  border-right: 1px solid #252a35;
  color: #a7acb6;
  font-size: 1.8rem;
  font-weight: 900;
  font-variant-numeric: tabular-nums;
}

.ranking-row--destaque {
  background: color-mix(in srgb, var(--accent) 14%, transparent);
}

.ranking-row__name {
  min-width: 0;
  padding: 0 34px;
  color: #f2f3f5;
  font-size: clamp(1rem, 2vw, 1.2rem);
  font-weight: 800;
}

.ranking-row__detalhe {
  display: block;
  margin-top: 2px;
  color: #828896;
  font-size: 0.72rem;
  font-weight: 700;
}

.ranking-row__points {
  padding-right: 34px;
  color: #c5c9d1;
  font-size: clamp(0.95rem, 1.8vw, 1.15rem);
  font-weight: 750;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

@media (max-width: 700px) {
  .leaderboard__header {
    margin-bottom: 58px;
  }

  .podium {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .podium-card {
    padding: 26px 6px 16px;
  }

  .podium-card__avatar-wrap {
    width: clamp(64px, 19vw, 88px);
    margin-bottom: 10px;
  }

  .podium-card--centro .podium-card__avatar-wrap {
    width: clamp(76px, 23vw, 102px);
  }

  .podium-card__position {
    font-size: clamp(2.45rem, 13vw, 3.75rem);
  }

  .podium-card h2 {
    font-size: clamp(0.78rem, 3.6vw, 1rem);
  }

  .podium-card p {
    font-size: clamp(0.72rem, 3.2vw, 0.95rem);
  }

  .ranking-row {
    min-height: 66px;
    grid-template-columns: 60px 1fr auto;
  }

  .ranking-row__position {
    font-size: 1.35rem;
  }

  .ranking-row__name {
    padding: 0 16px;
  }

  .ranking-row__points {
    padding-right: 16px;
  }
}

@media (max-width: 430px) {
  .podium-card__avatar-wrap {
    width: 62px;
  }

  .podium-card--centro .podium-card__avatar-wrap {
    width: 74px;
  }

  .podium-card h2 {
    font-size: 0.75rem;
  }

  .podium-card p {
    font-size: 0.68rem;
  }

  .ranking-row {
    grid-template-columns: 52px minmax(0, 1fr) auto;
  }

  .ranking-row__name {
    overflow: hidden;
    padding: 0 12px;
    font-size: 0.9rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .ranking-row__points {
    padding-right: 12px;
    font-size: 0.82rem;
  }
}

@media (prefers-reduced-motion: no-preference) {
  .podium-card {
    animation: leaderboard-reveal 0.55s both;
  }

  .podium-card:nth-child(2) {
    animation-delay: 90ms;
  }

  .podium-card:nth-child(3) {
    animation-delay: 180ms;
  }

  .ranking-row {
    animation: leaderboard-reveal 0.45s both;
    animation-delay: calc(var(--row-index, 0) * 40ms + 180ms);
  }
}

@keyframes leaderboard-reveal {
  from {
    opacity: 0;
    transform: translateY(14px);
  }
}
</style>
