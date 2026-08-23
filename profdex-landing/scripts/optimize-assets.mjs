/**
 * Gera `public/professors/*` a partir da arte de origem.
 *
 *   node scripts/optimize-assets.mjs
 *   PROFDEX_FRONT=D:\profdex\main\profdex-front node scripts/optimize-assets.mjs
 *
 * Duas fontes, porque a arte vive em dois lugares:
 *
 *  · Os **cartoons** vêm do app (`profdex-front/public/professors/*-cartoon.png`).
 *    São o retrato de ficha: card quadrado, moldura de QR, fundo. Viram
 *    `-cartoon.webp` (o que quase todo mundo baixa) e `-cartoon.png` (o fallback
 *    do `<picture>`). O original é JPEG apesar da extensão `.png` — o nome foi
 *    mantido igual ao do app de propósito, para os dois repositórios seguirem
 *    comparáveis.
 *
 *  · Os **sprites** vêm de `assets-src/sprites/`, versionados aqui. São os
 *    bonecos de corpo inteiro, de frente e de costas, que a batalha usa. Viram
 *    `-pixel.png` e `-pixel-costas.png`.
 *
 * ── Sobre os sprites, que é a parte que merece explicação ────────────────────
 *
 * A arte real é 64×64 — é o que dizem os `.ase` do Aseprite
 * (`sprite-gustavo-frente-parado.ase`: 13 quadros, 64×64) e é o tamanho do
 * `gustavo-pixel.png` que o app exporta.
 *
 * Só que cinco dos seis arquivos de origem NÃO estão nesse tamanho: são capturas
 * de tela em 3× passadas por um removedor de fundo. Dá para medir — o boneco do
 * Eron ocupa 106×192 px, exatamente 3× os 35×64 do Gustavo. Publicá-los como
 * estão colocaria lado a lado um sprite com pixel de 1 px e outro com pixel de
 * 3 px; não lê como dois sprites, lê como um sprite e uma foto.
 *
 * Então cada sprite volta à grade nativa (altura 64) e tem o **alfa binarizado**:
 * o removedor de fundo deixa ~9% dos pixels numa borda macia semitransparente, e
 * pixel art não tem meio-termo — ou o pixel é do boneco, ou é do fundo.
 *
 * Quem já está na grade certa (o Gustavo de frente, exportado do Aseprite) passa
 * intacto: `nativeGrid()` mede antes de reamostrar. Trocar qualquer arquivo de
 * `assets-src/sprites/` por um export 64×64 de verdade desliga o reescalonamento
 * sozinho, sem mudar uma linha aqui.
 */
import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

import { CAPTURABLE } from '../src/data/professors.js'
import { resolveAppRoot } from './app-source.mjs'

const root = path.resolve(import.meta.dirname, '..')
const pub = path.join(root, 'public')
const spriteSrc = path.join(root, 'assets-src', 'sprites')

/** Lado do sprite publicado. O tamanho de autoria da arte, não uma escolha nossa. */
const SPRITE_SIDE = 64

/**
 * Acima deste alfa o pixel é do boneco; abaixo, é fundo.
 *
 * 110 e não 128 porque a borda macia do removedor de fundo é assimétrica: ela
 * come o contorno escuro do sprite antes de comer o fundo. Um corte no meio
 * emagrecia o boneco em um pixel de contorno; 110 devolve o contorno inteiro sem
 * trazer halo junto.
 */
const ALPHA_CUT = 110

/** Lado do retrato publicado. Os originais variam de 460 a 488 px. */
const PORTRAIT_SIDE = 460

/** Cores da paleta indexada do PNG — o fallback do `<picture>`. */
const PNG_COLORS = 128

