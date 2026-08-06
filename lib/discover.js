import { glob } from 'glob'
import path from 'node:path'

// glob treats \ in patterns as an escape character, so patterns must use
// forward slashes even on Windows
const globJoin = (...parts) => path.join(...parts).split(path.sep).join('/')

function patterns(config) {
  const pattern = globJoin(config.in, config.include)
  const ignore = config.exclude.map(e => globJoin(config.in, e))

  // The tool's own output tree is never a source — without this, a second run
  // over out-inside-in re-ingests the first run's variants (dist/dist/dist).
  // Only when out sits strictly inside in: when they are the same directory
  // this would exclude every source, so that case is covered by the
  // cache-recorded-outputs filter in processAll instead.
  const relOut = path.relative(path.resolve(config.in), path.resolve(config.out))
  if (relOut !== '' && !relOut.startsWith('..') && !path.isAbsolute(relOut)) {
    ignore.push(globJoin(config.in, relOut, '**'))
  }

  return { pattern, ignore }
}

// One glob pass over `include` decides what gets processed at all; the file
// extension decides which pipeline. SVG and GIF sit in the default include, so
// narrowing `include` narrows them too — an include naming one file means that
// one file, not the file plus every svg and gif beside it.
export async function discoverAll(config) {
  const { pattern, ignore } = patterns(config)
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

// Watch events route through the same predicate as a build run, so the two
// modes cannot drift on include/exclude. Re-globbing per event is the cost;
// events arrive at human pace and a build pays the same glob every run.
export async function isDiscovered(config, filePath) {
  const { pattern, ignore } = patterns(config)
  const files = await glob(pattern, { ignore, nodir: true })
  const target = path.resolve(filePath)
  return files.some(f => path.resolve(f) === target)
}
