import { glob } from 'glob'
import path from 'node:path'

// glob treats \ in patterns as an escape character, so patterns must use
// forward slashes even on Windows
const globJoin = (...parts) => path.join(...parts).split(path.sep).join('/')

// One glob pass over `include` decides what gets processed at all; the file
// extension decides which pipeline. SVG and GIF sit in the default include, so
// narrowing `include` narrows them too — an include naming one file means that
// one file, not the file plus every svg and gif beside it.
export async function discoverAll(config) {
  const pattern = globJoin(config.in, config.include)
  const ignore = config.exclude.map(e => globJoin(config.in, e))
  const files = await glob(pattern, { ignore, nodir: true })

  const buckets = { raster: [], svg: [], gif: [] }
  for (const file of files) {
    const ext = path.extname(file).toLowerCase()
    if (ext === '.svg') buckets.svg.push(file)
    else if (ext === '.gif') buckets.gif.push(file)
    else buckets.raster.push(file)
  }
  return buckets
}
