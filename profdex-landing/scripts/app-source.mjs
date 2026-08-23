/**
 * Onde está o `profdex-front` (o app), visto daqui.
 *
 * A landing é um repositório separado e NÃO versiona os originais: os `.glb` de
 * 27–74 MB e os PNG 4096² não têm por que viajar num repo de página estática.
 * O que este repo guarda é o RESULTADO (`public/`) mais os scripts que sabem
 * refazê-lo — então quem só quer rodar `npm run dev` não precisa do app ao lado,
 * e quem vai reprocessar arte precisa.
 *
 * A ordem de busca é: variável de ambiente primeiro (é a resposta de quem sabe),
 * depois os lugares onde o app costuma estar clonado. Falhar com a lista toda na
 * mensagem economiza uma ida ao README.
 */
import { existsSync } from 'node:fs'
import path from 'node:path'

const CANDIDATES = [
  process.env.PROFDEX_FRONT,
  path.resolve(import.meta.dirname, '../../profdex-front'),
  path.resolve(import.meta.dirname, '../../../profdex-front'),
  'D:\\profdex\\main\\profdex-front',
  path.join(process.env.USERPROFILE ?? process.env.HOME ?? '', 'Desktop', 'Profdex', 'profdex-front'),
].filter(Boolean)

/** Marca d'água: uma pasta só é o app se tiver a arte que viemos buscar. */
const MARKER = path.join('public', 'professors', 'gustavo-cartoon.png')

export function resolveAppRoot() {
  for (const dir of CANDIDATES) {
    if (existsSync(path.join(dir, MARKER))) return dir
  }

  throw new Error(
    'Não encontrei o profdex-front. Aponte com PROFDEX_FRONT=<caminho>.\n' +
      'Procurei em:\n' +
      CANDIDATES.map((c) => `  · ${c}`).join('\n'),
  )
}
