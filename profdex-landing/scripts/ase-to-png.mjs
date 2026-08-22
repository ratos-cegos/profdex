/**
 * Extrai o quadro neutro de um `.ase`/`.aseprite` para PNG.
 *
 *   node scripts/ase-to-png.mjs <entrada.ase> <saida.png> [quadro]
 *
 * Existe porque a arte de autoria do Gustavo é `.ase`, e o PNG exportado dele
 * andava por aí solto. Com o `.ase` versionado em `assets-src/sprites/` e este
 * leitor aqui, a cadeia inteira — arte → PNG → `public/` — é refazível sem
 * abrir o Aseprite.
 *
 * Foi assim que se descobriu qual Gustavo era o antigo: comparar o PNG em uso
 * com o quadro 0 de cada `.ase` deu 0 pixels de diferença para o
 * `frente-parado.ase` (13 quadros) e 1086 para o `Sprite-Gustavo.ase` (1 quadro,
 * mais velho). Sem ler o `.ase` isso seria palpite.
 *
 * ── O formato, na medida em que interessa ────────────────────────────────────
 *
 * Cabeçalho de 128 bytes (magic 0xA5E0 no offset 4), depois um cabeçalho de 16
 * bytes por quadro (magic 0xF1FA) seguido dos chunks daquele quadro. Só dois
 * tipos de chunk importam aqui:
 *
 *   0x2004 Layer — de onde sai a visibilidade (bit 0 das flags).
 *   0x2005 Cel   — o retângulo de pixels de uma camada naquele quadro.
 *
 * No chunk de Cel há 7 bytes entre o tipo e os dados da imagem. Eles mudaram de
 * significado na versão 1.3 (viraram Z-Index + 5 reservados, antes eram 7
 * reservados) mas continuam sendo 7 — por isso o leitor pula 7 e funciona nas
 * duas versões.
 *
 * Suporta só cor de 32 bits (RGBA), que é o que estes arquivos usam. Indexado e
 * tons de cinza exigiriam ler a paleta, e não há caso.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { inflateSync } from 'node:zlib'
import sharp from 'sharp'

const CHUNK_LAYER = 0x2004
const CHUNK_CEL = 0x2005

/** Lê o arquivo inteiro: dimensões, camadas e os cels de cada quadro. */
export function readAse(file) {
  const b = readFileSync(file)
  if (b.readUInt16LE(4) !== 0xa5e0) throw new Error(`${file} não é um .ase (magic errado)`)

  const frames = b.readUInt16LE(6)
  const width = b.readUInt16LE(8)
  const height = b.readUInt16LE(10)
  const depth = b.readUInt16LE(12)
  if (depth !== 32) throw new Error(`${file} usa ${depth} bits por pixel; este leitor só faz RGBA (32).`)

  const camadas = []
  const quadros = []
  let off = 128

  for (let f = 0; f < frames; f++) {
    const bytesNoQuadro = b.readUInt32LE(off)
    if (b.readUInt16LE(off + 4) !== 0xf1fa) throw new Error(`quadro ${f} de ${file} inválido`)

    // O contador antigo (WORD) vale quando o novo (DWORD) é zero — arquivos com
    // mais de 65535 chunks só existem no campo novo.
    const nChunks = b.readUInt32LE(off + 12) || b.readUInt16LE(off + 6)
    const cels = []
    let p = off + 16

    for (let c = 0; c < nChunks; c++) {
      const size = b.readUInt32LE(p)
      const type = b.readUInt16LE(p + 4)
      const d = p + 6

      if (type === CHUNK_LAYER) {
        camadas.push({ visivel: (b.readUInt16LE(d) & 1) === 1 })
      } else if (type === CHUNK_CEL) {
        const layer = b.readUInt16LE(d)
        const x = b.readInt16LE(d + 2)
        const y = b.readInt16LE(d + 4)
        const opacity = b[d + 6]
        const celType = b.readUInt16LE(d + 7)
        const q = d + 16 // 7 bytes de reservado/Z-Index depois do tipo

        // 0 = pixels crus, 2 = pixels em zlib. 1 é cel ligado a outro quadro e 3
        // é tilemap; nenhum dos dois aparece nestes arquivos.
        if (celType === 0 || celType === 2) {
          const w = b.readUInt16LE(q)
          const h = b.readUInt16LE(q + 2)
          const dados = b.subarray(q + 4, p + size)
          cels.push({
            layer,
            x,
            y,
            w,
            h,
            opacity,
            raw: celType === 2 ? inflateSync(dados) : dados.subarray(0, w * h * 4),
          })
        }
      }

      p += size
    }

    quadros.push(cels)
    off += bytesNoQuadro
  }

  return { width, height, frames, camadas, quadros }
}

/** Compõe um quadro num buffer RGBA de `width × height`. */
export function compose(ase, indice = 0) {
  const { width, height } = ase
  const out = Buffer.alloc(width * height * 4, 0)
  const cels = [...ase.quadros[indice]].sort((a, b) => a.layer - b.layer)

  for (const cel of cels) {
    if (ase.camadas[cel.layer]?.visivel === false) continue

    for (let yy = 0; yy < cel.h; yy++) {
      for (let xx = 0; xx < cel.w; xx++) {
        const X = cel.x + xx
        const Y = cel.y + yy
        if (X < 0 || Y < 0 || X >= width || Y >= height) continue

        const s = (yy * cel.w + xx) * 4
        const af = ((cel.raw[s + 3] * cel.opacity) / 255 / 255)
        if (af === 0) continue

        const t = (Y * width + X) * 4
        const ab = out[t + 3] / 255
        const ao = af + ab * (1 - af)
        for (let k = 0; k < 3; k++) {
          out[t + k] = Math.round((cel.raw[s + k] * af + out[t + k] * ab * (1 - af)) / ao)
        }
        out[t + 3] = Math.round(ao * 255)
      }
    }
  }

  return out
}

// ── Uso pela linha de comando ───────────────────────────────────────────────
const [entrada, saida, quadro = '0'] = process.argv.slice(2)

if (entrada && saida) {
  const ase = readAse(entrada)
  const rgba = compose(ase, Number(quadro))
  const png = await sharp(rgba, {
    raw: { width: ase.width, height: ase.height, channels: 4 },
  })
    .png()
    .toBuffer()
  writeFileSync(saida, png)
  console.log(
    `✓ ${saida} (${ase.width}×${ase.height}, quadro ${quadro} de ${ase.frames})`,
  )
}
