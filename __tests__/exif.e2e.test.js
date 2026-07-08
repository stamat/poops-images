import { describe, it, expect, beforeAll, afterAll } from '@jest/globals'
import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import ImageProcessor from '../lib/processor.js'
import { analyzeImage } from '../lib/analyze.js'

// End-to-end EXIF tests on synthetic fixtures generated with sharp's withExif —
// exercises the real `sharp metadata → exif-reader → extractExif` path without
// committing a real photo (real EXIF carries GPS/device/timestamp data).

const FIXTURES_DIR = path.join(import.meta.dirname, 'fixtures')
const TEST_INPUT = path.join(FIXTURES_DIR, 'exif-input')
const TEST_OUTPUT = path.join(FIXTURES_DIR, 'exif-output')

function cleanup(dir) {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true })
}

// 200x100 raw pixels; orientation 6/8 displays as 100x200 portrait
async function makeExifImage(filename, orientation) {
  await sharp({ create: { width: 200, height: 100, channels: 3, background: '#886644' } })
    .jpeg({ quality: 90 })
    .withMetadata({ orientation })
    .withExif({
      IFD0: { Make: 'FakeCorp', Model: 'FakeCam 3000', Software: '1.0' },
      IFD2: {
        ExposureTime: '1/125',
        FNumber: '2.8',
        ISOSpeedRatings: '200',
        FocalLength: '21/5',
        LensModel: 'FakeLens 4.2mm'
      },
      IFD3: {
        GPSLatitudeRef: 'N',
        GPSLatitude: '51/1 30/1 0/1',
        GPSLongitudeRef: 'W',
        GPSLongitude: '0/1 7/1 0/1'
      }
    })
    .toFile(path.join(TEST_INPUT, filename))
}

async function outputMeta(file) {
  return sharp(path.join(TEST_OUTPUT, file)).metadata()
}

beforeAll(async() => {
  cleanup(TEST_INPUT)
  fs.mkdirSync(TEST_INPUT, { recursive: true })
  await makeExifImage('orient6.jpg', 6)
  await makeExifImage('orient8.jpg', 8)
  await makeExifImage('orient3.jpg', 3)
})

afterAll(() => {
  cleanup(TEST_INPUT)
  cleanup(TEST_OUTPUT)
})

describe('analyzeImage — real EXIF parse path', () => {
  const config = { in: TEST_INPUT, sizes: [], format: false, skipOriginal: false }

  it('extracts camera and GPS fields from an actual JPEG', async() => {
    const inputPath = path.join(TEST_INPUT, 'orient6.jpg')
    const job = await analyzeImage(inputPath, config, fs.statSync(inputPath))

    expect(job.exif).not.toBeNull()
    expect(job.exif.make).toBe('FakeCorp')
    expect(job.exif.model).toBe('FakeCam 3000')
    expect(job.exif.orientation).toBe(6)
    expect(job.exif.iso).toBe(200)
    expect(job.exif.lensModel).toBe('FakeLens 4.2mm')
    expect(job.exif.exposure.formatted).toBe('1/125')
    // 51°30'0" N, 0°7'0" W
    expect(job.exif.gps.latitude.decimal).toBeCloseTo(51.5, 4)
    expect(job.exif.gps.longitude.decimal).toBeCloseTo(-0.116667, 4)
  })

  it.each([
    ['orient6.jpg', 100, 200], // 90° CW — swaps
    ['orient8.jpg', 100, 200], // 90° CCW — swaps
    ['orient3.jpg', 200, 100] // 180° — no swap
  ])('%s → source dims %dx%d', async(file, w, h) => {
    const inputPath = path.join(TEST_INPUT, file)
    const job = await analyzeImage(inputPath, config, fs.statSync(inputPath))
    expect(job.sourceWidth).toBe(w)
    expect(job.sourceHeight).toBe(h)
  })
})

describe('EXIF orientation through the pipeline', () => {
  it.each([
    ['orient6.jpg', 100, 200],
    ['orient8.jpg', 100, 200],
    ['orient3.jpg', 200, 100]
  ])('%s original output is %dx%d', async(file, w, h) => {
    cleanup(TEST_OUTPUT)
    const processor = new ImageProcessor({
      in: TEST_INPUT,
      out: TEST_OUTPUT,
      include: file,
      sizes: [],
      cache: false
    })
    await processor.processAll({ force: true })

    const m = await outputMeta(file)
    expect(m.width).toBe(w)
    expect(m.height).toBe(h)
  })
})

describe('EXIF orientation through preprocessor modes', () => {
  // orient6 displays as 100x200 portrait; a 50w variant must be 50x100 in every mode
  it.each([
    ['default', {}],
    ['resizeFirst: true', { resizeFirst: true }],
    ['resizeFirst: {width}', { resizeFirst: { width: 100 } }]
  ])('stays portrait with %s', async(_label, extra) => {
    cleanup(TEST_OUTPUT)
    const processor = new ImageProcessor({
      in: TEST_INPUT,
      out: TEST_OUTPUT,
      include: 'orient6.jpg',
      sizes: [{ width: 50 }],
      skipOriginal: true,
      cache: false,
      preprocessors: [{ name: 'gray', operations: [{ type: 'grayscale' }], ...extra }]
    })
    await processor.processAll({ force: true })

    const m = await outputMeta('orient6-gray-50w.jpg')
    expect(m.width).toBe(50)
    expect(m.height).toBe(100)
  })
})

describe('EXIF stored in cache entry', () => {
  it('persists extracted EXIF alongside outputs', async() => {
    cleanup(TEST_OUTPUT)
    const processor = new ImageProcessor({
      in: TEST_INPUT,
      out: TEST_OUTPUT,
      include: 'orient6.jpg',
      sizes: [{ width: 50 }],
      cache: false
    })
    await processor.processAll({ force: true })

    const entry = processor.cache.getEntry('orient6.jpg')
    expect(entry).not.toBeNull()
    expect(entry.exif.make).toBe('FakeCorp')
    expect(entry.exif.gps.latitude.decimal).toBeCloseTo(51.5, 4)
    expect(entry.width).toBe(100)
    expect(entry.height).toBe(200)
  })
})
