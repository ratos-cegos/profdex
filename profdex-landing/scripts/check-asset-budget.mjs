/**
 * Orçamento de assets. Roda no `prebuild` e QUEBRA o build quando estourado.
 *
 *   npm run check:assets
 *
 * Existe porque o combinado verbal de "não põe .glb pesado na página" já existia
 * no projeto e não segurou — o incidente da arena (dois `<model-viewer>` de 27 e
 * 74 MB no Safari do iOS, aba descartada no meio da batalha) aconteceu com a
 * regra escrita e todo mundo de acordo. Um limite que o build não verifica é uma
 * intenção, não um limite.
 *
 * ── Uma regra mudou, e vale registrar por quê ────────────────────────────────
 *
 * A versão anterior proibia MAIS DE UM `.glb` em public/. Era a leitura correta
 * do incidente com os números daquela época: com arquivos de 27–74 MB, "quantos
 * arquivos existem" era uma proxy honesta para "quanta memória isto pode pedir".
 *
 * Depois do `optimize-model.mjs` os três somam 2,24 MB e ~13 MB de textura na
 * GPU cada. A contagem de arquivos deixou de medir o risco, e continuar com ela
 * custaria a coisa que o briefing pede na seção 3D — o aluno ver O professor
 * dele, não um professor sorteado.
 *
 * O que impedia o incidente nunca foi a contagem de arquivos: é UM PALCO POR
 * PÁGINA, e isso mora em `useLazyModel.js` (trava no escopo do módulo, `release`
 * ao trocar de professor, `release` ao sair da tela). O que este script cobre é
 * o tamanho — por arquivo E somado, porque três modelos de 1,6 MB passariam num
 * teto só por arquivo e ainda assim seriam demais.
 */
import { readdir, readFile, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'

import { CAPTURABLE } from '../src/data/professors.js'
import { MODEL_SIZES_MB } from '../src/config/model-sizes.js'

const root = path.resolve(import.meta.dirname, '..')
const pub = path.join(root, 'public')

/** Teto por modelo. O Gustavo (1,53 MB) é o maior; a folga é para o próximo. */
const MAX_MODEL_MB = 2

/** Teto SOMADO dos modelos: o que a página inteira pode oferecer de 3D. */
const MAX_MODELS_TOTAL_MB = 5

/** Teto por imagem. Acima disto alguém esqueceu de passar pelo optimize-assets. */
const MAX_IMAGE_KB = 350

/** Quanto o tamanho anunciado pode divergir do arquivo real, em MB. */
const SIZE_TOLERANCE_MB = 0.01

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif'])

const erros = []
const mb = (bytes) => bytes / 1048576
const kb = (bytes) => bytes / 1024

/** Todos os arquivos de public/, recursivamente, como caminhos relativos. */
async function walk(dir, base = dir) {
  const saida = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) saida.push(...(await walk(full, base)))
    else saida.push(path.relative(base, full).replaceAll('\\', '/'))
  }
  return saida
}

const arquivos = await walk(pub)

// ── Modelos: tamanho por arquivo e somado ───────────────────────────────────
const modelos = arquivos.filter((f) => f.endsWith('.glb'))
let totalModelos = 0

for (const rel of modelos) {
  const bytes = (await stat(path.join(pub, rel))).size
  totalModelos += bytes
  if (mb(bytes) > MAX_MODEL_MB) {
    erros.push(`${rel} tem ${mb(bytes).toFixed(2)} MB — o teto por modelo é ${MAX_MODEL_MB} MB.`)
  }
}

if (mb(totalModelos) > MAX_MODELS_TOTAL_MB) {
  erros.push(
    `Os ${modelos.length} modelos somam ${mb(totalModelos).toFixed(2)} MB — o teto somado é ${MAX_MODELS_TOTAL_MB} MB.`,
  )
}

// ── Imagens ─────────────────────────────────────────────────────────────────
for (const rel of arquivos.filter((f) => IMAGE_EXT.has(path.extname(f).toLowerCase()))) {
  const bytes = (await stat(path.join(pub, rel))).size
  if (kb(bytes) > MAX_IMAGE_KB) {
    erros.push(`${rel} tem ${kb(bytes).toFixed(0)} kB — o teto por imagem é ${MAX_IMAGE_KB} kB.`)
  }
}

// ── O tamanho anunciado bate com o disco? ───────────────────────────────────
// A seção 3D mostra este número ANTES de baixar qualquer byte. Um aviso de
// tamanho que mente é pior que nenhum aviso — é por isso que ele é gerado por
// medição, e é por isso que o build confere a medição.
for (const [slug, anunciado] of Object.entries(MODEL_SIZES_MB)) {
  const rel = `models/${slug}-hero.glb`
  if (!existsSync(path.join(pub, rel))) {
    erros.push(`model-sizes.js anuncia "${slug}" mas public/${rel} não existe. Rode npm run model:optimize.`)
    continue
  }
  const real = mb((await stat(path.join(pub, rel))).size)
  if (Math.abs(real - anunciado) > SIZE_TOLERANCE_MB) {
    erros.push(
      `public/${rel} tem ${real.toFixed(2)} MB, mas model-sizes.js anuncia ${anunciado} MB.` +
        ' Rode npm run model:optimize.',
    )
  }
}

// ── Tudo que os dados referenciam existe mesmo? ─────────────────────────────
// Um card de Pokédex com imagem quebrada é pior que um card ausente, e um 404 de
// .glb some dentro do loader: o palco fica carregando para sempre, sem erro.
for (const prof of CAPTURABLE) {
  for (const campo of ['sprite', 'spriteBack', 'spriteFace', 'image', 'fallback', 'model']) {
    const url = prof[campo]
    if (!url) continue
    if (!existsSync(path.join(pub, url.replace(/^\//, '')))) {
      erros.push(`professors.js → ${prof.slug}.${campo} aponta para ${url}, que não existe em public/.`)
    }
  }
}

// ── O decodificador Draco casa com o `three` instalado? ─────────────────────
// Versão descasada não quebra o build: quebra o carregamento no navegador do
// aluno, que é onde ninguém vai olhar.
const dracoLocal = path.join(pub, 'draco', 'draco_decoder.js')
const dracoThree = path.join(root, 'node_modules', 'three', 'examples', 'jsm', 'libs', 'draco', 'gltf', 'draco_decoder.js')
if (existsSync(dracoLocal) && existsSync(dracoThree)) {
  const [a, b] = await Promise.all([readFile(dracoLocal), readFile(dracoThree)])
  if (!a.equals(b)) {
    erros.push(
      'public/draco/ está diferente do decodificador do three instalado.' +
        ' Recopie de node_modules/three/examples/jsm/libs/draco/gltf/.',
    )
  }
}

// ── Resultado ───────────────────────────────────────────────────────────────
if (erros.length > 0) {
  console.error('\n✗ Orçamento de assets estourado:\n')
  for (const e of erros) console.error(`  · ${e}`)
  console.error('')
  process.exit(1)
}

console.log(
  `✓ Assets dentro do orçamento: ${modelos.length} modelo(s), ${mb(totalModelos).toFixed(2)} MB somados.`,
)
