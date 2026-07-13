const VALID_X_POSITIONS = ['left', 'center', 'right']
const VALID_Y_POSITIONS = ['top', 'center', 'bottom']

export function validateSize(size) {
  if (size.name !== undefined && typeof size.name !== 'string') {
    throw new Error('Size "name" must be a string if provided')
  }

  const name = size.name || ''
  const width = size.width || 0
  const height = size.height || 0

  const label = name || `${width}x${height}`

  // width=0 && height=0 is valid: conversion-only mode (no resize)

  if (typeof width !== 'number' || width < 0) {
    throw new Error(`Size "${label}": width must be a non-negative number`)
  }

  if (typeof height !== 'number' || height < 0) {
    throw new Error(`Size "${label}": height must be a non-negative number`)
  }

  if (size.crop !== undefined && size.crop !== false && size.crop !== true && !Array.isArray(size.crop)) {
    throw new Error(`Size "${label}": crop must be boolean or [x, y] array`)
  }

  if (Array.isArray(size.crop)) {
    if (size.crop.length !== 2) {
      throw new Error(`Size "${label}": crop array must have exactly 2 elements [x, y]`)
    }
    if (!VALID_X_POSITIONS.includes(size.crop[0])) {
      throw new Error(`Size "${label}": crop x must be one of: ${VALID_X_POSITIONS.join(', ')}`)
    }
    if (!VALID_Y_POSITIONS.includes(size.crop[1])) {
      throw new Error(`Size "${label}": crop y must be one of: ${VALID_Y_POSITIONS.join(', ')}`)
    }
  }

  return {
    name,
    width,
    height,
    crop: size.crop || false
  }
}

// sharp accepts: 'top', 'right top', 'right', 'right bottom', 'bottom',
// 'left bottom', 'left', 'left top', 'centre'/'center'
// When center is one axis, drop it: ['center','top'] → 'top', ['left','center'] → 'left'
// When both are center: ['center','center'] → 'centre'
function cropArrayToPosition([x, y]) {
  if (x === 'center' && y === 'center') return 'centre'
  if (x === 'center') return y
  if (y === 'center') return x
  return `${x} ${y}`
}

export function filterByUpscale(sizes, sourceWidth, sourceHeight) {
  return sizes.filter(sizeDef => {
    if (sizeDef.width === 0 && sizeDef.height === 0) return true

    const tooNarrow = sizeDef.width > 0 && sourceWidth < sizeDef.width
    const tooShort = sizeDef.height > 0 && sourceHeight < sizeDef.height

    // Crops always produce output — an undersized source is scaled down to the
    // largest box that fits (clampSizeToSource), never dropped or upscaled.
    if (sizeDef.crop) return true

    if (sizeDef.width > 0 && sizeDef.height === 0 && tooNarrow) return false
    if (sizeDef.height > 0 && sizeDef.width === 0 && tooShort) return false
    if (sizeDef.width > 0 && sizeDef.height > 0 && tooNarrow && tooShort) return false
    return true
  })
}

// Crops can't upscale to fill: when the source is smaller than the crop box on
// either axis, scale the whole box down proportionally (preserving the crop's
// aspect ratio) and crop to the largest box that fits. Non-crop sizes are left
// to sharp's withoutEnlargement. Returns a (possibly new) size with clamped dims.
export function clampSizeToSource(size, sourceWidth, sourceHeight) {
  if (!size.crop || size.width <= 0 || size.height <= 0) return size
  const scale = Math.min(sourceWidth / size.width, sourceHeight / size.height, 1)
  if (scale >= 1) return size
  return {
    ...size,
    width: Math.max(1, Math.round(size.width * scale)),
    height: Math.max(1, Math.round(size.height * scale))
  }
}

// Among sizes sharing a name, the largest (by longest side, area tie-break) is
// the "main" one: poops-images drops the width suffix from its filename so it
// reads as the canonical named variant (e.g. `photo-thumb.webp`), while the
// smaller siblings keep `-{width}w`. Returns a new list; named entries gain a
// `main` boolean, unnamed entries pass through untouched.
export function markMainSizes(sizes) {
  const longest = s => Math.max(s.width || 0, s.height || 0)
  const area = s => (s.width || 0) * (s.height || 0)
  const mainIdx = new Map() // name -> index of current largest
  sizes.forEach((s, i) => {
    if (!s.name) return
    const cur = mainIdx.get(s.name)
    if (cur === undefined) { mainIdx.set(s.name, i); return }
    const prev = sizes[cur]
    if (longest(s) > longest(prev) || (longest(s) === longest(prev) && area(s) > area(prev))) {
      mainIdx.set(s.name, i)
    }
  })
  const mains = new Set(mainIdx.values())
  return sizes.map((s, i) => s.name ? { ...s, main: mains.has(i) } : s)
}

export function toSharpOptions(size) {
  // Conversion-only: no resize needed
  if (size.width === 0 && size.height === 0) return null

  const opts = {}

  if (size.width > 0) opts.width = size.width
  if (size.height > 0) opts.height = size.height

  if (size.crop === false) {
    opts.fit = 'inside'
    opts.withoutEnlargement = true
  } else if (size.crop === true) {
    opts.fit = 'cover'
    opts.position = 'centre'
  } else if (Array.isArray(size.crop)) {
    opts.fit = 'cover'
    opts.position = cropArrayToPosition(size.crop)
  }

  return opts
}
