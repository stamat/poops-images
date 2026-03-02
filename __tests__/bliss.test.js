import { describe, it, expect, beforeAll, afterAll } from '@jest/globals'
import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import ImageProcessor from '../lib/processor.js'

// bliss.jpg: 4400x3300, JPEG, no alpha, sRGB (4:3 aspect ratio)
const BLISS_PATH = path.join(import.meta.dirname, '..', 'src', 'bliss.jpg')
const FIXTURES_DIR = path.join(import.meta.dirname, 'fixtures')
const TEST_INPUT = path.join(FIXTURES_DIR, 'bliss-input')
const TEST_OUTPUT = path.join(FIXTURES_DIR, 'bliss-output')

function cleanup(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

function listOutputFiles(subdir = '') {
  const dir = subdir ? path.join(TEST_OUTPUT, subdir) : TEST_OUTPUT
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir)
}

describe('bliss.jpg — comprehensive real image test', () => {
  beforeAll(() => {
    cleanup(TEST_INPUT)
    cleanup(TEST_OUTPUT)
    fs.mkdirSync(TEST_INPUT, { recursive: true })
    fs.copyFileSync(BLISS_PATH, path.join(TEST_INPUT, 'bliss.jpg'))
    // Also place a copy in a subdirectory to test directory preservation
    fs.mkdirSync(path.join(TEST_INPUT, 'gallery'), { recursive: true })
    fs.copyFileSync(BLISS_PATH, path.join(TEST_INPUT, 'gallery', 'bliss.jpg'))
  })

  afterAll(() => {
    cleanup(TEST_INPUT)
    cleanup(TEST_OUTPUT)
  })

  describe('single size — soft crop', () => {
    it('should resize proportionally to fit inside bounding box', async() => {
      const processor = new ImageProcessor({
        in: TEST_INPUT,
        out: TEST_OUTPUT,
        sizes: [{ name: 'medium', width: 300, height: 300 }],

      })

      cleanup(TEST_OUTPUT)
      await processor.processAll({ force: true })

      // 4400x3300 (4:3) fit inside 300x300 → 300x225
      const files = listOutputFiles()
      const variant = files.find(f => f === 'bliss-medium-300w.jpg')
      expect(variant).toBeDefined()

      const meta = await sharp(path.join(TEST_OUTPUT, variant)).metadata()
      expect(meta.width).toBe(300)
      expect(meta.height).toBe(225)
      expect(meta.format).toBe('jpeg')
    })

    it('should use actual width in filename (not configured target)', async() => {
      const processor = new ImageProcessor({
        in: TEST_INPUT,
        out: TEST_OUTPUT,
        sizes: [{ name: 'wide', width: 1000, height: 500 }],

      })

      cleanup(TEST_OUTPUT)
      await processor.processAll({ force: true })

      // 4400x3300 (4:3) fit inside 1000x500 → 667x500 (height-constrained)
      const files = listOutputFiles()
      const variant = files.find(f => f.startsWith('bliss-wide-') && f.endsWith('.jpg'))
      expect(variant).toBeDefined()

      const match = variant.match(/^bliss-wide-(\d+)w\.jpg$/)
      expect(match).not.toBeNull()

      const meta = await sharp(path.join(TEST_OUTPUT, variant)).metadata()
      expect(meta.width).toBe(parseInt(match[1], 10))
      // Width should be less than 1000 because height constrains first
      expect(meta.width).toBeLessThan(1000)
      expect(meta.height).toBeLessThanOrEqual(500)
    })
  })

  describe('single size — hard crop', () => {
    it('should produce exact dimensions with crop: true (center)', async() => {
      const processor = new ImageProcessor({
        in: TEST_INPUT,
        out: TEST_OUTPUT,
        sizes: [{ name: 'thumb', width: 150, height: 150, crop: true }],

      })

      cleanup(TEST_OUTPUT)
      await processor.processAll({ force: true })

      const files = listOutputFiles()
      const variant = files.find(f => f === 'bliss-thumb-150w.jpg')
      expect(variant).toBeDefined()

      const meta = await sharp(path.join(TEST_OUTPUT, variant)).metadata()
      expect(meta.width).toBe(150)
      expect(meta.height).toBe(150)
    })

    it('should produce exact dimensions with anchor crop', async() => {
      const processor = new ImageProcessor({
        in: TEST_INPUT,
        out: TEST_OUTPUT,
        sizes: [{ name: 'hero', width: 1920, height: 600, crop: ['center', 'top'] }],

      })

      cleanup(TEST_OUTPUT)
      await processor.processAll({ force: true })

      const files = listOutputFiles()
      const variant = files.find(f => f === 'bliss-hero-1920w.jpg')
      expect(variant).toBeDefined()

      const meta = await sharp(path.join(TEST_OUTPUT, variant)).metadata()
      expect(meta.width).toBe(1920)
      expect(meta.height).toBe(600)
    })

    it('should produce exact dimensions for all 9 crop positions', async() => {
      const positions = [
        ['left', 'top'], ['center', 'top'], ['right', 'top'],
        ['left', 'center'], ['center', 'center'], ['right', 'center'],
        ['left', 'bottom'], ['center', 'bottom'], ['right', 'bottom']
      ]

      const sizes = positions.map(([x, y], i) => ({
        name: `pos${i}`,
        width: 400,
        height: 300,
        crop: [x, y]
      }))

      const processor = new ImageProcessor({
        in: TEST_INPUT,
        out: TEST_OUTPUT,
        sizes,
        // Use only root bliss.jpg for this test
        exclude: ['gallery/**']
      })

      cleanup(TEST_OUTPUT)
      await processor.processAll({ force: true })

      const files = listOutputFiles()
      for (let i = 0; i < 9; i++) {
        const variant = files.find(f => f === `bliss-pos${i}-400w.jpg`)
        expect(variant).toBeDefined()

        const meta = await sharp(path.join(TEST_OUTPUT, variant)).metadata()
        expect(meta.width).toBe(400)
        expect(meta.height).toBe(300)
      }
    })
  })

  describe('multiple sizes', () => {
    it('should generate all size variants', async() => {
      const processor = new ImageProcessor({
        in: TEST_INPUT,
        out: TEST_OUTPUT,
        sizes: [
          { name: 'thumbnail', width: 150, height: 150, crop: true },
          { name: 'medium', width: 300, height: 300 },
          { name: 'medium_large', width: 768, height: 0 },
          { name: 'large', width: 1024, height: 1024 },
          { name: 'hero', width: 1920, height: 600, crop: ['center', 'top'] }
        ],
        exclude: ['gallery/**']
      })

      cleanup(TEST_OUTPUT)
      await processor.processAll({ force: true })

      const files = listOutputFiles()

      // thumbnail: hard crop → 150x150
      expect(files).toContain('bliss-thumbnail-150w.jpg')

      // medium: soft crop 300x300 → 300x225
      const medVariant = files.find(f => f.startsWith('bliss-medium-'))
      expect(medVariant).toBeDefined()

      // medium_large: width only → 768xN
      const mlVariant = files.find(f => f.startsWith('bliss-medium_large-'))
      expect(mlVariant).toBeDefined()

      // large: soft crop 1024x1024 → 1024x768
      const lgVariant = files.find(f => f.startsWith('bliss-large-'))
      expect(lgVariant).toBeDefined()

      // hero: hard crop → 1920x600
      expect(files).toContain('bliss-hero-1920w.jpg')

      expect(files.filter(f => f.startsWith('bliss-'))).toHaveLength(5)
    })

    it('should produce correct dimensions for each variant', async() => {
      const processor = new ImageProcessor({
        in: TEST_INPUT,
        out: TEST_OUTPUT,
        sizes: [
          { name: 'thumbnail', width: 150, height: 150, crop: true },
          { name: 'medium', width: 300, height: 300 },
          { name: 'medium_large', width: 768, height: 0 },
          { name: 'large', width: 1024, height: 1024 }
        ],
        exclude: ['gallery/**']
      })

      cleanup(TEST_OUTPUT)
      await processor.processAll({ force: true })

      const check = async(filename, expectedW, expectedH) => {
        const meta = await sharp(path.join(TEST_OUTPUT, filename)).metadata()
        expect(meta.width).toBe(expectedW)
        expect(meta.height).toBe(expectedH)
      }

      // Hard crop: exact 150x150
      await check('bliss-thumbnail-150w.jpg', 150, 150)

      // Soft crop: 4400x3300 into 300x300 → 300x225
      await check('bliss-medium-300w.jpg', 300, 225)

      // Width only: 4400x3300 → 768x576
      await check('bliss-medium_large-768w.jpg', 768, 576)

      // Soft crop: 4400x3300 into 1024x1024 → 1024x768
      await check('bliss-large-1024w.jpg', 1024, 768)
    })
  })

  describe('size without name', () => {
    it('should produce filename without size name segment', async() => {
      const processor = new ImageProcessor({
        in: TEST_INPUT,
        out: TEST_OUTPUT,
        sizes: [{ width: 640 }],
        exclude: ['gallery/**']
      })

      cleanup(TEST_OUTPUT)
      await processor.processAll({ force: true })

      const files = listOutputFiles()
      expect(files).toContain('bliss-640w.jpg')
    })

    it('should mix named and unnamed sizes', async() => {
      const processor = new ImageProcessor({
        in: TEST_INPUT,
        out: TEST_OUTPUT,
        sizes: [
          { name: 'thumb', width: 150, height: 150, crop: true },
          { width: 640 },
          { width: 1024 }
        ],
        exclude: ['gallery/**']
      })

      cleanup(TEST_OUTPUT)
      await processor.processAll({ force: true })

      const files = listOutputFiles()
      expect(files).toContain('bliss-thumb-150w.jpg')
      expect(files).toContain('bliss-640w.jpg')
      expect(files).toContain('bliss-1024w.jpg')
      expect(files.filter(f => f.startsWith('bliss-'))).toHaveLength(3)
    })
  })

  describe('format conversion — webp', () => {
    it('should produce only webp when format is webp', async() => {
      const processor = new ImageProcessor({
        in: TEST_INPUT,
        out: TEST_OUTPUT,
        sizes: [{ name: 'medium', width: 300, height: 300 }],
        format: 'webp',
        exclude: ['gallery/**']
      })

      cleanup(TEST_OUTPUT)
      await processor.processAll({ force: true })

      const files = listOutputFiles()
      expect(files).toContain('bliss-medium-300w.webp')
      expect(files).not.toContain('bliss-medium-300w.jpg')
    })
  })

  describe('format conversion — avif', () => {
    it('should produce only avif when format is avif', async() => {
      const processor = new ImageProcessor({
        in: TEST_INPUT,
        out: TEST_OUTPUT,
        sizes: [{ name: 'medium', width: 300, height: 300 }],
        format: 'avif',
        exclude: ['gallery/**']
      })

      cleanup(TEST_OUTPUT)
      await processor.processAll({ force: true })

      const files = listOutputFiles()
      expect(files).toContain('bliss-medium-300w.avif')
      expect(files).toContain('bliss.avif')
      expect(files).not.toContain('bliss-medium-300w.jpg')
    }, 15000)
  })

  describe('format conversion — webp + avif combined', () => {
    it('should produce exactly webp and avif for multiple sizes', async() => {
      const processor = new ImageProcessor({
        in: TEST_INPUT,
        out: TEST_OUTPUT,
        sizes: [
          { name: 'medium', width: 300, height: 300 },
          { name: 'large', width: 1024, height: 1024 }
        ],
        format: ['webp', 'avif'],
        exclude: ['gallery/**']
      })

      cleanup(TEST_OUTPUT)
      await processor.processAll({ force: true })

      const files = listOutputFiles()

      // medium: webp + avif = 2 files (no base jpg)
      expect(files).toContain('bliss-medium-300w.webp')
      expect(files).toContain('bliss-medium-300w.avif')
      expect(files).not.toContain('bliss-medium-300w.jpg')

      // large: webp + avif = 2 files
      expect(files).toContain('bliss-large-1024w.webp')
      expect(files).toContain('bliss-large-1024w.avif')
      expect(files).not.toContain('bliss-large-1024w.jpg')

      // Total: 2 sizes × 2 formats = 4 sized variants
      expect(files.filter(f => f.startsWith('bliss-'))).toHaveLength(4)

      // Original: webp + avif
      expect(files).toContain('bliss.webp')
      expect(files).toContain('bliss.avif')
    }, 30000)
  })

  describe('format — smart', () => {
    it('should pick webp or jpg (whichever is smaller) for opaque image', async() => {
      const processor = new ImageProcessor({
        in: TEST_INPUT,
        out: TEST_OUTPUT,
        sizes: [{ name: 'medium', width: 300, height: 300 }],
        format: 'smart',
        exclude: ['gallery/**']
      })

      cleanup(TEST_OUTPUT)
      await processor.processAll({ force: true })

      const files = listOutputFiles()
      const blissFiles = files.filter(f => f.startsWith('bliss-medium-'))
      // Smart should produce exactly 1 file (webp or jpg)
      expect(blissFiles).toHaveLength(1)
      expect(blissFiles[0]).toMatch(/\.(webp|jpg)$/)
    })

    it('should produce smart pick + avif with format: [smart, avif]', async() => {
      const processor = new ImageProcessor({
        in: TEST_INPUT,
        out: TEST_OUTPUT,
        sizes: [{ name: 'medium', width: 300, height: 300 }],
        format: ['smart', 'avif'],
        exclude: ['gallery/**']
      })

      cleanup(TEST_OUTPUT)
      await processor.processAll({ force: true })

      const files = listOutputFiles()
      const blissFiles = files.filter(f => f.startsWith('bliss-medium-'))
      // Should have avif + smart pick (webp or jpg) = 2 files
      expect(blissFiles).toHaveLength(2)
      expect(files).toContain('bliss-medium-300w.avif')
      const other = blissFiles.find(f => !f.endsWith('.avif'))
      expect(other).toMatch(/\.(webp|jpg)$/)

      // Original should also have avif + smart pick
      expect(files).toContain('bliss.avif')
    }, 30000)
  })

  describe('quality settings', () => {
    it('should respect custom quality — lower quality = smaller file', async() => {
      // High quality run
      const processorHigh = new ImageProcessor({
        in: TEST_INPUT,
        out: TEST_OUTPUT,
        sizes: [{ name: 'q', width: 800, height: 800 }],
        quality: { jpg: 95 },
        exclude: ['gallery/**']
      })

      cleanup(TEST_OUTPUT)
      await processorHigh.processAll({ force: true })
      const highFile = listOutputFiles().find(f => f.startsWith('bliss-q-'))
      const highSize = fs.statSync(path.join(TEST_OUTPUT, highFile)).size

      // Low quality run
      const processorLow = new ImageProcessor({
        in: TEST_INPUT,
        out: TEST_OUTPUT,
        sizes: [{ name: 'q', width: 800, height: 800 }],
        quality: { jpg: 40 },
        exclude: ['gallery/**']
      })

      cleanup(TEST_OUTPUT)
      await processorLow.processAll({ force: true })
      const lowFile = listOutputFiles().find(f => f.startsWith('bliss-q-'))
      const lowSize = fs.statSync(path.join(TEST_OUTPUT, lowFile)).size

      expect(lowSize).toBeLessThan(highSize)
    })
  })

  describe('directory structure', () => {
    it('should preserve subdirectory structure', async() => {
      const processor = new ImageProcessor({
        in: TEST_INPUT,
        out: TEST_OUTPUT,
        sizes: [{ name: 'medium', width: 300, height: 300 }],

      })

      cleanup(TEST_OUTPUT)
      await processor.processAll({ force: true })

      // Root variant
      expect(listOutputFiles()).toContain('bliss-medium-300w.jpg')

      // Gallery variant
      expect(fs.existsSync(path.join(TEST_OUTPUT, 'gallery'))).toBe(true)
      expect(listOutputFiles('gallery')).toContain('bliss-medium-300w.jpg')
    })
  })

  describe('no upscaling', () => {
    it('should skip sizes larger than the source (soft crop, width only)', async() => {
      const processor = new ImageProcessor({
        in: TEST_INPUT,
        out: TEST_OUTPUT,
        sizes: [
          { name: 'ok', width: 2000, height: 0 },
          { name: 'toobig', width: 5000, height: 0 }
        ],
        exclude: ['gallery/**']
      })

      cleanup(TEST_OUTPUT)
      await processor.processAll({ force: true })

      const files = listOutputFiles()
      expect(files.some(f => f.startsWith('bliss-ok-'))).toBe(true)
      expect(files.some(f => f.startsWith('bliss-toobig-'))).toBe(false)
    })

    it('should skip hard crop sizes when source is smaller in either dimension', async() => {
      const processor = new ImageProcessor({
        in: TEST_INPUT,
        out: TEST_OUTPUT,
        sizes: [
          { name: 'ok', width: 2000, height: 2000, crop: true },
          { name: 'toowide', width: 5000, height: 1000, crop: true },
          { name: 'tootall', width: 1000, height: 5000, crop: true }
        ],
        exclude: ['gallery/**']
      })

      cleanup(TEST_OUTPUT)
      await processor.processAll({ force: true })

      const files = listOutputFiles()
      expect(files.some(f => f.startsWith('bliss-ok-'))).toBe(true)
      expect(files.some(f => f.startsWith('bliss-toowide-'))).toBe(false)
      expect(files.some(f => f.startsWith('bliss-tootall-'))).toBe(false)
    })
  })

  describe('caching', () => {
    it('should skip on second run when source unchanged', async() => {
      const processor = new ImageProcessor({
        in: TEST_INPUT,
        out: TEST_OUTPUT,
        sizes: [{ name: 'medium', width: 300, height: 300 }],
        format: 'webp',
        exclude: ['gallery/**']
      })

      cleanup(TEST_OUTPUT)
      await processor.processAll({ force: true })
      const stats1 = processor.getStats()
      expect(stats1.processed).toBe(1)

      // Second run — should skip
      await processor.processAll()
      const stats2 = processor.getStats()
      expect(stats2.skipped).toBe(1)
      expect(stats2.processed).toBe(0)
    })

    it('should reprocess with --force even when cached', async() => {
      const processor = new ImageProcessor({
        in: TEST_INPUT,
        out: TEST_OUTPUT,
        sizes: [{ name: 'medium', width: 300, height: 300 }],
        exclude: ['gallery/**']
      })

      cleanup(TEST_OUTPUT)
      await processor.processAll({ force: true })

      await processor.processAll({ force: true })
      const stats = processor.getStats()
      expect(stats.processed).toBe(1)
      expect(stats.skipped).toBe(0)
    })

    it('should invalidate cache when config changes', async() => {
      const processor1 = new ImageProcessor({
        in: TEST_INPUT,
        out: TEST_OUTPUT,
        sizes: [{ name: 'medium', width: 300, height: 300 }],
        exclude: ['gallery/**']
      })

      cleanup(TEST_OUTPUT)
      await processor1.processAll({ force: true })

      // Different sizes → different config hash → should reprocess
      const processor2 = new ImageProcessor({
        in: TEST_INPUT,
        out: TEST_OUTPUT,
        sizes: [{ name: 'large', width: 1024, height: 1024 }],
        exclude: ['gallery/**']
      })

      await processor2.processAll()
      const stats = processor2.getStats()
      expect(stats.processed).toBe(1)
      expect(stats.skipped).toBe(0)
    })
  })

  describe('dry run', () => {
    it('should not write any files', async() => {
      cleanup(TEST_OUTPUT)

      const processor = new ImageProcessor({
        in: TEST_INPUT,
        out: TEST_OUTPUT,
        sizes: [
          { name: 'medium', width: 300, height: 300 },
          { name: 'large', width: 1024, height: 1024 }
        ],
        format: ['webp', 'avif']
      })

      await processor.processAll({ dryRun: true })
      expect(fs.existsSync(TEST_OUTPUT)).toBe(false)
    })
  })

  describe('stats', () => {
    it('should report accurate processing stats', async() => {
      const processor = new ImageProcessor({
        in: TEST_INPUT,
        out: TEST_OUTPUT,
        sizes: [
          { name: 'medium', width: 300, height: 300 },
          { name: 'large', width: 1024, height: 1024 }
        ],
        format: 'webp',
        exclude: ['gallery/**']
      })

      cleanup(TEST_OUTPUT)
      const stats = await processor.processAll({ force: true })

      expect(stats.processed).toBe(1)
      // 1 original + 2 sizes × 1 format (webp) = 3 variants
      expect(stats.variants).toBe(3)
      expect(stats.bytes).toBeGreaterThan(0)
      expect(stats.elapsed).toBeGreaterThan(0)
      expect(stats.skipped).toBe(0)
    })
  })

  describe('naming pattern — regex compatibility', () => {
    it('all output files should match poops discovery regex', async() => {
      const processor = new ImageProcessor({
        in: TEST_INPUT,
        out: TEST_OUTPUT,
        sizes: [
          { name: 'thumbnail', width: 150, height: 150, crop: true },
          { name: 'medium', width: 300, height: 300 },
          { width: 768 }
        ],
        format: ['webp', 'avif'],
        exclude: ['gallery/**']
      })

      cleanup(TEST_OUTPUT)
      await processor.processAll({ force: true })

      const poopsRegex = /^(.+)-(\d+)w\.([a-z0-9]+)$/
      const originalRegex = /^(.+)\.([a-z0-9]+)$/
      const files = listOutputFiles()

      for (const file of files) {
        // Skip cache files
        if (file.startsWith('.')) continue
        // Originals (non-resized) have no -NNNw suffix
        if (!file.includes('-')) {
          expect(file).toMatch(originalRegex)
          continue
        }
        const match = file.match(poopsRegex)
        expect(match).not.toBeNull()
        expect(parseInt(match[2], 10)).toBeGreaterThan(0)
      }
    }, 30000)
  })

  describe('conversion-only mode (no resize)', () => {
    it('should re-encode at original dimensions with no width suffix (default)', async() => {
      const processor = new ImageProcessor({
        in: TEST_INPUT,
        out: TEST_OUTPUT,
        sizes: [],
        exclude: ['gallery/**']
      })

      cleanup(TEST_OUTPUT)
      await processor.processAll({ force: true })

      const files = listOutputFiles()

      // Default: just re-encode base format (jpg)
      expect(files).toContain('bliss.jpg')
      expect(files).not.toContain('bliss.webp')

      // Should NOT have any -NNNw pattern
      expect(files.some(f => /\d+w\./.test(f))).toBe(false)

      // Dimensions should match source (4400x3300)
      const meta = await sharp(path.join(TEST_OUTPUT, 'bliss.jpg')).metadata()
      expect(meta.width).toBe(4400)
      expect(meta.height).toBe(3300)
    })

    it('should work with single format', async() => {
      const processor = new ImageProcessor({
        in: TEST_INPUT,
        out: TEST_OUTPUT,
        sizes: [],
        format: 'webp',
        exclude: ['gallery/**']
      })

      cleanup(TEST_OUTPUT)
      await processor.processAll({ force: true })

      const files = listOutputFiles()
      expect(files).toContain('bliss.webp')
      expect(files).not.toContain('bliss.jpg')
      expect(files).not.toContain('bliss.avif')
    })

    it('should work with multiple formats', async() => {
      const processor = new ImageProcessor({
        in: TEST_INPUT,
        out: TEST_OUTPUT,
        sizes: [],
        format: ['webp', 'avif'],
        exclude: ['gallery/**']
      })

      cleanup(TEST_OUTPUT)
      await processor.processAll({ force: true })

      const files = listOutputFiles()
      expect(files).toContain('bliss.webp')
      expect(files).toContain('bliss.avif')
      expect(files).not.toContain('bliss.jpg')
    }, 15000)
  })

  describe('full WordPress-style config', () => {
    it('should handle a production-like config with all size types', async() => {
      const processor = new ImageProcessor({
        in: TEST_INPUT,
        out: TEST_OUTPUT,
        sizes: [
          { name: 'thumbnail', width: 150, height: 150, crop: true },
          { name: 'medium', width: 300, height: 300 },
          { name: 'medium_large', width: 768, height: 0 },
          { name: 'large', width: 1024, height: 1024 },
          { name: 'hero', width: 1920, height: 600, crop: ['center', 'top'] },
          { name: 'card', width: 400, height: 300, crop: ['center', 'center'] }
        ],
        format: ['webp', 'avif'],
        quality: { jpg: 82, webp: 80, avif: 60 },
        exclude: ['gallery/**']
      })

      cleanup(TEST_OUTPUT)
      const stats = await processor.processAll({ force: true })

      expect(stats.processed).toBe(1)
      // 1 original × 2 formats + 6 sizes × 2 formats = 14
      expect(stats.variants).toBe(14)

      const files = listOutputFiles()

      // Original: webp + avif
      expect(files).toContain('bliss.webp')
      expect(files).toContain('bliss.avif')

      // Verify each size produced webp + avif (no jpg — format list is explicit)
      expect(files).toContain('bliss-thumbnail-150w.webp')
      expect(files).toContain('bliss-thumbnail-150w.avif')
      expect(files).toContain('bliss-medium-300w.webp')
      expect(files).toContain('bliss-medium-300w.avif')
      expect(files).toContain('bliss-medium_large-768w.webp')
      expect(files).toContain('bliss-medium_large-768w.avif')
      expect(files).toContain('bliss-large-1024w.webp')
      expect(files).toContain('bliss-large-1024w.avif')
      expect(files).toContain('bliss-hero-1920w.webp')
      expect(files).toContain('bliss-hero-1920w.avif')
      expect(files).toContain('bliss-card-400w.webp')
      expect(files).toContain('bliss-card-400w.avif')

      // No jpg files
      expect(files.filter(f => f.endsWith('.jpg'))).toHaveLength(0)

      // Verify dimensions via webp
      const check = async(filename, expectedW, expectedH) => {
        const meta = await sharp(path.join(TEST_OUTPUT, filename)).metadata()
        expect(meta.width).toBe(expectedW)
        if (expectedH) expect(meta.height).toBe(expectedH)
      }

      await check('bliss-thumbnail-150w.webp', 150, 150)     // hard crop
      await check('bliss-medium-300w.webp', 300, 225)         // soft crop 4:3
      await check('bliss-medium_large-768w.webp', 768, 576)   // width-only 4:3
      await check('bliss-large-1024w.webp', 1024, 768)        // soft crop 4:3
      await check('bliss-hero-1920w.webp', 1920, 600)         // anchor crop
      await check('bliss-card-400w.webp', 400, 300)           // anchor crop
    }, 30000)
  })
})
