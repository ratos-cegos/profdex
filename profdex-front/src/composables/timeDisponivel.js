/**
 * Quais professores o aluno pode levar para a batalha.
 *
 * Função PURA, fora da `PvpPickView`, porque esta lista já errou duas vezes
 * pelo mesmo motivo — e componente Vue não é testado neste repositório
 * (ver `test/battle-sprites.test.js`), então o que precisa de rede de proteção
 * mora num módulo como este.
 *
 * As duas vezes foram a mesma omissão: a lista nasceu como "a dex", e todo
 * professor que vive FORA da contagem da dex ficou invisível para a batalha
 * mesmo com o exemplar na mão e o servidor pronto para aceitá-lo.
 *
 * - Os **raros** não entram em `professors` porque a tela da coleção os desenha
 *   de outra lista (o servidor nunca manda raro não capturado).
 * - O **lendário** não entra em `professors` porque o gate da raid o exclui da
 *   dex de propósito: incluí-lo tornaria a conta circular (só destravaria a
 *   raid quem já tivesse vencido a raid). E não entra em `rares` porque raro e
 *   lendário são exclusivos no cadastro.
 *
 * Em batalha a distinção não existe: o que entra na arena é o EXEMPLAR, e o
 * servidor (`build-team.ts`) nunca filtrou raridade nenhuma. Quem decide é esta
 * lista — por isso ela junta as três origens e não uma só.
 */

/**
 * @param {object} fontes
 * @param {Array} fontes.dex           professores da Profdex (`professors`)
 * @param {Array} fontes.raros         raros POSSUÍDOS (`rares.owned`)
 * @param {Array} fontes.lendario      o lendário vencido, em lista (`[]` até lá)
 * @param {(id: string) => Array} exemplaresDe  as capturas de um professor
 * @returns {Array} os professores com ao menos um exemplar, cada um com
 *   `exemplares` preenchido e na ordem dex → raros → lendário.
 */
export function professoresParaOTime(
  { dex = [], raros = [], lendario = [] } = {},
  exemplaresDe = () => [],
) {
  // O lendário por último de propósito: ele é a última entrada da coleção, e a
  // faixa de escolha segue a mesma ordem da Profdex.
  return [...dex, ...raros, ...lendario]
    .map((professor) => ({
      ...professor,
      exemplares: exemplaresDe(professor.id),
    }))
    .filter((professor) => professor.exemplares.length > 0)
}

/**
 * Quantos exemplares a lista inteira oferece — é o teto de slots do time.
 *
 * Conta EXEMPLARES, não professores: dois exemplares do mesmo professor são
 * dois personagens (tipos, deck e IVs próprios) e ocupam dois slots.
 */
export function totalDeExemplares(professores) {
  return professores.reduce((total, p) => total + p.exemplares.length, 0)
}
