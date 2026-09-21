/**
 * Traduz o snapshot de reconexão do servidor no novo estado do PvP.
 *
 * Mora fora do store (e é testado) por causa da fase `idle`: o servidor passou
 * a responder SEMPRE ao reconectar, inclusive quando não há sala nenhuma. Antes
 * ele ficava calado, e quem voltava de uma queda com `phase: 'active'` e
 * `youMoved: true` em memória ficava com os botões da arena mortos para sempre
 * — nenhum outro evento chega para corrigir isso, e só o F5 resolvia porque
 * jogava o estado fora. Ver docs/BUG-BATALHA-TRAVANDO.md (P1).
 *
 * Devolve `{ pvp, rota, aviso }`: o estado novo (ou o atual, intocado), a rota
 * para onde a tela deve ir (ou null para ficar onde está) e a mensagem a
 * mostrar (ou null).
 */
export const AVISO_SEM_SALA = 'A batalha foi encerrada enquanto você esteve sem conexão.'

export function applyResync(snap, atual) {
  const semSala = !snap || snap.phase === 'idle'

  if (semSala) {
    // `done` é a tela de resultado: a sala já fechou no servidor de propósito e
    // apagá-la aqui tiraria do jogador o placar que ele ainda não leu.
    const presoEmBatalhaMorta = !!atual && atual.phase !== 'done'
    if (!presoEmBatalhaMorta) return { pvp: atual ?? null, rota: null, aviso: null }
    return { pvp: null, rota: 'batalha', aviso: AVISO_SEM_SALA }
  }

  // `syncedAt` marca cada snapshot: como ele não traz fila de eventos para
  // animar, é o sinal que a arena usa para realinhar as barras de HP.
  const base = {
    battleId: snap.battleId,
    opponent: snap.opponent,
    phase: snap.phase,
    pendingEvents: [],
    result: null,
    syncedAt: Date.now(),
  }

  // `picking` e `preview` são as duas etapas da mesma tela: em picking o
  // jogador monta o time, em preview escolhe o lead vendo o rival.
  if (snap.phase === 'picking' || snap.phase === 'preview') {
    return {
      pvp: {
        ...base,
        pickDeadline: snap.deadline,
        youPicked: snap.youPicked,
        foePicked: snap.foePicked,
        you: snap.you ?? null,
        foe: snap.foe ?? null,
      },
      rota: 'pvp-pick',
      aviso: null,
    }
  }

  if (snap.phase === 'active' || snap.phase === 'switching') {
    return {
      pvp: {
        ...base,
        turn: snap.turn,
        deadline: snap.deadline,
        you: snap.you,
        foe: snap.foe,
        youMoved: snap.youMoved,
        foeMoved: snap.foeMoved,
        youChoose: snap.youChoose ?? false,
      },
      rota: 'pvp-arena',
      aviso: null,
    }
  }

  // Fase desconhecida (servidor mais novo que o app): não dá para desenhar,
  // mas também não dá para fingir que a batalha continua.
  return { pvp: null, rota: 'batalha', aviso: AVISO_SEM_SALA }
}
