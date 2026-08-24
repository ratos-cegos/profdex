/**
 * Gera sprites de arena (35×64) a partir dos cartoons de ficha/captura.
 *
 * Frente: recorte + pixelização + paleta de docs/ESTILO-VISUAL.md.
 * Costas: silhueta derivada da frente (placeholder até render Blender/Aseprite).
 *
 * Uso:
 *   node scripts/cartoon2sprite.cjs eron mario
 *   node scripts/cartoon2sprite.cjs --all
 */
const fs = require('node:fs')
const path = require('node:path')
const zlib = require('node:zlib')
const sharp = require('sharp')

const ROOT = path.resolve(__dirname, '..')
const OUT_W = 35
const OUT_H = 64

const PALETA = [
  [0x1a, 0x12, 0x10],
  [0x12, 0x14, 0x18],
  [0x1a, 0x1a, 0x1a],
  [0x2b, 0x2b, 0x2b],
  [0x4a, 0x4a, 0x4a],
  [0x6e, 0x6e, 0x6e],
  [0xe8, 0xe8, 0xe8],
  [0xff, 0xff, 0xff],
  [0xd4, 0xa5, 0x74],
  [0xb8, 0x89, 0x5a],
  [0xf0, 0xc8, 0x96],
  [0x6b, 0x42, 0x26],
  [0x4a, 0x2e, 0x18],
  [0x2e, 0x4a, 0x7a],
  [0x4a, 0x6a, 0x9a],
  [0xf5, 0xf5, 0xf5],
  [0x99, 0x52, 0x00],
  [0xed, 0xaf, 0x68],
  [0xcb, 0xa0, 0x34],
  [0xff, 0xdf, 0x6d],
  [0x3c, 0x7f, 0xa1],
  [0x7e, 0xc5, 0xe6],
  [0x54, 0x99, 0x42],
  [0x9a, 0xe1, 0x86],
  [0xff, 0x6b, 0x6b],
  [0x55, 0x6b, 0x2f],
  [0x3d, 0x4f, 0x22],
]

let crcTable
function crc32(buf) {
  if (!crcTable) crcTable = makeCrcTable()
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function makeCrcTable() {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
}

function chunkPng(tipo, dados) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(dados.length)
  const corpo = Buffer.concat([Buffer.from(tipo, 'ascii'), dados])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(corpo))
  return Buffer.concat([len, corpo, crc])
}

function codificarPng(largura, altura, pixels) {
  const passo = largura * 4
  const bruto = Buffer.alloc(altura * (passo + 1))
  for (let y = 0; y < altura; y++) {
    bruto[y * (passo + 1)] = 0
    Buffer.from(pixels.buffer, pixels.byteOffset + y * passo, passo).copy(
      bruto,
      y * (passo + 1) + 1,
    )
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(largura, 0)
  ihdr.writeUInt32BE(altura, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunkPng('IHDR', ihdr),
    chunkPng('IDAT', zlib.deflateSync(bruto, { level: 9 })),
    chunkPng('IEND', Buffer.alloc(0)),
  ])
}

function quantizar(r, g, b) {
  let best = PALETA[0]
  let bestD = Infinity
  for (const cor of PALETA) {
    const dr = r - cor[0]
    const dg = g - cor[1]
    const db = b - cor[2]
    const d = dr * dr + dg * dg + db * db
    if (d < bestD) {
      bestD = d
      best = cor
    }
  }
  return best
}

function floodFundo(pixels, w, h, eh) {
  const seen = new Uint8Array(w * h)
  const stack = []
  const push = (x, y) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return
    const idx = y * w + x
    if (seen[idx]) return
    const i = idx * 4
    if (!eh(pixels[i], pixels[i + 1], pixels[i + 2])) return
    seen[idx] = 1
    stack.push(idx)
  }
  for (let x = 0; x < w; x++) {
    push(x, 0)
    push(x, h - 1)
  }
  for (let y = 0; y < h; y++) {
    push(0, y)
    push(w - 1, y)
  }
  while (stack.length) {
    const idx = stack.pop()
    push((idx % w) - 1, (idx / w) | 0)
    push((idx % w) + 1, (idx / w) | 0)
    push(idx % w, ((idx / w) | 0) - 1)
    push(idx % w, ((idx / w) | 0) + 1)
  }
  for (let idx = 0; idx < w * h; idx++) {
    if (seen[idx]) pixels[idx * 4 + 3] = 0
  }
}

