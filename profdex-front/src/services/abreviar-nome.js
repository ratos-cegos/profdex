// Nome de exibição com os nomes do meio abreviados: primeiro e último nome
// inteiros, cada nome do meio vira a inicial com ponto.
//
//   "Maria Eduarda Schneider de Albuquerque" → "Maria E. S. de Albuquerque"
//   "Luiz Henrique Vasconcellos Pereira Filho" → "Luiz H. V. Pereira Filho"
//
// Duas regras de nome brasileiro que um "pega a primeira letra" ingênuo erra:
//
// - Partícula (de, da, dos…) não é nome, então não vira "d.". No meio ela sai;
//   colada no sobrenome final ela fica, porque "dos Santos" é o sobrenome.
// - Agnome (Filho, Júnior, Neto…) não é o sobrenome: "Pereira Filho" é o par
//   que identifica a pessoa, e os dois ficam inteiros.

const PARTICULAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', "d'", 'di', 'du', 'del', 'van', 'von'])

const AGNOMES = new Set([
  'filho',
  'filha',
  'junior',
  'júnior',
  'jr',
  'jr.',
  'neto',
  'neta',
  'sobrinho',
  'sobrinha',
  'segundo',
  'terceiro',
])

const ehParticula = (palavra) => PARTICULAS.has(palavra.toLowerCase())

export function abreviarNome(nome) {
  const palavras = String(nome ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (palavras.length <= 2) return palavras.join(' ')

  // O fim do nome que fica inteiro: último sobrenome, mais o agnome se houver,
  // mais a partícula colada nele ("de Albuquerque", "dos Santos Filho").
  let inicioDoFim = palavras.length - 1
  if (AGNOMES.has(palavras[inicioDoFim].toLowerCase()) && inicioDoFim > 1) inicioDoFim--
  while (inicioDoFim > 1 && ehParticula(palavras[inicioDoFim - 1])) inicioDoFim--

  const meio = palavras
    .slice(1, inicioDoFim)
    .filter((palavra) => !ehParticula(palavra))
    // `Array.from` pega o primeiro caractere de verdade, inclusive acentuado
    // composto ("É").
    .map((palavra) => `${Array.from(palavra)[0].toLocaleUpperCase('pt-BR')}.`)

  return [palavras[0], ...meio, ...palavras.slice(inicioDoFim)].join(' ')
}
