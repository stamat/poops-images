import path from 'node:path'
import fs from 'node:fs'
import { pathToFileURL } from 'node:url'
import sharp from 'sharp'
import { validateSize } from './sizes.js'

const OPERATION_REGISTRY = {
  blur: (pipeline, params) => {
    if (params.sigma == null) throw new Error('blur requires "sigma" parameter')
    if (typeof params.sigma !== 'number' || params.sigma < 0.3 || params.sigma > 1000) {
      throw new Error('blur "sigma" must be a number between 0.3 and 1000')
    }
    return pipeline.blur(params.sigma)
  },

  grayscale: (pipeline) => pipeline.grayscale(),

  sharpen: (pipeline, params) => {
    const opts = {}
    if (params.sigma != null) opts.sigma = params.sigma
    return pipeline.sharpen(opts)
  },

  tint: (pipeline, params) => {
    if (!params.color) throw new Error('tint requires "color" parameter')
    return pipeline.tint(params.color)
  },

  modulate: (pipeline, params) => {
    const opts = {}
    if (params.brightness != null) opts.brightness = params.brightness
    if (params.saturation != null) opts.saturation = params.saturation
    if (params.hue != null) opts.hue = params.hue
    if (params.lightness != null) opts.lightness = params.lightness
    return pipeline.modulate(opts)
  },

  negate: (pipeline) => pipeline.negate(),

  normalize: (pipeline) => pipeline.normalize(),

  rotate: (pipeline, params) => {
    if (params.angle == null) throw new Error('rotate requires "angle" parameter')
    return pipeline.rotate(params.angle)
  },

  flip: (pipeline) => pipeline.flip(),

  flop: (pipeline) => pipeline.flop(),

  gamma: (pipeline, params) => {
    if (params.value == null) throw new Error('gamma requires "value" parameter')
    return pipeline.gamma(params.value)
  },

  composite: (pipeline, params, configDir) => {
    if (!params.input) throw new Error('composite requires "input" parameter')

    const overlayPath = path.resolve(configDir || process.cwd(), params.input)
    if (!fs.existsSync(overlayPath)) {
      throw new Error(`composite overlay not found: ${overlayPath}`)
    }

    const compositeOpts = { input: overlayPath }
    if (params.gravity) compositeOpts.gravity = params.gravity
    if (params.blend) compositeOpts.blend = params.blend
    if (params.top != null) compositeOpts.top = params.top
    if (params.left != null) compositeOpts.left = params.left

    return pipeline.composite([compositeOpts])
  }
}

export const VALID_OPERATIONS = Object.keys(OPERATION_REGISTRY)

// Cache for loaded custom handler modules, keyed by path + mtime so an edited
// handler is re-imported on the next run (watch mode) without a restart
const handlerCache = new Map()

function resolveHandlerPath(name, configDir) {
  const base = configDir || process.cwd()

  // If name looks like a path (contains / or .), resolve directly
  if (name.includes('/') || name.includes('.')) {
    return path.resolve(base, name)
  }

  // Otherwise, look for handlers/{name}.js in the config directory
  return path.resolve(base, 'handlers', `${name}.js`)
}

async function loadHandler(name, configDir) {
  const resolved = resolveHandlerPath(name, configDir)

  if (!fs.existsSync(resolved)) {
    throw new Error(`Custom handler not found: ${resolved}`)
  }

  // import() caches by URL for the process lifetime, so key both the local
  // cache and the import URL by mtime — an edited handler loads fresh
  const mtime = fs.statSync(resolved).mtimeMs
  const key = `${resolved}:${mtime}`
  if (handlerCache.has(key)) return handlerCache.get(key)

  const mod = await import(`${pathToFileURL(resolved).href}?v=${mtime}`)
  const fn = mod.default || mod

  if (typeof fn !== 'function') {
    throw new Error(`Custom handler must export a function: ${resolved}`)
  }

  handlerCache.set(key, fn)
  return fn
}

function validateResizeFirst(value, name) {
  if (value == null || value === false) return false
  if (value === true) return true

  if (typeof value === 'object' && !Array.isArray(value)) {
    const hasWidth = typeof value.width === 'number' && value.width > 0
    const hasHeight = typeof value.height === 'number' && value.height > 0
    if ((value.width !== undefined && !hasWidth) ||
        (value.height !== undefined && !hasHeight) ||
        (!hasWidth && !hasHeight)) {
      throw new Error(`Preprocessor "${name}": "resizeFirst" object requires a positive numeric "width" and/or "height"`)
    }
    // Reuse size validation for crop rules
    const validated = validateSize({ width: value.width || 0, height: value.height || 0, crop: value.crop })
    return { width: validated.width, height: validated.height, crop: validated.crop }
  }

  throw new Error(`Preprocessor "${name}": "resizeFirst" must be true or an object like { width, height, crop }`)
}

