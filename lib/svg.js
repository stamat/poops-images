import fs from 'node:fs'
import path from 'node:path'
import { optimize } from 'svgo'
import log from './utils/log.js'
import { formatBytes } from './utils/format.js'

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

export async function processSvg(inputPath, outputDir, inputDir) {
  const relativePath = path.relative(inputDir, inputPath)
  const outPath = path.join(outputDir, relativePath)
  const outDir = path.dirname(outPath)

  let source
  try {
    source = fs.readFileSync(inputPath, 'utf-8')
  } catch (err) {
    log({ tag: 'error', text: `Cannot read SVG: ${err.message}`, link: relativePath })
    return null
  }

  const originalSize = Buffer.byteLength(source, 'utf-8')

  let result
  try {
    result = optimize(source, {
      path: inputPath,
      multipass: true
    })
  } catch (err) {
    log({ tag: 'error', text: `SVGO failed: ${err.message}`, link: relativePath })
    return null
  }

  const optimizedSize = Buffer.byteLength(result.data, 'utf-8')
  const saved = originalSize - optimizedSize
  const pct = originalSize > 0 ? Math.round((saved / originalSize) * 100) : 0

  // Parse dimensions from the optimized SVG
  const { width, height } = parseSvgDimensions(result.data)

  fs.mkdirSync(outDir, { recursive: true })
  fs.writeFileSync(outPath, result.data, 'utf-8')

  log({
    tag: 'image',
    text: 'Minified:',
    link: relativePath,
    size: `${formatBytes(optimizedSize)} (${pct > 0 ? '-' + pct + '%' : 'same'})`
  })

  return { relativePath, outputSize: optimizedSize, saved, width, height }
}
