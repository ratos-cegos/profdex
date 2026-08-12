/**
 * Aplica ao estado da batalha o ack de um golpe enviado.
 *
 * Mora fora do store (e é testado) porque a ordem entre o ack e o
 * `battle:round` não é a intuitiva: quando o SEU golpe é o que fecha a rodada,
 * o servidor resolve o turno ainda dentro da chamada e emite a rodada nova
 * ANTES de confirmar o golpe. Marcar "já joguei" na volta do ack carimbava um
 * turno que já tinha começado — e os botões de golpe morriam até um F5.
 * Ver docs/BUG-BATALHA-TRAVANDO.md.
 *
 * `ack.turn` é o turno em que o SERVIDOR aceitou o golpe. `turnAtSend` é o
 * fallback para acks de erro, que não carregam turno.
 */
export function applyMoveAck(pvp, { ack, turnAtSend }) {
  if (!pvp) return

  const ackTurn = ack.ok ? (ack.turn ?? turnAtSend) : turnAtSend

  // A rodada virou enquanto o ack voltava: o turno novo já nasceu com
  // `youMoved: false`, vindo da autoridade. Escrever aqui seria desfazer isso.
  if (ackTurn !== pvp.turn) return

  pvp.youMoved = ack.ok
}