/**
 * Qualidade do WebP.
 *
 * O número tem que ser BAIXO o bastante para o WebP ganhar do PNG indexado, e
 * isso não é automático: o `<picture>` prefere o WebP, então um WebP maior que o
 * fallback faz a página servir o arquivo pior para quase todo mundo. Medido nos
 * três cartoons (kB):
 *
 *   | q  | Mário | Eron | Gustavo |
 *   |----|-------|------|---------|
 *   | 60 |  18,6 | 16,8 |    17,4 |
 *   | 68 |  20,2 | 18,0 |    18,9 |
 *   | 82 |  27,8 | 25,5 |    25,7 |
 *   | PNG|  23,8 | 23,4 |    18,2 |
 *
 * 82 (o valor anterior) perdia para o PNG nos três. 60 ganha nos três, e o custo
 * visual é invisível nesta arte: cartoon é cor chapada com contorno duro, que é
 * exatamente o que o WebP com perda preserva bem.
 */
const WEBP_QUALITY = 60

const kb = (bytes) => (bytes / 1024).toFixed(1)

async function write(rel, buffer) {
  const dest = path.join(pub, rel)
  await mkdir(path.dirname(dest), { recursive: true })
  await writeFile(dest, buffer)
  console.log(`✓ public/${rel} (${kb(buffer.byteLength)} kB)`)
}

/** Caixa do desenho dentro do arquivo, ignorando a margem transparente. */
async function alphaBox(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true })

  let minX = info.width
  let minY = info.height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      // 40 e não 0: o halo do removedor de fundo tem alfa baixo mas não zero, e
      // contá-lo devolveria o arquivo inteiro como "caixa do desenho".
      if (data[(y * info.width + x) * 4 + 3] <= 40) continue
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }

  if (maxX < 0) return null
  return { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 }
}

/**
 * Devolve o sprite à grade nativa, num canvas de `SPRITE_SIDE`.
 *
 * O boneco é alinhado EMBAIXO e centralizado na horizontal, que é como o
 * `gustavo-pixel.png` do Aseprite já vem — assim os três pisam na mesma linha
 * quando ficam lado a lado numa arena.
 */
