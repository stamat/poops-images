import { describe, it, expect, beforeAll, afterAll } from '@jest/globals'
import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import ImageProcessor from '../lib/processor.js'

const FIXTURES_DIR = path.join(import.meta.dirname, 'fixtures')
const TEST_INPUT = path.join(FIXTURES_DIR, 'input')
const TEST_OUTPUT = path.join(FIXTURES_DIR, 'output')

async function createTestImage(filename, width, height, color = { r: 255, g: 0, b: 0 }) {
  const dir = path.dirname(path.join(TEST_INPUT, filename))
  fs.mkdirSync(dir, { recursive: true })
  const ext = path.extname(filename).toLowerCase()
  if (ext === '.png') {
    await sharp({
      create: { width, height, channels: 4, background: { ...color, alpha: 1 } }
    }).png().toFile(path.join(TEST_INPUT, filename))
  } else {
    await sharp({
      create: { width, height, channels: 3, background: color }
    }).jpeg({ quality: 90 }).toFile(path.join(TEST_INPUT, filename))
  }
}

async function createTransparentPng(filename, width, height) {
  const dir = path.dirname(path.join(TEST_INPUT, filename))
  fs.mkdirSync(dir, { recursive: true })
  // Create image with semi-transparent pixels
  const pixels = Buffer.alloc(width * height * 4)
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = 255     // R
    pixels[i + 1] = 0   // G
    pixels[i + 2] = 0   // B
    pixels[i + 3] = 128  // A — semi-transparent
  }
  await sharp(pixels, { raw: { width, height, channels: 4 } })
    .png().toFile(path.join(TEST_INPUT, filename))
}

async function createRotatedImage(filename, width, height, orientation) {
  const dir = path.dirname(path.join(TEST_INPUT, filename))
  fs.mkdirSync(dir, { recursive: true })
  await sharp({
    create: { width, height, channels: 3, background: { r: 255, g: 0, b: 0 } }
  }).withMetadata({ orientation }).jpeg({ quality: 90 }).toFile(path.join(TEST_INPUT, filename))
}

async function createOpaqueGif(filename, width, height) {
  const dir = path.dirname(path.join(TEST_INPUT, filename))
  fs.mkdirSync(dir, { recursive: true })
  await sharp({
    create: { width, height, channels: 3, background: { r: 0, g: 0, b: 255 } }
  }).gif().toFile(path.join(TEST_INPUT, filename))
}

async function createTransparentGif(filename, width, height) {
  const dir = path.dirname(path.join(TEST_INPUT, filename))
  fs.mkdirSync(dir, { recursive: true })
  const pixels = Buffer.alloc(width * height * 4)
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = 0        // R
    pixels[i + 1] = 255  // G
    pixels[i + 2] = 0    // B
    pixels[i + 3] = i < pixels.length / 2 ? 0 : 255  // half transparent
  }
  await sharp(pixels, { raw: { width, height, channels: 4 } })
    .gif().toFile(path.join(TEST_INPUT, filename))
}

