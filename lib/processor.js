import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import chokidar from 'chokidar'
import { validateConfig, configHash } from './config.js'
import { toSharpOptions, filterByUpscale } from './sizes.js'
import { convertFormat, resolveTargetFormats } from './formats.js'
import { discoverAll } from './discover.js'
import { analyzeImage } from './analyze.js'
import Cache from './cache.js'
import { processSvg } from './svg.js'
import log from './utils/log.js'
import { formatBytes, formatTime } from './utils/format.js'

export default class ImageProcessor {
  constructor(config) {
    this.config = validateConfig(config)
    this.cache = new Cache(this.config.out, this.config.cache)
    this.stats = { processed: 0, variants: 0, skipped: 0, bytes: 0, startTime: 0 }
    this.watcher = null
  }

  async processAll(options = {}) {
    const { force = false, dryRun = false } = options
    this.stats = { processed: 0, variants: 0, skipped: 0, bytes: 0, startTime: Date.now() }

    this.cache.load()

    const hash = configHash(this.config)
    if (this.cache.getConfigHash() !== hash) {
      if (this.cache.getConfigHash() !== null) {
        log({ tag: 'image', text: 'Config changed, reprocessing all images' })
      }
      this.cache.invalidateAll()
      this.cache.setConfigHash(hash)
    }

    // Discover all file types in parallel
    const { raster: sourceFiles, svg: svgFiles, gif: gifFiles } = await discoverAll(this.config)

    if (sourceFiles.length > 0) {
      log({ tag: 'image', text: `Found ${sourceFiles.length} source image(s)` })
    }

    // Raster pipeline — resize and format conversion
    if (dryRun) {
      for (const file of sourceFiles) {
        log({ tag: 'image', text: 'Would process:', link: file })
      }
    } else {
      const queue = [...sourceFiles]
      const workers = []
      for (let i = 0; i < this.config.concurrency; i++) {
        workers.push(this._worker(queue, force))
      }
      await Promise.all(workers)
    }

    // SVG + GIF pipelines — run concurrently
    await Promise.all([
      this._processSvgPipeline(svgFiles, { force, dryRun }),
      this._processGifPipeline(gifFiles, { force, dryRun })
    ])

    if (!dryRun) this.cache.save()

    const elapsed = formatTime(Date.now() - this.stats.startTime)
    log({
      tag: 'image',
      text: `\u2713 ${this.stats.processed} image(s) \u2192 ${this.stats.variants} variant(s)`,
      size: this.stats.skipped > 0 ? `(${this.stats.skipped} skipped)` : '',
      time: elapsed
    })

    return this.getStats()
  }

  async processImage(inputPath, force = false) {
    const relativePath = path.relative(this.config.in, inputPath)

    // Stat + cache check
    let stat
    try {
      stat = fs.statSync(inputPath)
    } catch {
      log({ tag: 'error', text: 'Cannot read file:', link: inputPath })
      return
    }

    if (!force && this.cache.shouldSkip(relativePath, stat.mtimeMs, stat.size)) {
      this.stats.skipped++
      return
    }

    log({ tag: 'image', text: 'Processing:', link: relativePath })

    // Analyze — metadata, transparency, format normalization, effective sizes
    const job = await analyzeImage(inputPath, this.config, stat)
    if (!job) return

    const startTime = Date.now()
    const outputs = []

    // Get previous outputs before processing (for stale cleanup)
    const previousOutputs = this.cache.getOutputs(relativePath)

    // Filter sizes by upscale constraints
    const eligibleSizes = filterByUpscale(
      job.effectiveSizes, job.sourceWidth, job.sourceHeight
    )

    for (const sizeDef of eligibleSizes) {
      const conversionOnly = sizeDef.width === 0 && sizeDef.height === 0

      // Resize
      const sharpOpts = toSharpOptions(sizeDef)
      const pipeline = sharpOpts ? sharp(inputPath).rotate().resize(sharpOpts) : sharp(inputPath).rotate()
      const resizedBuffer = await pipeline.toBuffer({ resolveWithObject: true })
      const actualWidth = resizedBuffer.info.width
      const actualHeight = resizedBuffer.info.height

      // Build output path
      const outDir = path.join(this.config.out, job.parsed.dir)
      fs.mkdirSync(outDir, { recursive: true })

      let baseName
      if (conversionOnly) {
        baseName = job.parsed.name
      } else if (sizeDef.name) {
        baseName = `${job.parsed.name}-${sizeDef.name}-${actualWidth}w`
      } else {
        baseName = `${job.parsed.name}-${actualWidth}w`
      }

      // Resolve which formats to generate
      const { formats: targetFormats, preEncoded } = await resolveTargetFormats(
        job.outputExt, job.transparent, resizedBuffer.data,
        this.config.format, this.config.quality
      )

      // Encode + write each target format
      for (const targetExt of targetFormats) {
        let buffer
        try {
          // Reuse pre-encoded buffer from smart format comparison when available
          buffer = preEncoded.get(targetExt) || await convertFormat(
            sharp(resizedBuffer.data), targetExt, this.config.quality
          )
        } catch (err) {
          log({ tag: 'error', text: `Format conversion failed (${targetExt}): ${err.message}`, link: relativePath })
          continue
        }

        const filename = `${baseName}.${targetExt}`
        const outputPath = path.join(outDir, filename)
        const relPath = path.join(job.parsed.dir, filename)

        fs.writeFileSync(outputPath, buffer)
        outputs.push({ path: relPath, width: actualWidth, height: actualHeight })
        this.stats.variants++
        this.stats.bytes += buffer.length

        log({
          tag: 'image',
          text: 'Compiled:',
          link: relPath,
          size: formatBytes(buffer.length),
          time: formatTime(Date.now() - startTime)
        })
      }
    }

    // Clean up stale outputs from previous runs of this source file
    const newPaths = new Set(outputs.map(o => o.path))
    for (const prev of previousOutputs) {
      const prevPath = typeof prev === 'string' ? prev : prev.path
      if (!newPaths.has(prevPath)) {
        const fullPath = path.join(this.config.out, prevPath)
        if (fs.existsSync(fullPath)) {
          fs.unlinkSync(fullPath)
        }
      }
    }

    this.cache.setEntry(relativePath, {
      mtime: job.mtime,
      size: job.fileSize,
      width: job.sourceWidth,
      height: job.sourceHeight,
      exif: job.exif,
      outputs
    })

    this.stats.processed++
  }

