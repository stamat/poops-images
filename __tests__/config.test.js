import { describe, it, expect, beforeEach, afterEach } from '@jest/globals'
import fs from 'node:fs'
import path from 'node:path'
import { loadConfig, validateConfig, configHash } from '../lib/config.js'

describe('validateConfig', () => {
  const minimalConfig = {
    in: 'src/images',
    out: 'dist/images',
    sizes: [{ name: 'thumb', width: 150, height: 150 }]
  }

  it('should accept minimal valid config', () => {
    const result = validateConfig(minimalConfig)
    expect(result.in).toBe('src/images')
    expect(result.out).toBe('dist/images')
    expect(result.sizes).toHaveLength(1)
    expect(result.format).toBe(false)
    expect(result.concurrency).toBe(4)
  })

  it('should accept format as string', () => {
    const result = validateConfig({ ...minimalConfig, format: 'webp' })
    expect(result.format).toBe('webp')
  })

  it('should accept format as array', () => {
    const result = validateConfig({ ...minimalConfig, format: ['webp', 'avif'] })
    expect(result.format).toEqual(['webp', 'avif'])
  })

  it('should accept format smart', () => {
    const result = validateConfig({ ...minimalConfig, format: 'smart' })
    expect(result.format).toBe('smart')
  })

  it('should accept format array with smart', () => {
    const result = validateConfig({ ...minimalConfig, format: ['smart', 'avif'] })
    expect(result.format).toEqual(['smart', 'avif'])
  })

  it('should throw for unsupported format', () => {
    expect(() => validateConfig({ ...minimalConfig, format: 'bmp' }))
      .toThrow('Unsupported format: "bmp"')
  })

  it('should throw for invalid format type', () => {
    expect(() => validateConfig({ ...minimalConfig, format: 123 }))
      .toThrow('"format" must be false')
  })

  it('should apply default quality values', () => {
    const result = validateConfig(minimalConfig)
    expect(result.quality.jpg).toBe(82)
    expect(result.quality.webp).toBe(80)
    expect(result.quality.avif).toBe(60)
    expect(result.quality.png).toBe(90)
  })

  it('should merge custom quality with defaults', () => {
    const result = validateConfig({ ...minimalConfig, quality: { jpg: 90 } })
    expect(result.quality.jpg).toBe(90)
    expect(result.quality.webp).toBe(80)
  })

  it('should accept quality as a number and set all formats', () => {
    const result = validateConfig({ ...minimalConfig, quality: 70 })
    expect(result.quality.jpg).toBe(70)
    expect(result.quality.webp).toBe(70)
    expect(result.quality.avif).toBe(70)
    expect(result.quality.png).toBe(70)
  })

  it('should throw for invalid quality type', () => {
    expect(() => validateConfig({ ...minimalConfig, quality: 'high' }))
      .toThrow('"quality" must be a number or an object')
  })

  it('should default empty sizes to conversion-only mode', () => {
    const result = validateConfig({ ...minimalConfig, sizes: [] })
    expect(result.sizes).toEqual([{ name: '', width: 0, height: 0, crop: false }])
  })

  it('should throw if in is not a string', () => {
    expect(() => validateConfig({ ...minimalConfig, in: 123 }))
      .toThrow('"in" must be a string')
  })

  it('should throw if out is not a string', () => {
    expect(() => validateConfig({ ...minimalConfig, out: null }))
      .toThrow('"out" must be a string')
  })

  it('should normalize exclude to array', () => {
    const result = validateConfig({ ...minimalConfig, exclude: 'drafts/**' })
    expect(result.exclude).toEqual(['drafts/**'])
  })

  it('should keep default include pattern', () => {
    const result = validateConfig(minimalConfig)
    expect(result.include).toBe('**/*.{jpg,jpeg,png,tiff,tif,webp,heic,heif}')
  })

  it('should default cache to true', () => {
    const result = validateConfig(minimalConfig)
    expect(result.cache).toBe(true)
  })

  it('should accept cache false to disable', () => {
    const result = validateConfig({ ...minimalConfig, cache: false })
    expect(result.cache).toBe(false)
  })

  it('should accept cache as string path', () => {
    const result = validateConfig({ ...minimalConfig, cache: '.my-cache.json' })
    expect(result.cache).toBe('.my-cache.json')
  })

  it('should accept cache as absolute path', () => {
    const result = validateConfig({ ...minimalConfig, cache: '/tmp/cache.json' })
    expect(result.cache).toBe('/tmp/cache.json')
  })

  it('should throw for invalid cache type', () => {
    expect(() => validateConfig({ ...minimalConfig, cache: 123 }))
      .toThrow('"cache" must be false, true, or a string path')
  })
})

const LOAD_TMP = path.join(import.meta.dirname, 'fixtures', 'config-tmp')

