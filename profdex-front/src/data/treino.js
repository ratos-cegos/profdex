/**
 * Oponente da batalha de treino.
 *
 * É SORTEADO entre os professores comuns a cada "INICIAR TREINO". Por muito
 * tempo foi fixo no Gustavo, o único com sprite de frente e de costas; desde a
 * tarefa 13 a arte vem do banco, e o painel exige as três peças de todo
 * professor cadastrado. Então qualquer comum sobe na arena sem ficar quebrado.
 *
 * Raro e lendário ficam de fora: a lista pública de /professors já só traz os
 * comuns ativos, e a arena procura o oponente nela mesma (ver ArenaView).
 *
 * O Gustavo continua sendo o fallback de tudo: quem o jogador controla, e o
 * oponente quando a lista não veio (backend fora do ar em dev, F5 antes do
 * preload terminar).
 */
export const TREINO_ENEMY_KEY = 'gustavo'

/** O boneco que o jogador controla na arena de treino. */
export const PLAYER_KEY = 'gustavo'

/** Nome exibido quando a lista de professores ainda não carregou. */
export const TREINO_ENEMY_FALLBACK_NAME = 'Gustavo'

/**
 * Um professor comum ao acaso para o bot.
 *
 * Prefere quem não é o boneco do jogador: Gustavo contra Gustavo é a arena que
 * o sorteio veio aposentar. Se o elenco comum for só ele, luta contra ele.
 *
 * @param {Array<{ slug: string }>} comuns lista de /professors
 * @param {() => number} [aleatorio] injetável para teste
 * @returns {string} slug do oponente
 */
export function sortearOponente(comuns, aleatorio = Math.random) {
  const lista = Array.isArray(comuns) ? comuns.filter((p) => p?.slug) : []
  const outros = lista.filter((p) => p.slug !== PLAYER_KEY)
  const candidatos = outros.length ? outros : lista
  if (!candidatos.length) return TREINO_ENEMY_KEY
  return candidatos[Math.floor(aleatorio() * candidatos.length)].slug
}

/**
 * O que a arena assume quando a lista de professores não veio (backend fora do
 * ar em dev, ou F5 antes do preload terminar).
 *
 * Existe porque a batalha monta os combatentes no `setup`: sem tipo não há deck
 * de golpes, e a tela quebraria em vez de degradar. É o ÚNICO lugar do front
 * que ainda cita arte e tipo de um professor específico — e só como último
 * recurso, para uma tela de treino que não vale ranking.
 */
export const PLAYER_FALLBACK = {
  types: ['arquitetura'],
  spriteFrontUrl: '/professors/gustavo-frente.png',
  spriteBackUrl: '/professors/gustavo-costas.png',
  pixelArt: true,
}
