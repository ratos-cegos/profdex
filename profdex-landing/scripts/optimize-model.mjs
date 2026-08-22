/**
 * Gera os `.glb` de public/models a partir dos modelos do app.
 *
 *   node scripts/optimize-model.mjs            # todos
 *   node scripts/optimize-model.mjs mario      # só um
 *   PROFDEX_FRONT=D:\profdex\main\profdex-front node scripts/optimize-model.mjs
 *
 * ── Por que este script existe ───────────────────────────────────────────────
 *
 * Os originais em `profdex-front/public/models` pesam 27 MB (Mário), 27 MB
 * (Eron) e 74 MB (Gustavo), e o problema NÃO é o disco: é a GPU. O `inspect`
 * dos três mostra a mesma assinatura — três texturas 4096×4096 por professor:
 *
 *   baseColor 4096²          → ~89 MB descompactada na GPU
 *   normal 4096²             → ~89 MB
 *   metallicRoughness 4096²  → ~89 MB
 *
 * São ~268 MB de textura para UM professor. Dois combatentes na arena passavam
 * de meio giga e o Safari do iOS descartava a aba no meio da batalha
 * (docs/BUG-BATALHA-TRAVANDO.md no repo principal). A geometria era detalhe:
 * 32 mil vértices ocupam 1,3 MB.
 *
 * A exceção que o briefing abre para a landing é "um modelo, sob interação
 * explícita, e otimizado antes". Este script é a parte "otimizado antes".
 *
 * ── O que ele faz, e por que nesta ordem ─────────────────────────────────────
 *
 * 1. TEXTURAS, com sharp e não com o `textureCompress` do gltf-transform: nestas
 *    imagens específicas o passo pronto quebra com `colourspace: parameter space
 *    not set`. Reduz para 1024 (baseColor), 1024 (normal) e 512
 *    (metallicRoughness) e converte para JPEG. O corte assimétrico é
 *    proposital: metallicRoughness carrega dois canais de material que ninguém
 *    olha de perto num visualizador que gira a 40 px/s.
 *
 * 2. GEOMETRIA. `weld` funde vértices duplicados — sem isso o `simplify` não
 *    tem o que colapsar. O Gustavo tem 854 mil vértices (26× os outros dois,
 *    provavelmente um scan sem retopologia) e só ele passa pelo `simplify`; nos
 *    demais o custo já é irrelevante e simplificar só tiraria silhueta de graça.
 *
 * 3. DRACO por último, porque comprime o que sobrou — rodar antes do simplify
 *    seria comprimir vértices que vão ser jogados fora.
 *
 * O decodificador Draco que o navegador usa está em `public/draco/`, copiado do
 * `three` instalado. Se atualizar o `three`, recopie de
 * `node_modules/three/examples/jsm/libs/draco/gltf/` — versões descasadas
 * quebram o carregamento em runtime, não no build.
 */
