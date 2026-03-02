import { describe, it, expect } from '@jest/globals'
import { extractExif } from '../lib/analyze.js'

const FULL_EXIF = {
  Image: {
    Make: 'Apple',
    Model: 'iPhone 15 Pro',
    Orientation: 6,
    XResolution: 72,
    YResolution: 72,
    DateTime: '2025-11-25T15:32:05.000Z',
    Software: '26.1',
  },
  Photo: {
    ExposureTime: 0.016666666666666666,
    FNumber: 1.9,
    ISOSpeedRatings: 80,
    OffsetTime: '+09:00',
    FocalLength: 2.69,
    FocalLengthIn35mmFilm: 30,
    Flash: 16,
    LensModel: 'iPhone 15 Pro front TrueDepth camera 2.69mm f/1.9',
  },
  GPSInfo: {
    GPSLatitudeRef: 'N',
    GPSLatitude: [35, 42, 55.01],
    GPSLongitudeRef: 'E',
    GPSLongitude: [139, 46, 16.85],
    GPSAltitudeRef: 0,
    GPSAltitude: 15.278277153558053,
    GPSTimeStamp: [6, 32, 4],
    GPSSpeedRef: 'K',
    GPSSpeed: 0.2116664946325351,
    GPSImgDirectionRef: 'T',
    GPSImgDirection: 39.19978331527627,
    GPSDateStamp: '2025:11:25',
  },
}

