/**
 * Gera o placeholder 480×270 de `public/arena/ginasio-unifil.png`.
 * Arte final (16-bit, marca oficial) substitui este arquivo; o código das
 * arenas já aponta para o mesmo caminho.
 *
 *   node scripts/generate-ginasio-placeholder.cjs
 */
const fs = require('node:fs')
const path = require('node:path')
const zlib = require('node:zlib')

const W = 480
const H = 270

const C = {
  teto: [0x12, 0x14, 0x18],
  parede: [0x1a, 0x1a, 0x1a],
  paredeClaro: [0x2b, 0x2b, 0x2b],
  laranja: [0x99, 0x52, 0x00],
  ouro: [0xed, 0xaf, 0x68],
  ouroBrilho: [0xcb, 0xa0, 0x34],
  arquibancada: [0x4a, 0x4a, 0x4a],
  arquibancadaEsc: [0x2b, 0x2b, 0x2b],
  chao: [0x3a, 0x32, 0x28],
  chaoClaro: [0x5a, 0x4a, 0x38],
  plataforma: [0x6e, 0x5a, 0x42],
  linha: [0xed, 0xaf, 0x68],
  sombra: [0x1a, 0x12, 0x10],
  luz: [0xff, 0xdf, 0x6d],
}

function crc32(buf) {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = t[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunkPng(tipo, dados) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(dados.length)
  const corpo = Buffer.concat([Buffer.from(tipo, 'ascii'), dados])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(corpo))
  return Buffer.concat([len, corpo, crc])
}

function set(px, x, y, rgb) {
  if (x < 0 || y < 0 || x >= W || y >= H) return
  const i = (y * W + x) * 4
  px[i] = rgb[0]
  px[i + 1] = rgb[1]
  px[i + 2] = rgb[2]
  px[i + 3] = 255
}

function fillRect(px, x0, y0, x1, y1, rgb) {
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) set(px, x, y, rgb)
  }
}

function fillEllipse(px, cx, cy, rx, ry, rgb) {
  for (let y = cy - ry; y <= cy + ry; y++) {
    for (let x = cx - rx; x <= cx + rx; x++) {
      const nx = (x - cx) / rx
      const ny = (y - cy) / ry
      if (nx * nx + ny * ny <= 1) set(px, x, y, rgb)
    }
  }
}

const px = new Uint8Array(W * H * 4)

fillRect(px, 0, 0, W, 88, C.teto)
fillRect(px, 0, 88, W, 148, C.parede)

for (let y = 20; y < 86; y += 12) {
  fillRect(px, 0, y, W, y + 8, C.arquibancadaEsc)
  fillRect(px, 0, y + 8, W, y + 10, C.arquibancada)
}

for (let x = 24; x < W; x += 48) {
  fillRect(px, x, 8, x + 8, 22, C.luz)
  fillRect(px, x + 2, 22, x + 6, 88, C.paredeClaro)
}

fillRect(px, 0, 108, W, 118, C.laranja)
fillRect(px, 0, 118, W, 128, C.ouro)
fillRect(px, 0, 128, W, 132, C.ouroBrilho)

fillRect(px, 96, 92, 384, 108, C.paredeClaro)
fillRect(px, 108, 96, 372, 106, C.laranja)
fillRect(px, 140, 98, 340, 104, C.ouro)

fillRect(px, 0, 148, W, H, C.chao)
for (let y = 148; y < H; y++) {
  const t = (y - 148) / (H - 148)
  const inset = Math.round(40 * (1 - t))
  fillRect(px, inset, y, W - inset, y + 1, y % 6 === 0 ? C.chaoClaro : C.chao)
}

fillEllipse(px, 150, 168, 70, 14, C.plataforma)
fillEllipse(px, 330, 228, 90, 18, C.plataforma)
fillEllipse(px, 150, 168, 50, 8, C.sombra)
fillEllipse(px, 330, 228, 64, 10, C.sombra)

fillRect(px, 40, 200, W - 40, 202, C.linha)
fillRect(px, W / 2 - 1, 160, W / 2 + 1, 250, C.linha)

const bruto = Buffer.alloc(H * (W * 4 + 1))
for (let y = 0; y < H; y++) {
  bruto[y * (W * 4 + 1)] = 0
  Buffer.from(px.buffer, y * W * 4, W * 4).copy(bruto, y * (W * 4 + 1) + 1)
}
const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(W, 0)
ihdr.writeUInt32BE(H, 4)
ihdr[8] = 8
ihdr[9] = 6
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunkPng('IHDR', ihdr),
  chunkPng('IDAT', zlib.deflateSync(bruto, { level: 9 })),
  chunkPng('IEND', Buffer.alloc(0)),
])

const out = path.join(__dirname, '..', 'public', 'arena', 'ginasio-unifil.png')
fs.mkdirSync(path.dirname(out), { recursive: true })
fs.writeFileSync(out, png)
console.log(`gravado ${out} (${(png.length / 1024).toFixed(1)} KB, ${W}×${H})`)
