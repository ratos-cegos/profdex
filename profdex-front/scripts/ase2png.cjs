/**
 * Converte um .ase/.aseprite em PNG, sem depender do Aseprite instalado.
 *
 * O arquivo é um container binário: cabeçalho de 128 bytes, depois um bloco por
 * frame, cada um com chunks (camadas, cels). Os pixels de cada cel vêm
 * comprimidos em zlib — o mesmo `zlib` nativo que já usamos para os ícones dá
 * conta. Aqui compomos as camadas visíveis de cada frame sobre um canvas RGBA.
 *
 * Extensão `.cjs` porque o pacote do front é ESM (`"type": "module"`).
 *
 * Uso: node scripts/ase2png.cjs <entrada.ase> <saida-base>
 *   Gera <saida-base>.png (frame 0) e <saida-base>-sheet.png (todos os frames).
 *
 * Exemplo (sprites usados na arena):
 *   node scripts/ase2png.cjs ../../profdex_sprites/sprite-gustavo-frente-parado.ase \
 *     public/professors/gustavo-frente
 */
const fs = require('node:fs')
const zlib = require('node:zlib')

const CHUNK_LAYER = 0x2004
const CHUNK_CEL = 0x2005

// ── Leitura do .ase ─────────────────────────────────────────────────────────

function lerAse(caminho) {
  const b = fs.readFileSync(caminho)
  if (b.readUInt16LE(4) !== 0xa5e0) throw new Error('não é um arquivo Aseprite')

  const totalFrames = b.readUInt16LE(6)
  const largura = b.readUInt16LE(8)
  const altura = b.readUInt16LE(10)
  const bits = b.readUInt16LE(12)
  if (bits !== 32) throw new Error(`profundidade ${bits} não suportada (só RGBA 32)`)

  const camadas = []
  const frames = []
  let o = 128

  for (let f = 0; f < totalFrames; f++) {
    const bytesFrame = b.readUInt32BE ? b.readUInt32LE(o) : 0
    if (b.readUInt16LE(o + 4) !== 0xf1fa) throw new Error(`frame ${f} corrompido`)
    const duracao = b.readUInt16LE(o + 8)
    const antigos = b.readUInt16LE(o + 6)
    const novos = b.readUInt32LE(o + 12)
    const totalChunks = novos || antigos

    let p = o + 16
    const cels = []

    for (let c = 0; c < totalChunks; c++) {
      const tamChunk = b.readUInt32LE(p)
      const tipo = b.readUInt16LE(p + 4)
      const dados = b.subarray(p + 6, p + tamChunk)

      if (tipo === CHUNK_LAYER) {
        const flags = dados.readUInt16LE(0)
        const tipoCamada = dados.readUInt16LE(2)
        const opacidade = dados.readUInt8(12)
        camadas.push({
          visivel: (flags & 1) === 1,
          grupo: tipoCamada === 1,
          opacidade,
        })
      } else if (tipo === CHUNK_CEL) {
        const indiceCamada = dados.readUInt16LE(0)
        const x = dados.readInt16LE(2)
        const y = dados.readInt16LE(4)
        const opacidade = dados.readUInt8(6)
        const tipoCel = dados.readUInt16LE(7)
        // 7 bytes reservados (ou z-index + 5) — mesmo tamanho nas duas versões
        const corpo = dados.subarray(16)

        if (tipoCel === 0 || tipoCel === 2) {
          const cw = corpo.readUInt16LE(0)
          const ch = corpo.readUInt16LE(2)
          const cru = corpo.subarray(4)
          const pixels =
            tipoCel === 2 ? zlib.inflateSync(cru) : cru.subarray(0, cw * ch * 4)
          cels.push({ indiceCamada, x, y, largura: cw, altura: ch, opacidade, pixels })
        } else if (tipoCel === 1) {
          // Cel ligado: reaproveita o cel da mesma camada em outro frame.
          const frameOrigem = corpo.readUInt16LE(0)
          cels.push({ indiceCamada, ligadoA: frameOrigem })
        }
      }

      p += tamChunk
    }

    frames.push({ duracao, cels })
    o += bytesFrame
  }

  return { largura, altura, camadas, frames }
}

// ── Composição ──────────────────────────────────────────────────────────────

/** Alpha compositing source-over de um cel sobre o canvas. */
function desenharCel(canvas, larguraCanvas, alturaCanvas, cel, opacidadeCamada) {
  const alfaGlobal = (cel.opacidade / 255) * (opacidadeCamada / 255)

  for (let y = 0; y < cel.altura; y++) {
    const destY = y + cel.y
    if (destY < 0 || destY >= alturaCanvas) continue
    for (let x = 0; x < cel.largura; x++) {
      const destX = x + cel.x
      if (destX < 0 || destX >= larguraCanvas) continue

      const s = (y * cel.largura + x) * 4
      const sa = (cel.pixels[s + 3] / 255) * alfaGlobal
      if (sa === 0) continue

      const d = (destY * larguraCanvas + destX) * 4
      const da = canvas[d + 3] / 255
      const outA = sa + da * (1 - sa)
      if (outA === 0) continue

      for (let k = 0; k < 3; k++) {
        canvas[d + k] = Math.round(
          (cel.pixels[s + k] * sa + canvas[d + k] * da * (1 - sa)) / outA,
        )
      }
      canvas[d + 3] = Math.round(outA * 255)
    }
  }
}

