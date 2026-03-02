import { glob } from 'glob'
import path from 'node:path'

export async function discoverSources(config) {
  const pattern = path.join(config.in, config.include)
  const ignore = [
    ...config.exclude.map(e => path.join(config.in, e)),
    // SVG and GIF have dedicated pipelines — exclude from raster discovery
    path.join(config.in, '**/*.svg'),
    path.join(config.in, '**/*.gif')
  ]
  return glob(pattern, { ignore, nodir: true })
}

export async function discoverSvgs(config) {
  const pattern = path.join(config.in, '**/*.svg')
  const ignore = config.exclude.map(e => path.join(config.in, e))
  return glob(pattern, { ignore, nodir: true })
}

export async function discoverGifs(config) {
  const pattern = path.join(config.in, '**/*.gif')
  const ignore = config.exclude.map(e => path.join(config.in, e))
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
