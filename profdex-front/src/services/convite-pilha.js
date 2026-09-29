// Regras de visibilidade da pilha de desafios (ConvitePilha.vue), fora do
// componente para poderem ser testadas sem montar Vue.

/** Quantos convites a pilha desenha; o resto vira "+N aguardando". */
export const RENDER_CAP = 20

/**
 * Rotas onde nenhum aviso de batalha aparece.
 *
 * O painel e a bancada do quiz (`/admin/quiz/bancada`) rodam numa conta de
 * organizador, muitas vezes no tablet do estande à frente do público. Um
 * desafio pipocando por cima da bancada atrapalharia o atendimento. Os
 * convites continuam chegando no store; só não são desenhados aqui, e
 * reaparecem (se ainda valerem) quando a conta sai do `/admin`.
 */
export function rotaSilenciada(path) {
  return path === '/admin' || String(path ?? '').startsWith('/admin/')
}

/**
 * Convites que a pilha deve mostrar, do que expira primeiro ao último.
 *
 * Nada durante uma batalha (o servidor nem entrega convites a quem está em
 * `em_batalha`; o que sobrou na memória não pode cobrir a arena) nem numa rota
 * silenciada.
 */
export function convitesVisiveis(convites, { pvp = null, path = '' } = {}) {
  if (pvp || rotaSilenciada(path)) return []
  return [...(convites ?? [])].sort((a, b) => a.expiresAt - b.expiresAt)
}

/** Segundos inteiros até expirar, nunca negativos. */
export function segundosRestantes(expiresAt, agora) {
  return Math.max(0, Math.ceil((expiresAt - agora) / 1000))
}