const VALID_FILE_CONFIG = {
  in: 'src/images',
  out: 'dist/images',
  sizes: [{ name: 'thumb', width: 150 }],
}

describe('loadConfig', () => {
  let originalCwd

  beforeEach(() => {
    fs.mkdirSync(LOAD_TMP, { recursive: true })
    originalCwd = process.cwd()
    process.chdir(LOAD_TMP)
  })

  afterEach(() => {
    process.chdir(originalCwd)
    fs.rmSync(LOAD_TMP, { recursive: true, force: true })
  })

  it('should load explicit config path', () => {
    const configPath = path.join(LOAD_TMP, 'custom.json')
    fs.writeFileSync(configPath, JSON.stringify(VALID_FILE_CONFIG))

    const result = loadConfig('custom.json')
    expect(result.in).toBe('src/images')
    expect(result.out).toBe('dist/images')
  })

  it('should throw for missing explicit config path', () => {
    expect(() => loadConfig('does-not-exist.json'))
      .toThrow('Config file not found')
  })

  it('should auto-discover poops-images.json', () => {
    fs.writeFileSync(path.join(LOAD_TMP, 'poops-images.json'), JSON.stringify(VALID_FILE_CONFIG))

    const result = loadConfig()
    expect(result.in).toBe('src/images')
  })

  it('should fallback to poops.json images key', () => {
    fs.writeFileSync(path.join(LOAD_TMP, 'poops.json'), JSON.stringify({ images: VALID_FILE_CONFIG }))

    const result = loadConfig()
    expect(result.in).toBe('src/images')
  })

  it('should skip poops.json without images key and fallback further', () => {
    fs.writeFileSync(path.join(LOAD_TMP, 'poops.json'), JSON.stringify({ other: true }))
    fs.writeFileSync(path.join(LOAD_TMP, '\u{1F4A9}.json'), JSON.stringify({ images: VALID_FILE_CONFIG }))

    const result = loadConfig()
    expect(result.in).toBe('src/images')
  })

  it('should fallback to \u{1F4A9}.json', () => {
    fs.writeFileSync(path.join(LOAD_TMP, '\u{1F4A9}.json'), JSON.stringify({ images: VALID_FILE_CONFIG }))

    const result = loadConfig()
    expect(result.in).toBe('src/images')
  })

  it('should throw when no config found at all', () => {
    expect(() => loadConfig())
      .toThrow('No config found')
  })

  it('should prefer poops-images.json over poops.json', () => {
    fs.writeFileSync(path.join(LOAD_TMP, 'poops-images.json'), JSON.stringify({
      ...VALID_FILE_CONFIG, in: 'from-poops-images'
    }))
    fs.writeFileSync(path.join(LOAD_TMP, 'poops.json'), JSON.stringify({
      images: { ...VALID_FILE_CONFIG, in: 'from-poops' }
    }))

    const result = loadConfig()
    expect(result.in).toBe('from-poops-images')
  })

  it('should return validated config with defaults applied', () => {
    fs.writeFileSync(path.join(LOAD_TMP, 'poops-images.json'), JSON.stringify(VALID_FILE_CONFIG))

    const result = loadConfig()
    expect(result.concurrency).toBe(4)
    expect(result.format).toBe(false)
    expect(result.quality.jpg).toBe(82)
  })
})

describe('configHash', () => {
  it('should return consistent hash for same config', () => {
    const config = validateConfig({
      in: 'src',
      out: 'dist',
      sizes: [{ name: 'a', width: 100, height: 100 }]
    })
    expect(configHash(config)).toBe(configHash(config))
  })

  it('should change when sizes change', () => {
    const config1 = validateConfig({
      in: 'src',
      out: 'dist',
      sizes: [{ name: 'a', width: 100, height: 100 }]
    })
    const config2 = validateConfig({
      in: 'src',
      out: 'dist',
      sizes: [{ name: 'a', width: 200, height: 200 }]
    })
    expect(configHash(config1)).not.toBe(configHash(config2))
  })

  it('should not change when in/out paths change', () => {
    const config1 = validateConfig({
      in: 'src',
      out: 'dist',
      sizes: [{ name: 'a', width: 100, height: 100 }]
    })
    const config2 = validateConfig({
      in: 'other',
      out: 'other-dist',
      sizes: [{ name: 'a', width: 100, height: 100 }]
    })
    expect(configHash(config1)).toBe(configHash(config2))
  })

  it('should change when format changes', () => {
    const config1 = validateConfig({
      in: 'src',
      out: 'dist',
      sizes: [{ name: 'a', width: 100, height: 100 }]
    })
    const config2 = validateConfig({
      in: 'src',
      out: 'dist',
      sizes: [{ name: 'a', width: 100, height: 100 }],
      format: 'webp'
    })
    expect(configHash(config1)).not.toBe(configHash(config2))
  })
})
