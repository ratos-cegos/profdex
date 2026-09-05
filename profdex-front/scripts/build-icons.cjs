/**
 * Prepara os ícones de navegação do ProfDex a partir da arte original.
 *
 * A arte crua não serve para uso direto: parte dos PNGs vem com fundo preto
 * chapado (um deles sem canal alfa nenhum), cada um tem uma margem diferente em
 * volta do desenho e todos chegam entre 900px e 1600px para renderizar a ~34px.
 *
 * Para cada ícone: decodifica → torna o preto de fundo transparente → recorta na
 * bounding box → reduz por nearest-neighbor (a interpolação suave destruiria a
 * borda dura do pixel art) → reescreve.
 *
 * A proporção original é preservada de propósito: o CSS dimensiona os ícones
 * pela ALTURA, que é o que iguala o peso visual de um ao lado do outro. Forçar
 * quadrado fazia a arte larga (batalha, 1.75:1) aparecer com pouco mais da
 * metade da altura das demais.
 *
 * Extensão `.cjs` porque o pacote do front é ESM (`"type": "module"`).
 *
 * Uso:
 *   node scripts/build-icons.cjs [pasta-da-arte]
 * A pasta da arte fica fora do repositório; o padrão assume o layout local
 * `profdex/profdex_icons` ao lado da worktree.
 */
const fs = require('node:fs')
const path = require('node:path')
const zlib = require('node:zlib')

const RAIZ_FRONT = path.resolve(__dirname, '..')
const ORIGEM =
  process.argv[2] || path.resolve(RAIZ_FRONT, '../../profdex_icons')
const DESTINO = path.join(RAIZ_FRONT, 'public', 'icons')
// 128px cobre com folga o maior uso (56px no botão da lista) em telas 2x/3x.
const TAMANHO = 128

// Fundo preto a remover. Os contornos do desenho (marrom, vermelho) ficam bem
// acima disso, então o limiar não fura a arte.
const LIMIAR_PRETO = 40

const ICONES = [
  { entrada: 'profdex_profdex.png', saida: 'profdex.png', removerPreto: false },
  // A arte nova do scanner (cantoneiras douradas) já vem com fundo transparente.
  { entrada: 'profdex_scanner.png', saida: 'scanner.png', removerPreto: false },
  { entrada: 'profdex_batalha.png', saida: 'batalha.png', removerPreto: true },
  { entrada: 'profdex_ranking.png', saida: 'ranking.png', removerPreto: false },
  { entrada: 'profdex_quiz.png', saida: 'quiz.png', removerPreto: false },
  // Os quatro passos do "Como Funciona" da tela inicial. Passam pelo mesmo
  // tratamento dos ícones de navegação: a arte chega acima de 1000px para
  // renderizar a ~40px, e o recorte na bounding box tira a margem irregular de
  // cada arquivo — sem isso os quatro apareceriam com tamanhos diferentes.
  { entrada: 'profdex_passo1.png', saida: 'passo1.png', removerPreto: false },
  { entrada: 'profdex_passo2.png', saida: 'passo2.png', removerPreto: false },
  { entrada: 'profdex_passo3.png', saida: 'passo3.png', removerPreto: false },
  { entrada: 'profdex_passo4.png', saida: 'passo4.png', removerPreto: false },
]

// ── PNG: leitura ────────────────────────────────────────────────────────────

function lerChunks(buf) {
  const chunks = []
  let o = 8
  while (o < buf.length) {
    const len = buf.readUInt32BE(o)
    const tipo = buf.toString('ascii', o + 4, o + 8)
    chunks.push({ tipo, dados: buf.subarray(o + 8, o + 8 + len) })
    o += 8 + len + 4
  }
  return chunks
}

function paeth(a, b, c) {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  if (pa <= pb && pa <= pc) return a
  if (pb <= pc) return b
  return c
}