  watch() {
    const watchPath = path.resolve(this.config.in)

    log({ tag: 'image', text: 'Watching for changes in', link: this.config.in })

    this._watchQueue = []
    this._watchProcessing = false

    this.watcher = chokidar.watch(watchPath, {
      ignoreInitial: true,
      ignored: this.config.exclude
    })

    this.watcher.on('add', (filePath) => {
      this._enqueueWatch(filePath, false)
    })

    this.watcher.on('change', (filePath) => {
      this._enqueueWatch(filePath, true)
    })

    this.watcher.on('unlink', (filePath) => {
      const relativePath = path.relative(this.config.in, filePath)
      const outputs = this.cache.getOutputs(relativePath)

      for (const output of outputs) {
        const outputPath = typeof output === 'string' ? output : output.path
        const fullPath = path.join(this.config.out, outputPath)
        if (fs.existsSync(fullPath)) {
          fs.unlinkSync(fullPath)
          log({ tag: 'image', text: 'Removed:', link: outputPath })
        }
      }

      this.cache.removeEntry(relativePath)
      this.cache.save()
    })

    return this.watcher
  }

  stopWatch() {
    if (this.watcher) {
      this.watcher.close()
      this.watcher = null
    }
  }

  getStats() {
    return {
      processed: this.stats.processed,
      variants: this.stats.variants,
      skipped: this.stats.skipped,
      bytes: this.stats.bytes,
      elapsed: Date.now() - this.stats.startTime
    }
  }

  async _processSvgPipeline(svgFiles, { force, dryRun }) {
    for (const svgFile of svgFiles) {
      const relativePath = path.relative(this.config.in, svgFile)

      if (dryRun) {
        log({ tag: 'image', text: 'Would minify:', link: relativePath })
        continue
      }

      let stat
      try {
        stat = fs.statSync(svgFile)
      } catch {
        continue
      }

      if (!force && this.cache.shouldSkip(relativePath, stat.mtimeMs, stat.size)) {
        this.stats.skipped++
        continue
      }

      const result = await processSvg(svgFile, this.config.out, this.config.in)
      if (result) {
        this.cache.setEntry(relativePath, {
          mtime: stat.mtimeMs,
          size: stat.size,
          outputs: [{ path: result.relativePath, width: result.width, height: result.height }]
        })
        this.stats.processed++
        this.stats.variants++
        this.stats.bytes += result.outputSize
      }
    }
  }