function ehFundoFactory(ref) {
  return (r, g, b) => {
    if (ref) {
      const d = Math.abs(r - ref[0]) + Math.abs(g - ref[1]) + Math.abs(b - ref[2])
      if (d < 48) return true
    }
    if (r + g + b < 50) return true
    if (r > 210 && g > 210 && b > 210) return true
    if (b > 140 && g > 110 && r < 170 && b - r > 25) return true
    if (r > 200 && g < 90 && b < 90) return true
    if (r > 200 && g > 170 && b < 80) return true
    if (b > 180 && r < 120) return true
    if (r > 170 && g < 100 && b < 100) return true
    if (r < 100 && g < 100 && b > 170) return true
    if (r > 170 && g > 140 && b < 60) return true
    return false
  }
}

function bbox(pixels, w, h) {
  let minX = w
  let minY = h
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      if (pixels[i + 3] > 0) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  return { minX, minY, largura: maxX - minX + 1, altura: maxY - minY + 1 }
}

function amostra(pixels, w, bbox, sx, sy) {
  const x = Math.min(w - 1, Math.max(0, bbox.minX + Math.floor(sx)))
  const y = Math.min(
    pixels.length / (w * 4) - 1,
    Math.max(0, bbox.minY + Math.floor(sy)),
  )
  const i = (y * w + x) * 4
  return [pixels[i], pixels[i + 1], pixels[i + 2], pixels[i + 3]]
}

function escalarParaSprite(src, w, h, bbox) {
  const alvoCorpoH = 52
  const alvoCorpoW = OUT_W - 4
  const escala = Math.min(alvoCorpoW / bbox.largura, alvoCorpoH / bbox.altura)
  const dstW = Math.max(1, Math.round(bbox.largura * escala))
  const dstH = Math.max(1, Math.round(bbox.altura * escala))
  const out = new Uint8Array(OUT_W * OUT_H * 4)
  const offsetX = Math.floor((OUT_W - dstW) / 2)
  const offsetY = OUT_H - 8 - dstH

  for (let y = 0; y < dstH; y++) {
    for (let x = 0; x < dstW; x++) {
      const sx = ((x + 0.5) / dstW) * bbox.largura - 0.5
      const sy = ((y + 0.5) / dstH) * bbox.altura - 0.5
      const [r, g, b, a] = amostra(src, w, bbox, sx, sy)
      if (a < 20) continue
      const [qr, qg, qb] = quantizar(r, g, b)
      const o = ((offsetY + y) * OUT_W + (offsetX + x)) * 4
      out[o] = qr
      out[o + 1] = qg
      out[o + 2] = qb
      out[o + 3] = 255
    }
  }
  return out
}

function sombra(out) {
  const sombraY = OUT_H - 5
  const cx = OUT_W / 2
  const rx = 10
  const ry = 3
  for (let y = 0; y < OUT_H; y++) {
    for (let x = 0; x < OUT_W; x++) {
      const nx = (x - cx) / rx
      const ny = (y - sombraY) / ry
      if (nx * nx + ny * ny > 1) continue
      const i = (y * OUT_W + x) * 4
      if (out[i + 3] > 0) continue
      out[i] = 0x1a
      out[i + 1] = 0x12
      out[i + 2] = 0x10
      out[i + 3] = 153
    }
  }
}

function corDominante(out, y0, y1, x0, x1) {
  const freq = new Map()
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = (y * OUT_W + x) * 4
      if (out[i + 3] === 0) continue
      const key = `${out[i]},${out[i + 1]},${out[i + 2]}`
      freq.set(key, (freq.get(key) || 0) + 1)
    }
  }
  let best = [0x1a, 0x1a, 0x1a]
  let bestN = 0
  for (const [key, n] of freq) {
    if (n > bestN) {
      bestN = n
      best = key.split(',').map(Number)
    }
  }
  return best
}

function setPx(out, x, y, rgb, a = 255) {
  if (x < 0 || y < 0 || x >= OUT_W || y >= OUT_H) return
  const i = (y * OUT_W + x) * 4
  out[i] = rgb[0]
  out[i + 1] = rgb[1]
  out[i + 2] = rgb[2]
  out[i + 3] = a
}

