/**
 * Gera os assets de public/ que NÃO estão versionados neste repositório
 * (as artes reais vêm do profdex-front, ver README §"O que veio de onde").
 *
 * O objetivo é só um: `npm run dev` abrir a página inteira, sem imagem
 * quebrada, em uma máquina que não tem o app original ao lado. Ao trocar por
 * arte de verdade, apague o arquivo e copie o original por cima.
 *
 *   node scripts/make-placeholder-assets.mjs
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

import { CAPTURABLE } from '../src/data/professors.js'

const root = path.resolve(import.meta.dirname, '..')
const pub = path.join(root, 'public')

const BRAND = { orange: '#995200', gold: '#edaf68', deep: '#121418', surface: '#1a1a1a' }

/** Retrato quadrado com a inicial no centro — o suficiente para ler o card. */
function portraitSvg(label, w = 512, h = 512) {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <rect width="100%" height="100%" fill="${BRAND.surface}"/>
    <rect x="8" y="8" width="${w - 16}" height="${h - 16}" fill="none"
          stroke="${BRAND.orange}" stroke-width="16"/>
    <circle cx="${w / 2}" cy="${h * 0.42}" r="${w * 0.2}" fill="${BRAND.orange}"/>
    <text x="50%" y="${h * 0.47}" text-anchor="middle" font-family="monospace"
          font-size="${w * 0.22}" font-weight="bold" fill="${BRAND.gold}">${label[0].toUpperCase()}</text>
    <text x="50%" y="${h * 0.78}" text-anchor="middle" font-family="monospace"
          font-size="${w * 0.09}" fill="#ffffff">${label}</text>
    <text x="50%" y="${h * 0.88}" text-anchor="middle" font-family="monospace"
          font-size="${w * 0.055}" fill="#a8b8c0">placeholder</text>
  </svg>`)
}

/**
 * A "eagle ball" é ARTE REAL (public/eagle-ball.png, 500×500, paleta indexada,
 * 6,4 kB) — não é placeholder, e nada aqui a sobrescreve. O favicon e a imagem
 * de Open Graph são derivados dela, para os três serem a mesma marca.
 */
const EAGLE_BALL = path.join(pub, 'eagle-ball.png')

function ogBackgroundSvg() {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
    <rect width="100%" height="100%" fill="${BRAND.deep}"/>
    <rect x="24" y="24" width="1152" height="582" fill="none" stroke="${BRAND.orange}" stroke-width="12"/>
    <text x="600" y="420" text-anchor="middle" font-family="monospace" font-size="86"
          font-weight="bold" fill="#ffffff">PROF<tspan fill="${BRAND.gold}">DEX</tspan></text>
    <text x="600" y="490" text-anchor="middle" font-family="monospace" font-size="34"
          fill="#a8b8c0">Colecione seus professores</text>
    <text x="600" y="550" text-anchor="middle" font-family="monospace" font-size="26"
          fill="${BRAND.orange}">Semana Tecnologica UniFil</text>
  </svg>`)
}

/** ICO com payload PNG: cabeçalho de 22 bytes + o PNG inteiro. */
function icoFromPng(png, size = 32) {
  const header = Buffer.alloc(22)
  header.writeUInt16LE(0, 0) // reservado
  header.writeUInt16LE(1, 2) // tipo: ícone
  header.writeUInt16LE(1, 4) // 1 imagem
  header.writeUInt8(size % 256, 6)
  header.writeUInt8(size % 256, 7)
  header.writeUInt8(0, 8) // paleta
  header.writeUInt8(0, 9)
  header.writeUInt16LE(1, 10) // planos
  header.writeUInt16LE(32, 12) // bpp
  header.writeUInt32LE(png.length, 14)
  header.writeUInt32LE(22, 18) // offset dos dados
  return Buffer.concat([header, png])
}

/**
 * GLB mínimo (um cubo laranja) para a seção 3D ter o que carregar.
 * Sem Draco: o GLTFLoader lê glTF puro sem passar pelo decodificador.
 */
