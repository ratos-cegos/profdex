// Ícones em pixel art, desenhados à mão numa grade de 12×12.
//
// Substituem os emojis (🥇🥈🥉💠💎👑🏆🎯…) que o ranking e as abas usavam. Emoji
// muda de desenho a cada sistema — no Android da maioria do público é um, no
// iPhone é outro, e nenhum dos dois é pixel — e brigava com a Press Start 2P e
// os sprites dos professores. Aqui o ícone é da casa: mesma grade, mesmas cores
// de token, igual em qualquer aparelho.
//
// Cada ícone é uma lista de linhas; cada caractere é um pixel. `.` é
// transparente, e as outras letras apontam para a PALETA — tokens do style.css,
// nunca hex solto, para o ícone acompanhar a identidade se ela mudar.
//
// Algumas grades são MOLDES com letras-coringa (`l` luz, `m` metal, `M` sombra):
// a mesma medalha vira ouro, prata ou bronze só trocando o que o coringa
// significa. Assim as três não podem divergir de formato.

export const PALETA = {
  k: 'var(--bg-deep)', // contorno
  w: 'var(--text-primary)',
  s: 'var(--silver-hi)',
  S: 'var(--silver-lo)',
  o: 'var(--unifil-orange)',
  g: 'var(--unifil-gold)',
  y: 'var(--ds-orange-glow)',
  Y: 'var(--ds-orange)',
  d: 'var(--ds-orange-shadow)',
  n: 'var(--bronze-lo)',
  r: 'var(--error)',
  B: 'var(--ds-blue)',
  c: 'var(--ds-blue-glow)',
  b: 'var(--ds-blue-shadow)',
  // Herda a cor do texto em volta — para ícones de controle (fechar, setas),
  // que acompanham o estado do botão (hover, desabilitado).
  x: 'currentColor',
}

export const TAMANHO_GRADE = 12

// Coringas dos moldes, por metal.
const METAL = {
  ouro: { l: 'y', m: 'Y', M: 'd' },
  prata: { l: 'w', m: 's', M: 'S' },
  bronze: { l: 'g', m: 'o', M: 'n' },
  platina: { l: 's', m: 'c', M: 'S' },
  diamante: { l: 'c', m: 'B', M: 'b' },
}

const TROFEU = [
  '..kkkkkkkk..',
  'kkkyyyyyYkkk',
  'kYkywyyyYkYk',
  'kYkyyyyyYkYk',
  '.kkyyyyyYkk.',
  '..kYyyyYYk..',
  '...kkYYkk...',
  '....kYdk....',
  '...kkYdkk...',
  '..kYYYYddk..',
  '..kkkkkkkk..',
  '............',
]

const MEDALHA = [
  'kkkk....kkkk',
  'kook....kBBk',
  '.kook..kBBk.',
  '..kookkBBk..',
  '...kkkkkk...',
  '..kllmmmmk..',
  '.klmmmmmmMk.',
  '.klmmmmmmMk.',
  '.kmmmmmmMMk.',
  '.kmmmmmmMMk.',
  '..kMMMMMMk..',
  '...kkkkkk...',
]

// Escudos dos três primeiros tiers. As faixas claras contam o degrau — uma no
// Bronze, duas na Prata, três no Ouro — para o tier ser lido mesmo por quem
// não distingue bem as cores.
const ESCUDO_1 = [
  '.kkkkkkkkkk.',
  'kllllmmmmmMk',
  'klmmmmmmmmMk',
  'klmmmmmmmmMk',
  'klmllllllmMk',
  'klmmmmmmmmMk',
  '.kmmmmmmmMk.',
  '.klmmmmmmMk.',
  '..kmmmmmMk..',
  '...kmmmMk...',
  '....kmMk....',
  '.....kk.....',
]

const ESCUDO_2 = [
  '.kkkkkkkkkk.',
  'kllllmmmmmMk',
  'klmmmmmmmmMk',
  'klmllllllmMk',
  'klmmmmmmmmMk',
  'klmllllllmMk',
  '.kmmmmmmmMk.',
  '.klmmmmmmMk.',
  '..kmmmmmMk..',
  '...kmmmMk...',
  '....kmMk....',
  '.....kk.....',
]