/** Costas aproximadas a partir da frente — trocar por arte manual depois. */
function gerarCostas(frente) {
  const out = new Uint8Array(OUT_W * OUT_H * 4)
  const cabelo = corDominante(frente, 4, 18, 8, 26)
  const camisa = corDominante(frente, 18, 36, 10, 24)
  const calca = corDominante(frente, 36, 52, 10, 24)
  const tenis = corDominante(frente, 50, 58, 12, 22)

  for (let y = 0; y < OUT_H; y++) {
    for (let x = 0; x < OUT_W; x++) {
      const i = (y * OUT_W + x) * 4
      const fi = i
      if (frente[fi + 3] > 0 && y >= 34) {
        out[i] = frente[fi]
        out[i + 1] = frente[fi + 1]
        out[i + 2] = frente[fi + 2]
        out[i + 3] = 255
      }
    }
  }

  for (let y = 10; y <= 33; y++) {
    for (let x = 8; x <= 26; x++) {
      const t = (y - 10) / 23
      const largura = Math.round(9 - t * 2)
      const cx = 17 + (y < 22 ? -1 : 0)
      if (Math.abs(x - cx) <= largura) setPx(out, x, y, y < 20 ? cabelo : camisa)
    }
  }

  for (let y = 12; y <= 18; y++) {
    for (let x = 12; x <= 22; x++) setPx(out, x, y, cabelo)
  }

  for (let y = 34; y <= 52; y++) {
    for (let x = 11; x <= 23; x++) {
      if (out[(y * OUT_W + x) * 4 + 3] === 0) setPx(out, x, y, calca)
    }
  }

  for (let y = 53; y <= 57; y++) {
    for (let x = 12; x <= 16; x++) setPx(out, x, y, tenis)
    for (let x = 19; x <= 23; x++) setPx(out, x, y, tenis)
  }

  sombra(out)
  return out
}

async function frenteDeCartoon(cartoonPath) {
  const meta = await sharp(cartoonPath).metadata()
  const cropW = Math.round(meta.width * 0.58)
  const cropH = Math.round(meta.height * 0.72)
  const left = Math.round((meta.width - cropW) / 2)
  const top = Math.round(meta.height * 0.1)

  const { data, info } = await sharp(cartoonPath)
    .extract({ left, top, width: cropW, height: cropH })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const pixels = new Uint8Array(data.length)
  const ref = [data[0], data[1], data[2]]
  const eh = ehFundoFactory(ref)
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    if (eh(r, g, b)) {
      pixels[i + 3] = 0
      continue
    }
    pixels[i] = r
    pixels[i + 1] = g
    pixels[i + 2] = b
    pixels[i + 3] = 255
  }

  floodFundo(pixels, info.width, info.height, eh)

  const bb = bbox(pixels, info.width, info.height)
  const sprite = escalarParaSprite(pixels, info.width, info.height, bb)
  sombra(sprite)
  return sprite
}

async function gerarSlug(slug) {
  const cartoonPath = path.join(ROOT, 'public', 'professors', `${slug}-cartoon.png`)
  if (!fs.existsSync(cartoonPath)) throw new Error(`Cartoon não encontrado: ${cartoonPath}`)

  const outDir = path.join(ROOT, 'public', 'professors')
  console.log(`\n${slug}: ${path.basename(cartoonPath)} → pixel art`)

  const frente = await frenteDeCartoon(cartoonPath)
  const costas = gerarCostas(frente)

  const frentePath = path.join(outDir, `${slug}-frente.png`)
  const costasPath = path.join(outDir, `${slug}-costas.png`)
  fs.writeFileSync(frentePath, codificarPng(OUT_W, OUT_H, frente))
  fs.writeFileSync(costasPath, codificarPng(OUT_W, OUT_H, costas))

  const kb = (p) => (fs.statSync(p).size / 1024).toFixed(1)
  console.log(`  ${slug}-frente.png (${OUT_W}×${OUT_H}, ${kb(frentePath)} KB)`)
  console.log(`  ${slug}-costas.png (${OUT_W}×${OUT_H}, ${kb(costasPath)} KB)`)
}

async function main() {
  const args = process.argv.slice(2)
  const slugs =
    args[0] === '--all' ? ['eron', 'mario'] : args.length ? args : ['eron', 'mario']

  for (const slug of slugs) await gerarSlug(slug)
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
