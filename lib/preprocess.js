import path from 'node:path'
import fs from 'node:fs'
import sharp from 'sharp'

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

// Cache for loaded custom handler modules
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

  if (handlerCache.has(resolved)) return handlerCache.get(resolved)

  if (!fs.existsSync(resolved)) {
    throw new Error(`Custom handler not found: ${resolved}`)
  }

  const mod = await import(resolved)
  const fn = mod.default || mod

  if (typeof fn !== 'function') {
    throw new Error(`Custom handler must export a function: ${resolved}`)
  }

  handlerCache.set(resolved, fn)
  return fn
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
    svg: !!preprocessor.svg
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

export async function applyOperations(inputPath, operations, configDir) {
  // Auto-rotate for EXIF only when no explicit rotate operation is present
  const hasExplicitRotate = operations.some(op => op.type === 'rotate')
  let pipeline = hasExplicitRotate ? sharp(inputPath) : sharp(inputPath).rotate()
  const sidecars = []

  for (const op of operations) {
    if (OPERATION_REGISTRY[op.type]) {
      const registryHandler = OPERATION_REGISTRY[op.type]
      pipeline = registryHandler(pipeline, op, configDir)
    } else {
      // Treat type as a handler — flush pipeline to buffer, call handler, create new pipeline
      const buf = await pipeline.toBuffer()
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

  const output = await pipeline.toBuffer({ resolveWithObject: true })
  output.sidecars = sidecars
  return output
}
