import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import chokidar from 'chokidar'
import { validateConfig, configHash } from './config.js'
import { toSharpOptions, filterByUpscale } from './sizes.js'
import { convertFormat, resolveTargetFormats } from './formats.js'
import { discoverAll } from './discover.js'
import { analyzeImage, buildEffectiveSizes } from './analyze.js'
import { applyOperations } from './preprocess.js'
import Cache from './cache.js'
import { processSvg } from './svg.js'
import log from './utils/log.js'
import { formatBytes, formatTime } from './utils/format.js'

export default class ImageProcessor {
  constructor(config) {
    this.config = validateConfig(config)
    this._configDir = this.config.configDir
    this.cache = new Cache(this.config.out, this.config.cache)
    this.stats = { processed: 0, variants: 0, skipped: 0, bytes: 0, errors: 0, startTime: 0 }
    this.watcher = null
  }

  // Per-file progress logs — silenced by `verbose: false` (poops runs quiet).
  // The end-of-run summary, errors and dry-run listings are never gated.
  _info(opts) {
    if (this.config.verbose) log({ tag: 'image', ...opts })
  }

  // Single point every processing error routes through, so the count that
  // decides a caller's build exit code can't drift from what was logged.
  _error(opts) {
    this.stats.errors++
    log({ tag: 'error', ...opts })
  }

  async processAll(options = {}) {
    const { force = false, dryRun = false } = options
    this.stats = { processed: 0, variants: 0, skipped: 0, bytes: 0, errors: 0, startTime: Date.now() }

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
      this._info({ text: `Found ${sourceFiles.length} source image(s)` })
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
      this._error({ text: 'Cannot read file:', link: inputPath })
      return
    }

    if (!force && this.cache.shouldSkip(relativePath, stat.mtimeMs, stat.size)) {
      this.stats.skipped++
      return
    }

    this._info({ text: 'Processing:', link: relativePath })

    // Analyze — metadata, transparency, format normalization, effective sizes.
    // null means analyzeImage already logged a metadata failure (corrupt source);
    // count it so the build's error total reflects it.
    const job = await analyzeImage(inputPath, this.config, stat)
    if (!job) { this.stats.errors++; return }

    const startTime = Date.now()
    const outputs = []

    // Get previous outputs before processing (for stale cleanup)
    const previousOutputs = this.cache.getOutputs(relativePath)

    // 1. Original pipeline
    await this._processVariants(inputPath, job, null, outputs, startTime)

