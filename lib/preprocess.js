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
    if (!OPERATION_REGISTRY[op.type]) {
      throw new Error(`Preprocessor "${preprocessor.name}": unknown operation type "${op.type}". Valid types: ${VALID_OPERATIONS.join(', ')}`)
    }
  }

  return {
    name: preprocessor.name,
    operations: preprocessor.operations,
    sizes: preprocessor.sizes || null,
    format: preprocessor.format !== undefined ? preprocessor.format : null,
    quality: preprocessor.quality !== undefined ? preprocessor.quality : null,
    skipOriginal: preprocessor.skipOriginal !== undefined ? preprocessor.skipOriginal : null
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

  for (const op of operations) {
    const handler = OPERATION_REGISTRY[op.type]
    pipeline = handler(pipeline, op, configDir)
  }

  return pipeline.toBuffer({ resolveWithObject: true })
}
