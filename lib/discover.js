import { glob } from 'glob'
import path from 'node:path'

// glob treats \ in patterns as an escape character, so patterns must use
// forward slashes even on Windows
const globJoin = (...parts) => path.join(...parts).split(path.sep).join('/')

export async function discoverSources(config) {
  const pattern = globJoin(config.in, config.include)
  const ignore = [
    ...config.exclude.map(e => globJoin(config.in, e)),
    // SVG and GIF have dedicated pipelines — exclude from raster discovery
    globJoin(config.in, '**/*.svg'),
    globJoin(config.in, '**/*.gif')
  ]
  return glob(pattern, { ignore, nodir: true })
}

export async function discoverSvgs(config) {
  const pattern = globJoin(config.in, '**/*.svg')
  const ignore = config.exclude.map(e => globJoin(config.in, e))
  return glob(pattern, { ignore, nodir: true })
}

export async function discoverGifs(config) {
  const pattern = globJoin(config.in, '**/*.gif')
  const ignore = config.exclude.map(e => globJoin(config.in, e))
  return glob(pattern, { ignore, nodir: true })
}

export async function discoverAll(config) {
  const [raster, svg, gif] = await Promise.all([
    discoverSources(config),
    discoverSvgs(config),
    discoverGifs(config)
  ])
  return { raster, svg, gif }
}
