/**
 * Pixelate/Nokia-style preprocessor handler for poops-images.
 *
 * Downscales to a tiny grid then upscales with nearest-neighbor interpolation,
 * producing a chunky pixel art / retro Nokia look.
 *
 * Usage in poops-images.json:
 * {
 *   "name": "pixel",
 *   "operations": [
 *     {
 *       "type": "pixelate",
 *       "blockSize": 8,
 *       "colors": 4
 *     }
 *   ]
 * }
 *
 * @param {Buffer} buffer - Input image buffer
 * @param {object} params - Operation parameters + { width, height } from the pipeline
 * @param {Function} sharp - The sharp module
 * @returns {Promise<Buffer>} - Processed image buffer
 */
export default async function pixelate(buffer, params, sharp) {
  const {
    width,
    height,
    blockSize = 8,
    colors = 0,
    grayscale = false,
  } = params

  const gridW = Math.max(1, Math.ceil(width / blockSize))
  const gridH = Math.max(1, Math.ceil(height / blockSize))

  // Downscale to tiny grid
  let pipeline = sharp(buffer)
    .resize(gridW, gridH, { fit: 'fill', kernel: 'nearest' })

  if (grayscale) {
    pipeline = pipeline.grayscale()
  }

  const small = await pipeline.png().toBuffer()

  // Upscale with nearest-neighbor for blocky pixels
  const upscale = sharp(small)
    .resize(width, height, { fit: 'fill', kernel: 'nearest' })

  // Reduce color palette if requested (posterize effect)
  if (colors > 0) {
    // Use sharp's built-in palette: convert to indexed PNG with limited colors
    return upscale
      .png({ palette: true, colours: colors })
      .toBuffer()
  }

  return upscale.png().toBuffer()
}
