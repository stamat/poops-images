import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { validateSize } from './sizes.js'
import { validatePreprocessors } from './preprocess.js'

// Output formats only — tiff/tif/heic/heif/gif are input formats normalized to jpg/png during processing
const SUPPORTED_FORMATS = new Set(['jpg', 'jpeg', 'png', 'webp', 'avif'])

const DEFAULTS = {
  in: '.',
  out: '.',
  sizes: [],
  quality: {
    jpg: 82,
    webp: 80,
    avif: 60,
    png: 90
  },
  include: '**/*.{jpg,jpeg,png,tiff,tif,webp,heic,heif}',
  exclude: [],
  concurrency: 4,
  format: false,
  skipOriginal: false,
  cache: true,
  preprocessors: []
}

export function loadConfig(configPath) {
  const cwd = process.cwd()

  let raw = null
  let resolvedPath = null

  if (configPath) {
    resolvedPath = path.resolve(cwd, configPath)
    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`Config file not found: ${resolvedPath}`)
    }
    raw = JSON.parse(fs.readFileSync(resolvedPath, 'utf-8'))
  } else {
    // Try poops-images.json first
    resolvedPath = path.resolve(cwd, 'poops-images.json')
    if (fs.existsSync(resolvedPath)) {
      raw = JSON.parse(fs.readFileSync(resolvedPath, 'utf-8'))
    } else {
      // Fallback: read images key from poops.json
      resolvedPath = path.resolve(cwd, 'poops.json')
      if (fs.existsSync(resolvedPath)) {
        const poopsConfig = JSON.parse(fs.readFileSync(resolvedPath, 'utf-8'))
        if (poopsConfig.images) {
          raw = poopsConfig.images
        }
      }

      if (!raw) {
        // Try 💩.json as last fallback
        resolvedPath = path.resolve(cwd, '💩.json')
        if (fs.existsSync(resolvedPath)) {
          const poopsConfig = JSON.parse(fs.readFileSync(resolvedPath, 'utf-8'))
          if (poopsConfig.images) {
            raw = poopsConfig.images
          }
        }
      }

      if (!raw) {
        throw new Error('No config found. Create poops-images.json or add "images" key to poops.json')
      }
    }
  }

  return validateConfig(raw)
}

export function validateConfig(raw) {
  const config = { ...DEFAULTS, ...raw }

  if (typeof config.in !== 'string') {
    throw new Error('Config "in" must be a string path')
  }

  if (typeof config.out !== 'string') {
    throw new Error('Config "out" must be a string path')
  }

  if (!Array.isArray(config.sizes)) {
    throw new Error('Config "sizes" must be an array')
  }

  // Empty sizes = conversion-only mode (no resize, just format convert)
  if (config.sizes.length === 0) {
    config.sizes = [{ width: 0, height: 0 }]
  }

  config.sizes = config.sizes.map(validateSize)

  if (typeof config.quality === 'number') {
    const q = config.quality
    if (q < 1 || q > 100) {
      throw new Error('Config "quality" must be between 1 and 100')
    }
    config.quality = { jpg: q, webp: q, avif: q, png: q }
  } else if (typeof config.quality !== 'object') {
    throw new Error('Config "quality" must be a number or an object')
  } else {
    config.quality = { ...DEFAULTS.quality, ...config.quality }
    for (const [key, val] of Object.entries(config.quality)) {
      if (typeof val !== 'number' || val < 1 || val > 100) {
        throw new Error(`Config "quality.${key}" must be a number between 1 and 100`)
      }
    }
  }

  if (typeof config.include !== 'string') {
    throw new Error('Config "include" must be a string glob pattern')
  }

  if (!Array.isArray(config.exclude)) {
    config.exclude = config.exclude ? [config.exclude] : []
  }

  if (typeof config.concurrency !== 'number' || config.concurrency < 1) {
    config.concurrency = DEFAULTS.concurrency
  }

  config.skipOriginal = !!config.skipOriginal

  if (config.cache !== false && config.cache !== true && typeof config.cache !== 'string') {
    throw new Error('Config "cache" must be false, true, or a string path')
  }

  // Validate preprocessors
  if (config.preprocessors && config.preprocessors.length > 0) {
    const sizeNames = new Set(config.sizes.map(s => s.name).filter(Boolean))
    config.preprocessors = validatePreprocessors(config.preprocessors, sizeNames)
  } else {
    config.preprocessors = []
  }

  if (config.format !== false) {
    const fmts = Array.isArray(config.format)
      ? config.format
      : typeof config.format === 'string'
        ? [config.format]
        : null
    if (fmts === null) {
      throw new Error('Config "format" must be false, a format string, or an array of format strings')
    }
    for (const f of fmts) {
      if (f === 'smart') continue
      if (!SUPPORTED_FORMATS.has(f)) {
        throw new Error(`Unsupported format: "${f}"`)
      }
    }
  }

  return config
}

export function configHash(config) {
  const hashable = {
    sizes: config.sizes,
    format: config.format,
    quality: config.quality,
    skipOriginal: config.skipOriginal,
    preprocessors: config.preprocessors
  }
  return crypto.createHash('md5').update(JSON.stringify(hashable)).digest('hex')
}
