import { ref } from 'vue'
import { registerSW } from 'virtual:pwa-register'

/**
 * Estado do PWA: atualização pendente e convite de instalação.
 *
 * Fica num módulo (e não dentro de um componente) porque os dois eventos que
 * alimentam isso chegam UMA vez por carregamento da página, em momentos que
 * ninguém controla: o `beforeinstallprompt` dispara logo no boot, e o service
 * worker avisa da atualização quando termina de baixar. Guardar num ref de
 * componente perderia o evento se o componente ainda não estivesse montado.
 */

/** Há uma versão nova baixada e esperando. */
export const temAtualizacao = ref(false)

/** O navegador ofereceu instalar o app (Android/Chrome; iOS nunca dispara). */
export const podeInstalar = ref(false)

/** Guardado do `beforeinstallprompt` — é o único jeito de abrir o diálogo. */
let eventoDeInstalacao = null

/**
 * Aplica a atualização. Com `registerType: 'prompt'` isso só acontece quando o
 * aluno toca no aviso — recarregar sozinho no meio de uma batalha PvP derruba
 * a partida, porque o estado do Socket.IO vive na memória do servidor.
 */
export let atualizarAgora = () => {}

// `registerSW` só existe no build (o SW está desligado em dev, ver
// vite.config.js). Chamar no import garante que a checagem começa cedo.
if (typeof window !== 'undefined') {
  atualizarAgora = registerSW({
    onNeedRefresh() {
      temAtualizacao.value = true
    },
  })

  window.addEventListener('beforeinstallprompt', (evento) => {
    // Sem o preventDefault o Chrome mostra o próprio banner, e aí existiriam
    // dois convites de instalação competindo na mesma tela.
    evento.preventDefault()
    eventoDeInstalacao = evento
    podeInstalar.value = true
  })

  window.addEventListener('appinstalled', () => {
    eventoDeInstalacao = null
    podeInstalar.value = false
  })
}

/** Abre o diálogo nativo de instalação. Só vale uma vez por evento capturado. */
export async function instalar() {
  if (!eventoDeInstalacao) return false
  const prompt = eventoDeInstalacao
  eventoDeInstalacao = null
  podeInstalar.value = false

  prompt.prompt()
  const { outcome } = await prompt.userChoice
  return outcome === 'accepted'
}

/** Já está rodando instalado (standalone)? */
export function estaInstalado() {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    // Só o Safari define isto; nos outros navegadores é undefined.
    window.navigator.standalone === true
  )
}

/**
 * iOS não dispara `beforeinstallprompt`: lá a instalação é manual, pelo menu
 * Compartilhar. A tela precisa saber disso para mostrar a instrução em vez de
 * um botão que não faria nada.
 */
export function ehIos() {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  // iPadOS recente se identifica como Mac; o toque é o que o distingue.
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
}
