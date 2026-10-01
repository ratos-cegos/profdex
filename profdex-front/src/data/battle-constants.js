// Constantes de balanceamento do motor de batalha.
//
// Por que vive em `data/` e não ao lado de `composables/battleEngine.js`: é
// daqui que o `engine-parity.spec.ts` do back lê os números para comparar com
// os dele. O loader daquele teste carrega arquivos SEM import, num contexto
// isolado — `battleEngine.js` importa `types.js` e `moves.js` e por isso não
// pode ser lido daquele jeito.
//
// O motor existe em duas cópias (esta e `profdex-back/src/battle/engine/`). O
// teste de paridade comparava só os DADOS dos golpes: mudar DAMAGE_SCALE ou
// STAB de um lado só desalinhava treino e ranqueado em silêncio — nada quebra,
// nada loga, e o jogador descobre perdendo. Estas constantes agora entram na
// comparação.
//
// Mudou um número aqui, muda no `engine.ts`. O teste falha se divergirem.

export const DEFAULT_MAX_HP = 120
export const DAMAGE_SCALE = 0.4 // calibra poder→dano contra a vida
export const STAB = 1.5 // bônus quando o golpe é do mesmo tipo do usuário
export const STAGE_MIN = -6
export const STAGE_MAX = 6

/** Teto do bônus que um IV concede em combate (banco guarda 0–15). */
export const IV_BONUS_MAX = 5

/**
 * Prazo de cada tique de `statGrowPerTurn`.
 *
 * O ganho por turno era PERMANENTE: `growPerTurn(rigor, +1, 4)` entregava +4
 * estágios definitivos (×3,0 de ataque) em troca de um único turno de setup.
 * Cada tique agora entra como buff temporizado — escala até +3 (×2,5) e decai.
 */
export const GROW_TICK_TURNS = 4

/**
 * Teto do produto efetividade × `weakPoint`.
 *
 * `weakPoint` multiplica SOBRE a efetividade de tipo; contra alvo de tipo duplo
 * (4×) o produto chegava a 6×.
 */
export const WEAK_POINT_CAP = 4

// ── Status ──────────────────────────────────────────────────────────────────
// Passaram a ser carga real de balanceamento quando os cinco golpes de
// `CATEGORY.STATUS` deixaram de ser no-op: antes, paralisia/confusão/dano
// contínuo só existiam como efeito colateral de ataque.
export const PARALYSIS_SKIP_CHANCE = 0.35
export const CONFUSION_SELF_HIT_CHANCE = 0.33
export const CONFUSION_SELF_HIT_FRACTION = 0.08
export const DOT_DEFAULT_POWER = 8
export const DOT_DEFAULT_TURNS = 3

/**
 * Expoente da razão de Velocidade na ordem do turno.
 *
 * A ordem é uma moeda pesada por `ps/(ps+es)`. Com a razão CRUA, o atributo
 * inteiro não consegue pesar quase nada: Velocidade vai de 100 a 105 (o IV
 * rende no máximo IV_BONUS_MAX), então 15 contra 0 dava 51,2% e o caso comum no
 * evento — um raro de IV 15 contra um comum de IV 9, 105 contra 103 — dava
 * 50,5%. Era cara ou coroa, e os alunos relatavam o raro de cinco estrelas
 * abrindo o turno depois de um comum qualquer.
 *
 * Elevar a razão antes de normalizar estica essa faixa curta: 21 põe 105 contra
 * 100 em ~74% e 105 contra 103 em ~60%. Medido com o motor real (n=4000), a
 * guarda de Elo não piora — quem tem IV maior vence 52,8% das partidas contra
 * 53,3% da versão crua, porque a iniciativa é só um dos quatro atributos. Ver
 * `iv-balance.spec.ts`, que falha se isso voltar a subir.
 */
export const SPEED_ORDER_EXPONENT = 21

// ── Precisão ────────────────────────────────────────────────────────────────
export const EVASION_PER_STAGE = 0.05
export const MIN_HIT_CHANCE = 0.1
export const VARIANCE_MIN = 0.85
