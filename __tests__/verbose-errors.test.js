// Covers error accounting (stats.errors), refusal to overwrite a source with
// its own output, and verbose gating of per-file logs.
// Deliberately not covered: write failures (EACCES/ENOSPC) — not portable to
// simulate across the CI matrix; they route through the same containment as
// decode failures.
import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals'
import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import ImageProcessor from '../lib/processor.js'

const FIXTURES_DIR = path.join(import.meta.dirname, 'fixtures')
const TEST_INPUT = path.join(FIXTURES_DIR, 'verbose-input')
const TEST_OUTPUT = path.join(FIXTURES_DIR, 'verbose-output')

function cleanup(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  }
}

async function createImage(filename) {
  fs.mkdirSync(TEST_INPUT, { recursive: true })
  await sharp({ create: { width: 400, height: 300, channels: 3, background: { r: 0, g: 100, b: 200 } } })
    .jpeg({ quality: 90 }).toFile(path.join(TEST_INPUT, filename))
}

function createCorruptImage(filename) {
  fs.mkdirSync(TEST_INPUT, { recursive: true })
  // Valid extension so discovery picks it up, garbage bytes so sharp fails
  fs.writeFileSync(path.join(TEST_INPUT, filename), 'not a real image')
}

describe('error counting and verbose gating', () => {
  beforeAll(() => {
    cleanup(TEST_INPUT)
    cleanup(TEST_OUTPUT)
  })

  afterAll(() => {
    cleanup(TEST_INPUT)
    cleanup(TEST_OUTPUT)
  })

  it('counts a corrupt image as an error without throwing', async() => {
    cleanup(TEST_INPUT)
    cleanup(TEST_OUTPUT)
    await createImage('ok.jpg')
    createCorruptImage('broken.jpg')

    const processor = new ImageProcessor({
      in: TEST_INPUT, out: TEST_OUTPUT, sizes: [{ width: 200 }], cache: false
    })

    const stats = await processor.processAll({ force: true })
    expect(stats.errors).toBe(1)
    expect(stats.processed).toBe(1) // the good image still went through
  })

  it('an svg that svgo cannot parse is counted in stats.errors', async() => {
    cleanup(TEST_INPUT)
    cleanup(TEST_OUTPUT)
    await createImage('ok.jpg')
    fs.writeFileSync(path.join(TEST_INPUT, 'broken.svg'), 'this is <<< not an svg')

    const processor = new ImageProcessor({
      in: TEST_INPUT, out: TEST_OUTPUT, sizes: [{ width: 200 }], cache: false
    })

    const stats = await processor.processAll({ force: true })
    expect(stats.errors).toBe(1)
    expect(stats.processed).toBe(1)
  })

  it('a truncated image fails alone — the rest of the build still completes', async() => {
    cleanup(TEST_INPUT)
    cleanup(TEST_OUTPUT)
    await createImage('ok.jpg')
    // Valid header (metadata reads fine), truncated body (decode throws)
    const whole = await sharp({ create: { width: 400, height: 300, channels: 3, background: { r: 0, g: 100, b: 200 } } })
      .jpeg({ quality: 90 }).toBuffer()
    fs.writeFileSync(path.join(TEST_INPUT, 'truncated.jpg'), whole.subarray(0, Math.floor(whole.length / 3)))

    const processor = new ImageProcessor({
      in: TEST_INPUT, out: TEST_OUTPUT, sizes: [{ width: 200 }], cache: false
    })

    const stats = await processor.processAll({ force: true })
    expect(stats.errors).toBe(1)
    expect(stats.processed).toBe(1)
    expect(fs.existsSync(path.join(TEST_OUTPUT, 'ok-200w.jpg'))).toBe(true)
  })

  it('a decode failure leaves the previous run\'s outputs and cache entry alone', async() => {
    cleanup(TEST_INPUT)
    cleanup(TEST_OUTPUT)
    await createImage('photo.jpg')

    const config = { in: TEST_INPUT, out: TEST_OUTPUT, sizes: [{ width: 200 }] }
    const processor = new ImageProcessor(config)
    await processor.processAll({ force: true })
    expect(fs.existsSync(path.join(TEST_OUTPUT, 'photo-200w.jpg'))).toBe(true)

    // Same name, now truncated — the failed run must not delete good outputs
    const whole = await sharp({ create: { width: 400, height: 300, channels: 3, background: { r: 0, g: 100, b: 200 } } })
      .jpeg({ quality: 90 }).toBuffer()
    fs.writeFileSync(path.join(TEST_INPUT, 'photo.jpg'), whole.subarray(0, Math.floor(whole.length / 3)))

    const processor2 = new ImageProcessor(config)
    const stats = await processor2.processAll({ force: true })
    expect(stats.errors).toBe(1)
    // A failed decode must not delete the previous run's good outputs
    expect(fs.existsSync(path.join(TEST_OUTPUT, 'photo-200w.jpg'))).toBe(true)
  })

  async function createLoggingFixtures() {
    cleanup(TEST_INPUT)
    cleanup(TEST_OUTPUT)
    await createImage('ok.jpg')
    // Opaque png triggers the "Opaque PNG → JPEG:" normalization notice
    await sharp({ create: { width: 400, height: 300, channels: 3, background: { r: 50, g: 50, b: 50 } } })
      .png().toFile(path.join(TEST_INPUT, 'opaque.png'))
    fs.writeFileSync(path.join(TEST_INPUT, 'icon.svg'),
      '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"><rect width="4" height="4"/></svg>')
  }

  async function collectLogs(verbose) {
    const lines = []
    const spy = jest.spyOn(console, 'log').mockImplementation((msg) => lines.push(String(msg)))
    try {
      const processor = new ImageProcessor({
        in: TEST_INPUT, out: TEST_OUTPUT, sizes: [{ width: 200 }], cache: false, verbose
      })
      await processor.processAll({ force: true })
    } finally {
      spy.mockRestore()
    }
    return lines.join('\n')
  }

  it('suppresses per-file logs when verbose is false but keeps the summary', async() => {
    await createLoggingFixtures()
    const out = await collectLogs(false)
    expect(out).not.toMatch(/Processing:/)
    expect(out).not.toMatch(/Compiled:/)
    expect(out).not.toMatch(/Minified:/)
    expect(out).not.toMatch(/Opaque PNG/)
    expect(out).toMatch(/image\(s\)/) // summary line survives
  })

  it('verbose true still prints the per-file logs', async() => {
    await createLoggingFixtures()
    const out = await collectLogs(true)
    expect(out).toMatch(/Compiled:/)
    expect(out).toMatch(/Minified:/)
    expect(out).toMatch(/Opaque PNG/)
  })
})