const ESCUDO_3 = [
  '.kkkkkkkkkk.',
  'kllllmmmmmMk',
  'klmllllllmMk',
  'klmmmmmmmmMk',
  'klmllllllmMk',
  'klmmmmmmmmMk',
  '.kmlllllmMk.',
  '.klmmmmmmMk.',
  '..kmmmmmMk..',
  '...kmmmMk...',
  '....kmMk....',
  '.....kk.....',
]

const GEMA = [
  '............',
  '..kkkkkkkk..',
  '.kwllmmllmk.',
  'kwllmmmmllMk',
  'kkkkkkkkkkkk',
  '.kmmllmmMMk.',
  '..kmmlmmMk..',
  '...kmlmMk...',
  '....kmMk....',
  '.....kk.....',
  '............',
  '............',
]

const COROA = [
  '.k...kk...k.',
  'kyk.kyyk.kyk',
  'kYk.kYYk.kYk',
  'kYYkYYYYkYYk',
  'kYYYYYYYYYYk',
  'kYYrYYYYrYdk',
  'kYYYYrrYYYdk',
  'kYYYYYYYYddk',
  'kkkkkkkkkkkk',
  'kyyyyyyyyydk',
  'kkkkkkkkkkkk',
  '............',
]

const ALVO = [
  '....kkkk....',
  '..kkrrrrkk..',
  '.krrwwwwrrk.',
  '.krwwrrwwrk.',
  'krwwrrrrwwrk',
  'krwrrwwrrwrk',
  'krwrrwwrrwrk',
  'krwwrrrrwwrk',
  '.krwwrrwwrk.',
  '.krrwwwwrrk.',
  '..kkrrrrkk..',
  '....kkkk....',
]

const ESPADAS = [
  'kk........kk',
  'kwk......kwk',
  '.kwk....kwk.',
  '..kwk..kwk..',
  '...kwkkwk...',
  '....kwwk....',
  '....kwwk....',
  '...kwkkwk...',
  '..kgk..kgk..',
  '.kgok..kogk.',
  'kok......kok',
  'kk........kk',
]

const AMPULHETA = [
  '.kkkkkkkkkk.',
  '.kddddddddk.',
  '..kSSSSSSk..',
  '..kggggggk..',
  '...kggggk...',
  '....kggk....',
  '....kSgk....',
  '...kSSgSk...',
  '..kSSSgSSk..',
  '..kggggggk..',
  '.kddddddddk.',
  '.kkkkkkkkkk.',
]

const CADEADO = [
  '....kkkk....',
  '...kSSSSk...',
  '..kSk..kSk..',
  '..kSk..kSk..',
  '..kSk..kSk..',
  '.kkkkkkkkkk.',
  '.kYYYYYYYYk.',
  '.kYYYkkYYdk.',
  '.kYYYkkYYdk.',
  '.kYYYYkYYdk.',
  '.kddddddddk.',
  '.kkkkkkkkkk.',
]

const ALERTA = [
  '.....kk.....',
  '....kyyk....',
  '....kyyk....',
  '...kyyyyk...',
  '...kykkyk...',
  '..kyykkyyk..',
  '..kyykkyyk..',
  '.kyyykkyyyk.',
  '.kyyyyyyyyk.',
  'kyyyykkyyyyk',
  'kyyyyyyyyyyk',
  'kkkkkkkkkkkk',
]

const FECHAR = [
  '............',
  '.xx......xx.',
  '.xxx....xxx.',
  '..xxx..xxx..',
  '...xxxxxx...',
  '....xxxx....',
  '....xxxx....',
  '...xxxxxx...',
  '..xxx..xxx..',
  '.xxx....xxx.',
  '.xx......xx.',
  '............',
]

