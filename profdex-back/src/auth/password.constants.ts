/**
 * Tamanho mínimo da senha.
 *
 * A regra vivia repetida em três DTOs (cadastro direto, cadastro por Google e
 * redefinição) e em três telas do front. Seis literais soltos é o número exato
 * de lugares onde alguém muda cinco e esquece o sexto — e o sexto vira uma
 * senha aceita num fluxo e recusada no outro, sem mensagem que explique.
 *
 * O par no front é `MIN_PASSWORD_LENGTH` em
 * `profdex-front/src/services/password-rules.js`; os dois têm de andar juntos,
 * porque o front só antecipa a mensagem — quem recusa de verdade é este lado.
 *
 * O piso de guessing online é sustentado pelo AuthRateLimitService (5 falhas
 * por 15min, por IP+matrícula) e pelo hash bcrypt, não pelo comprimento.
 */
export const MIN_PASSWORD_LENGTH = 8;

/** Teto: evita virar vetor de DoS no custo do bcrypt. */
export const MAX_PASSWORD_LENGTH = 128;