describe('an output never overwrites its own source (in == out)', () => {
  const DIR = path.join(FIXTURES_DIR, 'inplace-input')
  const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10">\n  <rect width="10" height="10" fill="red"/>\n</svg>'

  beforeAll(() => cleanup(DIR))
  afterAll(() => cleanup(DIR))

  it('a conversion-only variant landing on its source is refused and counted', async() => {
    cleanup(DIR)
    fs.mkdirSync(DIR, { recursive: true })
    const jpg = await sharp({ create: { width: 400, height: 300, channels: 3, background: { r: 0, g: 100, b: 200 } } })
      .jpeg({ quality: 90 }).toBuffer()
    fs.writeFileSync(path.join(DIR, 'photo.jpg'), jpg)

    const processor = new ImageProcessor({ in: DIR, out: DIR, sizes: [], cache: false })
    const stats = await processor.processAll({ force: true })

    // The source must be byte-for-byte what it was — every run recompressing
    // it in place is compounding generation loss
    expect(fs.readFileSync(path.join(DIR, 'photo.jpg')).equals(jpg)).toBe(true)
    expect(stats.errors).toBe(1)
  })

  it('sized variants still get written next to the untouched source', async() => {
    cleanup(DIR)
    fs.mkdirSync(DIR, { recursive: true })
    const jpg = await sharp({ create: { width: 400, height: 300, channels: 3, background: { r: 0, g: 100, b: 200 } } })
      .jpeg({ quality: 90 }).toBuffer()
    fs.writeFileSync(path.join(DIR, 'photo.jpg'), jpg)

    const processor = new ImageProcessor({ in: DIR, out: DIR, sizes: [{ width: 200 }], cache: false })
    await processor.processAll({ force: true })

    expect(fs.readFileSync(path.join(DIR, 'photo.jpg')).equals(jpg)).toBe(true)
    expect(fs.existsSync(path.join(DIR, 'photo-200w.jpg'))).toBe(true)
  })

  it('an svg is not minified over itself', async() => {
    cleanup(DIR)
    fs.mkdirSync(DIR, { recursive: true })
    fs.writeFileSync(path.join(DIR, 'icon.svg'), SVG)

    const processor = new ImageProcessor({ in: DIR, out: DIR, sizes: [], cache: false })
    const stats = await processor.processAll({ force: true })

    expect(fs.readFileSync(path.join(DIR, 'icon.svg'), 'utf-8')).toBe(SVG)
    expect(stats.errors).toBe(1)
  })

  it('an animated gif is not copied onto itself', async() => {
    cleanup(DIR)
    fs.mkdirSync(DIR, { recursive: true })
    const a = await sharp({ create: { width: 10, height: 10, channels: 3, background: { r: 200, g: 0, b: 0 } } }).png().toBuffer()
    const b = await sharp({ create: { width: 10, height: 10, channels: 3, background: { r: 0, g: 200, b: 0 } } }).png().toBuffer()
    const gif = await sharp([a, b], { join: { animated: true } }).gif().toBuffer()
    fs.writeFileSync(path.join(DIR, 'anim.gif'), gif)

    const processor = new ImageProcessor({ in: DIR, out: DIR, sizes: [], cache: false })
    const stats = await processor.processAll({ force: true })

    expect(fs.readFileSync(path.join(DIR, 'anim.gif')).equals(gif)).toBe(true)
    expect(stats.errors).toBe(1)
  })
})
