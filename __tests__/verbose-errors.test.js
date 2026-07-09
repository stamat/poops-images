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
