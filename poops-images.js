#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { loadConfig, validateConfig } from './lib/config.js'
import ImageProcessor from './lib/processor.js'
import { setQuiet } from './lib/utils/log.js'
import PrintStyle from 'printstyle'
import Argoyle from 'argoyle'

let pkg
try {
  pkg = JSON.parse(fs.readFileSync(new URL('./package.json', import.meta.url), 'utf-8'))
} catch {
  console.error('Failed to read package.json')
  process.exit(1)
}
const ps = new PrintStyle()

const cli = new Argoyle(pkg.version)
cli.line('Usage: poops-images [input] [options]')
cli.line('')
cli.option('build', { short: 'b', description: 'Process all images and exit (default)' })
cli.option('watch', { short: 'w', description: 'Watch for changes and process incrementally' })
cli.option('force', { short: 'f', description: 'Ignore cache, regenerate everything' })
cli.option('config', { short: 'c', value: '<path>', description: 'Config file path (default: poops-images.json)' })
cli.option('widths', {
  short: 's',
  value: '<list>',
  description: 'Comma-separated widths (e.g. 300,768,1024)',
  callback: (val) => val.split(',').map(w => {
    const n = parseInt(w.trim(), 10)
    if (isNaN(n) || n <= 0) {
      console.error(`Invalid width: "${w.trim()}"`)
      process.exit(1)
    }
    return n
  })
})
cli.option('in', { short: 'i', value: '<path>', description: 'Input directory or file path (default: .)' })
cli.option('out', { short: 'o', value: '<path>', description: 'Output directory (default: .)' })
cli.option('quiet', { short: 'q', description: 'Suppress progress output' })
cli.option('format', {
  short: 'F',
  value: '<format>',
  description: 'Output format(s): smart, webp, avif, or comma-separated (e.g. smart,avif)',
  callback: (val) => {
    if (val.includes(',')) return val.split(',').map(f => f.trim())
    return val
  }
})
cli.option('quality', {
  short: 'Q',
  value: '<value>',
  description: 'Quality 1-100 (all formats) or per-format (e.g. webp:60,avif:40)',
  callback: (val) => {
    const num = Number(val)
    if (!isNaN(num)) {
      if (num < 1 || num > 100) {
        console.error(`Quality must be between 1 and 100, got: ${num}`)
        process.exit(1)
      }
      return Math.round(num)
    }
    const obj = {}
    for (const part of val.split(',')) {
      const [fmt, q] = part.split(':').map(s => s.trim())
      const n = Number(q)
      if (!fmt || isNaN(n) || n < 1 || n > 100) {
        console.error(`Invalid quality value: "${part}". Use format:number (e.g. webp:60)`)
        process.exit(1)
      }
      obj[fmt] = Math.round(n)
    }
    return obj
  }
})
cli.option('dry-run', { description: 'Show what would be processed without writing' })
cli.option('skip-original', { description: 'Skip the original (non-resized) compressed image' })
cli.option('preprocess', {
  short: 'P',
  value: '<ops>',
  description: 'Preprocess operations (e.g. blur:20,grayscale,sharpen:1.5)',
  callback: (val) => {
    const PRIMARY_PARAM = {
      blur: 'sigma',
      sharpen: 'sigma',
      gamma: 'value',
      rotate: 'angle',
      tint: 'color'
    }
    return val.split(',').map(op => {
      const [type, ...args] = op.trim().split(':')
      const params = { type }
      if (args.length === 1) {
        const key = PRIMARY_PARAM[type]
        if (key) {
          const num = Number(args[0])
          params[key] = isNaN(num) ? args[0] : num
        }
      }
      return params
    })
  }
})

cli.line('')
cli.line('Quick mode (no config file needed):')
cli.line(`  ${pkg.name} --widths 300,768,1024 --in src/images --out dist/images`)
cli.line(`  ${pkg.name} --widths 300,768,1024 --format webp --in photo.jpg --out dist/images`)

try {
  const { flags, positionals } = cli.parse()

  const watchMode = flags.watch
  const force = flags.force
  const configPath = flags.config || null
  const quiet = flags.quiet
  const dryRun = flags['dry-run']
  const cliWidths = flags.widths
  let cliIn = flags.in || positionals[0] || null
  const cliOut = flags.out
  const cliFormat = flags.format
  const cliQuality = flags.quality
  const skipOriginal = flags['skip-original']
  const cliPreprocess = flags.preprocess

  if (quiet) setQuiet(true)

  // CLI Header
  const title = `💩\uD83D\uDCF8 Poops Images \u2014 v${pkg.version}`
  console.log(ps.paint(`\n{#2e8b57|${title}\n${title.replace(/./g, '-')}}\n`))

  // When --in is a file or glob, split into directory + include pattern
  let cliInclude = null
  if (cliIn) {
    const GLOB_CHARS = /[*?{[\]]/
    if (GLOB_CHARS.test(cliIn)) {
      // Glob pattern: split at the first segment containing glob characters
      const segments = cliIn.split(path.sep)
      const globIdx = segments.findIndex(s => GLOB_CHARS.test(s))
      cliInclude = segments.slice(globIdx).join(path.sep)
      cliIn = segments.slice(0, globIdx).join(path.sep) || '.'
    } else {
      const resolved = path.resolve(cliIn)
      try {
        if (fs.statSync(resolved).isFile()) {
          cliInclude = path.basename(resolved)
          cliIn = path.dirname(resolved)
        }
      } catch {
        // Path doesn't exist yet or can't be accessed — treat as directory
      }
    }
  }

  let config
  if (cliWidths || cliIn) {
    const raw = {
      sizes: cliWidths ? cliWidths.map(w => ({ width: w })) : [],
      out: cliOut || '.'
    }
    if (cliIn) raw.in = cliIn
    if (cliInclude) raw.include = cliInclude
    if (cliFormat !== null) raw.format = cliFormat
    if (cliQuality != null) raw.quality = cliQuality
    if (skipOriginal) raw.skipOriginal = true
    if (cliPreprocess) raw.preprocessors = [{ name: 'preprocessed', operations: cliPreprocess }]
    config = validateConfig(raw)
  } else {
    config = loadConfig(configPath)
    if (cliIn) config.in = cliIn
    if (cliOut) config.out = cliOut
    if (cliInclude) config.include = cliInclude
    if (cliFormat !== null) config.format = cliFormat
    if (cliQuality != null) {
      if (typeof cliQuality === 'number') {
        config.quality = { jpg: cliQuality, webp: cliQuality, avif: cliQuality, png: cliQuality }
      } else {
        config.quality = { ...config.quality, ...cliQuality }
      }
    }
    if (skipOriginal) config.skipOriginal = true
    if (cliPreprocess) {
      config.preprocessors = config.preprocessors || []
      config.preprocessors.push({ name: 'preprocessed', operations: cliPreprocess })
    }
  }
  const processor = new ImageProcessor(config)

  await processor.processAll({ force, dryRun })

  if (watchMode) {
    processor.watch()
  } else {
    process.exit(0)
  }
} catch (err) {
  console.error(ps.paint(`{redBright.bold|[error]} ${err.message}`))
  process.exit(1)
}