async function normalizeSprite(file) {
  const box = await alphaBox(file)
  if (!box) throw new Error(`${path.basename(file)} está inteiro transparente.`)

  // Já está na grade de autoria: não reamostra. Reamostrar pixel art correta é
  // sempre perda, nunca ganho.
  const jaNativo = box.height <= SPRITE_SIDE

  const alturaAlvo = Math.min(box.height, SPRITE_SIDE)
  const larguraAlvo = Math.max(1, Math.round((box.width * alturaAlvo) / box.height))

  const recorte = sharp(file).extract(box)
  const escalado = jaNativo
    ? recorte
    : recorte.resize(larguraAlvo, alturaAlvo, { kernel: 'lanczos3' })

  const { data, info } = await escalado.ensureAlpha().raw().toBuffer({ resolveWithObject: true })

  // Alfa binário: pixel art não tem borda macia. Sem isto o `pixelated` do CSS
  // amplia o halo do removedor de fundo junto com o desenho, e o boneco fica com
  // uma auréola de 3 px na tela.
  for (let i = 3; i < data.length; i += 4) data[i] = data[i] >= ALPHA_CUT ? 255 : 0

  const desenho = await sharp(data, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .png()
    .toBuffer()

  return sharp({
    create: {
      width: SPRITE_SIDE,
      height: SPRITE_SIDE,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      {
        input: desenho,
        left: Math.round((SPRITE_SIDE - info.width) / 2),
        top: SPRITE_SIDE - info.height,
      },
    ])
    .png({ palette: true, colors: 64 })
    .toBuffer()
}

/**
 * Recorte do ROSTO a partir do sprite de frente.
 *
 * É o retrato que a seção 3D mostra antes de carregar o modelo. Antes ali ficava
 * o cartoon; um card emoldurado em QR ao lado de um seletor de bonecos misturava
 * duas linguagens, e o rosto em pixel diz "é este professor" tão bem quanto.
 *
 * `FACE_RATIO` é fração da ALTURA do boneco, não da largura: a cabeça é a mesma
 * fatia vertical em todos os três (0,38 cortava o cabelo do Mário e do Gustavo;
 * 0,50 já pegava ombro demais e deixava de ser um zoom).
 *
 * O `HEADROOM` existe porque o desenho começa em y=0 nesses arquivos — o cabelo
 * encosta na borda de cima e o recorte fica sem ar. Três linhas transparentes
 * resolvem, e como o resultado é PNG com alfa elas somem no fundo da seção.
 */
const FACE_RATIO = 0.46
const HEADROOM = 3

async function faceCrop(spriteFile) {
  const box = await alphaBox(spriteFile)
  if (!box) throw new Error(`${path.basename(spriteFile)} está inteiro transparente.`)

  const lado = Math.round(box.height * FACE_RATIO)
  const centro = Math.round(box.left + box.width / 2)
  const { width: W } = await sharp(spriteFile).metadata()
  const left = Math.max(0, Math.min(W - lado, centro - Math.round(lado / 2)))

  const cabeca = await sharp(spriteFile)
    .extract({ left, top: box.top, width: lado, height: lado })
    .png()
    .toBuffer()

  const canvas = lado + HEADROOM * 2
  return sharp({
    create: {
      width: canvas,
      height: canvas,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: cabeca, left: HEADROOM, top: HEADROOM }])
    .png({ palette: true, colors: 64 })
    .toBuffer()
}

/** Retrato quadrado: o cartoon centralizado, sem esticar. */
function portrait(sourceFile) {
  return sharp(sourceFile).resize(PORTRAIT_SIDE, PORTRAIT_SIDE, {
    fit: 'cover',
    position: 'centre',
    kernel: 'lanczos3',
  })
}

const appRoot = resolveAppRoot()
const srcProfessors = path.join(appRoot, 'public', 'professors')

for (const prof of CAPTURABLE) {
  // ── Retrato de ficha ──────────────────────────────────────────────────────
  const cartoon = path.join(srcProfessors, `${prof.slug}-cartoon.png`)
  if (existsSync(cartoon)) {
    await write(
      `professors/${prof.slug}-cartoon.webp`,
      await portrait(cartoon).webp({ quality: WEBP_QUALITY }).toBuffer(),
    )
    await write(
      `professors/${prof.slug}-cartoon.png`,
      await portrait(cartoon).png({ palette: true, colors: PNG_COLORS }).toBuffer(),
    )
  } else {
    console.warn(`· ${prof.slug}: não achei ${cartoon}`)
  }

  // ── Bonecos ───────────────────────────────────────────────────────────────
  for (const [lado, saida] of [
    ['frente', `professors/${prof.slug}-pixel.png`],
    ['costas', `professors/${prof.slug}-pixel-costas.png`],
  ]) {
    const origem = path.join(spriteSrc, `${prof.slug}-${lado}.png`)
    if (!existsSync(origem)) {
      console.warn(`· ${prof.slug} (${lado}): não achei assets-src/sprites/${prof.slug}-${lado}.png`)
      continue
    }
    await write(saida, await normalizeSprite(origem))
  }

  // O rosto sai do sprite JÁ NORMALIZADO, não da origem: recortar antes de
  // acertar a grade daria um rosto na escala errada, que é o problema que a
  // normalização existe para resolver.
  const frente = path.join(pub, 'professors', `${prof.slug}-pixel.png`)
  if (existsSync(frente)) {
    await write(`professors/${prof.slug}-pixel-face.png`, await faceCrop(frente))
  }
}

// A águia é arte real e versionada aqui; o favicon e o Open Graph saem dela para
// a aba do navegador e o card do WhatsApp serem a mesma marca da página.
if (!existsSync(path.join(pub, 'eagle-ball.png'))) {
  throw new Error('public/eagle-ball.png não encontrado — é arte real e precisa estar versionada.')
}