/** Devolve { largura, altura, pixels } com pixels em RGBA (Uint8Array). */
function decodificar(buf) {
  const largura = buf.readUInt32BE(16)
  const altura = buf.readUInt32BE(20)
  const profundidade = buf[24]
  const tipoCor = buf[25]
  const entrelacado = buf[28]

  if (profundidade !== 8) throw new Error(`profundidade ${profundidade} não suportada`)
  if (entrelacado !== 0) throw new Error('PNG entrelaçado não suportado')

  const chunks = lerChunks(buf)
  const plte = chunks.find((c) => c.tipo === 'PLTE')?.dados
  const trns = chunks.find((c) => c.tipo === 'tRNS')?.dados
  const bruto = zlib.inflateSync(
    Buffer.concat(chunks.filter((c) => c.tipo === 'IDAT').map((c) => c.dados)),
  )

  // canais por pixel na imagem original
  const canais = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[tipoCor]
  if (!canais) throw new Error(`tipo de cor ${tipoCor} não suportado`)

  const bpp = canais
  const passo = largura * bpp
  const linhas = Buffer.alloc(altura * passo)

  let pos = 0
  for (let y = 0; y < altura; y++) {
    const filtro = bruto[pos++]
    const linha = bruto.subarray(pos, pos + passo)
    pos += passo
    const destino = y * passo
    const anterior = (y - 1) * passo

    for (let i = 0; i < passo; i++) {
      const x = linha[i]
      const a = i >= bpp ? linhas[destino + i - bpp] : 0
      const b = y > 0 ? linhas[anterior + i] : 0
      const c = y > 0 && i >= bpp ? linhas[anterior + i - bpp] : 0
      let valor
      switch (filtro) {
        case 0: valor = x; break
        case 1: valor = x + a; break
        case 2: valor = x + b; break
        case 3: valor = x + ((a + b) >> 1); break
        case 4: valor = x + paeth(a, b, c); break
        default: throw new Error(`filtro ${filtro} inválido`)
      }
      linhas[destino + i] = valor & 0xff
    }
  }

  // normaliza para RGBA
  const pixels = new Uint8Array(largura * altura * 4)
  for (let i = 0, n = largura * altura; i < n; i++) {
    const s = i * bpp
    const d = i * 4
    if (tipoCor === 6) {
      pixels[d] = linhas[s]; pixels[d + 1] = linhas[s + 1]
      pixels[d + 2] = linhas[s + 2]; pixels[d + 3] = linhas[s + 3]
    } else if (tipoCor === 2) {
      pixels[d] = linhas[s]; pixels[d + 1] = linhas[s + 1]
      pixels[d + 2] = linhas[s + 2]; pixels[d + 3] = 255
    } else if (tipoCor === 3) {
      const idx = linhas[s]
      pixels[d] = plte[idx * 3]; pixels[d + 1] = plte[idx * 3 + 1]
      pixels[d + 2] = plte[idx * 3 + 2]
      pixels[d + 3] = trns && idx < trns.length ? trns[idx] : 255
    } else if (tipoCor === 0) {
      pixels[d] = pixels[d + 1] = pixels[d + 2] = linhas[s]; pixels[d + 3] = 255
    } else {
      pixels[d] = pixels[d + 1] = pixels[d + 2] = linhas[s]
      pixels[d + 3] = linhas[s + 1]
    }
  }

  return { largura, altura, pixels }
}

// ── PNG: escrita ────────────────────────────────────────────────────────────

const TABELA_CRC = (() => {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
})()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = TABELA_CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(tipo, dados) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(dados.length)
  const corpo = Buffer.concat([Buffer.from(tipo, 'ascii'), dados])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(corpo))
  return Buffer.concat([len, corpo, crc])
}