describe('extractExif', () => {
  it('should return null for null input', () => {
    expect(extractExif(null)).toBeNull()
  })

  it('should return null for undefined input', () => {
    expect(extractExif(undefined)).toBeNull()
  })

  it('should extract all Image fields', () => {
    const result = extractExif(FULL_EXIF)
    expect(result.make).toBe('Apple')
    expect(result.model).toBe('iPhone 15 Pro')
    expect(result.orientation).toBe(6)
    expect(result.resolution).toEqual({ x: 72, y: 72 })
    expect(result.dateTime).toBe('2025-11-25T15:32:05.000Z')
    expect(result.software).toBe('26.1')
  })

  it('should extract all Photo fields', () => {
    const result = extractExif(FULL_EXIF)
    expect(result.fNumber).toBe(1.9)
    expect(result.iso).toBe(80)
    expect(result.offsetTime).toBe('+09:00')
    expect(result.focalLength).toBe(2.69)
    expect(result.focalLength35mm).toBe(30)
    expect(result.lensModel).toBe('iPhone 15 Pro front TrueDepth camera 2.69mm f/1.9')
  })

  it('should handle empty EXIF sections gracefully', () => {
    const result = extractExif({})
    expect(result.make).toBeNull()
    expect(result.model).toBeNull()
    expect(result.fNumber).toBeNull()
    expect(result.iso).toBeNull()
    expect(result.gps).toBeNull()
  })

  it('should handle missing Photo section', () => {
    const result = extractExif({ Image: { Make: 'Canon' } })
    expect(result.make).toBe('Canon')
    expect(result.exposure).toBeNull()
    expect(result.flash).toBeNull()
    expect(result.focalLength35mm).toBeNull()
  })

  it('should null resolution when both X and Y are missing', () => {
    const result = extractExif({ Image: { Make: 'Canon' } })
    expect(result.resolution).toBeNull()
  })

  describe('exposure formatting', () => {
    it('should format fractional exposure as 1/N', () => {
      const result = extractExif({
        Photo: { ExposureTime: 0.016666666666666666 },
      })
      expect(result.exposure).toEqual({ value: 0.016666666666666666, formatted: '1/60' })
    })

    it('should format 1/1000s exposure', () => {
      const result = extractExif({
        Photo: { ExposureTime: 0.001 },
      })
      expect(result.exposure).toEqual({ value: 0.001, formatted: '1/1000' })
    })

    it('should format long exposure >= 1s', () => {
      const result = extractExif({
        Photo: { ExposureTime: 2 },
      })
      expect(result.exposure).toEqual({ value: 2, formatted: '2s' })
    })

    it('should format exactly 1s exposure', () => {
      const result = extractExif({
        Photo: { ExposureTime: 1 },
      })
      expect(result.exposure).toEqual({ value: 1, formatted: '1s' })
    })

    it('should handle ExposureTime of 0', () => {
      const result = extractExif({
        Photo: { ExposureTime: 0 },
      })
      // 0 is != null, so exposure should be set
      expect(result.exposure).not.toBeNull()
    })
  })

  describe('flash decoding', () => {
    it('should decode flash not fired (0x10 = 16)', () => {
      const result = extractExif({ Photo: { Flash: 16 } })
      expect(result.flash).toBe(false)
    })

    it('should decode flash fired (0x01 = 1)', () => {
      const result = extractExif({ Photo: { Flash: 1 } })
      expect(result.flash).toBe(true)
    })

    it('should decode auto flash fired (0x19 = 25)', () => {
      const result = extractExif({ Photo: { Flash: 25 } })
      expect(result.flash).toBe(true)
    })

    it('should decode no flash (0x00 = 0)', () => {
      const result = extractExif({ Photo: { Flash: 0 } })
      expect(result.flash).toBe(false)
    })

    it('should return null when Flash is absent', () => {
      const result = extractExif({ Photo: {} })
      expect(result.flash).toBeNull()
    })
  })

  describe('GPS extraction', () => {
    it('should return gps null when no GPS data', () => {
      const result = extractExif({ Image: { Make: 'Canon' } })
      expect(result.gps).toBeNull()
    })

    it('should return gps null when only latitude present', () => {
      const result = extractExif({
        GPSInfo: { GPSLatitude: [35, 42, 55.01], GPSLatitudeRef: 'N' },
      })
      expect(result.gps).toBeNull()
    })

    it('should extract full GPS data', () => {
      const result = extractExif(FULL_EXIF)
      expect(result.gps).not.toBeNull()
      expect(result.gps.latitude.degrees).toEqual([35, 42, 55.01])
      expect(result.gps.latitude.ref).toBe('N')
      expect(result.gps.latitude.decimal).toBe(35.715281)
      expect(result.gps.latitude.formatted).toBe('35° 42\' 55.01" N')
      expect(result.gps.longitude.degrees).toEqual([139, 46, 16.85])
      expect(result.gps.longitude.ref).toBe('E')
      expect(result.gps.longitude.decimal).toBe(139.771347)
      expect(result.gps.longitude.formatted).toBe('139° 46\' 16.85" E')
    })

    it('should extract altitude', () => {
      const result = extractExif(FULL_EXIF)
      expect(result.gps.altitude).toEqual({ value: 15.28, ref: 0 })
    })

    it('should null altitude when absent', () => {
      const result = extractExif({
        GPSInfo: {
          GPSLatitude: [35, 42, 55.01],
          GPSLatitudeRef: 'N',
          GPSLongitude: [139, 46, 16.85],
          GPSLongitudeRef: 'E',
        },
      })
      expect(result.gps.altitude).toBeNull()
    })

    it('should extract direction rounded to 2 decimals', () => {
      const result = extractExif(FULL_EXIF)
      expect(result.gps.direction).toBe(39.2)
    })

    it('should null direction when absent', () => {
      const result = extractExif({
        GPSInfo: {
          GPSLatitude: [35, 42, 55.01],
          GPSLatitudeRef: 'N',
          GPSLongitude: [139, 46, 16.85],
          GPSLongitudeRef: 'E',
        },
      })
      expect(result.gps.direction).toBeNull()
    })

    it('should extract speed in km/h', () => {
      const result = extractExif(FULL_EXIF)
      expect(result.gps.speed).toEqual({ value: 0.21, unit: 'km/h' })
    })

    it('should map speed unit M to mph', () => {
      const result = extractExif({
        GPSInfo: {
          GPSLatitude: [0, 0, 0],
          GPSLatitudeRef: 'N',
          GPSLongitude: [0, 0, 0],
          GPSLongitudeRef: 'E',
          GPSSpeed: 5.5,
          GPSSpeedRef: 'M',
        },
      })
      expect(result.gps.speed).toEqual({ value: 5.5, unit: 'mph' })
    })

    it('should map unknown speed ref to knots', () => {
      const result = extractExif({
        GPSInfo: {
          GPSLatitude: [0, 0, 0],
          GPSLatitudeRef: 'N',
          GPSLongitude: [0, 0, 0],
          GPSLongitudeRef: 'E',
          GPSSpeed: 3,
          GPSSpeedRef: 'N',
        },
      })
      expect(result.gps.speed).toEqual({ value: 3, unit: 'knots' })
    })

    it('should null speed when absent', () => {
      const result = extractExif({
        GPSInfo: {
          GPSLatitude: [0, 0, 0],
          GPSLatitudeRef: 'N',
          GPSLongitude: [0, 0, 0],
          GPSLongitudeRef: 'E',
        },
      })
      expect(result.gps.speed).toBeNull()
    })

    it('should combine GPS datestamp and timestamp into ISO dateTime', () => {
      const result = extractExif(FULL_EXIF)
      expect(result.gps.dateTime).toBe('2025-11-25T06:32:04Z')
    })

    it('should null GPS dateTime when datestamp is missing', () => {
      const result = extractExif({
        GPSInfo: {
          GPSLatitude: [0, 0, 0],
          GPSLatitudeRef: 'N',
          GPSLongitude: [0, 0, 0],
          GPSLongitudeRef: 'E',
          GPSTimeStamp: [6, 32, 4],
        },
      })
      expect(result.gps.dateTime).toBeNull()
    })

    it('should null GPS dateTime when timestamp is missing', () => {
      const result = extractExif({
        GPSInfo: {
          GPSLatitude: [0, 0, 0],
          GPSLatitudeRef: 'N',
          GPSLongitude: [0, 0, 0],
          GPSLongitudeRef: 'E',
          GPSDateStamp: '2025:11:25',
        },
      })
      expect(result.gps.dateTime).toBeNull()
    })

    it('should generate Google Maps URL', () => {
      const result = extractExif(FULL_EXIF)
      expect(result.gps.googleMapsUrl).toBe('https://www.google.com/maps?q=35.715281,139.771347')
    })

    it('should handle negative coordinates in Google Maps URL', () => {
      const result = extractExif({
        GPSInfo: {
          GPSLatitude: [33, 51, 54.55],
          GPSLatitudeRef: 'S',
          GPSLongitude: [118, 14, 37.25],
          GPSLongitudeRef: 'W',
        },
      })
      expect(result.gps.googleMapsUrl).toBe('https://www.google.com/maps?q=-33.865153,-118.243681')
    })
  })
})
