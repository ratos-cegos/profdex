// Quem a arena MOSTRA em campo de cada lado, avançando evento a evento.
//
// O `you`/`foe` que o servidor manda na rodada já é o estado FINAL — depois de
// trocas e golpes. Ligar o palco direto nele fazia três coisas erradas numa
// rodada com troca ou nocaute:
//   - o sprite do substituto aparecia antes de a fila chegar à troca, ainda
//     com a marca de "caído" de quem saiu (a animação de queda "passava" para
//     quem entrou);
//   - o dano depois da troca era descontado do HP de quem SAIU, e podia
//     derrubar na tela quem acabou de entrar;
//   - a transição de queda do <img> reaproveitado continuava no novo professor.
//
// Aqui o ocupante é estado próprio da tela, que só muda quando a fila passa
// pelo evento correspondente — o `switch` traz quem entra (servidor, ver
// `switchEvent` em profdex-back/src/battle/team.ts). Funções puras, sem Vue,
// para o teste ser direto.

/**
 * @typedef {{ professor: object|null, types: string[], hp: number, maxHp: number,
 *             fainted: boolean, entrada: number }} Ocupante
 */

/** O ocupante como o servidor o descreve agora (fim de rodada, reconexão). */
export function ocupanteDoServidor(lado, entrada = 0) {
  const hp = Math.max(0, lado?.hp ?? 0)
  return {
    professor: lado?.professor ?? null,
    types: lado?.types ?? [],
    hp,
    maxHp: lado?.maxHp ?? 0,
    fainted: Boolean(lado) && hp <= 0,
    entrada,
  }
}

/**
 * Aplica UM evento da fila ao estado exibido `{ player, enemy }`.
 *
 * Devolve um estado novo (não muta), para o Vue enxergar a troca de referência.
 * Eventos sem alvo (mensagem, eficácia) não mudam ninguém.
 */
export function aplicarEvento(estado, ev) {
  if (!ev || !('target' in ev) || !estado[ev.target]) return estado
  const atual = estado[ev.target]
  let proximo

  switch (ev.type) {
    case 'damage': {
      const hp = Math.max(0, atual.hp - ev.amount)
      proximo = { ...atual, hp, fainted: hp <= 0 }
      break
    }
    case 'heal':
      proximo = { ...atual, hp: Math.min(atual.maxHp || Infinity, atual.hp + ev.amount) }
      break
    case 'faint':
      proximo = { ...atual, hp: 0, fainted: true }
      break
    case 'switch':
      // Servidor antigo (sem os dados de quem entra): pelo menos não deixa o
      // substituto tombado; o sprite e a barra se acertam no fim da fila.
      proximo = ev.professor
        ? {
            professor: ev.professor,
            types: ev.types ?? [],
            hp: Math.max(0, ev.hp ?? 0),
            maxHp: ev.maxHp ?? 0,
            fainted: false,
            entrada: atual.entrada + 1,
          }
        : { ...atual, fainted: false, entrada: atual.entrada + 1 }
      break
    default:
      return estado
  }
  return { ...estado, [ev.target]: proximo }
}

/**
 * Chave do sprite em campo. Muda a cada ENTRADA, não só a cada professor: dois
 * exemplares do mesmo professor trocando entre si também precisam de um <img>
 * novo, senão o que entra herda a transição de queda do que saiu.
 */
export const chaveDoOcupante = (ocupante) =>
  `${ocupante?.professor?.id ?? ocupante?.professor?.slug ?? 'vazio'}#${ocupante?.entrada ?? 0}`
