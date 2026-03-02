import { describe, it, expect } from '@jest/globals'
import { dmsToDecimal, formatDms, formatBytes, formatTime } from '../../lib/utils/format.js'

describe('dmsToDecimal', () => {
  it('should convert North latitude', () => {
    expect(dmsToDecimal([35, 42, 55.01], 'N')).toBe(35.715281)
  })

  it('should convert East longitude', () => {
    expect(dmsToDecimal([139, 46, 16.85], 'E')).toBe(139.771347)
  })

  it('should negate for South latitude', () => {
    expect(dmsToDecimal([33, 51, 54.55], 'S')).toBe(-33.865153)
  })

  it('should negate for West longitude', () => {
    expect(dmsToDecimal([118, 14, 37.25], 'W')).toBe(-118.243681)
  })

  it('should handle zero seconds', () => {
    expect(dmsToDecimal([45, 30, 0], 'N')).toBe(45.5)
  })

  it('should handle zero minutes and seconds', () => {
    expect(dmsToDecimal([90, 0, 0], 'N')).toBe(90)
  })
})

describe('formatDms', () => {
  it('should format North latitude', () => {
    expect(formatDms([35, 42, 55.01], 'N')).toBe('35° 42\' 55.01" N')
  })

  it('should format East longitude', () => {
    expect(formatDms([139, 46, 16.85], 'E')).toBe('139° 46\' 16.85" E')
  })

  it('should format South latitude', () => {
    expect(formatDms([33, 51, 54.55], 'S')).toBe('33° 51\' 54.55" S')
  })

  it('should format West longitude', () => {
    expect(formatDms([118, 14, 37.25], 'W')).toBe('118° 14\' 37.25" W')
  })
})

describe('formatBytes', () => {
  it('should format bytes', () => {
    expect(formatBytes(512)).toBe('512B')
  })

  it('should format kilobytes', () => {
    expect(formatBytes(1024)).toBe('1.0KB')
    expect(formatBytes(1536)).toBe('1.5KB')
  })

  it('should format megabytes', () => {
    expect(formatBytes(1024 * 1024)).toBe('1.0MB')
    expect(formatBytes(5.5 * 1024 * 1024)).toBe('5.5MB')
  })

  it('should format gigabytes', () => {
    expect(formatBytes(1024 * 1024 * 1024)).toBe('1.0GB')
    expect(formatBytes(2.3 * 1024 * 1024 * 1024)).toBe('2.3GB')
  })
})

describe('formatTime', () => {
  it('should format milliseconds', () => {
    expect(formatTime(45)).toBe('45ms')
    expect(formatTime(999)).toBe('999ms')
  })

  it('should format seconds', () => {
    expect(formatTime(1000)).toBe('1.0s')
    expect(formatTime(5500)).toBe('5.5s')
    expect(formatTime(59999)).toBe('60.0s')
  })

  it('should format minutes and seconds', () => {
    expect(formatTime(60000)).toBe('1m 0s')
    expect(formatTime(90000)).toBe('1m 30s')
    expect(formatTime(125000)).toBe('2m 5s')
  })

  it('should format hours and minutes', () => {
    expect(formatTime(3600000)).toBe('1h')
    expect(formatTime(5400000)).toBe('1h 30m')
    expect(formatTime(7200000)).toBe('2h')
  })
})
