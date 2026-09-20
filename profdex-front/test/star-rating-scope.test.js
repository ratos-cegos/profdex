// Regressão: as estrelas da ficha do professor apareciam SEMPRE com 5 de 5.
//
// O `StarRating` pinta a estrela vazia com `--surface-border` e a cheia com
// `--unifil-gold`. Quem usa o componente não vê nada disso — mas o nó raiz dele
// é um `<span>`, e no Vue o nó raiz de um filho recebe também o atributo de
// escopo do PAI. Um `.algum__head > span { color: ... }` no pai casa com esse
// span, com especificidade maior que o `.stars` do próprio componente, e pinta
// as vazias da cor das cheias. O exemplar passa a mostrar nota máxima
// independente do IV, e a mesma informação diverge da seleção de batalha.
//
// O defeito não é do StarRating — consertá-lo com `!important` só empurraria o
// problema para o próximo componente que usasse estrelas. Então o teste vale
// para TODOS os SFCs que montam o componente, e só acusa o caso que de fato
// alcança as estrelas: seletor de `span` cru pendurado num ANCESTRAL do
// StarRating. `.ivs span`, que existe no mesmo arquivo e não tem estrela
// dentro, continua livre.

import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src')

function vueFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const caminho = join(dir, entry.name)
    if (entry.isDirectory()) return vueFiles(caminho)
    return entry.name.endsWith('.vue') ? [caminho] : []
  })
}

const semComentarios = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '')

function estilos(source) {
  const blocos = source.match(/<style[^>]*>([\s\S]*?)<\/style>/g) ?? []
  return blocos.map((b) => semComentarios(b.replace(/<\/?style[^>]*>/g, '')))
}

/**
 * Tudo que envolve um `<StarRating>` no template: as classes estáticas e as
 * tags dos ancestrais. É essa lista que separa "seletor perigoso" de "seletor
 * que nunca vai encostar numa estrela".
 */
function ancestraisDoStarRating(source) {
  const template = source.match(/<template>([\s\S]*)<\/template>/)?.[1] ?? ''
  const ancestrais = new Set()
  const pilha = []

  for (const [tag, nome, atributos] of template.matchAll(
    /<(\/?[A-Za-z][\w.-]*)((?:"[^"]*"|'[^']*'|[^>])*)>/g,
  )) {
    if (nome === 'StarRating') {
      for (const aberto of pilha) {
        ancestrais.add(aberto.tag)
        for (const classe of aberto.classes) ancestrais.add(`.${classe}`)
      }
      continue
    }
    if (nome.startsWith('/')) {
      const fechando = nome.slice(1)
      const i = pilha.findLastIndex((a) => a.tag === fechando)
      if (i >= 0) pilha.length = i
      continue
    }
    if (atributos.trimEnd().endsWith('/') || tag.endsWith('/>')) continue

    const classes = (atributos.match(/\sclass="([^"]*)"/)?.[1] ?? '')
      .split(/\s+/)
      .filter(Boolean)
    pilha.push({ tag: nome, classes })
  }

  return ancestrais
}

/** Regras que pintam um `span` cru pendurado num dos ancestrais das estrelas. */
function regrasPerigosas(css, ancestrais) {
  const achados = []
  for (const [, seletores, corpo] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!/(^|[\s;])color\s*:/.test(corpo)) continue
    for (const seletor of seletores.split(',')) {
      const limpo = seletor.trim()
      const compounds = limpo.split(/[\s>+~]+/).filter(Boolean)
      // O último compound decide em quem a cor cai; o anterior, de onde ela
      // desce. `span` nomeado por classe (`span.pixel`) nunca é o problema.
      if (compounds.at(-1) !== 'span' || compounds.length < 2) continue
      if (ancestrais.has(compounds.at(-2))) achados.push(limpo)
    }
  }
  return achados
}

test('nenhum SFC pinta span cru acima de um StarRating', () => {
  const culpados = []
  let analisados = 0

  for (const arquivo of vueFiles(SRC)) {
    const source = readFileSync(arquivo, 'utf8')
    if (!/<StarRating/.test(source)) continue
    analisados++

    const ancestrais = ancestraisDoStarRating(source)
    for (const css of estilos(source)) {
      for (const seletor of regrasPerigosas(css, ancestrais)) {
        culpados.push(`${relative(SRC, arquivo)}: ${seletor}`)
      }
    }
  }

  // Sem isto, renomear o componente faria o teste passar sem checar nada.
  assert.ok(analisados > 0, 'nenhum SFC usando StarRating foi encontrado')
  assert.deepEqual(
    culpados,
    [],
    'Seletor de elemento pintando span filho: o nó raiz do StarRating é um ' +
      'span e as estrelas vazias saem da cor das cheias. Restrinja o seletor ' +
      `a uma classe (ex.: "> span.pixel"). Encontrados:\n${culpados.join('\n')}`,
  )
})

test('ProfessorExemplares escopa o rótulo do exemplar pela classe', () => {
  const source = readFileSync(
    join(SRC, 'components', 'ProfessorExemplares.vue'),
    'utf8',
  )

  // O rótulo continua dourado — o conserto foi mirar nele, não desligar a cor.
  assert.match(source, /\.copy__head > span\.pixel\s*\{/)
  assert.match(source, /<span class="pixel">EXEMPLAR/)
})
