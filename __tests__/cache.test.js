import { describe, it, expect, beforeEach, afterEach } from '@jest/globals'
import fs from 'node:fs'
import path from 'node:path'
import Cache from '../lib/cache.js'

const TMP = path.join(import.meta.dirname, 'fixtures', 'cache-tmp')

beforeEach(() => {
  fs.mkdirSync(TMP, { recursive: true })
})

afterEach(() => {
  fs.rmSync(TMP, { recursive: true, force: true })
})

describe('Cache path resolution', () => {
  it('should default to .poops-images-cache.json in output dir', () => {
    const cache = new Cache(TMP)
    expect(cache.cachePath).toBe(path.join(TMP, '.poops-images-cache.json'))
    expect(cache.disabled).toBe(false)
  })

  it('should use default path when cache is true', () => {
    const cache = new Cache(TMP, true)
    expect(cache.cachePath).toBe(path.join(TMP, '.poops-images-cache.json'))
    expect(cache.disabled).toBe(false)
  })

  it('should resolve relative cache path against output dir', () => {
    const cache = new Cache(TMP, 'custom-cache.json')
    expect(cache.cachePath).toBe(path.join(TMP, 'custom-cache.json'))
  })

  it('should use absolute cache path as-is', () => {
    const absPath = '/tmp/my-image-cache.json'
    const cache = new Cache(TMP, absPath)
    expect(cache.cachePath).toBe(absPath)
  })

  it('should resolve relative path with subdirectory', () => {
    const cache = new Cache(TMP, '.cache/images.json')
    expect(cache.cachePath).toBe(path.join(TMP, '.cache/images.json'))
  })
})

describe('Cache disabled mode', () => {
  it('should be disabled when cache is false', () => {
    const cache = new Cache(TMP, false)
    expect(cache.disabled).toBe(true)
    expect(cache.cachePath).toBeNull()
  })

  it('should not write any file on save', () => {
    const cache = new Cache(TMP, false)
    cache.setConfigHash('abc123')
    cache.setEntry('test.jpg', { mtime: 1000, size: 500 })
    cache.save()

    const files = fs.readdirSync(TMP)
    expect(files).toHaveLength(0)
  })

  it('should not load from disk', () => {
    // First create a cache file with enabled cache
    const enabled = new Cache(TMP, true)
    enabled.setConfigHash('abc123')
    enabled.save()

    // Disabled cache should not read it
    const disabled = new Cache(TMP, false)
    disabled.load()
    expect(disabled.getConfigHash()).toBeNull()
  })

  it('should always return false from shouldSkip', () => {
    const cache = new Cache(TMP, false)
    cache.setEntry('test.jpg', { mtime: 1000, size: 500, outputs: [] })
    expect(cache.shouldSkip('test.jpg', 1000, 500)).toBe(false)
  })
})

describe('Cache save with custom path', () => {
  it('should create parent directories for custom cache path', () => {
    const subdir = path.join(TMP, 'nested', 'dir')
    const cache = new Cache(TMP, 'nested/dir/cache.json')
    cache.save()

    expect(fs.existsSync(path.join(subdir, 'cache.json'))).toBe(true)
  })

  it('should save and load from custom path', () => {
    const cache = new Cache(TMP, 'my-cache.json')
    cache.setConfigHash('abc123')
    cache.setEntry('test.jpg', {
      mtime: 1000, size: 500,
      outputs: [{ path: 'test.jpg', width: 300, height: 200 }]
    })
    cache.save()

    const cache2 = new Cache(TMP, 'my-cache.json')
    cache2.load()
    expect(cache2.getConfigHash()).toBe('abc123')
    expect(cache2.getEntry('test.jpg')).toEqual({
      mtime: 1000, size: 500,
      outputs: [{ path: 'test.jpg', width: 300, height: 200 }]
    })
  })

  it('should store and retrieve output dimensions', () => {
    const cache = new Cache(TMP, 'dim-cache.json')
    cache.setEntry('photo.jpg', {
      mtime: 2000, size: 1000,
      outputs: [
        { path: 'photo-thumb-150w.webp', width: 150, height: 100 },
        { path: 'photo-thumb-150w.avif', width: 150, height: 100 },
        { path: 'photo-large-800w.webp', width: 800, height: 533 }
      ]
    })
    cache.save()

    const cache2 = new Cache(TMP, 'dim-cache.json')
    cache2.load()
    const outputs = cache2.getOutputs('photo.jpg')
    expect(outputs).toHaveLength(3)
    expect(outputs[0]).toEqual({ path: 'photo-thumb-150w.webp', width: 150, height: 100 })
    expect(outputs[2].width).toBe(800)
    expect(outputs[2].height).toBe(533)
  })

  it('should skip when all object outputs exist on disk', () => {
    const cache = new Cache(TMP)
    fs.writeFileSync(path.join(TMP, 'out.webp'), 'fake')
    cache.setEntry('test.jpg', {
      mtime: 1000, size: 500,
      outputs: [{ path: 'out.webp', width: 300, height: 200 }]
    })
    expect(cache.shouldSkip('test.jpg', 1000, 500)).toBe(true)
  })

  it('should not skip when object output is missing from disk', () => {
    const cache = new Cache(TMP)
    cache.setEntry('test.jpg', {
      mtime: 1000, size: 500,
      outputs: [{ path: 'missing.webp', width: 300, height: 200 }]
    })
    expect(cache.shouldSkip('test.jpg', 1000, 500)).toBe(false)
  })

  it('should handle legacy string outputs in shouldSkip', () => {
    const cache = new Cache(TMP)
    fs.writeFileSync(path.join(TMP, 'legacy.webp'), 'fake')
    cache.setEntry('test.jpg', {
      mtime: 1000, size: 500,
      outputs: ['legacy.webp']
    })
    expect(cache.shouldSkip('test.jpg', 1000, 500)).toBe(true)
  })

  it('should store null dimensions for SVG outputs', () => {
    const cache = new Cache(TMP)
    cache.setEntry('icon.svg', {
      mtime: 3000, size: 800,
      outputs: [{ path: 'icon.svg', width: null, height: null }]
    })
    const outputs = cache.getOutputs('icon.svg')
    expect(outputs[0].width).toBeNull()
    expect(outputs[0].height).toBeNull()
  })

  it('should not find cache at default path when custom path is used', () => {
    const cache = new Cache(TMP, 'my-cache.json')
    cache.setConfigHash('abc123')
    cache.save()

    expect(fs.existsSync(path.join(TMP, '.poops-images-cache.json'))).toBe(false)
    expect(fs.existsSync(path.join(TMP, 'my-cache.json'))).toBe(true)
  })
})
