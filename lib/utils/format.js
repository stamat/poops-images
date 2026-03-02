/**
 * Convert degrees/minutes/seconds to decimal degrees.
 * @param {[number, number, number]} dms - [degrees, minutes, seconds]
 * @param {string} ref - Cardinal direction: "N", "S", "E", or "W"
 * @returns {number} Decimal degrees (negative for S/W)
 * @example dmsToDecimal([35, 42, 55.01], 'N') // => 35.715281
 * @example dmsToDecimal([139, 46, 16.85], 'E') // => 139.771347
 * @example dmsToDecimal([33, 51, 54.55], 'S') // => -33.865153
 */
export function dmsToDecimal(dms, ref) {
  const [degrees, minutes, seconds] = dms
  let decimal = degrees + minutes / 60 + seconds / 3600
  if (ref === 'S' || ref === 'W') decimal = -decimal
  return Math.round(decimal * 1000000) / 1000000
}

/**
 * Format degrees/minutes/seconds as a human-readable string.
 * @param {[number, number, number]} dms - [degrees, minutes, seconds]
 * @param {string} ref - Cardinal direction: "N", "S", "E", or "W"
 * @returns {string} Formatted string like `35° 42' 55.01" N`
 * @example formatDms([35, 42, 55.01], 'N') // => '35° 42\' 55.01" N'
 * @example formatDms([139, 46, 16.85], 'E') // => '139° 46\' 16.85" E'
 */
export function formatDms(dms, ref) {
  return `${dms[0]}° ${dms[1]}' ${dms[2]}" ${ref}`
}

export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}GB`
}

export function formatTime(ms) {
  if (ms < 1000) return `${Math.round(ms)}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  if (ms < 3600000) return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`
  const h = Math.floor(ms / 3600000)
  const m = Math.round((ms % 3600000) / 60000)
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}
