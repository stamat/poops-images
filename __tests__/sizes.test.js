import { describe, it, expect } from '@jest/globals'
import { validateSize, toSharpOptions } from '../lib/sizes.js'

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
