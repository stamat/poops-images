// Covers error accounting (stats.errors) and verbose gating of per-file logs.
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

  it('suppresses per-file logs when verbose is false but keeps the summary', async() => {
    cleanup(TEST_INPUT)
    cleanup(TEST_OUTPUT)
    await createImage('ok.jpg')

    const lines = []
    const spy = jest.spyOn(console, 'log').mockImplementation((msg) => lines.push(String(msg)))
    try {
      const processor = new ImageProcessor({
        in: TEST_INPUT, out: TEST_OUTPUT, sizes: [{ width: 200 }], cache: false, verbose: false
      })
      await processor.processAll({ force: true })
    } finally {
      spy.mockRestore()
    }

    const out = lines.join('\n')
    expect(out).not.toMatch(/Processing:/)
    expect(out).not.toMatch(/Compiled:/)
    expect(out).toMatch(/image\(s\)/) // summary line survives
  })
})