import { existsSync } from 'node:fs'
import { mkdir, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { dedup, draco, prune, resample, simplify, weld } from '@gltf-transform/functions'
import draco3d from 'draco3dgltf'
import { MeshoptSimplifier } from 'meshoptimizer'
import sharp from 'sharp'

import { CAPTURABLE } from '../src/data/professors.js'
import { resolveAppRoot } from './app-source.mjs'

const root = path.resolve(import.meta.dirname, '..')
const outDir = path.join(root, 'public', 'models')

/**
 * Tamanho máximo por tipo de textura, em pixels.
 *
 * A memória de GPU cai com o QUADRADO do lado: 4096→1024 é 16× menos, e é daí
 * que vêm os ~268 MB → ~13 MB por modelo. O JPEG no disco é consequência, não o
 * objetivo.
 */
const TEXTURE_BUDGET = {
  baseColorTexture: 1024,
  normalTexture: 1024,
  metallicRoughnessTexture: 512,
  emissiveTexture: 512,
  occlusionTexture: 512,
  default: 512,
}

/** Acima disto o modelo passa pelo simplify. Abaixo, não vale a perda de forma. */
const SIMPLIFY_THRESHOLD = 100_000

/**
 * Fração de triângulos preservada quando o simplify roda.
 *
 * Medido: o Gustavo para em 268.360 vértices (31%), não nos 25% pedidos, e
 * afrouxar o `error` de 0,001 para 0,01 não move o número em um vértice. O
 * limite não é o erro geométrico — é topológico: o meshopt trava vértices de
 * borda e de descontinuidade de UV, e um scan sem retopologia é feito de
 * costura. Mexer nestes dois números não vai adiante; quem quiser o Gustavo
 * mais leve precisa de retopologia no modelo de origem.
 */
const SIMPLIFY_RATIO = 0.25

/** Erro máximo aceito pelo simplify, como fração do raio do modelo. */
const SIMPLIFY_ERROR = 0.001

const mb = (bytes) => (bytes / 1048576).toFixed(2)

/** Onde o tamanho medido de cada modelo é publicado para o app Vue. */
const manifestPath = path.join(root, 'src', 'config', 'model-sizes.js')

/** Escreve o manifesto de tamanhos que a seção 3D lê. */
async function writeManifest(entries) {
  const linhas = entries
    .sort((a, b) => a.slug.localeCompare(b.slug))
    .map((e) => `  '${e.slug}': ${(e.bytes / 1048576).toFixed(2)},`)
    .join('\n')

  const conteudo = `// GERADO POR scripts/optimize-model.mjs — não edite à mão.
//
// Tamanho de cada .glb de public/models, em MB, MEDIDO no arquivo publicado. A
// seção 3D mostra este número antes de baixar qualquer byte, e o
// scripts/check-asset-budget.mjs quebra o build se ele divergir do disco.
//
// Para atualizar: npm run model:optimize

export const MODEL_SIZES_MB = {
${linhas}
}
`
  await mkdir(path.dirname(manifestPath), { recursive: true })
  await writeFile(manifestPath, conteudo)
  console.log(`✓ src/config/model-sizes.js`)
}

/** Em qual slot do material esta textura está ligada — decide o orçamento. */
function slotOf(document, texture) {
  for (const material of document.getRoot().listMaterials()) {
    for (const slot of Object.keys(TEXTURE_BUDGET)) {
      const getter = `get${slot[0].toUpperCase()}${slot.slice(1)}`
      if (material[getter]?.() === texture) return slot
    }
  }
  return 'default'
}

/**
 * Reduz e recomprime as texturas do documento no lugar.
 *
 * O `sharp` recebe o buffer cru do glTF e devolve outro buffer — o grafo do
 * documento não muda, só o payload de cada imagem.
 */
async function shrinkTextures(document) {
  let before = 0
  let after = 0

  for (const texture of document.getRoot().listTextures()) {
    const image = texture.getImage()
    if (!image) continue

    const limit = TEXTURE_BUDGET[slotOf(document, texture)] ?? TEXTURE_BUDGET.default
    before += image.byteLength

    const resized = await sharp(Buffer.from(image))
      // `withoutEnlargement` porque uma textura que já seja menor que o teto não
      // ganha nada sendo esticada — só perderia nitidez e ganharia bytes.
      .resize(limit, limit, { fit: 'inside', withoutEnlargement: true, kernel: 'lanczos3' })
      .jpeg({ quality: 82, chromaSubsampling: '4:4:4', mozjpeg: true })
      .toBuffer()

    texture.setImage(new Uint8Array(resized)).setMimeType('image/jpeg')
    const uri = texture.getURI()
    if (uri) texture.setURI(uri.replace(/\.\w+$/, '.jpg'))

    after += resized.byteLength
  }

  return { before, after }
}

async function optimize(slug, sourcePath) {
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({
      'draco3d.decoder': await draco3d.createDecoderModule(),
      'draco3d.encoder': await draco3d.createEncoderModule(),
    })

  const document = await io.read(sourcePath)
  const vertices = document
    .getRoot()
    .listMeshes()
    .flatMap((mesh) => mesh.listPrimitives())
    .reduce((sum, prim) => sum + (prim.getAttribute('POSITION')?.getCount() ?? 0), 0)

  const tex = await shrinkTextures(document)

  const passes = [resample(), dedup(), prune(), weld()]

  // O simplify precisa do WASM do meshoptimizer pronto — daí o `ready`.
  if (vertices > SIMPLIFY_THRESHOLD) {
    await MeshoptSimplifier.ready
    passes.push(
      simplify({ simplifier: MeshoptSimplifier, ratio: SIMPLIFY_RATIO, error: SIMPLIFY_ERROR }),
    )
  }

  passes.push(draco())
  await document.transform(...passes)

  const glb = await io.writeBinary(document)
  await mkdir(outDir, { recursive: true })
  const dest = path.join(outDir, `${slug}-hero.glb`)
  await writeFile(dest, glb)

  const sourceSize = (await stat(sourcePath)).size
  const finalVertices = document
    .getRoot()
    .listMeshes()
    .flatMap((mesh) => mesh.listPrimitives())
    .reduce((sum, prim) => sum + (prim.getAttribute('POSITION')?.getCount() ?? 0), 0)

  console.log(
    `✓ ${slug}: ${mb(sourceSize)} MB → ${mb(glb.byteLength)} MB` +
      ` · texturas ${mb(tex.before)} → ${mb(tex.after)} MB` +
      ` · vértices ${vertices.toLocaleString('pt-BR')} → ${finalVertices.toLocaleString('pt-BR')}`,
  )

  return { slug, bytes: glb.byteLength }
}

// A lista de quem tem modelo sai do `professors.js` — um professor novo com arte
// é uma linha lá, e este script passa a processá-lo sem ser tocado.
const appRoot = resolveAppRoot()
const only = process.argv.slice(2)
const alvos = CAPTURABLE.filter((p) => p.model && (only.length === 0 || only.includes(p.slug)))

if (alvos.length === 0) {
  const conhecidos = CAPTURABLE.filter((p) => p.model).map((p) => p.slug)
  throw new Error(`Nenhum modelo casa com "${only.join(', ')}". Conhecidos: ${conhecidos.join(', ')}`)
}

const gerados = []
for (const prof of alvos) {
  // Convenção do app: `public/models/modelo-<slug>.glb`.
  const sourcePath = path.join(appRoot, 'public', 'models', `modelo-${prof.slug}.glb`)
  if (!existsSync(sourcePath)) {
    console.warn(`· pulado ${prof.slug}: não achei ${sourcePath}`)
    continue
  }
  const { bytes } = await optimize(prof.slug, sourcePath)
  gerados.push({ slug: prof.slug, bytes })
}

const total = gerados.reduce((sum, g) => sum + g.bytes, 0)
console.log(`\nTotal em public/models: ${mb(total)} MB`)

// O tamanho anunciado ao usuário ANTES do download sai daqui, medido, e nunca
// digitado à mão: a página promete "cerca de X MB" e um número que mente é pior
// que nenhum número. Só regrava quando a rodada processou todos — rodar
// `optimize-model.mjs mario` sozinho não pode apagar o tamanho dos outros dois.
if (only.length === 0) {
  await writeManifest(gerados)
} else {
  console.log('· manifesto não regravado (rodada parcial). Rode sem argumentos para atualizar.')
}