  async _processGifPipeline(gifFiles, { force, dryRun }) {
    for (const gifFile of gifFiles) {
      const relativePath = path.relative(this.config.in, gifFile)

      if (dryRun) {
        log({ tag: 'image', text: 'Would process:', link: relativePath })
        continue
      }

      let stat
      try {
        stat = fs.statSync(gifFile)
      } catch {
        continue
      }

      if (!force && this.cache.shouldSkip(relativePath, stat.mtimeMs, stat.size)) {
        this.stats.skipped++
        continue
      }

      // Detect animation: pages > 1 means animated GIF
      let meta
      try {
        meta = await sharp(gifFile).metadata()
      } catch (err) {
        log({ tag: 'error', text: `Failed to read GIF metadata: ${err.message}`, link: relativePath })
        continue
      }

      if ((meta.pages || 1) > 1) {
        // Animated GIF — copy as-is
        const outPath = path.join(this.config.out, relativePath)
        fs.mkdirSync(path.dirname(outPath), { recursive: true })
        fs.copyFileSync(gifFile, outPath)

        this.cache.setEntry(relativePath, {
          mtime: stat.mtimeMs,
          size: stat.size,
          outputs: [{ path: relativePath, width: meta.width, height: meta.height }]
        })
        this.stats.processed++
        this.stats.variants++
        this.stats.bytes += stat.size

        log({ tag: 'image', text: 'Copied:', link: relativePath, size: formatBytes(stat.size) })
      } else {
        // Static GIF — route through raster pipeline
        await this.processImage(gifFile, force)
      }
    }
  }

  async _worker(queue, force) {
    while (queue.length > 0) {
      const file = queue.shift()
      await this.processImage(file, force)
    }
  }

  _enqueueWatch(filePath, force) {
    this._watchQueue.push({ filePath, force })
    this._drainWatchQueue()
  }

  async _drainWatchQueue() {
    if (this._watchProcessing) return
    this._watchProcessing = true

    while (this._watchQueue.length > 0) {
      const { filePath, force } = this._watchQueue.shift()
      try {
        if (this._isSvg(filePath)) {
          await this._watchProcessSvg(filePath)
        } else if (this._isGif(filePath)) {
          await this._watchProcessGif(filePath, force)
        } else if (this._matchesInclude(filePath)) {
          await this.processImage(filePath, force)
          this.cache.save()
        }
      } catch (err) {
        log({ tag: 'error', text: `Watch processing failed: ${err.message}`, link: filePath })
      }
    }

    this._watchProcessing = false
  }

  _matchesInclude(filePath) {
    const ext = path.extname(filePath).toLowerCase().replace('.', '')
    // Input formats for raster pipeline — these get normalized to web formats during processing
    const supportedExts = ['jpg', 'jpeg', 'png', 'tiff', 'tif', 'webp', 'heic', 'heif']
    return supportedExts.includes(ext)
  }

  _isSvg(filePath) {
    return path.extname(filePath).toLowerCase() === '.svg'
  }

  _isGif(filePath) {
    return path.extname(filePath).toLowerCase() === '.gif'
  }

  async _watchProcessGif(filePath, force) {
    const relativePath = path.relative(this.config.in, filePath)

    let meta
    try {
      meta = await sharp(filePath).metadata()
    } catch (err) {
      log({ tag: 'error', text: `Failed to read GIF metadata: ${err.message}`, link: relativePath })
      return
    }

    if ((meta.pages || 1) > 1) {
      await this._watchCopyGif(filePath)
    } else {
      await this.processImage(filePath, force)
      this.cache.save()
    }
  }

  async _watchCopyGif(filePath) {
    const relativePath = path.relative(this.config.in, filePath)
    let stat
    try {
      stat = fs.statSync(filePath)
    } catch {
      return
    }

    const outPath = path.join(this.config.out, relativePath)
    fs.mkdirSync(path.dirname(outPath), { recursive: true })
    fs.copyFileSync(filePath, outPath)

    let gifWidth = null
    let gifHeight = null
    try {
      const gifMeta = await sharp(filePath).metadata()
      gifWidth = gifMeta.width
      gifHeight = gifMeta.height
    } catch (err) {
      log({ tag: 'error', text: `Failed to read GIF metadata: ${err.message}`, link: relativePath })
    }

    this.cache.setEntry(relativePath, {
      mtime: stat.mtimeMs,
      size: stat.size,
      outputs: [{ path: relativePath, width: gifWidth, height: gifHeight }]
    })
    this.cache.save()
    log({ tag: 'image', text: 'Copied:', link: relativePath, size: formatBytes(stat.size) })
  }

  async _watchProcessSvg(filePath) {
    const relativePath = path.relative(this.config.in, filePath)
    let stat
    try {
      stat = fs.statSync(filePath)
    } catch {
      return
    }

    const result = await processSvg(filePath, this.config.out, this.config.in)
    if (result) {
      this.cache.setEntry(relativePath, {
        mtime: stat.mtimeMs,
        size: stat.size,
        outputs: [{ path: result.relativePath, width: result.width, height: result.height }]
      })
      this.cache.save()
    }
  }
}
