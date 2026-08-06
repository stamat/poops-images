// Covers watch-mode event filtering: an event is processed exactly when a
// build run would discover the file — include, exclude and recorded outputs
// all apply. Deliberately not covered: chokidar's fs-event delivery, which is
// simulated here by enqueueing events directly; driving real fs watchers is
// slow and racy across the CI matrix.
import { describe, it, expect, beforeEach, afterAll } from '@jest/globals'
import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import ImageProcessor from '../lib/processor.js'

const FIXTURES_DIR = path.join(import.meta.dirname, 'fixtures')
const TEST_INPUT = path.join(FIXTURES_DIR, 'watch-input')
const TEST_OUTPUT = path.join(FIXTURES_DIR, 'watch-output')

function cleanup(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  }
}

async function createImage(relPath) {
  const abs = path.join(TEST_INPUT, relPath)
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  await sharp({ create: { width: 100, height: 100, channels: 3, background: { r: 100, g: 0, b: 100 } } })
    .jpeg().toFile(abs)
  return abs
}

async function drainEvent(processor, filePath) {
  processor._watchQueue.push({ type: 'process', filePath, force: false })
  await processor._drainWatchQueue()
}

describe('watch events pass through the same filter as build discovery', () => {
  beforeEach(() => {
    cleanup(TEST_INPUT)
    cleanup(TEST_OUTPUT)
  })

  afterAll(() => {
    cleanup(TEST_INPUT)
    cleanup(TEST_OUTPUT)
  })

  it('an event for an excluded file produces no output', async() => {
    const file = await createImage(path.join('drafts', 'hidden.jpg'))
    const processor = new ImageProcessor({
      in: TEST_INPUT, out: TEST_OUTPUT, sizes: [{ width: 50 }], exclude: ['drafts/**'], cache: false
    })
    await drainEvent(processor, file)
    expect(fs.existsSync(path.join(TEST_OUTPUT, 'drafts'))).toBe(false)
  })

  it('an event for a file outside include produces no output', async() => {
    const file = await createImage('stray.jpg')
    const processor = new ImageProcessor({
      in: TEST_INPUT, out: TEST_OUTPUT, sizes: [{ width: 50 }], include: 'photos/**/*.jpg', cache: false
    })
    await drainEvent(processor, file)
    expect(fs.existsSync(path.join(TEST_OUTPUT, 'stray-50w.jpg'))).toBe(false)
  })

  it('an event for an included file is processed', async() => {
    const file = await createImage(path.join('photos', 'shot.jpg'))
    const processor = new ImageProcessor({
      in: TEST_INPUT, out: TEST_OUTPUT, sizes: [{ width: 50 }], include: 'photos/**/*.jpg', cache: false
    })
    await drainEvent(processor, file)
    expect(fs.existsSync(path.join(TEST_OUTPUT, 'photos', 'shot-50w.jpg'))).toBe(true)
  })

  it('an svg edit under watch regenerates svg-preprocessor variants, same as a build', async() => {
    const abs = path.join(TEST_INPUT, 'icon.svg')
    fs.mkdirSync(TEST_INPUT, { recursive: true })
    fs.writeFileSync(abs, '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="blue"/></svg>')
    const processor = new ImageProcessor({
      in: TEST_INPUT,
      out: TEST_OUTPUT,
      sizes: [{ width: 50 }],
      cache: false,
      preprocessors: [{ name: 'gray', operations: [{ type: 'grayscale' }], svg: true }]
    })
    await drainEvent(processor, abs)
    expect(fs.existsSync(path.join(TEST_OUTPUT, 'icon.svg'))).toBe(true)
    expect(fs.existsSync(path.join(TEST_OUTPUT, 'icon-gray.png'))).toBe(true)
  })

  it('an excluded svg is not minified on a watch event', async() => {
    const abs = path.join(TEST_INPUT, 'drafts', 'icon.svg')
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    fs.writeFileSync(abs, '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"/>')
    const processor = new ImageProcessor({
      in: TEST_INPUT, out: TEST_OUTPUT, sizes: [{ width: 50 }], exclude: ['drafts/**'], cache: false
    })
    await drainEvent(processor, abs)
    expect(fs.existsSync(path.join(TEST_OUTPUT, 'drafts', 'icon.svg'))).toBe(false)
  })
})
