import { describe, it, expect, beforeAll, afterAll } from '@jest/globals'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import sharp from 'sharp'
import ImageProcessor from '../lib/processor.js'
import { validatePreprocessor } from '../lib/preprocess.js'
import { loadConfig } from '../lib/config.js'

const BLISS_PATH = path.join(import.meta.dirname, 'fixtures', 'bliss.jpg')
const FIXTURES_DIR = path.join(import.meta.dirname, 'fixtures')
const TEST_INPUT = path.join(FIXTURES_DIR, 'regressions-input')
const TEST_OUTPUT = path.join(FIXTURES_DIR, 'regressions-output')

// Echo handler: passes the image through and emits a sidecar recording the
// width it received — proves at what stage of the pipeline it ran.
const ECHO_HANDLER = path.join(FIXTURES_DIR, 'echo-handler.js')

function cleanup(dir) {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
}

async function meta(file) {
  return sharp(path.join(TEST_OUTPUT, file)).metadata()
}

function outputs() {
  return fs.existsSync(TEST_OUTPUT) ? fs.readdirSync(TEST_OUTPUT) : []
}

beforeAll(() => {
  cleanup(TEST_INPUT)
  fs.mkdirSync(TEST_INPUT, { recursive: true })
  fs.copyFileSync(BLISS_PATH, path.join(TEST_INPUT, 'bliss.jpg'))
  fs.writeFileSync(ECHO_HANDLER, `export default async function (buffer, params) {
  return { buffer, sidecars: [{ ext: 'txt', data: Buffer.from(String(params.width)) }] }
}
`)
})

afterAll(() => {
  cleanup(TEST_INPUT)
  cleanup(TEST_OUTPUT)
  fs.rmSync(ECHO_HANDLER, { force: true })
})

describe('resizeFirst validation', () => {
  const base = { name: 'x', operations: [{ type: 'grayscale' }] }

  it.each([
    ['string', 'yes'],
    ['number', 5],
    ['empty object', {}],
    ['object with only invalid crop', { crop: 'weird' }],
    ['negative width', { width: -5 }],
    ['string width', { width: '400' }]
  ])('rejects garbage: %s', (_label, bad) => {
    expect(() => validatePreprocessor({ ...base, resizeFirst: bad })).toThrow()
  })

  it.each([
    ['absent', undefined],
    ['false', false],
    ['true', true],
    ['width only', { width: 400 }],
    ['height only', { height: 300 }],
    ['width + crop true', { width: 400, crop: true }],
    ['width + crop array', { width: 400, height: 300, crop: ['left', 'top'] }]
  ])('accepts valid form: %s', (_label, good) => {
    expect(() => validatePreprocessor({ ...base, resizeFirst: good })).not.toThrow()
  })

  it('is idempotent — config is validated twice (loadConfig + processor constructor)', () => {
    const once = validatePreprocessor({ ...base, resizeFirst: { width: 1024 } })
    const twice = validatePreprocessor(once)
    expect(twice.resizeFirst).toEqual(once.resizeFirst)
  })
})

describe('configDir — handler resolution relative to config file (README §custom handlers)', () => {
  it('loadConfig records the config file directory', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'poops-configdir-'))
    const configPath = path.join(dir, 'poops-images.json')
    fs.writeFileSync(configPath, JSON.stringify({ in: 'in', out: 'out', sizes: [{ width: 300 }] }))
    const config = loadConfig(configPath)
    expect(config.configDir).toBe(dir)
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  })

  it('resolves short-name handlers from configDir, not process.cwd()', async() => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'poops-configdir-'))
    fs.mkdirSync(path.join(dir, 'handlers'))
    // ESM handler needs a module scope of its own outside this package
    fs.writeFileSync(path.join(dir, 'package.json'), '{"type":"module"}')
    fs.copyFileSync(ECHO_HANDLER, path.join(dir, 'handlers', 'echotest.js'))

    cleanup(TEST_OUTPUT)
    const processor = new ImageProcessor({
      in: TEST_INPUT,
      out: TEST_OUTPUT,
      sizes: [{ width: 300 }],
      skipOriginal: true,
      cache: false,
      configDir: dir,
      preprocessors: [{ name: 'custom', operations: [{ type: 'echotest' }] }]
    })
    await processor.processAll({ force: true })

    // Handler lives only under the config dir — output exists only if resolution honors configDir
    expect(outputs()).toContain('bliss-custom-300w.jpg')
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  })
})

describe('resizeFirst — no upscaling past the base (README: "Images are never upscaled")', () => {
  it('object form must not upscale crop sizes beyond the base buffer', async() => {
    cleanup(TEST_OUTPUT)
    const processor = new ImageProcessor({
      in: TEST_INPUT,
      out: TEST_OUTPUT,
      sizes: [{ name: 'big', width: 800, height: 600, crop: true }],
      skipOriginal: true,
      cache: false,
      preprocessors: [{
        name: 'gray',
        operations: [{ type: 'grayscale' }],
        resizeFirst: { width: 400 }
      }]
    })
    await processor.processAll({ force: true })

    const files = outputs()
    // Control: original pipeline is unaffected by resizeFirst — 800x600 from 4400x3300 is legit.
    // `big` is the sole (largest) member of its named group, so it drops the width suffix.
    expect(files).toContain('bliss-big.jpg')

    // Preprocessed variants come from a 400x300 base — none may exceed it
    const grayFiles = files.filter(f => f.includes('-gray-'))
    for (const f of grayFiles) {
      const m = await meta(f)
      expect(m.width).toBeLessThanOrEqual(400)
      expect(m.height).toBeLessThanOrEqual(300)
    }
  })
})