const SETA_CIMA = [
  '............',
  '............',
  '............',
  '.....xx.....',
  '....xxxx....',
  '...xxxxxx...',
  '..xxx..xxx..',
  '.xxx....xxx.',
  '.xx......xx.',
  '............',
  '............',
  '............',
]

/** Gira a grade 90° no sentido horário: a seta para cima vira a seta para a direita. */
function girarHorario(grade) {
  const n = grade.length
  return grade.map((_, linha) =>
    Array.from({ length: n }, (_, coluna) => grade[n - 1 - coluna][linha]).join(''),
  )
}

// "Recolher para o canto": um traço, o sinal de minimizar de qualquer janela.
const MINIMIZAR = [
  '............',
  '............',
  '............',
  '............',
  '............',
  '............',
  '............',
  '..xxxxxxxx..',
  '..xxxxxxxx..',
  '............',
  '............',
  '............',
]

const CHECK = [
  '............',
  '............',
  '..........xx',
  '.........xxx',
  '........xxx.',
  '.xx....xxx..',
  '.xxx..xxx...',
  '..xxxxxx....',
  '...xxxx.....',
  '....xx......',
  '............',
  '............',
]

export const ICONES = {
  trofeu: { grade: TROFEU },
  'medalha-ouro': { grade: MEDALHA, cores: METAL.ouro },
  'medalha-prata': { grade: MEDALHA, cores: METAL.prata },
  'medalha-bronze': { grade: MEDALHA, cores: METAL.bronze },
  'tier-bronze': { grade: ESCUDO_1, cores: METAL.bronze },
  'tier-prata': { grade: ESCUDO_2, cores: METAL.prata },
  'tier-ouro': { grade: ESCUDO_3, cores: METAL.ouro },
  'tier-platina': { grade: GEMA, cores: METAL.platina },
  'tier-diamante': { grade: GEMA, cores: METAL.diamante },
  'tier-mestre': { grade: COROA },
  alvo: { grade: ALVO },
  espadas: { grade: ESPADAS },
  ampulheta: { grade: AMPULHETA },
  cadeado: { grade: CADEADO },
  alerta: { grade: ALERTA },
  fechar: { grade: FECHAR },
  'seta-cima': { grade: SETA_CIMA },
  'seta-baixo': { grade: [...SETA_CIMA].reverse() },
  'seta-direita': { grade: girarHorario(SETA_CIMA) },
  minimizar: { grade: MINIMIZAR },
  check: { grade: CHECK },
}

// Nome do tier (como sai de `tierOf` no servidor) → ícone.
export const TIER_ICONE = {
  Bronze: 'tier-bronze',
  Prata: 'tier-prata',
  Ouro: 'tier-ouro',
  Platina: 'tier-platina',
  Diamante: 'tier-diamante',
  Mestre: 'tier-mestre',
}

/** Letra da grade → cor (valor CSS), resolvendo os coringas do molde. */
function corDoPixel(letra, cores = {}) {
  return PALETA[cores[letra] ?? letra]
}

/**
 * Converte um ícone em uma camada `<path>` por cor.
 *
 * Pixels vizinhos da mesma cor numa linha viram UM retângulo (`h{n}`), o que
 * deixa o SVG com dezenas de comandos em vez de centenas. Devolve `null` para
 * nome desconhecido — o componente simplesmente não desenha.
 */
export function desenharIcone(nome) {
  const icone = ICONES[nome]
  if (!icone) return null

  const porCor = new Map()
  icone.grade.forEach((linha, y) => {
    let x = 0
    while (x < linha.length) {
      const letra = linha[x]
      let fim = x + 1
      while (fim < linha.length && linha[fim] === letra) fim++
      if (letra !== '.') {
        const cor = corDoPixel(letra, icone.cores)
        porCor.set(cor, (porCor.get(cor) ?? '') + `M${x} ${y}h${fim - x}v1h${x - fim}z`)
      }
      x = fim
    }
  })

  return {
    largura: icone.grade[0].length,
    altura: icone.grade.length,
    camadas: [...porCor].map(([cor, d]) => ({ cor, d })),
  }
}