function cleanup(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

describe('ImageProcessor', () => {
  beforeAll(async() => {
    cleanup(TEST_INPUT)
    cleanup(TEST_OUTPUT)
    await createTestImage('photo.jpg', 2000, 1500)
    await createTestImage('gallery/landscape.jpg', 1600, 900)
    await createTestImage('small.jpg', 100, 80)
    await createTestImage('opaque.png', 800, 600)
    await createTransparentPng('transparent.png', 800, 600)
    // EXIF orientation 6 = 90° CW — raw pixels 200x100, displays as 100x200
    await createRotatedImage('rotated.jpg', 200, 100, 6)

    await createOpaqueGif('static-opaque.gif', 800, 600)
    await createTransparentGif('static-transparent.gif', 800, 600)

    // Create a test SVG with redundant whitespace and metadata
    const svgDir = path.join(TEST_INPUT, 'icons')
    fs.mkdirSync(svgDir, { recursive: true })
    fs.writeFileSync(path.join(TEST_INPUT, 'icons/logo.svg'),
      `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 100 100" width="100" height="100">
  <!-- A simple test SVG -->
  <metadata>Test metadata that should be removed</metadata>
  <defs>
    <style type="text/css"></style>
  </defs>
  <rect x="0" y="0" width="100" height="100" fill="#ff0000"    />
  <circle cx="50" cy="50" r="40" fill="#00ff00"    stroke="#000000"    stroke-width="2" />
</svg>`)
  })

  afterAll(() => {
    cleanup(TEST_INPUT)
    cleanup(TEST_OUTPUT)
  })

  it('should generate variants with correct naming pattern', async() => {
    const processor = new ImageProcessor({
      in: TEST_INPUT,
      out: TEST_OUTPUT,
      sizes: [
        { name: 'medium', width: 300, height: 300 }
      ],
    })

    await processor.processAll({ force: true })

    const files = fs.readdirSync(TEST_OUTPUT)
    const pattern = /^(.+)-(\d+)w\.([a-z0-9]+)$/
    const variants = files.filter(f => pattern.test(f))
    expect(variants.length).toBeGreaterThan(0)

    for (const variant of variants) {
      const match = variant.match(pattern)
      expect(match).not.toBeNull()
    }
  })

  it('should preserve directory structure', async() => {
    const processor = new ImageProcessor({
      in: TEST_INPUT,
      out: TEST_OUTPUT,
      sizes: [
        { name: 'medium', width: 300, height: 300 }
      ],
    })

    cleanup(TEST_OUTPUT)
    await processor.processAll({ force: true })

    const galleryDir = path.join(TEST_OUTPUT, 'gallery')
    expect(fs.existsSync(galleryDir)).toBe(true)
    const galleryFiles = fs.readdirSync(galleryDir)
    expect(galleryFiles.length).toBeGreaterThan(0)
  })

  it('should not upscale small images', async() => {
    const processor = new ImageProcessor({
      in: TEST_INPUT,
      out: TEST_OUTPUT,
      sizes: [
        { name: 'large', width: 1024, height: 1024 }
      ],
    })

    cleanup(TEST_OUTPUT)
    await processor.processAll({ force: true })

    // small.jpg is 100x80, should not be upscaled to 1024
    const files = fs.readdirSync(TEST_OUTPUT)
    const smallVariants = files.filter(f => f.startsWith('small-'))
    expect(smallVariants.length).toBe(0)
  })

  it('should produce exact dimensions for hard crop', async() => {
    const processor = new ImageProcessor({
      in: TEST_INPUT,
      out: TEST_OUTPUT,
      sizes: [
        { name: 'thumb', width: 150, height: 150, crop: true }
      ],
    })

    cleanup(TEST_OUTPUT)
    await processor.processAll({ force: true })

    const files = fs.readdirSync(TEST_OUTPUT)
    const photoVariant = files.find(f => f.startsWith('photo-') && f.endsWith('.jpg'))
    expect(photoVariant).toBeDefined()

    const metadata = await sharp(path.join(TEST_OUTPUT, photoVariant)).metadata()
    expect(metadata.width).toBe(150)
    expect(metadata.height).toBe(150)
  })

  it('should produce proportional dimensions for soft crop', async() => {
    const processor = new ImageProcessor({
      in: TEST_INPUT,
      out: TEST_OUTPUT,
      sizes: [
        { name: 'medium', width: 300, height: 300 }
      ],
    })

    cleanup(TEST_OUTPUT)
    await processor.processAll({ force: true })

    const files = fs.readdirSync(TEST_OUTPUT)
    const photoVariant = files.find(f => f.startsWith('photo-') && f.endsWith('.jpg'))
    expect(photoVariant).toBeDefined()

    const metadata = await sharp(path.join(TEST_OUTPUT, photoVariant)).metadata()
    // photo.jpg is 2000x1500 (4:3), soft crop to 300x300 should fit inside → 300x225
    expect(metadata.width).toBe(300)
    expect(metadata.height).toBe(225)
  })

  it('should skip unchanged files on second run (cache)', async() => {
    const processor = new ImageProcessor({
      in: TEST_INPUT,
      out: TEST_OUTPUT,
      sizes: [
        { name: 'medium', width: 300, height: 300 }
      ],
    })

    cleanup(TEST_OUTPUT)
    await processor.processAll({ force: true })

    // Second run without force should skip
    await processor.processAll()
    const stats2 = processor.getStats()

    expect(stats2.skipped).toBeGreaterThan(0)
    expect(stats2.processed).toBe(0)
  })

  it('should reprocess everything with --force', async() => {
    const processor = new ImageProcessor({
      in: TEST_INPUT,
      out: TEST_OUTPUT,
      sizes: [
        { name: 'medium', width: 300, height: 300 }
      ],
    })

    cleanup(TEST_OUTPUT)
    await processor.processAll({ force: true })

    // Force second run
    await processor.processAll({ force: true })
    const stats = processor.getStats()

    expect(stats.processed).toBeGreaterThan(0)
    expect(stats.skipped).toBe(0)
  })

  it('should handle format conversion', async() => {
    const processor = new ImageProcessor({
      in: TEST_INPUT,
      out: TEST_OUTPUT,
      sizes: [
        { name: 'medium', width: 300, height: 300 }
      ],
      format: 'webp'
    })

    cleanup(TEST_OUTPUT)
    await processor.processAll({ force: true })

    const files = fs.readdirSync(TEST_OUTPUT)

    // All raster outputs should be .webp (exclude directories)
    const rasterFiles = files.filter(f =>
      !f.startsWith('.') && !f.endsWith('.svg') &&
      fs.statSync(path.join(TEST_OUTPUT, f)).isFile()
    )
    for (const f of rasterFiles) {
      expect(f).toMatch(/\.webp$/)
    }
  })

  it('should handle dry-run without writing files', async() => {
    cleanup(TEST_OUTPUT)

    const processor = new ImageProcessor({
      in: TEST_INPUT,
      out: TEST_OUTPUT,
      sizes: [
        { name: 'medium', width: 300, height: 300 }
      ],
    })

    await processor.processAll({ dryRun: true })

    expect(fs.existsSync(TEST_OUTPUT)).toBe(false)
  })

  it('should use actual width in filename', async() => {
    const processor = new ImageProcessor({
      in: TEST_INPUT,
      out: TEST_OUTPUT,
      sizes: [
        { name: 'medium', width: 300, height: 300 }
      ],
    })

    cleanup(TEST_OUTPUT)
    await processor.processAll({ force: true })

    // gallery/landscape.jpg is 1600x900, soft crop to 300x300 → 300x169
    const galleryFiles = fs.readdirSync(path.join(TEST_OUTPUT, 'gallery'))
    const variant = galleryFiles.find(f => f.startsWith('landscape-'))
    expect(variant).toBeDefined()

    const match = variant.match(/^landscape-medium-(\d+)w\.jpg$/)
    expect(match).not.toBeNull()
    expect(parseInt(match[1], 10)).toBe(300)
  })

  it('should convert opaque PNG to JPEG', async() => {
    const processor = new ImageProcessor({
      in: TEST_INPUT,
      out: TEST_OUTPUT,
      sizes: [
        { name: 'medium', width: 300, height: 300 }
      ],
    })

    cleanup(TEST_OUTPUT)
    await processor.processAll({ force: true })

    const files = fs.readdirSync(TEST_OUTPUT)
    // opaque.png should produce a .jpg variant, not .png
    const opaqueJpg = files.filter(f => f.startsWith('opaque-') && f.endsWith('.jpg'))
    const opaquePng = files.filter(f => f.startsWith('opaque-') && f.endsWith('.png'))
    expect(opaqueJpg.length).toBe(1)
    expect(opaquePng.length).toBe(0)
  })

  it('should generate webp for opaque PNG when format is webp', async() => {
    const processor = new ImageProcessor({
      in: TEST_INPUT,
      out: TEST_OUTPUT,
      sizes: [
        { name: 'medium', width: 300, height: 300 }
      ],
      format: 'webp'
    })

    cleanup(TEST_OUTPUT)
    await processor.processAll({ force: true })

    const files = fs.readdirSync(TEST_OUTPUT)
    // opaque.png should produce only .webp when format is 'webp'
    const opaqueWebp = files.filter(f => f.startsWith('opaque-') && f.endsWith('.webp'))
    const opaqueJpg = files.filter(f => f.startsWith('opaque-') && f.endsWith('.jpg'))
    const opaquePng = files.filter(f => f.startsWith('opaque-') && f.endsWith('.png'))
    expect(opaqueWebp.length).toBe(1)
    expect(opaqueJpg.length).toBe(0)
    expect(opaquePng.length).toBe(0)
  })

  it('should keep transparent PNG as PNG', async() => {
    const processor = new ImageProcessor({
      in: TEST_INPUT,
      out: TEST_OUTPUT,
      sizes: [
        { name: 'medium', width: 300, height: 300 }
      ],
    })

    cleanup(TEST_OUTPUT)
    await processor.processAll({ force: true })

    const files = fs.readdirSync(TEST_OUTPUT)
    // transparent.png should stay as .png
    const transparentPng = files.filter(f => f.startsWith('transparent-') && f.endsWith('.png'))
    expect(transparentPng.length).toBe(1)
  })

  it('should minify SVGs with SVGO', async() => {
    const processor = new ImageProcessor({
      in: TEST_INPUT,
      out: TEST_OUTPUT,
      sizes: [
        { name: 'medium', width: 300, height: 300 }
      ],
    })

    cleanup(TEST_OUTPUT)
    await processor.processAll({ force: true })

    // SVG should be minified and placed in icons/ subdirectory
    const iconsDir = path.join(TEST_OUTPUT, 'icons')
    expect(fs.existsSync(iconsDir)).toBe(true)

    const svgFiles = fs.readdirSync(iconsDir).filter(f => f.endsWith('.svg'))
    expect(svgFiles.length).toBe(1)
    expect(svgFiles[0]).toBe('logo.svg')

    // Minified SVG should be smaller (metadata and comments removed)
    const original = fs.readFileSync(path.join(TEST_INPUT, 'icons/logo.svg'), 'utf-8')
    const minified = fs.readFileSync(path.join(iconsDir, 'logo.svg'), 'utf-8')
    expect(minified.length).toBeLessThan(original.length)

    // Should not contain the comment or metadata
    expect(minified).not.toContain('<!-- A simple test SVG -->')
    expect(minified).not.toContain('<metadata>')
  })

  it('should cache SVGs and skip on second run', async() => {
    const processor = new ImageProcessor({
      in: TEST_INPUT,
      out: TEST_OUTPUT,
      sizes: [
        { name: 'medium', width: 300, height: 300 }
      ],
    })

    cleanup(TEST_OUTPUT)
    await processor.processAll({ force: true })

    // Second run — SVGs should be skipped via cache
    await processor.processAll()
    const stats = processor.getStats()
    expect(stats.skipped).toBeGreaterThan(0)
  })

  it('should apply EXIF rotation when processing', async() => {
    const processor = new ImageProcessor({
      in: TEST_INPUT,
      out: TEST_OUTPUT,
      sizes: [],
      skipOriginal: false
    })

    cleanup(TEST_OUTPUT)
    await processor.processAll({ force: true })

    // rotated.jpg is 200x100 raw pixels with orientation 6 (90° CW)
    // After auto-rotation, output should be 100x200 (portrait)
    const files = fs.readdirSync(TEST_OUTPUT)
    const rotatedFile = files.find(f => f.startsWith('rotated'))
    expect(rotatedFile).toBeDefined()

    const metadata = await sharp(path.join(TEST_OUTPUT, rotatedFile)).metadata()
    expect(metadata.width).toBe(100)
    expect(metadata.height).toBe(200)
  })

  it('should convert opaque static GIF to JPEG', async() => {
    const processor = new ImageProcessor({
      in: TEST_INPUT,
      out: TEST_OUTPUT,
      sizes: [{ name: 'medium', width: 300, height: 300 }],
    })

    cleanup(TEST_OUTPUT)
    await processor.processAll({ force: true })

    const files = fs.readdirSync(TEST_OUTPUT)
    const gifJpg = files.filter(f => f.startsWith('static-opaque') && f.endsWith('.jpg'))
    const gifGif = files.filter(f => f.startsWith('static-opaque') && f.endsWith('.gif'))
    expect(gifJpg.length).toBeGreaterThan(0)
    expect(gifGif.length).toBe(0)
  })

  it('should convert transparent static GIF to PNG', async() => {
    const processor = new ImageProcessor({
      in: TEST_INPUT,
      out: TEST_OUTPUT,
      sizes: [{ name: 'medium', width: 300, height: 300 }],
    })

    cleanup(TEST_OUTPUT)
    await processor.processAll({ force: true })

    const files = fs.readdirSync(TEST_OUTPUT)
    const gifPng = files.filter(f => f.startsWith('static-transparent') && f.endsWith('.png'))
    const gifJpg = files.filter(f => f.startsWith('static-transparent') && f.endsWith('.jpg'))
    const gifGif = files.filter(f => f.startsWith('static-transparent') && f.endsWith('.gif'))
    expect(gifPng.length).toBeGreaterThan(0)
    expect(gifJpg.length).toBe(0)
    expect(gifGif.length).toBe(0)
  })

  it('should convert static GIF to webp when format is webp', async() => {
    const processor = new ImageProcessor({
      in: TEST_INPUT,
      out: TEST_OUTPUT,
      sizes: [{ name: 'medium', width: 300, height: 300 }],
      format: 'webp'
    })

    cleanup(TEST_OUTPUT)
    await processor.processAll({ force: true })

    const files = fs.readdirSync(TEST_OUTPUT)
    const gifWebp = files.filter(f => f.startsWith('static-opaque') && f.endsWith('.webp'))
    const gifGif = files.filter(f => f.startsWith('static-opaque') && f.endsWith('.gif'))
    expect(gifWebp.length).toBeGreaterThan(0)
    expect(gifGif.length).toBe(0)
  })
})