function codificar(largura, altura, pixels) {
  const passo = largura * 4
  const bruto = Buffer.alloc(altura * (passo + 1))
  for (let y = 0; y < altura; y++) {
    bruto[y * (passo + 1)] = 0 // filtro None
    Buffer.from(pixels.buffer, pixels.byteOffset + y * passo, passo).copy(
      bruto, y * (passo + 1) + 1,
    )
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(largura, 0)
  ihdr.writeUInt32BE(altura, 4)
  ihdr[8] = 8   // profundidade
  ihdr[9] = 6   // RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(bruto, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// ── Transformações ──────────────────────────────────────────────────────────

function removerFundoPreto(img) {
  let removidos = 0
  for (let i = 0, n = img.largura * img.altura; i < n; i++) {
    const d = i * 4
    const maior = Math.max(img.pixels[d], img.pixels[d + 1], img.pixels[d + 2])
    if (maior <= LIMIAR_PRETO && img.pixels[d + 3] > 0) {
      img.pixels[d + 3] = 0
      removidos++
    }
  }
  return removidos
}

/** Recorta na bounding box do conteúdo visível, preservando a proporção real.
 *
 *  Antes isso completava para quadrado. O problema: a arte de batalha é larga
 *  (1442x824), então o quadrado acrescentava ~21% de vazio em cima e embaixo e
 *  o ícone aparecia bem menor que os outros na barra. Agora cada arte mantém sua
 *  proporção e o CSS dimensiona todos pela ALTURA — é a altura que dá o peso
 *  visual de um ícone ao lado do outro. */
function recortar_bbox(img) {
  let minX = img.largura, minY = img.altura, maxX = -1, maxY = -1
  for (let y = 0; y < img.altura; y++) {
    for (let x = 0; x < img.largura; x++) {
      if (img.pixels[(y * img.largura + x) * 4 + 3] > 8) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  if (maxX < 0) throw new Error('imagem totalmente transparente')

  const largura = maxX - minX + 1
  const altura = maxY - minY + 1

  const saida = new Uint8Array(largura * altura * 4)
  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) {
      const o = ((y + minY) * img.largura + (x + minX)) * 4
      const d = (y * largura + x) * 4
      saida[d] = img.pixels[o]; saida[d + 1] = img.pixels[o + 1]
      saida[d + 2] = img.pixels[o + 2]; saida[d + 3] = img.pixels[o + 3]
    }
  }
  return { largura, altura, pixels: saida }
}

/** Reduz para uma ALTURA alvo mantendo a proporção.
 *  Nearest-neighbor: preserva a borda dura do pixel art. */
function reduzir(img, alturaAlvo) {
  const escala = alturaAlvo / img.altura
  const larguraAlvo = Math.max(1, Math.round(img.largura * escala))
  const saida = new Uint8Array(larguraAlvo * alturaAlvo * 4)

  for (let y = 0; y < alturaAlvo; y++) {
    const oy = Math.min(img.altura - 1, Math.floor((y + 0.5) / escala))
    for (let x = 0; x < larguraAlvo; x++) {
      const ox = Math.min(img.largura - 1, Math.floor((x + 0.5) / escala))
      const o = (oy * img.largura + ox) * 4
      const d = (y * larguraAlvo + x) * 4
      saida[d] = img.pixels[o]; saida[d + 1] = img.pixels[o + 1]
      saida[d + 2] = img.pixels[o + 2]; saida[d + 3] = img.pixels[o + 3]
    }
  }
  return { largura: larguraAlvo, altura: alturaAlvo, pixels: saida }
}

// Os utilitários de PNG são reaproveitados por `build-pwa-icons.cjs`, que gera
// os ícones de INSTALAÇÃO a partir da eagle-ball. Exportá-los evita uma segunda
// implementação de decode/encode no repositório.
module.exports = { decodificar, codificar, recortar_bbox, reduzir }

// ── Execução ────────────────────────────────────────────────────────────────
// Só quando chamado direto: importar este módulo não pode disparar a leitura da
// pasta de arte, que vive fora do repositório.
if (require.main === module) {
  fs.mkdirSync(DESTINO, { recursive: true })

  for (const icone of ICONES) {
    const origem = path.join(ORIGEM, icone.entrada)
    const buf = fs.readFileSync(origem)
    const img = decodificar(buf)

    let removidos = 0
    if (icone.removerPreto) removidos = removerFundoPreto(img)

    const cortado = recortar_bbox(img)
    const pequeno = reduzir(cortado, TAMANHO)
    const png = codificar(pequeno.largura, pequeno.altura, pequeno.pixels)

    const destino = path.join(DESTINO, icone.saida)
    fs.writeFileSync(destino, png)

    const kbAntes = (buf.length / 1024).toFixed(0)
    const kbDepois = (png.length / 1024).toFixed(1)
    const proporcao = (pequeno.largura / pequeno.altura).toFixed(2)
    console.log(
      `${icone.entrada.padEnd(22)} ${img.largura}x${img.altura} (${kbAntes}KB)` +
      ` → conteúdo ${cortado.largura}x${cortado.altura}` +
      ` → ${icone.saida} ${pequeno.largura}x${pequeno.altura} (proporção ${proporcao}, ${kbDepois}KB)` +
      (icone.removerPreto ? `  [${removidos} px de fundo removidos]` : ''),
    )
  }

  console.log(`\nGravado em ${DESTINO}`)
}
