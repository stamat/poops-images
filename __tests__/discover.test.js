// Covers discovery: which files enter which pipeline, and that `include`
// governs all three (raster, svg, gif). Deliberately not covered: watch-mode
// event filtering, which lives in processor tests — this file only proves what
// a build run picks up.
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals'
import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { discoverAll } from '../lib/discover.js'
import ImageProcessor from '../lib/processor.js'

const FIXTURES_DIR = path.join(import.meta.dirname, 'fixtures')
const TEST_INPUT = path.join(FIXTURES_DIR, 'discover-input')
const TEST_OUTPUT = path.join(FIXTURES_DIR, 'discover-output')

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="red"/></svg>'

function cleanup(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  }
}

async function createFixtures() {
  fs.mkdirSync(TEST_INPUT, { recursive: true })
  const jpg = await sharp({ create: { width: 100, height: 100, channels: 3, background: { r: 200, g: 0, b: 0 } } })
    .jpeg().toBuffer()
  fs.writeFileSync(path.join(TEST_INPUT, 'photo.jpg'), jpg)
  fs.writeFileSync(path.join(TEST_INPUT, 'other.jpg'), jpg)
  fs.writeFileSync(path.join(TEST_INPUT, 'icon.svg'), SVG)
  const gif = await sharp({ create: { width: 10, height: 10, channels: 3, background: { r: 0, g: 200, b: 0 } } })
    .gif().toBuffer()
  fs.writeFileSync(path.join(TEST_INPUT, 'anim.gif'), gif)
}

describe('discovery under include', () => {
  beforeAll(async() => {
    cleanup(TEST_INPUT)
    cleanup(TEST_OUTPUT)
    await createFixtures()
  })

  afterAll(() => {
    cleanup(TEST_INPUT)
    cleanup(TEST_OUTPUT)
  })

  it('the default include feeds all three pipelines', async() => {
    const processor = new ImageProcessor({ in: TEST_INPUT, out: TEST_OUTPUT, sizes: [{ width: 50 }] })
    const { raster, svg, gif } = await discoverAll(processor.config)
    expect(raster.map(f => path.basename(f)).sort()).toEqual(['other.jpg', 'photo.jpg'])
    expect(svg.map(f => path.basename(f))).toEqual(['icon.svg'])
    expect(gif.map(f => path.basename(f))).toEqual(['anim.gif'])
  })

  it('an include naming one file discovers that file and nothing else', async() => {
    const processor = new ImageProcessor({
      in: TEST_INPUT, out: TEST_OUTPUT, sizes: [{ width: 50 }], include: 'photo.jpg'
    })
    const { raster, svg, gif } = await discoverAll(processor.config)
    expect(raster.map(f => path.basename(f))).toEqual(['photo.jpg'])
    expect(svg).toEqual([])
    expect(gif).toEqual([])
  })

  it('an include narrowed to jpg leaves svg and gif out of the build', async() => {
    cleanup(TEST_OUTPUT)
    const processor = new ImageProcessor({
      in: TEST_INPUT, out: TEST_OUTPUT, sizes: [{ width: 50 }], include: '**/*.jpg', cache: false
    })
    await processor.processAll({ force: true })
    expect(fs.existsSync(path.join(TEST_OUTPUT, 'photo-50w.jpg'))).toBe(true)
    expect(fs.existsSync(path.join(TEST_OUTPUT, 'icon.svg'))).toBe(false)
    expect(fs.existsSync(path.join(TEST_OUTPUT, 'anim.gif'))).toBe(false)
  })

  it('an output directory nested under the input is never discovered as source', async() => {
    const IN = path.join(FIXTURES_DIR, 'reingest-nested')
    const OUT = path.join(IN, 'dist')
    cleanup(IN)
    fs.mkdirSync(IN, { recursive: true })
    const jpg = await sharp({ create: { width: 100, height: 100, channels: 3, background: { r: 0, g: 0, b: 200 } } })
      .jpeg().toBuffer()
    fs.writeFileSync(path.join(IN, 'a.jpg'), jpg)

    const config = { in: IN, out: OUT, sizes: [{ width: 50 }] }
    await new ImageProcessor(config).processAll({ force: true })
    await new ImageProcessor(config).processAll({ force: true })

    // A second run re-ingesting dist/ would produce dist/dist
    expect(fs.existsSync(path.join(OUT, 'dist'))).toBe(false)
    cleanup(IN)
  })

  it('a recorded output beside its source is not re-ingested when in equals out', async() => {
    const DIR = path.join(FIXTURES_DIR, 'reingest-flat')
    cleanup(DIR)
    fs.mkdirSync(DIR, { recursive: true })
    const jpg = await sharp({ create: { width: 100, height: 100, channels: 3, background: { r: 0, g: 200, b: 200 } } })
      .jpeg().toBuffer()
    fs.writeFileSync(path.join(DIR, 'a.jpg'), jpg)

    const config = { in: DIR, out: DIR, sizes: [{ width: 50 }], skipOriginal: true }
    await new ImageProcessor(config).processAll({ force: true })
    expect(fs.existsSync(path.join(DIR, 'a-50w.jpg'))).toBe(true)

    await new ImageProcessor(config).processAll({ force: true })
    expect(fs.existsSync(path.join(DIR, 'a-50w-50w.jpg'))).toBe(false)
    cleanup(DIR)
  })

  it('exclude applies to svg and gif, not only raster', async() => {
    const processor = new ImageProcessor({
      in: TEST_INPUT, out: TEST_OUTPUT, sizes: [{ width: 50 }], exclude: ['icon.svg', 'anim.gif']
    })
    const { svg, gif } = await discoverAll(processor.config)
    expect(svg).toEqual([])
    expect(gif).toEqual([])
  })
})