function comporFrame(doc, indice) {
  const { largura, altura, camadas, frames } = doc
  const canvas = new Uint8Array(largura * altura * 4)
  const cels = [...frames[indice].cels].sort((a, b) => a.indiceCamada - b.indiceCamada)

  for (let cel of cels) {
    const camada = camadas[cel.indiceCamada]
    if (!camada || !camada.visivel || camada.grupo) continue

    if (cel.ligadoA !== undefined) {
      const origem = frames[cel.ligadoA].cels.find(
        (c) => c.indiceCamada === cel.indiceCamada && c.pixels,
      )
      if (!origem) continue
      cel = { ...origem, opacidade: origem.opacidade }
    }
    if (!cel.pixels) continue

    desenharCel(canvas, largura, altura, cel, camada.opacidade)
  }

  return canvas
}

// ── Escrita de PNG (mesma rotina usada nos ícones) ──────────────────────────

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
      bruto, y * (passo + 1) + 1,
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

/** Recorta a bounding box do conteúdo comum a TODOS os frames (mantém o registro
 *  entre eles: recortar cada frame isolado faria o sprite "pular"). */
function bboxComum(quadros, largura, altura) {
  let minX = largura, minY = altura, maxX = -1, maxY = -1
  for (const q of quadros) {
    for (let y = 0; y < altura; y++) {
      for (let x = 0; x < largura; x++) {
        if (q[(y * largura + x) * 4 + 3] > 8) {
          if (x < minX) minX = x
          if (x > maxX) maxX = x
          if (y < minY) minY = y
          if (y > maxY) maxY = y
        }
      }
    }
  }
  return { minX, minY, largura: maxX - minX + 1, altura: maxY - minY + 1 }
}

function recortar(pixels, largura, bbox) {
  const saida = new Uint8Array(bbox.largura * bbox.altura * 4)
  for (let y = 0; y < bbox.altura; y++) {
    for (let x = 0; x < bbox.largura; x++) {
      const o = ((y + bbox.minY) * largura + (x + bbox.minX)) * 4
      const d = (y * bbox.largura + x) * 4
      saida.set(pixels.subarray(o, o + 4), d)
    }
  }
  return saida
}

// ── Execução ────────────────────────────────────────────────────────────────

const [entrada, base] = process.argv.slice(2)
const doc = lerAse(entrada)

console.log(`${doc.frames.length} frames de ${doc.largura}x${doc.altura}`)
console.log(`camadas: ${doc.camadas.length} (${doc.camadas.filter((c) => c.visivel).length} visíveis)`)
console.log(`durações (ms): ${doc.frames.map((f) => f.duracao).join(', ')}`)

const quadros = doc.frames.map((_, i) => comporFrame(doc, i))

// Quantos frames são realmente diferentes do primeiro?
const distintos = quadros.filter(
  (q, i) => i === 0 || !q.every((v, k) => v === quadros[0][k]),
).length
console.log(`frames distintos do primeiro: ${distintos - 1} de ${quadros.length - 1}`)

const bbox = bboxComum(quadros, doc.largura, doc.altura)
console.log(`conteúdo: ${bbox.largura}x${bbox.altura} em (${bbox.minX},${bbox.minY})`)

const recortados = quadros.map((q) => recortar(q, doc.largura, bbox))

// Frame 0 isolado
fs.writeFileSync(`${base}.png`, codificarPng(bbox.largura, bbox.altura, recortados[0]))

// Folha horizontal com todos os frames
const folha = new Uint8Array(bbox.largura * recortados.length * bbox.altura * 4)
const passoFolha = bbox.largura * recortados.length * 4
for (let i = 0; i < recortados.length; i++) {
  for (let y = 0; y < bbox.altura; y++) {
    for (let x = 0; x < bbox.largura; x++) {
      const o = (y * bbox.largura + x) * 4
      const d = y * passoFolha + (i * bbox.largura + x) * 4
      folha.set(recortados[i].subarray(o, o + 4), d)
    }
  }
}
fs.writeFileSync(
  `${base}-sheet.png`,
  codificarPng(bbox.largura * recortados.length, bbox.altura, folha),
)

const kb = (p) => (fs.statSync(p).size / 1024).toFixed(1)
console.log(`\ngravado: ${base}.png (${kb(`${base}.png`)}KB)`)
console.log(`gravado: ${base}-sheet.png (${kb(`${base}-sheet.png`)}KB)`)
