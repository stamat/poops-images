import fs from 'node:fs'
import path from 'node:path'
import { optimize } from 'svgo'

export function parseSvgDimensions(svgContent) {
  // Match the opening <svg> tag (may span multiple lines)
  const svgTagMatch = svgContent.match(/<svg\s[^>]*>/is)
  if (!svgTagMatch) return { width: null, height: null }

  const tag = svgTagMatch[0]

  // Try explicit width/height attributes (unitless or px only)
  const wMatch = tag.match(/\bwidth=["'](\d+(?:\.\d+)?)(px)?["']/i)
  const hMatch = tag.match(/\bheight=["'](\d+(?:\.\d+)?)(px)?["']/i)

  if (wMatch && hMatch) {
    return {
      width: Math.round(parseFloat(wMatch[1])),
      height: Math.round(parseFloat(hMatch[1]))
    }
  }

  // Fall back to viewBox
  const vbMatch = tag.match(/\bviewBox=["']\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*["']/i)
  if (vbMatch) {
    return {
      width: Math.round(parseFloat(vbMatch[3])),
      height: Math.round(parseFloat(vbMatch[4]))
    }
  }

  return { width: null, height: null }
}

// Throws on failure — error logging and counting is the caller's job, so
// stats.errors (which decides a caller's build exit code) cannot drift from
// what was logged.
export async function processSvg(inputPath, outputDir, inputDir) {
  const relativePath = path.relative(inputDir, inputPath)
  const outPath = path.join(outputDir, relativePath)
  const outDir = path.dirname(outPath)

  // With in == out the minified SVG would land on its own source; SVGO output
  // is not the file the author wrote, so refuse rather than rewrite in place
  if (path.resolve(outPath) === path.resolve(inputPath)) {
    throw new Error('Refusing to overwrite a source with its own output')
  }

  let source
  try {
    source = fs.readFileSync(inputPath, 'utf-8')
  } catch (err) {
    throw new Error(`Cannot read SVG: ${err.message}`)
  }

  const originalSize = Buffer.byteLength(source, 'utf-8')

  let result
  try {
    result = optimize(source, {
      path: inputPath,
      multipass: true
    })
  } catch (err) {
    throw new Error(`SVGO failed: ${err.message}`)
  }

  const optimizedSize = Buffer.byteLength(result.data, 'utf-8')
  const saved = originalSize - optimizedSize

  // Parse dimensions from the optimized SVG
  const { width, height } = parseSvgDimensions(result.data)

  fs.mkdirSync(outDir, { recursive: true })
  fs.writeFileSync(outPath, result.data, 'utf-8')

  return { relativePath, outputSize: optimizedSize, saved, width, height }
}
