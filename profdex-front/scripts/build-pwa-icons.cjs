/**
 * Gera os ícones de INSTALAÇÃO do PWA a partir de `public/eagle-ball.png`.
 *
 * Diferente de `build-icons.cjs`, que prepara os ícones da barra de navegação:
 * aqueles preservam a proporção da arte e são dimensionados pela altura; estes
 * precisam ser QUADRADOS, porque é isso que o manifest e o iOS exigem.
 *
 * Três formatos, por razões diferentes:
 *
 *  - **any (192 e 512)** — o ícone normal, com fundo transparente e a arte
 *    quase encostando na borda.
 *  - **maskable (512)** — o Android recorta o ícone na forma do launcher
 *    (círculo, squircle, gota). A arte fica dentro da safe zone central, com
 *    20% de margem de cada lado, senão a asa da águia é cortada em metade dos
 *    aparelhos. Fundo sólido porque o recorte revelaria o vazio.
 *  - **apple-touch-icon (180)** — o iOS **ignora os ícones do manifest** e não
 *    respeita transparência: sem fundo sólido, o atalho sai com um retângulo
 *    preto atrás da arte.
 *
 * Nearest-neighbor em todas as etapas (herdado de `build-icons.cjs`): a arte é
 * pixel art e qualquer interpolação suave borra a borda dura.
 *
 * Uso:
 *   node scripts/build-pwa-icons.cjs
 */
const fs = require('node:fs')
const path = require('node:path')
const { decodificar, codificar, recortar_bbox, reduzir } = require('./build-icons.cjs')

const RAIZ_FRONT = path.resolve(__dirname, '..')
const ORIGEM = path.join(RAIZ_FRONT, 'public/eagle-ball.png')
const DESTINO = path.join(RAIZ_FRONT, 'public/icons')

// `--bg-deep` de src/style.css — o mesmo fundo do app.
const FUNDO = [0x12, 0x14, 0x18, 0xff]
const TRANSPARENTE = [0, 0, 0, 0]

const SAIDAS = [
  { arquivo: 'pwa-192.png', lado: 192, margem: 0.04, fundo: TRANSPARENTE },
  { arquivo: 'pwa-512.png', lado: 512, margem: 0.04, fundo: TRANSPARENTE },
  { arquivo: 'pwa-maskable-512.png', lado: 512, margem: 0.2, fundo: FUNDO },
  { arquivo: 'apple-touch-icon.png', lado: 180, margem: 0.08, fundo: FUNDO },
]

/** Centraliza a arte num quadrado de `lado`, deixando `margem` (fração) de folga. */
function compor(arte, lado, margem, fundo) {
  const util = Math.round(lado * (1 - 2 * margem))
  const escala = Math.min(util / arte.largura, util / arte.altura)
  // `reduzir` preserva a proporção a partir da altura alvo, então basta
  // converter a escala em altura — e ele também serve para ampliar.
  const escalada = reduzir(arte, Math.max(1, Math.round(arte.altura * escala)))

  const pixels = new Uint8Array(lado * lado * 4)
  for (let i = 0; i < lado * lado; i++) {
    pixels.set(fundo, i * 4)
  }

  const offsetX = Math.floor((lado - escalada.largura) / 2)
  const offsetY = Math.floor((lado - escalada.altura) / 2)

  for (let y = 0; y < escalada.altura; y++) {
    for (let x = 0; x < escalada.largura; x++) {
      const o = (y * escalada.largura + x) * 4
      const alfa = escalada.pixels[o + 3]
      if (!alfa) continue

      const d = ((y + offsetY) * lado + (x + offsetX)) * 4
      if (alfa === 255) {
        pixels.set(escalada.pixels.subarray(o, o + 4), d)
        continue
      }
      // Borda semitransparente do pixel art: mistura com o fundo em vez de
      // sobrescrever, senão sobra um contorno duro no ícone maskable.
      const a = alfa / 255
      for (let c = 0; c < 3; c++) {
        pixels[d + c] = Math.round(escalada.pixels[o + c] * a + pixels[d + c] * (1 - a))
      }
      pixels[d + 3] = Math.max(pixels[d + 3], alfa)
    }
  }

  return { largura: lado, altura: lado, pixels }
}

fs.mkdirSync(DESTINO, { recursive: true })

const arte = recortar_bbox(decodificar(fs.readFileSync(ORIGEM)))
console.log(`eagle-ball.png → conteúdo ${arte.largura}x${arte.altura}`)

for (const saida of SAIDAS) {
  const quadrado = compor(arte, saida.lado, saida.margem, saida.fundo)
  const png = codificar(quadrado.largura, quadrado.altura, quadrado.pixels)
  fs.writeFileSync(path.join(DESTINO, saida.arquivo), png)

  console.log(
    `${saida.arquivo.padEnd(24)} ${saida.lado}x${saida.lado}` +
      ` (margem ${Math.round(saida.margem * 100)}%, ${(png.length / 1024).toFixed(1)}KB)`,
  )
}
