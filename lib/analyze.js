import path from 'node:path'
import sharp from 'sharp'
import exifReader from 'exif-reader'
import { hasTransparency } from './formats.js'
import { dmsToDecimal, formatDms } from './utils/format.js'
import log from './utils/log.js'

function formatExposure(value) {
  if (value >= 1) return `${value}s`
  return `1/${Math.round(1 / value)}`
}

export function extractExif(raw) {
  if (!raw) return null

  const image = raw.Image || {}
  const photo = raw.Photo || {}
  const gps = raw.GPSInfo || {}

  const result = {
    make: image.Make || null,
    model: image.Model || null,
    orientation: image.Orientation || null,
    resolution: (image.XResolution || image.YResolution)
      ? { x: image.XResolution, y: image.YResolution }
      : null,
    dateTime: image.DateTime || null,
    offsetTime: photo.OffsetTime || null,
    fNumber: photo.FNumber || null,
    exposure: photo.ExposureTime != null
      ? { value: photo.ExposureTime, formatted: formatExposure(photo.ExposureTime) }
      : null,
    iso: photo.ISOSpeedRatings || null,
    focalLength: photo.FocalLength || null,
    focalLength35mm: photo.FocalLengthIn35mmFilm || null,
    flash: photo.Flash != null ? !!(photo.Flash & 1) : null,
    lensModel: photo.LensModel || null,
    software: image.Software || null,
    gps: null,
  }

  if (gps.GPSLatitude && gps.GPSLongitude) {
    const latDecimal = dmsToDecimal(gps.GPSLatitude, gps.GPSLatitudeRef)
    const lonDecimal = dmsToDecimal(gps.GPSLongitude, gps.GPSLongitudeRef)

    result.gps = {
      latitude: {
        degrees: gps.GPSLatitude,
        ref: gps.GPSLatitudeRef,
        decimal: latDecimal,
        formatted: formatDms(gps.GPSLatitude, gps.GPSLatitudeRef),
      },
      longitude: {
        degrees: gps.GPSLongitude,
        ref: gps.GPSLongitudeRef,
        decimal: lonDecimal,
        formatted: formatDms(gps.GPSLongitude, gps.GPSLongitudeRef),
      },
      altitude: gps.GPSAltitude != null
        ? { value: Math.round(gps.GPSAltitude * 100) / 100, ref: gps.GPSAltitudeRef }
        : null,
      direction: gps.GPSImgDirection != null
        ? Math.round(gps.GPSImgDirection * 100) / 100
        : null,
      speed: gps.GPSSpeed != null
        ? { value: Math.round(gps.GPSSpeed * 100) / 100, unit: gps.GPSSpeedRef === 'K' ? 'km/h' : gps.GPSSpeedRef === 'M' ? 'mph' : 'knots' }
        : null,
      dateTime: null,
      googleMapsUrl: `https://www.google.com/maps?q=${latDecimal},${lonDecimal}`,
    }

    if (gps.GPSDateStamp && gps.GPSTimeStamp) {
      const [year, month, day] = gps.GPSDateStamp.split(':')
      const [hours, minutes, seconds] = gps.GPSTimeStamp
      const h = String(Math.floor(hours)).padStart(2, '0')
      const m = String(Math.floor(minutes)).padStart(2, '0')
      const s = String(Math.floor(seconds)).padStart(2, '0')
      result.gps.dateTime = `${year}-${month}-${day}T${h}:${m}:${s}Z`
    }
  }

  return result
}

export async function analyzeImage(inputPath, config, stat) {
  const relativePath = path.relative(config.in, inputPath)
  const parsed = path.parse(relativePath)
  const originalExt = parsed.ext.replace('.', '').toLowerCase()

  // Read metadata
  let metadata
  try {
    metadata = await sharp(inputPath).metadata()
  } catch (err) {
    log({ tag: 'error', text: `Failed to read metadata: ${err.message}`, link: relativePath })
    return null
  }

  // Parse EXIF data if available — extract only important fields
  let exif = null
  if (metadata.exif) {
    try {
      exif = extractExif(exifReader(metadata.exif))
    } catch {
      // Malformed EXIF — ignore
    }
  }

  // Normalize base format for web output
  const normalizedExt = { jpeg: 'jpg', tif: 'tiff' }[originalExt] || originalExt
  let outputExt = normalizedExt
  let transparent = false

  // Formats that support alpha and need transparency detection
  const alphaFormats = new Set(['png', 'tiff', 'heic', 'heif', 'gif'])

  // Check transparency for alpha-capable formats (needed for default + smart modes)
  const formatIncludesSmart = config.format === 'smart' ||
    (Array.isArray(config.format) && config.format.includes('smart'))

  const needsTransparencyCheck =
    alphaFormats.has(normalizedExt) &&
    (config.format === false || formatIncludesSmart)

  if (needsTransparencyCheck) {
    transparent = await hasTransparency(sharp(inputPath))
  }

  // Formats that aren't web-native and need normalization to jpg/png
  const nonWebFormats = new Set(['tiff', 'heic', 'heif', 'gif'])

  // Default mode: normalize non-web formats
  if (config.format === false) {
    if (originalExt === 'png' && !transparent) {
      outputExt = 'jpg'
      log({ tag: 'image', text: 'Opaque PNG \u2192 JPEG:', link: relativePath })
    } else if (nonWebFormats.has(normalizedExt)) {
      const label = normalizedExt.toUpperCase()
      if (transparent) {
        outputExt = 'png'
        log({ tag: 'image', text: `Transparent ${label} \u2192 PNG:`, link: relativePath })
      } else {
        outputExt = 'jpg'
        log({ tag: 'image', text: `${label} \u2192 JPEG:`, link: relativePath })
      }
    }
  }

  // Build effective sizes list — include original unless skipOriginal
  let effectiveSizes = config.sizes
  if (!config.skipOriginal) {
    const hasPassthrough = effectiveSizes.some(s => s.width === 0 && s.height === 0)
    if (!hasPassthrough) {
      effectiveSizes = [{ name: '', width: 0, height: 0, crop: false }, ...effectiveSizes]
    }
  }

  // EXIF orientations 5-8 swap width/height
  const swapped = metadata.orientation >= 5
  const sourceWidth = swapped ? metadata.height : metadata.width
  const sourceHeight = swapped ? metadata.width : metadata.height

  return {
    inputPath,
    relativePath,
    parsed,
    originalExt,
    outputExt,
    transparent,
    sourceWidth,
    sourceHeight,
    exif,
    mtime: stat.mtimeMs,
    fileSize: stat.size,
    effectiveSizes
  }
}
