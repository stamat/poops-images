import sharp from 'sharp'

const FORMAT_MAP = {
  jpg: 'jpeg',
  jpeg: 'jpeg',
  png: 'png',
  webp: 'webp',
  avif: 'avif',
  gif: 'gif',
  tiff: 'tiff',
  tif: 'tiff',
  heic: 'heif',
  heif: 'heif'
}

const EXT_MAP = {
  jpeg: 'jpg',
  jpg: 'jpg',
  png: 'png',
  webp: 'webp',
  avif: 'avif',
  gif: 'gif',
  tiff: 'tiff',
  tif: 'tif',
  heic: 'heic',
  heif: 'heif'
}

export function toSharpFormat(ext) {
  return FORMAT_MAP[ext.toLowerCase()] || ext.toLowerCase()
}

export function toFileExt(format) {
  return EXT_MAP[format.toLowerCase()] || format.toLowerCase()
}

export function getQuality(format, qualityConfig) {
  const ext = toFileExt(format)
  return qualityConfig[ext] || qualityConfig[format] || 80
}

export async function hasTransparency(sharpInstance) {
  const { channels, hasAlpha } = await sharpInstance.metadata()
  if (!hasAlpha || channels < 4) return false

  const { channels: channelStats } = await sharpInstance.stats()
  // Alpha is the last channel — if its min is 255, every pixel is fully opaque
  const alphaStats = channelStats[channels - 1]
  return alphaStats.min < 255
}

export async function convertFormat(sharpInstance, targetFormat, qualityConfig) {
  const fmt = toSharpFormat(targetFormat)
  const quality = getQuality(targetFormat, qualityConfig)

  const opts = { quality }
  if (fmt === 'png') {
    opts.compressionLevel = Math.round((100 - quality) / 100 * 9)
    delete opts.quality
  }

  const buffer = await sharpInstance.clone().toFormat(fmt, opts).toBuffer()
  return buffer
}

export async function resolveTargetFormats(outputExt, transparent, rawData, formatConfig, qualityConfig) {
  const preEncoded = new Map()

  // Default: just the normalized base format
  if (formatConfig === false) return { formats: [outputExt], preEncoded }

  // Expand format config to array
  const fmts = typeof formatConfig === 'string' ? [formatConfig] : [...formatConfig]

  // Resolve 'smart' entries
  const hasSmart = fmts.includes('smart')
  const result = fmts.filter(f => f !== 'smart')

  if (hasSmart) {
    if (transparent) {
      result.push('webp')
    } else {
      // Compare jpg vs webp, pick smaller — keep the winner buffer to avoid re-encoding
      const [jpgBuf, webpBuf] = await Promise.all([
        sharp(rawData)
          .toFormat('jpeg', { quality: getQuality('jpg', qualityConfig) })
          .toBuffer(),
        sharp(rawData)
          .toFormat('webp', { quality: getQuality('webp', qualityConfig) })
          .toBuffer()
      ])
      if (webpBuf.length < jpgBuf.length) {
        result.push('webp')
        preEncoded.set('webp', webpBuf)
      } else {
        result.push('jpg')
        preEncoded.set('jpg', jpgBuf)
      }
    }
  }

  // Normalize jpeg → jpg and dedupe
  return {
    formats: [...new Set(result.map(f => f === 'jpeg' ? 'jpg' : f))],
    preEncoded
  }
}
