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
 * @typedef {{ professor: object|null, grupo: object[]|null, nome: string|null,
 *             types: string[], hp: number, maxHp: number,
 *             fainted: boolean, entrada: number }} Ocupante
 *
 * `grupo` e `nome` só existem na raid: `grupo` são os quatro do NDE dividindo
 * um corpo, e `nome` é quem ocupa o assento quando ele não é um professor
 * ("NDE da Coordenação"). Moram aqui, e não lidos do `foe` do servidor, pelo
 * mesmo motivo do resto: o `foe` é o estado do FIM da rodada.
 */

/** Os lados anteriores à rodada quando há eventos esperando reprodução. */
export function ladosParaInicioDaAnimacao(batalha) {
  // A rodada já recebida contém um snapshot FINAL. Para reproduzi-la depois
  // de montar a arena, começa com os ocupantes anteriores à troca e ao dano.
  return batalha?.pendingEvents?.length && batalha.inicioDosEventos
    ? batalha.inicioDosEventos
    : batalha
}

/** O ocupante como o servidor o descreve agora (fim de rodada, reconexão). */
export function ocupanteDoServidor(lado, entrada = 0) {
  const hp = Math.max(0, lado?.hp ?? 0)
  return {
    professor: lado?.professor ?? null,
    grupo: lado?.professores ?? null,
    nome: lado?.nomeEmCampo ?? null,
    // Só a raid manda: escolhe o par de sprites do estagio do lendario.
    estagio: lado?.estagio ?? null,
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
      if (ev.professor) {
        proximo = {
          professor: ev.professor,
          grupo: null,
          nome: null,
          types: ev.types ?? [],
          hp: Math.max(0, ev.hp ?? 0),
          maxHp: ev.maxHp ?? 0,
          fainted: false,
          entrada: atual.entrada + 1,
        }
      } else if (Number.isFinite(ev.hp)) {
        // Um grupo em campo (o NDE da raid): não há UM professor, mas os quatro
        // vêm no evento. Sprites, nome e barra trocam juntos, aqui.
        proximo = {
          ...atual,
          grupo: ev.professores ?? atual.grupo,
          nome: ev.name ?? atual.nome,
          types: ev.types ?? atual.types,
          hp: Math.max(0, ev.hp),
          maxHp: ev.maxHp ?? atual.maxHp,
          fainted: false,
          entrada: atual.entrada + 1,
        }
      } else {
        // Servidor antigo (sem os dados de quem entra): pelo menos não deixa o
        // substituto tombado; o sprite e a barra se acertam no fim da fila.
        proximo = { ...atual, fainted: false, entrada: atual.entrada + 1 }
      }
      break
    // A virada de estagio da raid. O chefe nao sai do assento — so troca de
    // corpo —, entao nada aqui mexe em vida nem em `entrada`: a arte muda e o
    // resto continua. Roteiro sem `estagio` (NDE, Ricardo) nao chega aqui,
    // porque sem `target` a funcao sai na primeira linha.
    case 'roteiro':
      if (!Number.isFinite(ev.estagio)) return estado
      proximo = { ...atual, estagio: ev.estagio }
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
