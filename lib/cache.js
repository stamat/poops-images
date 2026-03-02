import fs from 'node:fs'
import path from 'node:path'

const CACHE_FILENAME = '.poops-images-cache.json'

export default class Cache {
  constructor(outputDir, cacheOption = true) {
    this.outputDir = outputDir
    this.disabled = cacheOption === false

    if (this.disabled) {
      this.cachePath = null
    } else if (typeof cacheOption === 'string') {
      this.cachePath = path.isAbsolute(cacheOption)
        ? cacheOption
        : path.join(outputDir, cacheOption)
    } else {
      this.cachePath = path.join(outputDir, CACHE_FILENAME)
    }

    this.data = { configHash: null, entries: {} }
  }

  load() {
    if (this.disabled) return
    try {
      if (fs.existsSync(this.cachePath)) {
        this.data = JSON.parse(fs.readFileSync(this.cachePath, 'utf-8'))
      }
    } catch {
      this.data = { configHash: null, entries: {} }
    }
  }

  save() {
    if (this.disabled) return
    fs.mkdirSync(path.dirname(this.cachePath), { recursive: true })
    fs.writeFileSync(this.cachePath, JSON.stringify(this.data, null, 2))
  }

  getConfigHash() {
    return this.data.configHash
  }

  setConfigHash(hash) {
    this.data.configHash = hash
  }

  invalidateAll() {
    // Mark all entries stale (mtime = -1) so shouldSkip returns false,
    // but preserve outputs for stale file cleanup
    for (const key of Object.keys(this.data.entries)) {
      this.data.entries[key].mtime = -1
    }
  }

  getEntry(relativePath) {
    return this.data.entries[relativePath] || null
  }

  setEntry(relativePath, entry) {
    this.data.entries[relativePath] = entry
  }

  removeEntry(relativePath) {
    delete this.data.entries[relativePath]
  }

  shouldSkip(relativePath, mtime, size) {
    if (this.disabled) return false
    const entry = this.getEntry(relativePath)
    if (!entry) return false

    if (entry.mtime !== mtime || entry.size !== size) return false

    // Check all outputs still exist on disk
    if (entry.outputs && Array.isArray(entry.outputs)) {
      for (const output of entry.outputs) {
        const outputPath = typeof output === 'string' ? output : output.path
        if (!fs.existsSync(path.join(this.outputDir, outputPath))) return false
      }
    }

    return true
  }

  getOutputs(relativePath) {
    const entry = this.getEntry(relativePath)
    return entry?.outputs || []
  }
}
