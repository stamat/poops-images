/**
 * ASCII art preprocessor handler for poops-images.
 *
 * Converts an image into ASCII character art. Outputs a raster image,
 * plus sidecars: plain text (.txt) and SVG with monospace text (.svg).
 *
 * Characters are mapped from dark to light:
 *   @%#*+=-:. (space)
 *
 * Character cells have ~2:1 height-to-width aspect ratio (monospace font),
 * so the grid accounts for this to avoid vertical stretching.
 *
 * Usage in poops-images.json:
 * {
 *   "name": "ascii",
 *   "operations": [
 *     {
 *       "type": "ascii",
 *       "fontSize": 10,
 *       "foreground": "#00ff00",
 *       "background": "#000000"
 *     }
 *   ]
 * }
 *
 * @param {Buffer} buffer - Input image buffer
 * @param {object} params - Operation parameters + { width, height } from the pipeline
 * @param {Function} sharp - The sharp module
 * @returns {Promise<{buffer: Buffer, sidecars: Array}>} - Raster image + text/SVG sidecars
 */

// Dark to light — first char for darkest pixels, last (space) for brightest
const CHARS = '@%#*+=-:. '

const CHAR_ASPECT = 0.6 // width/height ratio of monospace characters

export default async function ascii(buffer, params, sharp) {
  const {
    width,
    height,
    fontSize = 10,
    foreground = '#00ff00',
    background = '#000000',
  } = params

  // Calculate grid dimensions based on font size
  // Each character cell is fontSize tall, fontSize * CHAR_ASPECT wide
  const cellW = Math.round(fontSize * CHAR_ASPECT)
  const cellH = fontSize
  const cols = Math.max(1, Math.floor(width / cellW))
  const rows = Math.max(1, Math.floor(height / cellH))

  // Downscale to grid resolution in grayscale
  const small = await sharp(buffer)
    .grayscale()
    .resize(cols, rows, { fit: 'fill' })
    .raw()
    .toBuffer()

  // Map each pixel to an ASCII character
  const lines = []
  for (let y = 0; y < rows; y++) {
    let line = ''
    for (let x = 0; x < cols; x++) {
      const lum = small[y * cols + x] // 0 = black, 255 = white
      const idx = Math.floor((lum / 255) * (CHARS.length - 1))
      line += CHARS[idx]
    }
    lines.push(line)
  }

  const text = lines.join('\n')

  // Build SVG with monospace text
  const svgW = cols * cellW
  const svgH = rows * cellH

  // Escape XML special characters in the text lines
  const escapeXml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  let textElements = ''
  for (let y = 0; y < rows; y++) {
    // Position each line — y offset is baseline, so add cellH for first line
    const yPos = y * cellH + cellH * 0.85 // 0.85 approximates baseline offset
    textElements += `<text x="0" y="${yPos.toFixed(1)}" textLength="${svgW}" lengthAdjust="spacing">${escapeXml(lines[y])}</text>\n`
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${svgW}" height="${svgH}">
<style>text { font-family: monospace; font-size: ${fontSize}px; fill: ${foreground}; white-space: pre; }</style>
<rect width="100%" height="100%" fill="${background}"/>
${textElements}</svg>`

  // Render SVG to raster at original dimensions
  const raster = await sharp(Buffer.from(svg))
    .resize(width, height, { fit: 'fill' })
    .png()
    .toBuffer()

  return {
    buffer: raster,
    sidecars: [
      { ext: 'txt', data: Buffer.from(text) },
      { ext: 'svg', data: Buffer.from(svg) },
    ]
  }
}