export function validatePreprocessor(preprocessor) {
  if (!preprocessor || typeof preprocessor !== 'object') {
    throw new Error('Preprocessor must be an object')
  }

  if (!preprocessor.name || typeof preprocessor.name !== 'string') {
    throw new Error('Preprocessor "name" is required and must be a non-empty string')
  }

  if (!/^[a-zA-Z0-9_-]+$/.test(preprocessor.name)) {
    throw new Error(`Preprocessor name "${preprocessor.name}" must contain only letters, numbers, hyphens, and underscores`)
  }

  if (!Array.isArray(preprocessor.operations) || preprocessor.operations.length === 0) {
    throw new Error(`Preprocessor "${preprocessor.name}": "operations" must be a non-empty array`)
  }

  for (const op of preprocessor.operations) {
    if (!op.type || typeof op.type !== 'string') {
      throw new Error(`Preprocessor "${preprocessor.name}": each operation must have a "type" string`)
    }
  }

  return {
    name: preprocessor.name,
    operations: preprocessor.operations,
    sizes: preprocessor.sizes || null,
    format: preprocessor.format !== undefined ? preprocessor.format : null,
    quality: preprocessor.quality !== undefined ? preprocessor.quality : null,
    skipOriginal: preprocessor.skipOriginal !== undefined ? preprocessor.skipOriginal : null,
    svg: !!preprocessor.svg,
    resizeFirst: validateResizeFirst(preprocessor.resizeFirst, preprocessor.name)
  }
}

export function validatePreprocessors(preprocessors, sizeNames) {
  if (!Array.isArray(preprocessors)) {
    throw new Error('Config "preprocessors" must be an array')
  }

  const names = new Set()
  const validated = []

  for (const pp of preprocessors) {
    const result = validatePreprocessor(pp)

    if (names.has(result.name)) {
      throw new Error(`Duplicate preprocessor name: "${result.name}"`)
    }

    if (sizeNames && sizeNames.has(result.name)) {
      throw new Error(`Preprocessor name "${result.name}" conflicts with a size name`)
    }

    names.add(result.name)
    validated.push(result)
  }

  return validated
}

export async function applyOperations(input, operations, configDir, rawInfo = null) {
  // Auto-rotate for EXIF only when input is a file path and no explicit rotate operation
  const isBuffer = Buffer.isBuffer(input)
  const hasExplicitRotate = operations.some(op => op.type === 'rotate')
  // rawInfo = { width, height, channels } when input is a raw pixel buffer
  const create = () => rawInfo ? sharp(input, { raw: rawInfo }) : sharp(input)
  let pipeline = (!isBuffer && !hasExplicitRotate) ? create().rotate() : create()
  const sidecars = []

  for (const op of operations) {
    if (OPERATION_REGISTRY[op.type]) {
      const registryHandler = OPERATION_REGISTRY[op.type]
      pipeline = registryHandler(pipeline, op, configDir)
    } else {
      // Treat type as a handler — flush pipeline to buffer, call handler, create new pipeline.
      // Flush as fast lossless PNG: flushing in the source format would re-encode lossily.
      const buf = await pipeline.png({ compressionLevel: 0 }).toBuffer()
      const meta = await sharp(buf).metadata()
      const handler = await loadHandler(op.type, configDir)

      // Extract params (everything except type)
      const { type: _type, ...params } = op
      const result = await handler(buf, { ...params, width: meta.width, height: meta.height }, sharp)

      // Handlers can return Buffer or { buffer, sidecars: [{ ext, data }] }
      if (Buffer.isBuffer(result)) {
        pipeline = sharp(result)
      } else if (result && Buffer.isBuffer(result.buffer)) {
        pipeline = sharp(result.buffer)
        if (Array.isArray(result.sidecars)) {
          sidecars.push(...result.sidecars)
        }
      } else {
        throw new Error(`Custom handler "${op.type}" must return a Buffer or { buffer, sidecars }`)
      }
    }
  }

  // Fast lossless PNG — the final encode (format + quality) happens downstream;
  // flushing in the source format here would add a hidden generation of loss.
  const output = await pipeline.png({ compressionLevel: 0 }).toBuffer({ resolveWithObject: true })
  output.sidecars = sidecars
  return output
}
