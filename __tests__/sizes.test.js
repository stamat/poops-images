import { describe, it, expect } from '@jest/globals'
import { validateSize, toSharpOptions, clampSizeToSource, markMainSizes, filterByUpscale } from '../lib/sizes.js'

describe('validateSize', () => {
  it('should validate a basic size with width only', () => {
    const result = validateSize({ name: 'medium', width: 300 })
    expect(result).toEqual({ name: 'medium', width: 300, height: 0, crop: false })
  })

  it('should validate a size with width and height', () => {
    const result = validateSize({ name: 'thumb', width: 150, height: 150 })
    expect(result).toEqual({ name: 'thumb', width: 150, height: 150, crop: false })
  })

  it('should validate crop: true', () => {
    const result = validateSize({ name: 'thumb', width: 150, height: 150, crop: true })
    expect(result.crop).toBe(true)
  })

  it('should validate crop array', () => {
    const result = validateSize({ name: 'hero', width: 1920, height: 600, crop: ['center', 'top'] })
    expect(result.crop).toEqual(['center', 'top'])
  })

  it('should allow size without name', () => {
    const result = validateSize({ width: 300 })
    expect(result).toEqual({ name: '', width: 300, height: 0, crop: false })
  })

  it('should allow width=0 height=0 for conversion-only mode', () => {
    const result = validateSize({})
    expect(result).toEqual({ name: '', width: 0, height: 0, crop: false })
  })

  it('should throw on invalid crop x position', () => {
    expect(() => validateSize({ name: 'bad', width: 100, height: 100, crop: ['invalid', 'top'] }))
      .toThrow('crop x must be one of')
  })

  it('should throw on invalid crop y position', () => {
    expect(() => validateSize({ name: 'bad', width: 100, height: 100, crop: ['left', 'invalid'] }))
      .toThrow('crop y must be one of')
  })

  it('should throw on crop array with wrong length', () => {
    expect(() => validateSize({ name: 'bad', width: 100, height: 100, crop: ['left'] }))
      .toThrow('exactly 2 elements')
  })
})

describe('toSharpOptions', () => {
  it('should return inside fit for soft crop', () => {
    const result = toSharpOptions({ name: 'test', width: 300, height: 0, crop: false })
    expect(result).toEqual({ width: 300, fit: 'inside', withoutEnlargement: true })
  })

  it('should return cover fit with centre for hard crop true', () => {
    const result = toSharpOptions({ name: 'test', width: 150, height: 150, crop: true })
    expect(result).toEqual({ width: 150, height: 150, fit: 'cover', position: 'centre' })
  })

  it('should return cover fit with position for crop array (no center)', () => {
    const result = toSharpOptions({ name: 'test', width: 1920, height: 600, crop: ['left', 'top'] })
    expect(result).toEqual({ width: 1920, height: 600, fit: 'cover', position: 'left top' })
  })

  it('should return cover fit for center center → centre', () => {
    const result = toSharpOptions({ name: 'test', width: 400, height: 300, crop: ['center', 'center'] })
    expect(result).toEqual({ width: 400, height: 300, fit: 'cover', position: 'centre' })
  })

  it('should return cover fit for right bottom', () => {
    const result = toSharpOptions({ name: 'test', width: 400, height: 300, crop: ['right', 'bottom'] })
    expect(result).toEqual({ width: 400, height: 300, fit: 'cover', position: 'right bottom' })
  })

  it('should drop center x → position is just y', () => {
    const result = toSharpOptions({ name: 'test', width: 400, height: 300, crop: ['center', 'top'] })
    expect(result).toEqual({ width: 400, height: 300, fit: 'cover', position: 'top' })
  })

  it('should drop center y → position is just x', () => {
    const result = toSharpOptions({ name: 'test', width: 400, height: 300, crop: ['left', 'center'] })
    expect(result).toEqual({ width: 400, height: 300, fit: 'cover', position: 'left' })
  })

  it('should omit width when 0', () => {
    const result = toSharpOptions({ name: 'test', width: 0, height: 300, crop: false })
    expect(result.width).toBeUndefined()
    expect(result.height).toBe(300)
  })

  it('should omit height when 0', () => {
    const result = toSharpOptions({ name: 'test', width: 300, height: 0, crop: false })
    expect(result.height).toBeUndefined()
    expect(result.width).toBe(300)
  })

  it('should return null for conversion-only (width=0 height=0)', () => {
    const result = toSharpOptions({ name: '', width: 0, height: 0, crop: false })
    expect(result).toBeNull()
  })
})

describe('clampSizeToSource', () => {
  it('leaves non-crop sizes untouched', () => {
    const s = { width: 300, height: 300, crop: false }
    expect(clampSizeToSource(s, 100, 100)).toBe(s)
  })

  it('leaves a crop that fits untouched', () => {
    const s = { width: 300, height: 300, crop: true }
    expect(clampSizeToSource(s, 1000, 800)).toBe(s)
  })

  it('scales an oversized crop down proportionally, preserving aspect ratio', () => {
    // 960x960 crop from a 1083x726 source → limited by height: 726x726
    const r = clampSizeToSource({ width: 960, height: 960, crop: true }, 1083, 726)
    expect([r.width, r.height]).toEqual([726, 726])
  })

  it('keeps a non-square crop ratio when clamping', () => {
    // 400x100 (4:1) from 200x150 → scale by min(200/400,150/100)=0.5 → 200x50
    const r = clampSizeToSource({ width: 400, height: 100, crop: true }, 200, 150)
    expect([r.width, r.height]).toEqual([200, 50])
  })
})

describe('markMainSizes', () => {
  it('marks the largest of a named group as main, siblings not', () => {
    const r = markMainSizes([
      { name: 'thumb', width: 480, height: 480, crop: true },
      { name: 'thumb', width: 960, height: 960, crop: true }
    ])
    expect(r[0].main).toBe(false)
    expect(r[1].main).toBe(true)
  })

  it('marks a sole named size as main', () => {
    const r = markMainSizes([{ name: 'thumb', width: 200, height: 200 }])
    expect(r[0].main).toBe(true)
  })

  it('leaves unnamed sizes without a main flag', () => {
    const r = markMainSizes([{ name: '', width: 480, height: 0 }])
    expect(r[0].main).toBeUndefined()
  })

  it('keeps separate named groups independent', () => {
    const r = markMainSizes([
      { name: 'a', width: 100, height: 100 },
      { name: 'a', width: 200, height: 200 },
      { name: 'b', width: 50, height: 50 }
    ])
    expect(r.map(s => s.main)).toEqual([false, true, true])
  })
})

describe('filterByUpscale — crops', () => {
  it('keeps an oversized crop (it will be scaled down, not dropped)', () => {
    const sizes = [{ width: 960, height: 960, crop: true }]
    expect(filterByUpscale(sizes, 1083, 726)).toEqual(sizes)
  })
})