    // 2. Preprocessor pipelines
    for (const preprocessor of this.config.preprocessors) {
      try {
        if (preprocessor.resizeFirst === true) {
          // Per-variant: _processVariants resizes each variant, then preprocesses it
          await this._processVariants(inputPath, job, preprocessor, outputs, startTime)
        } else if (preprocessor.resizeFirst) {
          // Object: resize to base size once, preprocess once, then generate variants.
          // Base dims cap the variant sizes so nothing upscales past the base.
          const base = await this._resizeToBase(inputPath, preprocessor.resizeFirst, job)
          const result = await applyOperations(base.data, preprocessor.operations, this._configDir, {
            width: base.info.width, height: base.info.height, channels: base.info.channels
          })
          await this._processVariants(result.data, job, preprocessor, outputs, startTime, base.info)
          this._writeSidecars(result.sidecars, job, preprocessor, outputs, startTime)
        } else {
          const result = await applyOperations(inputPath, preprocessor.operations, this._configDir)
          await this._processVariants(result.data, job, preprocessor, outputs, startTime)
          this._writeSidecars(result.sidecars, job, preprocessor, outputs, startTime)
        }
      } catch (err) {
        this._error({ text: `Preprocessor "${preprocessor.name}" failed: ${err.message}`, link: relativePath })
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

  /**
   * Process size variants for a given input (file path or buffer).
   * @param {string|Buffer} input - file path (original) or Buffer (preprocessed)
   * @param {object} job - analysis result from analyzeImage
   * @param {object|null} preprocessor - preprocessor config, or null for original pipeline
   * @param {Array} outputs - accumulator for output entries
   * @param {number} startTime - processing start timestamp
   * @param {object|null} baseDims - dims of the input when it's a pre-shrunk base buffer
   *   (resizeFirst object form); caps variant sizes so nothing upscales past the base
   */
  async _processVariants(input, job, preprocessor, outputs, startTime, baseDims = null) {
    const relativePath = job.relativePath
    // resizeFirst: true — operations run on each already-resized variant
    const preprocessPerVariant = preprocessor?.resizeFirst === true

    // Determine effective config — preprocessor overrides or global
    const skipOrig = preprocessor?.skipOriginal != null ? preprocessor.skipOriginal : this.config.skipOriginal
    let sizes
    if (preprocessor?.sizes) {
      sizes = buildEffectiveSizes(
        preprocessor.sizes.map(s => ({ width: s.width || 0, height: s.height || 0, name: s.name || '', crop: s.crop || false })),
        skipOrig
      )
    } else if (preprocessor && preprocessor.skipOriginal != null) {
      // Preprocessor overrides skipOriginal but uses global sizes
      sizes = buildEffectiveSizes(this.config.sizes, skipOrig)
    } else {
      sizes = job.effectiveSizes
    }
    const format = preprocessor?.format != null ? preprocessor.format : this.config.format
    const quality = preprocessor?.quality != null
      ? (typeof preprocessor.quality === 'number'
          ? { jpg: preprocessor.quality, webp: preprocessor.quality, avif: preprocessor.quality, png: preprocessor.quality }
          : { ...this.config.quality, ...preprocessor.quality })
      : this.config.quality

    const namePrefix = preprocessor ? `${job.parsed.name}-${preprocessor.name}` : job.parsed.name

    // Filter sizes by upscale constraints — against the base buffer dims when pre-shrunk
    const srcWidth = baseDims ? baseDims.width : job.sourceWidth
    const srcHeight = baseDims ? baseDims.height : job.sourceHeight
    const eligibleSizes = filterByUpscale(sizes, srcWidth, srcHeight)
    let sidecarsWritten = false

    for (const sizeDef of eligibleSizes) {
      const conversionOnly = sizeDef.width === 0 && sizeDef.height === 0

      // Resize — flush to raw pixels; the only encode is the final one per format
      const sharpOpts = toSharpOptions(sizeDef)
      let pipeline = typeof input === 'string' ? sharp(input).rotate() : sharp(input)
      if (sharpOpts) pipeline = pipeline.resize(sharpOpts)
      const resized = await pipeline.raw().toBuffer({ resolveWithObject: true })

      // data is either raw pixels (with rawInfo) or an encoded buffer (rawInfo null)
      let data = resized.data
      let rawInfo = { width: resized.info.width, height: resized.info.height, channels: resized.info.channels }
      let actualWidth = resized.info.width
      let actualHeight = resized.info.height

      if (preprocessPerVariant) {
        const ppResult = await applyOperations(data, preprocessor.operations, this._configDir, rawInfo)
        data = ppResult.data
        rawInfo = null
        actualWidth = ppResult.info.width
        actualHeight = ppResult.info.height

        // Sidecar filename has no size suffix — write once, from the first variant
        if (!sidecarsWritten && ppResult.sidecars.length > 0) {
          this._writeSidecars(ppResult.sidecars, job, preprocessor, outputs, startTime)
          sidecarsWritten = true
        }
      }

      const toSharp = () => rawInfo ? sharp(data, { raw: rawInfo }) : sharp(data)

      // Build output path
      const outDir = path.join(this.config.out, job.parsed.dir)
      fs.mkdirSync(outDir, { recursive: true })

      let baseName
      if (conversionOnly) {
        baseName = namePrefix
      } else if (sizeDef.name) {
        baseName = `${namePrefix}-${sizeDef.name}-${actualWidth}w`
      } else {
        baseName = `${namePrefix}-${actualWidth}w`
      }

      // Resolve which formats to generate
      const { formats: targetFormats, preEncoded } = await resolveTargetFormats(
        job.outputExt, job.transparent, toSharp,
        format, quality
      )

      // Encode + write each target format
      for (const targetExt of targetFormats) {
        let buffer
        try {
          buffer = preEncoded.get(targetExt) || await convertFormat(
            toSharp(), targetExt, quality
          )
        } catch (err) {
          this._error({ text: `Format conversion failed (${targetExt}): ${err.message}`, link: relativePath })
          continue
        }

        const filename = `${baseName}.${targetExt}`
        const outputPath = path.join(outDir, filename)
        const relPath = path.join(job.parsed.dir, filename)

        fs.writeFileSync(outputPath, buffer)
        outputs.push({ path: relPath, width: actualWidth, height: actualHeight })
        this.stats.variants++
        this.stats.bytes += buffer.length

        this._info({
          text: preprocessor ? `Compiled [${preprocessor.name}]:` : 'Compiled:',
          link: relPath,
          size: formatBytes(buffer.length),
          time: formatTime(Date.now() - startTime)
        })
      }
    }
  }

  /**
   * Resize input to a base size before preprocessing.
   * Used when resizeFirst is an object like { width: 800 } (validated size shape).
   * Returns { data, info } — raw pixels at the base dimensions.
   */
  async _resizeToBase(input, resizeDef, job) {
    // Don't upscale: clamp target to source dimensions
    const def = {
      name: '',
      width: resizeDef.width || 0,
      height: resizeDef.height || 0,
      crop: resizeDef.crop || false
    }
    if (def.crop && def.width > 0 && def.height > 0) {
      // Proportional clamp — independent clamping would change the crop aspect ratio
      const scale = Math.min(job.sourceWidth / def.width, job.sourceHeight / def.height, 1)
      def.width = Math.max(1, Math.round(def.width * scale))
      def.height = Math.max(1, Math.round(def.height * scale))
    } else {
      def.width = Math.min(def.width, job.sourceWidth)
      def.height = Math.min(def.height, job.sourceHeight)
    }
    const opts = toSharpOptions(def)

    let pipeline = typeof input === 'string' ? sharp(input).rotate() : sharp(input)
    if (opts) pipeline = pipeline.resize(opts)

    return pipeline.raw().toBuffer({ resolveWithObject: true })
  }

  _writeSidecars(sidecars, job, preprocessor, outputs, startTime) {
    if (!sidecars || sidecars.length === 0) return

    const namePrefix = preprocessor ? `${job.parsed.name}-${preprocessor.name}` : job.parsed.name
    const outDir = path.join(this.config.out, job.parsed.dir)
    fs.mkdirSync(outDir, { recursive: true })

    for (const sidecar of sidecars) {
      const filename = `${namePrefix}.${sidecar.ext}`
      const outputPath = path.join(outDir, filename)
      const relPath = path.join(job.parsed.dir, filename)

      fs.writeFileSync(outputPath, sidecar.data)
      outputs.push({ path: relPath, width: null, height: null })
      this.stats.variants++
      this.stats.bytes += sidecar.data.length

      this._info({
        text: preprocessor ? `Compiled [${preprocessor.name}]:` : 'Compiled:',
        link: relPath,
        size: formatBytes(sidecar.data.length),
        time: formatTime(Date.now() - startTime)
      })
    }
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
      // Through the queue — deleting outputs mid-processing races with writes
      this._watchQueue.push({ type: 'unlink', filePath })
      this._drainWatchQueue()
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
      errors: this.stats.errors,
      elapsed: Date.now() - this.stats.startTime
    }
  }

  // Public alias for watch-mode output cleanup, so callers (e.g. poops) can
  // remove a deleted source's variants + cache entry without a private method.
  removeSource(filePath) {
    this._watchRemoveOutputs(filePath)
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
      if (!result) continue

      const outputs = [{ path: result.relativePath, width: result.width, height: result.height }]
      this.stats.variants++
      this.stats.bytes += result.outputSize

      // Run SVG-enabled preprocessors on rasterized SVG (original size only)
      const svgPreprocessors = this.config.preprocessors.filter(pp => pp.svg)
      if (svgPreprocessors.length > 0) {
        const startTime = Date.now()
        const parsed = path.parse(relativePath)

        let meta
        try {
          meta = await sharp(svgFile).metadata()
        } catch (err) {
          this._error({ text: `Failed to rasterize SVG: ${err.message}`, link: relativePath })
        }

        if (meta) {
          const svgJob = {
            relativePath,
            parsed,
            sourceWidth: meta.width,
            sourceHeight: meta.height,
            outputExt: 'png',
            transparent: true,
            effectiveSizes: [{ name: '', width: 0, height: 0, crop: false }]
          }

          for (const preprocessor of svgPreprocessors) {
            try {
              const ppResult = await applyOperations(svgFile, preprocessor.operations, this._configDir)
              // Force original-only sizes for SVG preprocessing
              const svgPP = { ...preprocessor, sizes: null, skipOriginal: null }
              await this._processVariants(ppResult.data, svgJob, svgPP, outputs, startTime)
              this._writeSidecars(ppResult.sidecars, svgJob, svgPP, outputs, startTime)
            } catch (err) {
              this._error({ text: `Preprocessor "${preprocessor.name}" failed for SVG: ${err.message}`, link: relativePath })
            }
          }
        }
      }

      this.cache.setEntry(relativePath, {
        mtime: stat.mtimeMs,
        size: stat.size,
        width: result.width,
        height: result.height,
        outputs
      })
      this.stats.processed++
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
        this._error({ text: `Failed to read GIF metadata: ${err.message}`, link: relativePath })
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

        this._info({ text: 'Copied:', link: relativePath, size: formatBytes(stat.size) })
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
    this._watchQueue.push({ type: 'process', filePath, force })
    this._drainWatchQueue()
  }

  _watchRemoveOutputs(filePath) {
    const relativePath = path.relative(this.config.in, filePath)
    const outputs = this.cache.getOutputs(relativePath)

    for (const output of outputs) {
      const outputPath = typeof output === 'string' ? output : output.path
      const fullPath = path.join(this.config.out, outputPath)
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath)
        this._info({ text: 'Removed:', link: outputPath })
      }
    }

