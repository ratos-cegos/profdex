const OUTPUT_MIN_WIDTH = 1080

export function photoSlug(value) {
  return String(value ?? 'professor')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'professor'
}

export function photoFileName(name) {
  return `profdex-${photoSlug(name)}.png`
}

async function loadImage(blob) {
  if ('createImageBitmap' in window) return createImageBitmap(blob)

  const url = URL.createObjectURL(blob)
  try {
    const image = new Image()
    image.decoding = 'async'
    image.src = url
    await image.decode()
    return image
  } finally {
    URL.revokeObjectURL(url)
  }
}

async function loadAssetImage(url) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Não foi possível carregar o asset ${url}.`)
  return loadImage(await response.blob())
}

function canvasBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Não foi possível gerar a foto.'))),
      'image/png',
    )
  })
}

export async function frameArPhoto(sourceBlob, { name, types = [], date = new Date() }) {
  const image = await loadImage(sourceBlob)
  const sourceWidth = image.width || image.naturalWidth
  const sourceHeight = image.height || image.naturalHeight
  if (!sourceWidth || !sourceHeight) throw new Error('A imagem capturada está vazia.')

  const scale = Math.max(1, OUTPUT_MIN_WIDTH / sourceWidth)
  const width = Math.max(OUTPUT_MIN_WIDTH, Math.round(sourceWidth * scale))
  const height = Math.round(sourceHeight * scale)
  const unit = width / OUTPUT_MIN_WIDTH
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Este navegador não permite montar a foto.')
  ctx.drawImage(image, 0, 0, width, height)
  image.close?.()

  const topHeight = 132 * unit
  const bottomHeight = 238 * unit
  const inset = 38 * unit
  ctx.fillStyle = 'rgba(8, 9, 12, 0.82)'
  ctx.fillRect(0, 0, width, topHeight)
  ctx.fillRect(0, height - bottomHeight, width, bottomHeight)

  ctx.strokeStyle = '#f5a623'
  ctx.lineWidth = 16 * unit
  ctx.strokeRect(8 * unit, 8 * unit, width - 16 * unit, height - 16 * unit)
  ctx.strokeStyle = '#ffd166'
  ctx.lineWidth = 4 * unit
  ctx.strokeRect(24 * unit, 24 * unit, width - 48 * unit, height - 48 * unit)

  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#ffffff'
  ctx.font = `700 ${46 * unit}px "Press Start 2P", monospace`
  ctx.fillText('PROFDEX', inset, topHeight / 2)
  ctx.textAlign = 'right'
  const brand = await loadAssetImage('/marca/logotipo-branco.png').catch(() => null)
  if (brand) {
    const brandWidth = 270 * unit
    const brandHeight = brandWidth / ((brand.width || brand.naturalWidth) / (brand.height || brand.naturalHeight))
    ctx.drawImage(brand, width - inset - brandWidth, (topHeight - brandHeight) / 2, brandWidth, brandHeight)
    brand.close?.()
  } else {
    ctx.fillStyle = '#ffd166'
    ctx.font = `700 ${34 * unit}px Arial, sans-serif`
    ctx.fillText('UNIFIL', width - inset, topHeight / 2)
  }

  ctx.textAlign = 'left'
  ctx.fillStyle = '#ffffff'
  ctx.font = `700 ${42 * unit}px "Press Start 2P", monospace`
  ctx.fillText(`Prof. ${name}`, inset, height - 155 * unit)

  const typeText = types.filter(Boolean).join(' · ') || 'ProfDex'
  ctx.fillStyle = '#ffd166'
  ctx.font = `600 ${31 * unit}px Arial, sans-serif`
  ctx.fillText(typeText, inset, height - 92 * unit)

  ctx.textAlign = 'right'
  ctx.fillStyle = '#d8d8dc'
  ctx.font = `500 ${25 * unit}px Arial, sans-serif`
  ctx.fillText(
    new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(date),
    width - inset,
    height - 92 * unit,
  )

  return canvasBlob(canvas)
}

export function downloadPhoto(blob, name) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = photoFileName(name)
  anchor.hidden = true
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export async function deliverArPhoto(blob, { name, forceDownload = false }) {
  const file = new File([blob], photoFileName(name), { type: 'image/png' })

  if (!forceDownload && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        title: 'ProfDex',
        text: `Capturei o Prof. ${name} no ProfDex!`,
      })
      return 'shared'
    } catch (error) {
      if (error?.name === 'AbortError') return 'cancelled'
    }
  }

  downloadPhoto(blob, name)
  return 'downloaded'
}
