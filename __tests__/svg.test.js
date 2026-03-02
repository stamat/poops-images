import { parseSvgDimensions } from '../lib/svg.js'

describe('parseSvgDimensions', () => {
  it('should extract width and height from attributes', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><rect/></svg>'
    expect(parseSvgDimensions(svg)).toEqual({ width: 200, height: 100 })
  })

  it('should extract width and height with px units', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="300px" height="150px"><rect/></svg>'
    expect(parseSvgDimensions(svg)).toEqual({ width: 300, height: 150 })
  })

  it('should round fractional dimensions', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="99.7" height="50.3"><rect/></svg>'
    expect(parseSvgDimensions(svg)).toEqual({ width: 100, height: 50 })
  })

  it('should fall back to viewBox when no width/height attributes', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600"><rect/></svg>'
    expect(parseSvgDimensions(svg)).toEqual({ width: 800, height: 600 })
  })

  it('should handle viewBox with non-zero origin', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="10 20 400 300"><rect/></svg>'
    expect(parseSvgDimensions(svg)).toEqual({ width: 400, height: 300 })
  })

  it('should prefer explicit width/height over viewBox', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 800 600"><rect/></svg>'
    expect(parseSvgDimensions(svg)).toEqual({ width: 200, height: 100 })
  })

  it('should return null dimensions when neither is present', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="50" height="50"/></svg>'
    expect(parseSvgDimensions(svg)).toEqual({ width: null, height: null })
  })

  it('should return null for invalid SVG content', () => {
    expect(parseSvgDimensions('<div>not an svg</div>')).toEqual({ width: null, height: null })
    expect(parseSvgDimensions('')).toEqual({ width: null, height: null })
  })

  it('should ignore non-numeric width/height (em, %, etc.)', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="50em" viewBox="0 0 400 200"><rect/></svg>'
    expect(parseSvgDimensions(svg)).toEqual({ width: 400, height: 200 })
  })

  it('should handle multiline svg tags', () => {
    const svg = `<svg
  xmlns="http://www.w3.org/2000/svg"
  width="120"
  height="80"
>
  <rect/>
</svg>`
    expect(parseSvgDimensions(svg)).toEqual({ width: 120, height: 80 })
  })
})
