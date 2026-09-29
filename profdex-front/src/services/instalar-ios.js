/**
 * Passo a passo da instalação manual no iPhone/iPad.
 *
 * O iOS não deixa a página abrir o diálogo de instalação (não existe
 * `beforeinstallprompt` lá), então o melhor que dá para fazer é mostrar o
 * caminho com os mesmos desenhos que o aluno vai procurar na tela. O caminho
 * muda um pouco conforme o navegador — e navegador de dentro de outro app
 * (Instagram, Facebook...) não instala de jeito nenhum.
 */

/** Navegadores embutidos em apps: não têm "Adicionar à Tela de Início". */
const APP_INTERNO = /FBAN|FBAV|Instagram|LinkedInApp|musical_ly|TikTok|Line\//

/**
 * @param {string | undefined} userAgent
 * @returns {'safari' | 'chrome' | 'outro' | 'app'}
 */
export function navegadorDoIos(userAgent) {
  const ua = userAgent ?? ''
  if (APP_INTERNO.test(ua)) return 'app'
  if (/CriOS/.test(ua)) return 'chrome'
  if (/FxiOS|EdgiOS|OPiOS/.test(ua)) return 'outro'
  return 'safari'
}

/**
 * Onde fica o Compartilhar em cada navegador. No Safari do iOS 26 ele saiu da
 * barra e foi para dentro do menu `···`; nas versões anteriores está na barra.
 */
const ONDE_COMPARTILHAR = {
  safari: 'Na barra do Safari. Não achou? Toque antes em ··· e ele aparece.',
  chrome: 'No canto da barra de endereço, lá em cima.',
  outro: 'No menu do navegador. Se não tiver, abra este link no Safari.',
}

/**
 * @param {'safari' | 'chrome' | 'outro' | 'app'} navegador
 * @returns {{ icone: string, titulo: string, detalhe: string }[]}
 */
export function passosDeInstalacao(navegador) {
  if (navegador === 'app') {
    return [
      {
        icone: 'mais',
        titulo: 'Abrir no navegador',
        detalhe:
          'Este navegador de dentro do app não instala. Toque em ··· e escolha abrir no Safari — ou copie o link abaixo e cole no Safari.',
      },
    ]
  }

  return [
    {
      icone: 'compartilhar',
      titulo: 'Compartilhar',
      detalhe: ONDE_COMPARTILHAR[navegador] ?? ONDE_COMPARTILHAR.safari,
    },
    {
      icone: 'adicionar',
      titulo: 'Adicionar à Tela de Início',
      detalhe: 'Role a lista de opções para baixo até achar.',
    },
    {
      icone: 'confirmar',
      titulo: 'Adicionar',
      detalhe: 'No canto de cima. Se aparecer "Abrir como App Web", deixe ligado.',
    },
    {
      icone: 'app',
      titulo: 'Abra pelo ícone',
      // O app instalado guarda a sessão separada do Safari: pode pedir login
      // de novo, e a matrícula e a senha são o caminho que funciona lá dentro.
      detalhe:
        'O ProfDex aparece na tela de início. Se pedir login, entre com sua matrícula e senha.',
    },
  ]
}
