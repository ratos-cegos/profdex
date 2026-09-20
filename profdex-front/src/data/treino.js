/**
 * Oponente da batalha de treino.
 *
 * É fixo porque o Gustavo é o único professor com pixel art nas DUAS
 * orientações — de frente (oponente) e de costas (jogador). Enquanto os demais
 * não tiverem os dois sprites, deixar o aluno "escolher" produziria uma arena
 * quebrada ou, pior, uma escolha ignorada em silêncio.
 *
 * A constante mora aqui, e não dentro da `ArenaView`, para que o hub de treino
 * anuncie exatamente contra quem se luta. Antes o hub montava a URL com o
 * primeiro professor capturado e a arena descartava o parâmetro: o aluno via
 * `/arena/eron` e enfrentava o Gustavo.
 *
 * Quando a tarefa 2 entregar os sprites dos demais, isto vira uma escolha de
 * verdade — e aí a `ArenaView` passa a honrar `route.params.id`.
 */
export const TREINO_ENEMY_KEY = 'gustavo'

/** O boneco que o jogador controla na arena de treino. */
export const PLAYER_KEY = 'gustavo'

/** Nome exibido quando a lista de professores ainda não carregou. */
export const TREINO_ENEMY_FALLBACK_NAME = 'Gustavo'

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
