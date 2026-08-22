// Quais modelos 3D esta landing serve, e quanto cada um pesa.
//
// A lista sai do `professors.js` (um professor com `model` entra aqui sozinho) e
// o peso sai do `model-sizes.js`, que é GERADO medindo o arquivo publicado. Nada
// aqui é digitado à mão: a seção 3D anuncia "cerca de X MB" antes de baixar, e
// um aviso de tamanho que mente é pior que nenhum aviso.
//
// Lista vazia desliga a seção 3D por completo — o botão some e a seção fica no
// retrato 2D. É o modo de falha correto: a página continua inteira sem o 3D, e
// nunca oferece um botão que não tem o que carregar.
import { CAPTURABLE } from '@/data/professors.js'
import { MODEL_SIZES_MB } from '@/config/model-sizes.js'

/**
 * Os professores que têm modelo, com o peso já resolvido.
 *
 * Um `model` sem entrada no manifesto fica de fora em vez de aparecer com
 * tamanho desconhecido — se o arquivo não foi medido, ele provavelmente não foi
 * gerado, e oferecer o download seria oferecer um 404.
 */
export const MODEL_ENTRIES = CAPTURABLE.filter(
  (prof) => prof.model && MODEL_SIZES_MB[prof.slug] != null,
).map((prof) => ({
  slug: prof.slug,
  name: prof.name,
  types: prof.types,
  url: prof.model,
  sizeMb: MODEL_SIZES_MB[prof.slug],
  // O retrato antes do 3D é o ROSTO em pixel, não o cartoon: um card emoldurado
  // em QR ao lado de um seletor de bonecos misturava duas linguagens na mesma
  // caixa. O cartoon continua sendo a arte de ficha, na Pokédex.
  poster: prof.spriteFace,
}))

/** O modelo aberto por padrão: o mais leve, que é o que dá a melhor primeira vez. */
export const DEFAULT_MODEL_SLUG = MODEL_ENTRIES.reduce(
  (leve, entry) => (leve && leve.sizeMb <= entry.sizeMb ? leve : entry),
  null,
)?.slug