    this.cache.removeEntry(relativePath)
    this.cache.save()
  }

  async _drainWatchQueue() {
    if (this._watchProcessing) return
    this._watchProcessing = true

    while (this._watchQueue.length > 0) {
      const { type, filePath, force } = this._watchQueue.shift()
      try {
        if (type === 'unlink') {
          this._watchRemoveOutputs(filePath)
        } else if (this._isSvg(filePath)) {
          await this._watchProcessSvg(filePath)
        } else if (this._isGif(filePath)) {
          await this._watchProcessGif(filePath, force)
        } else if (this._matchesInclude(filePath)) {
          await this.processImage(filePath, force)
          this.cache.save()
        }
      } catch (err) {
        this._error({ text: `Watch processing failed: ${err.message}`, link: filePath })
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
      this._error({ text: `Failed to read GIF metadata: ${err.message}`, link: relativePath })
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
      this._error({ text: `Failed to read GIF metadata: ${err.message}`, link: relativePath })
    }

    this.cache.setEntry(relativePath, {
      mtime: stat.mtimeMs,
      size: stat.size,
      outputs: [{ path: relativePath, width: gifWidth, height: gifHeight }]
    })
    this.cache.save()
    this._info({ text: 'Copied:', link: relativePath, size: formatBytes(stat.size) })
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