describe('resizeFirst — operation ordering (locks behavior through refactors)', () => {
  async function sidecarWidth(resizeFirst) {
    cleanup(TEST_OUTPUT)
    const processor = new ImageProcessor({
      in: TEST_INPUT,
      out: TEST_OUTPUT,
      sizes: [{ width: 300 }],
      skipOriginal: true,
      cache: false,
      preprocessors: [{
        name: 'echo',
        operations: [{ type: '__tests__/fixtures/echo-handler.js' }],
        ...(resizeFirst !== undefined ? { resizeFirst } : {})
      }]
    })
    await processor.processAll({ force: true })
    const sidecar = path.join(TEST_OUTPUT, 'bliss-echo.txt')
    expect(fs.existsSync(sidecar)).toBe(true)
    return Number(fs.readFileSync(sidecar, 'utf-8'))
  }

  it('default: operations run on the full-size source', async() => {
    expect(await sidecarWidth(undefined)).toBe(4400)
  })

  it('resizeFirst: true — operations run on each already-resized variant', async() => {
    expect(await sidecarWidth(true)).toBe(300)
  })

  it('resizeFirst: {width} — operations run once on the resized base', async() => {
    expect(await sidecarWidth({ width: 400 })).toBe(400)
  })
})

describe('per-preprocessor smart format — transparency detection', () => {
  it('detects transparency when only a preprocessor uses smart', async() => {
    const { analyzeImage } = await import('../lib/analyze.js')
    const input = path.join(TEST_INPUT, 'transparent.png')
    await sharp({ create: { width: 100, height: 100, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 0.5 } } })
      .png()
      .toFile(input)

    const config = {
      in: TEST_INPUT,
      sizes: [],
      skipOriginal: false,
      format: 'webp', // global format has no smart — pre-fix this skipped the check
      preprocessors: [{ name: 'pp', operations: [{ type: 'grayscale' }], format: 'smart' }]
    }
    const job = await analyzeImage(input, config, fs.statSync(input))
    // smart needs transparency info or it flattens alpha to jpg
    expect(job.transparent).toBe(true)
  })
})

describe('_resizeToBase crop clamp keeps aspect ratio', () => {
  it('clamps proportionally when the crop target exceeds the source', async() => {
    const input = path.join(TEST_INPUT, 'clamp-src.jpg')
    await sharp({ create: { width: 200, height: 150, channels: 3, background: '#456' } })
      .jpeg()
      .toFile(input)

    const processor = new ImageProcessor({
      in: TEST_INPUT, out: TEST_OUTPUT, sizes: [{ width: 100 }], cache: false
    })
    // 400x100 crop (4:1) from a 200x150 source — independent clamping would
    // produce 200x100 (2:1); proportional clamping keeps 4:1 → 200x50
    const base = await processor._resizeToBase(input, { width: 400, height: 100, crop: true }, {
      sourceWidth: 200, sourceHeight: 150
    })
    expect(base.info.width).toBe(200)
    expect(base.info.height).toBe(50)
  })
})

describe('no intermediate lossy encode (single generation loss)', () => {
  it('output quality matches a single-pass encode', async() => {
    cleanup(TEST_OUTPUT)
    const processor = new ImageProcessor({
      in: TEST_INPUT,
      out: TEST_OUTPUT,
      sizes: [{ width: 300 }],
      skipOriginal: true,
      cache: false,
      format: 'webp'
    })
    await processor.processAll({ force: true })

    const rs = { width: 300, fit: 'inside', withoutEnlargement: true }
    const src = path.join(TEST_INPUT, 'bliss.jpg')

    // Ground truth: decode once, resize, raw pixels
    const truth = await sharp(src).rotate().resize(rs).raw().toBuffer()
    // Reference: correct single-pass encode at the same quality the processor uses (webp default 80)
    const reference = await sharp(src).rotate().resize(rs).webp({ quality: 80 }).toBuffer()

    const mae = async(buf) => {
      const raw = await sharp(buf).raw().toBuffer()
      expect(raw.length).toBe(truth.length)
      let sum = 0
      for (let i = 0; i < raw.length; i++) sum += Math.abs(raw[i] - truth[i])
      return sum / raw.length
    }

    const outBuf = fs.readFileSync(path.join(TEST_OUTPUT, 'bliss-300w.webp'))
    const maeOut = await mae(outBuf)
    const maeRef = await mae(reference)

    // A hidden intermediate encode adds a full extra generation of loss (~15% more error).
    // Allow 5% headroom for encoder nondeterminism; the bug overshoots this by far.
    expect(maeOut).toBeLessThanOrEqual(maeRef * 1.05)
  })
})
