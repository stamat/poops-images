import { describe, it, expect, beforeAll, afterAll } from '@jest/globals'
import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import ImageProcessor from '../lib/processor.js'
import { validatePreprocessor, validatePreprocessors, applyOperations, VALID_OPERATIONS } from '../lib/preprocess.js'
import { validateConfig, configHash } from '../lib/config.js'

const FIXTURES_DIR = path.join(import.meta.dirname, 'fixtures')
const TEST_INPUT = path.join(FIXTURES_DIR, 'preprocess-input')
const TEST_OUTPUT = path.join(FIXTURES_DIR, 'preprocess-output')

async function createTestImage(filename, width, height, color = { r: 255, g: 0, b: 0 }) {
  const dir = path.dirname(path.join(TEST_INPUT, filename))
  fs.mkdirSync(dir, { recursive: true })
  await sharp({
    create: { width, height, channels: 3, background: color }
  }).jpeg({ quality: 90 }).toFile(path.join(TEST_INPUT, filename))
}

function cleanup(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

describe('validatePreprocessor', () => {
  it('should accept a valid preprocessor', () => {
    const result = validatePreprocessor({
      name: 'blurred',
      operations: [{ type: 'blur', sigma: 20 }]
    })
    expect(result.name).toBe('blurred')
    expect(result.operations).toHaveLength(1)
    expect(result.sizes).toBeNull()
    expect(result.format).toBeNull()
    expect(result.quality).toBeNull()
    expect(result.skipOriginal).toBeNull()
  })

  it('should accept preprocessor with overrides', () => {
    const result = validatePreprocessor({
      name: 'lqip',
      operations: [{ type: 'blur', sigma: 30 }],
      sizes: [{ width: 32 }],
      skipOriginal: true,
      format: 'webp',
      quality: 50
    })
    expect(result.sizes).toEqual([{ width: 32 }])
    expect(result.skipOriginal).toBe(true)
    expect(result.format).toBe('webp')
    expect(result.quality).toBe(50)
  })

  it('should throw for missing name', () => {
    expect(() => validatePreprocessor({ operations: [{ type: 'blur', sigma: 5 }] }))
      .toThrow('"name" is required')
  })

  it('should throw for invalid name characters', () => {
    expect(() => validatePreprocessor({ name: 'has spaces', operations: [{ type: 'blur', sigma: 5 }] }))
      .toThrow('must contain only letters')
  })

  it('should throw for empty operations', () => {
    expect(() => validatePreprocessor({ name: 'test', operations: [] }))
      .toThrow('non-empty array')
  })

  it('should throw for unknown operation type', () => {
    expect(() => validatePreprocessor({ name: 'test', operations: [{ type: 'vaporize' }] }))
      .toThrow('unknown operation type "vaporize"')
  })
})

describe('validatePreprocessors', () => {
  it('should accept an array of valid preprocessors', () => {
    const result = validatePreprocessors([
      { name: 'blurred', operations: [{ type: 'blur', sigma: 10 }] },
      { name: 'gray', operations: [{ type: 'grayscale' }] }
    ])
    expect(result).toHaveLength(2)
  })

  it('should throw for duplicate names', () => {
    expect(() => validatePreprocessors([
      { name: 'blurred', operations: [{ type: 'blur', sigma: 10 }] },
      { name: 'blurred', operations: [{ type: 'grayscale' }] }
    ])).toThrow('Duplicate preprocessor name')
  })

  it('should throw for name conflicting with size name', () => {
    const sizeNames = new Set(['thumb'])
    expect(() => validatePreprocessors(
      [{ name: 'thumb', operations: [{ type: 'blur', sigma: 10 }] }],
      sizeNames
    )).toThrow('conflicts with a size name')
  })
})

describe('applyOperations', () => {
  const testImagePath = path.join(TEST_INPUT, 'ops-test.jpg')

  beforeAll(async () => {
    cleanup(TEST_INPUT)
    await createTestImage('ops-test.jpg', 200, 150)
  })

  afterAll(() => {
    cleanup(TEST_INPUT)
  })

  it('should apply blur operation', async () => {
    const result = await applyOperations(testImagePath, [{ type: 'blur', sigma: 5 }])
    expect(result.data).toBeInstanceOf(Buffer)
    expect(result.info.width).toBe(200)
    expect(result.info.height).toBe(150)
  })

  it('should apply grayscale operation', async () => {
    const result = await applyOperations(testImagePath, [{ type: 'grayscale' }])
    expect(result.data).toBeInstanceOf(Buffer)
  })

  it('should chain multiple operations', async () => {
    const result = await applyOperations(testImagePath, [
      { type: 'grayscale' },
      { type: 'blur', sigma: 3 }
    ])
    expect(result.data).toBeInstanceOf(Buffer)
    expect(result.info.width).toBe(200)
  })

  it('should apply negate operation', async () => {
    const result = await applyOperations(testImagePath, [{ type: 'negate' }])
    expect(result.data).toBeInstanceOf(Buffer)
  })

  it('should apply flip operation', async () => {
    const result = await applyOperations(testImagePath, [{ type: 'flip' }])
    expect(result.data).toBeInstanceOf(Buffer)
  })

  it('should apply flop operation', async () => {
    const result = await applyOperations(testImagePath, [{ type: 'flop' }])
    expect(result.data).toBeInstanceOf(Buffer)
  })

  it('should apply modulate operation', async () => {
    const result = await applyOperations(testImagePath, [
      { type: 'modulate', brightness: 1.2, saturation: 0.5 }
    ])
    expect(result.data).toBeInstanceOf(Buffer)
  })

  it('should apply normalize operation', async () => {
    const result = await applyOperations(testImagePath, [{ type: 'normalize' }])
    expect(result.data).toBeInstanceOf(Buffer)
  })

  it('should apply gamma operation', async () => {
    const result = await applyOperations(testImagePath, [{ type: 'gamma', value: 2.2 }])
    expect(result.data).toBeInstanceOf(Buffer)
  })

  it('should apply rotate operation', async () => {
    const result = await applyOperations(testImagePath, [{ type: 'rotate', angle: 90 }])
    expect(result.data).toBeInstanceOf(Buffer)
    // 200x150 rotated 90° → 150x200
    expect(result.info.width).toBe(150)
    expect(result.info.height).toBe(200)
  })
})

describe('config integration', () => {
  it('should default preprocessors to empty array', () => {
    const config = validateConfig({ in: 'src', out: 'dist', sizes: [{ width: 100 }] })
    expect(config.preprocessors).toEqual([])
  })

  it('should validate preprocessors in config', () => {
    const config = validateConfig({
      in: 'src', out: 'dist',
      sizes: [{ width: 100 }],
      preprocessors: [
        { name: 'blurred', operations: [{ type: 'blur', sigma: 10 }] }
      ]
    })
    expect(config.preprocessors).toHaveLength(1)
    expect(config.preprocessors[0].name).toBe('blurred')
  })

  it('should include preprocessors in configHash', () => {
    const config1 = validateConfig({
      in: 'src', out: 'dist', sizes: [{ width: 100 }]
    })
    const config2 = validateConfig({
      in: 'src', out: 'dist', sizes: [{ width: 100 }],
      preprocessors: [{ name: 'blurred', operations: [{ type: 'blur', sigma: 10 }] }]
    })
    expect(configHash(config1)).not.toBe(configHash(config2))
  })
})

describe('ImageProcessor with preprocessors', () => {
  beforeAll(async () => {
    cleanup(TEST_INPUT)
    cleanup(TEST_OUTPUT)
    await createTestImage('photo.jpg', 800, 600)
  })

  afterAll(() => {
    cleanup(TEST_INPUT)
    cleanup(TEST_OUTPUT)
  })

  it('should generate preprocessed variants with correct naming', async () => {
    const processor = new ImageProcessor({
      in: TEST_INPUT,
      out: TEST_OUTPUT,
      sizes: [{ name: 'small', width: 300 }],
      preprocessors: [
        { name: 'blurred', operations: [{ type: 'blur', sigma: 10 }] }
      ]
    })

    cleanup(TEST_OUTPUT)
    await processor.processAll({ force: true })

    const files = fs.readdirSync(TEST_OUTPUT)

    // Original pipeline outputs
    expect(files).toContain('photo.jpg')
    expect(files.some(f => f.match(/^photo-small-300w\.jpg$/))).toBe(true)

    // Preprocessed outputs
    expect(files).toContain('photo-blurred.jpg')
    expect(files.some(f => f.match(/^photo-blurred-small-300w\.jpg$/))).toBe(true)
  })

  it('should produce different pixel data for preprocessed variants', async () => {
    const processor = new ImageProcessor({
      in: TEST_INPUT,
      out: TEST_OUTPUT,
      sizes: [],
      preprocessors: [
        { name: 'gray', operations: [{ type: 'grayscale' }] }
      ]
    })

    cleanup(TEST_OUTPUT)
    await processor.processAll({ force: true })

    const original = fs.readFileSync(path.join(TEST_OUTPUT, 'photo.jpg'))
    const gray = fs.readFileSync(path.join(TEST_OUTPUT, 'photo-gray.jpg'))

    // Files should be different (grayscale vs color)
    expect(Buffer.compare(original, gray)).not.toBe(0)
  })

  it('should support multiple preprocessors', async () => {
    const processor = new ImageProcessor({
      in: TEST_INPUT,
      out: TEST_OUTPUT,
      sizes: [{ name: 'small', width: 300 }],
      preprocessors: [
        { name: 'blurred', operations: [{ type: 'blur', sigma: 10 }] },
        { name: 'gray', operations: [{ type: 'grayscale' }] }
      ]
    })

    cleanup(TEST_OUTPUT)
    await processor.processAll({ force: true })

    const files = fs.readdirSync(TEST_OUTPUT)

    // Both preprocessors should produce outputs
    expect(files.some(f => f.startsWith('photo-blurred'))).toBe(true)
    expect(files.some(f => f.startsWith('photo-gray'))).toBe(true)
  })

  it('should respect preprocessor skipOriginal override', async () => {
    const processor = new ImageProcessor({
      in: TEST_INPUT,
      out: TEST_OUTPUT,
      sizes: [{ name: 'small', width: 300 }],
      preprocessors: [
        {
          name: 'blurred',
          operations: [{ type: 'blur', sigma: 10 }],
          skipOriginal: true
        }
      ]
    })

    cleanup(TEST_OUTPUT)
    await processor.processAll({ force: true })

    const files = fs.readdirSync(TEST_OUTPUT)

    // Original pipeline should still have passthrough
    expect(files).toContain('photo.jpg')

    // Preprocessed should NOT have passthrough (skipOriginal)
    expect(files).not.toContain('photo-blurred.jpg')
    // But should have the sized variant
    expect(files.some(f => f.match(/^photo-blurred-small-300w\.jpg$/))).toBe(true)
  })

  it('should respect preprocessor sizes override', async () => {
    const processor = new ImageProcessor({
      in: TEST_INPUT,
      out: TEST_OUTPUT,
      sizes: [
        { name: 'small', width: 300 },
        { name: 'medium', width: 600 }
      ],
      preprocessors: [
        {
          name: 'lqip',
          operations: [{ type: 'blur', sigma: 20 }],
          sizes: [{ width: 32 }],
          skipOriginal: true
        }
      ]
    })

    cleanup(TEST_OUTPUT)
    await processor.processAll({ force: true })

    const files = fs.readdirSync(TEST_OUTPUT)

    // Original pipeline should have both sizes
    expect(files.some(f => f.match(/^photo-small-300w\.jpg$/))).toBe(true)
    expect(files.some(f => f.match(/^photo-medium-600w\.jpg$/))).toBe(true)

    // LQIP should only have the 32w variant
    const lqipFiles = files.filter(f => f.startsWith('photo-lqip'))
    expect(lqipFiles).toHaveLength(1)
    expect(lqipFiles[0]).toMatch(/^photo-lqip-32w\.jpg$/)
  })

  it('should respect preprocessor format override', async () => {
    const processor = new ImageProcessor({
      in: TEST_INPUT,
      out: TEST_OUTPUT,
      sizes: [],
      preprocessors: [
        {
          name: 'webp-only',
          operations: [{ type: 'grayscale' }],
          format: 'webp'
        }
      ]
    })

    cleanup(TEST_OUTPUT)
    await processor.processAll({ force: true })

    const files = fs.readdirSync(TEST_OUTPUT)

    // Original pipeline: default format (jpg)
    expect(files).toContain('photo.jpg')

    // Preprocessed: webp format
    expect(files).toContain('photo-webp-only.webp')
    expect(files).not.toContain('photo-webp-only.jpg')
  })

  it('should chain multiple operations in a preprocessor', async () => {
    const processor = new ImageProcessor({
      in: TEST_INPUT,
      out: TEST_OUTPUT,
      sizes: [],
      preprocessors: [
        {
          name: 'combo',
          operations: [
            { type: 'grayscale' },
            { type: 'blur', sigma: 5 }
          ]
        }
      ]
    })

    cleanup(TEST_OUTPUT)
    await processor.processAll({ force: true })

    const files = fs.readdirSync(TEST_OUTPUT)
    expect(files).toContain('photo-combo.jpg')
  })

  it('should count preprocessed variants in stats', async () => {
    const processor = new ImageProcessor({
      in: TEST_INPUT,
      out: TEST_OUTPUT,
      sizes: [{ name: 'small', width: 300 }],
      preprocessors: [
        { name: 'blurred', operations: [{ type: 'blur', sigma: 10 }] }
      ]
    })

    cleanup(TEST_OUTPUT)
    await processor.processAll({ force: true })
    const stats = processor.getStats()

    // 1 image × (2 original variants + 2 preprocessed variants) = 4 total
    expect(stats.variants).toBe(4)
  })

  it('should clean up stale preprocessed outputs when preprocessor is removed', async () => {
    // First run with preprocessor
    const processor1 = new ImageProcessor({
      in: TEST_INPUT,
      out: TEST_OUTPUT,
      sizes: [],
      preprocessors: [
        { name: 'blurred', operations: [{ type: 'blur', sigma: 10 }] }
      ]
    })

    cleanup(TEST_OUTPUT)
    await processor1.processAll({ force: true })

    let files = fs.readdirSync(TEST_OUTPUT)
    expect(files).toContain('photo-blurred.jpg')

    // Second run without preprocessor — config hash changes, so force reprocess
    const processor2 = new ImageProcessor({
      in: TEST_INPUT,
      out: TEST_OUTPUT,
      sizes: [],
      preprocessors: []
    })

    await processor2.processAll({ force: true })

    files = fs.readdirSync(TEST_OUTPUT).filter(f => !f.startsWith('.'))
    expect(files).toContain('photo.jpg')
    expect(files).not.toContain('photo-blurred.jpg')
  })
})

describe('VALID_OPERATIONS', () => {
  it('should export all supported operation types', () => {
    expect(VALID_OPERATIONS).toContain('blur')
    expect(VALID_OPERATIONS).toContain('grayscale')
    expect(VALID_OPERATIONS).toContain('sharpen')
    expect(VALID_OPERATIONS).toContain('tint')
    expect(VALID_OPERATIONS).toContain('modulate')
    expect(VALID_OPERATIONS).toContain('negate')
    expect(VALID_OPERATIONS).toContain('normalize')
    expect(VALID_OPERATIONS).toContain('rotate')
    expect(VALID_OPERATIONS).toContain('flip')
    expect(VALID_OPERATIONS).toContain('flop')
    expect(VALID_OPERATIONS).toContain('gamma')
    expect(VALID_OPERATIONS).toContain('composite')
  })
})