function cubeGlb() {
  const positions = new Float32Array([
    -0.5, -0.5, 0.5, 0.5, -0.5, 0.5, 0.5, 0.5, 0.5, -0.5, 0.5, 0.5,
    -0.5, -0.5, -0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, 0.5, -0.5, -0.5,
  ])
  const indices = new Uint16Array([
    0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7, 3, 2, 6, 3, 6, 5,
    0, 4, 7, 0, 7, 1, 1, 7, 6, 1, 6, 2, 0, 3, 5, 0, 5, 4,
  ])
  const posBytes = Buffer.from(positions.buffer)
  const idxBytes = Buffer.from(indices.buffer)
  const idxPad = (4 - (idxBytes.length % 4)) % 4
  const bin = Buffer.concat([posBytes, idxBytes, Buffer.alloc(idxPad)])

  const gltf = {
    asset: { version: '2.0', generator: 'make-placeholder-assets.mjs' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }] }],
    materials: [
      { pbrMetallicRoughness: { baseColorFactor: [0.6, 0.32, 0, 1], metallicFactor: 0.1, roughnessFactor: 0.6 } },
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 8, type: 'VEC3', min: [-0.5, -0.5, -0.5], max: [0.5, 0.5, 0.5] },
      { bufferView: 1, componentType: 5123, count: indices.length, type: 'SCALAR' },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: posBytes.length, target: 34962 },
      { buffer: 0, byteOffset: posBytes.length, byteLength: idxBytes.length, target: 34963 },
    ],
    buffers: [{ byteLength: bin.length }],
  }

  const jsonBytes = Buffer.from(JSON.stringify(gltf), 'utf8')
  const jsonPad = (4 - (jsonBytes.length % 4)) % 4
  const json = Buffer.concat([jsonBytes, Buffer.alloc(jsonPad, 0x20)])

  const total = 12 + 8 + json.length + 8 + bin.length
  const head = Buffer.alloc(12)
  head.write('glTF', 0, 'ascii')
  head.writeUInt32LE(2, 4)
  head.writeUInt32LE(total, 8)

  const jsonHead = Buffer.alloc(8)
  jsonHead.writeUInt32LE(json.length, 0)
  jsonHead.write('JSON', 4, 'ascii')

  const binHead = Buffer.alloc(8)
  binHead.writeUInt32LE(bin.length, 0)
  binHead.write('BIN\0', 4, 'ascii')

  return Buffer.concat([head, jsonHead, json, binHead, bin])
}

/** Nunca sobrescreve arte real que já esteja no lugar. */
async function put(rel, buf) {
  const dest = path.join(pub, rel)
  if (existsSync(dest)) {
    console.log(`· mantido  public/${rel}`)
    return
  }
  await mkdir(path.dirname(dest), { recursive: true })
  await writeFile(dest, buf)
  console.log(`✓ gerado   public/${rel} (${(buf.length / 1024).toFixed(1)} kB)`)
}

// A lista sai do professors.js: um professor novo lá ganha placeholder aqui sem
// ninguém tocar neste arquivo.
for (const prof of CAPTURABLE) {
  const svg = portraitSvg(prof.slug)
  await put(`professors/${prof.slug}-cartoon.png`, await sharp(svg).png().toBuffer())
  await put(`professors/${prof.slug}-cartoon.webp`, await sharp(svg).webp({ quality: 82 }).toBuffer())

  // Os sprites também precisam existir, ou os cards da Pókedex e a arena ficam
  // com imagem quebrada — que é pior que card ausente. 64×64, o mesmo lado da
  // arte real, para o `pixelated` do CSS ampliar a mesma grade.
  //
  // Na prática isto quase nunca roda: os sprites de verdade estão versionados em
  // `assets-src/sprites/`, então `npm run assets:optimize` resolve sem depender
  // do app. Estes ficam como rede para um `public/` apagado sem o `assets-src/`
  // junto.
  for (const lado of ['-pixel', '-pixel-costas', '-pixel-face']) {
    await put(
      `professors/${prof.slug}${lado}.png`,
      await sharp(portraitSvg(prof.slug, 64, 64)).png({ palette: true, colors: 16 }).toBuffer(),
    )
  }
}

// Favicon e OG saem do logo real, não de um desenho paralelo: a aba do
// navegador e o card do WhatsApp precisam ser a mesma águia da página.
if (!existsSync(EAGLE_BALL)) {
  throw new Error('public/eagle-ball.png não encontrado — é arte real e precisa estar versionada.')
}

await put(
  'favicon.ico',
  icoFromPng(await sharp(EAGLE_BALL).resize(32, 32, { kernel: 'lanczos3' }).png().toBuffer(), 32),
)

await put(
  'og-image.png',
  await sharp(await sharp(ogBackgroundSvg()).png().toBuffer())
    .composite([
      {
        input: await sharp(EAGLE_BALL).resize(260, 260, { kernel: 'lanczos3' }).png().toBuffer(),
        top: 60,
        left: 470,
      },
    ])
    .png({ palette: true, colors: 64, dither: 0 })
    .toBuffer(),
)

// Um cubo por professor com modelo: sem isto o seletor 3D oferece botões cujo
// arquivo não existe, e um 404 de .glb SOME dentro do GLTFLoader — o palco fica
// carregando para sempre, sem erro na tela nem no console.
//
// Estes cubos jamais chegam à produção: o `check:assets` compara cada arquivo com
// o tamanho medido em `src/config/model-sizes.js`, e 872 bytes não passam por
// 0,35 MB. O build quebra mandando rodar `npm run model:optimize`, que é
// exatamente a instrução certa.
const cubo = cubeGlb()
for (const prof of CAPTURABLE.filter((p) => p.model)) {
  await put(prof.model.replace(/^\//, ''), cubo)
}
