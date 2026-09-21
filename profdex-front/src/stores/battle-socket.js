/**
 * Ciclo de vida do socket de batalha — a parte que não depende do Pinia, e que
 * por isso dá para testar.
 *
 * Os dois problemas aqui são a mesma família: um objeto de socket em mãos não
 * significa uma conexão viva. Ver docs/BUG-BATALHA-TRAVANDO.md (P2 e P4).
 */

/** Sem resposta neste prazo, a conexão é dada como morta. */
export const ACK_ZUMBI_MS = 2000

/**
 * Devolve o socket pronto para uso, chamando `criar` só quando ainda não há um.
 *
 * O `connect()` do store era `if (socket) return` — com um socket desconectado
 * em mãos, chamar de novo não fazia nada. E as três telas de batalha chamam
 * `connect()` no `onMounted` justamente contando com isso funcionar.
 */
export function ensureSocket(socket, criar) {
  if (!socket) return criar()
  if (!socket.connected) socket.connect()
  return socket
}

/**
 * Confere se o socket ainda responde e o reergue quando não responde.
 *
 * Quando o sistema operacional congela a aba, `socket.connected` continua
 * `true` por até ~45s (pingInterval 25s + pingTimeout 20s) depois de a conexão
 * já estar morta. Nessa janela os comandos são emitidos no vazio e só falham no
 * timeout de 5s. Um `battle:resync` com ack curto detecta a janela morta E já
 * traz o snapshot na volta.
 *
 * Só deve ser chamado por `visibilitychange` — nunca em cadeia, para o ciclo
 * disconnect/connect não entrar em laço com o backoff de reconexão do
 * Socket.IO (que é largo de propósito, ver `connect` no store).
 */
export function checarSocketVivo(socket, { timeoutMs = ACK_ZUMBI_MS } = {}) {
  if (!socket) return
  if (!socket.connected) {
    socket.connect()
    return
  }

  let respondeu = false
  const prazo = setTimeout(() => {
    if (respondeu) return
    socket.disconnect()
    socket.connect()
  }, timeoutMs)

  // O snapshot volta pelo evento `battle:resync`, não pelo ack: aqui ele serve
  // só como prova de vida da conexão.
  socket.emit('battle:resync', {}, () => {
    respondeu = true
    clearTimeout(prazo)
  })
}
