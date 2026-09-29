import { ref } from 'vue'
import { defineStore } from 'pinia'
import { classificarAviso } from '../services/battle-avisos'

// Avisos curtos do ecossistema de batalha (cooldown, convite recusado, rival
// que saiu…), desenhados pelo AvisoPixel no topo de QUALQUER tela.
//
// Antes cada recusa ia para `battle.lastError`, que só a tela de batalha
// mostrava: quem aceitava um desafio pelo aviso na Profdex e recebia "quem
// convidou não está mais disponível" não via nada — e dava de cara com a
// mensagem velha minutos depois, ao abrir /batalha.

// Tempo na tela. Longo o bastante para ler duas linhas com o celular na mão,
// curto o bastante para não virar entulho.
const DURACAO_MS = 5000
// A mesma frase de novo em menos disto só renova o aviso que já está lá —
// dois toques em "desafiar" não podem empilhar dois "aguarde".
const JANELA_REPETIDO_MS = 3000
// Mais que isto vira muro de texto; o mais antigo sai.
const MAX_VISIVEIS = 2

let proximoId = 1

export const useAvisosStore = defineStore('avisos', () => {
  const avisos = ref([]) // [{ id, texto, tipo, icone, titulo, duracao, criadoEm }]
  const timers = new Map()

  function fechar(id) {
    clearTimeout(timers.get(id))
    timers.delete(id)
    avisos.value = avisos.value.filter((aviso) => aviso.id !== id)
  }

  function agendar(aviso) {
    clearTimeout(timers.get(aviso.id))
    timers.set(
      aviso.id,
      setTimeout(() => fechar(aviso.id), aviso.duracao),
    )
  }

  /** Mostra um aviso. `code` é o da raid, quando o servidor manda. */
  function mostrar(texto, { code, duracao = DURACAO_MS } = {}) {
    if (!texto) return null
    const agora = Date.now()

    const repetido = avisos.value.find(
      (aviso) => aviso.texto === texto && agora - aviso.criadoEm < JANELA_REPETIDO_MS,
    )
    if (repetido) {
      // Nova identidade faz a barra de tempo recomeçar na tela.
      const renovado = { ...repetido, id: proximoId++, criadoEm: agora }
      clearTimeout(timers.get(repetido.id))
      timers.delete(repetido.id)
      avisos.value = avisos.value.map((aviso) => (aviso.id === repetido.id ? renovado : aviso))
      agendar(renovado)
      return renovado.id
    }

    const aviso = { id: proximoId++, texto, duracao, criadoEm: agora, ...classificarAviso(texto, code) }
    const mantidos = avisos.value.slice(-(MAX_VISIVEIS - 1))
    for (const antigo of avisos.value) if (!mantidos.includes(antigo)) fechar(antigo.id)
    avisos.value = [...mantidos, aviso]
    agendar(aviso)
    return aviso.id
  }

  return { avisos, mostrar, fechar }
})
