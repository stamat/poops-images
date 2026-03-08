/**
 * Halftone/dot-matrix preprocessor handler for poops-images.
 *
 * Converts an image into a halftone dot pattern. Supports both circular dots
 * (classic newspaper print) and square dots (Nokia-era LCD look).
 *
 * Values can be absolute pixels or relative to image size:
 *   - Number: absolute pixels (e.g. 8)
 *   - String with %: percentage of shortest side (e.g. "1%")
 *
 * Usage in poops-images.json:
 * {
 *   "name": "halftone",
 *   "operations": [
 *     {
 *       "type": "halftone",
 *       "dotSize": "0.8%",
 *       "spacing": "1%",
 *       "shape": "square",
 *       "background": "#c7f0d8",
 *       "foreground": "#43523d"
 *     }
 *   ]
 * }
 *
 * @param {Buffer} buffer - Input image buffer
 * @param {object} params - Operation parameters + { width, height } from the pipeline
 * @param {Function} sharp - The sharp module
 * @returns {Promise<Buffer>} - Processed image buffer
 */

function resolveValue(value, width, height) {
  if (typeof value === 'string' && value.endsWith('%')) {
    const pct = parseFloat(value) / 100
    const ref = Math.min(width, height)
    return Math.max(1, Math.round(ref * pct))
  }
  return value
}

export default async function halftone(buffer, params, sharp) {
  const {
    width,
    height,
    dotSize: rawDotSize = 6,
    spacing: rawSpacing = 8,
    shape = 'circle',
    background = '#ffffff',
    foreground = '#000000',
  } = params

  const spacing = resolveValue(rawSpacing, width, height)
  const dotSize = resolveValue(rawDotSize, width, height)

  // Step 1: Downscale to grid resolution (each pixel becomes one dot)
  const gridW = Math.ceil(width / spacing)
  const gridH = Math.ceil(height / spacing)

  const small = await sharp(buffer)
    .grayscale()
    .resize(gridW, gridH, { fit: 'fill' })
    .raw()
    .toBuffer()

  // Step 2: Build SVG with dots — brightness controls dot size
  const maxR = dotSize / 2
  let dots = ''
  for (let y = 0; y < gridH; y++) {
    for (let x = 0; x < gridW; x++) {
      const lum = small[y * gridW + x] // 0 = black, 255 = white
      const scale = 1 - lum / 255      // darker = bigger dot

      if (scale < 0.02) continue

      const cx = x * spacing + spacing / 2
      const cy = y * spacing + spacing / 2

      if (shape === 'square') {
        const side = dotSize * scale
        const sx = cx - side / 2
        const sy = cy - side / 2
        dots += `<rect x="${sx.toFixed(2)}" y="${sy.toFixed(2)}" width="${side.toFixed(2)}" height="${side.toFixed(2)}" fill="${foreground}"/>`
      } else {
        const r = maxR * scale
        if (r > 0.3) {
          dots += `<circle cx="${cx}" cy="${cy}" r="${r.toFixed(2)}" fill="${foreground}"/>`
        }
      }
    }
  }

  const outW = gridW * spacing
  const outH = gridH * spacing
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${outW}" height="${outH}">
<rect width="100%" height="100%" fill="${background}"/>
${dots}
</svg>`

  // Step 3: Render SVG back to raster at the original dimensions
  const raster = await sharp(Buffer.from(svg))
    .resize(width, height, { fit: 'fill' })
    .png()
    .toBuffer()

  return {
    buffer: raster,
    sidecars: [{ ext: 'svg', data: Buffer.from(svg) }]
  }
}
