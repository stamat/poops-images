# poops-images 💩📸

CLI tool for preparing images for the web.

Features:

- Compresses, generates size variants and crops
- Based on: `sharp` and `svgo`
- WordPress-like notation for resizing and cropping with 9-position anchor grid
- Supported input formats: JPEG, PNG, TIFF, WebP, HEIC, HEIF, SVG, GIF
  - HEIC/HEIF → JPEG (opaque) or PNG (transparent)
  - TIFF → JPEG (opaque) or PNG (transparent)
  - SVG → SVG minified with SVGO, no crops
  - GIF (static) → JPEG (opaque) or PNG (transparent), resized and cropped like other raster images
  - GIF (animated) → copied as-is, no compression, no crops
- Smart format selection — compares JPEG vs WebP, keeps whichever is smaller
- Transparency detection — auto-converts opaque PNGs and GIFs to JPEG
- Never upscales — skips sizes larger than the source
- Preprocessors — apply transformations (blur, grayscale, custom handlers, etc.) before generating variants, great for LQIP placeholders, hover effects, and artistic filters like halftone
- Watch mode with incremental processing
- Configurable concurrency for parallel processing
- Keeps track with cache
  - Extracts EXIF metadata (camera, lens, GPS, exposure) and stores it in the cache
  - Cache file tracks source dimensions, output dimensions, and generated variants

## Why

Built cause I hate opening Pixelmator Pro and ImageOptim both, I want to be able to convert the format and optimize the image in one go, regardless of the source format. Also **sometimes JPEG is lighter then WebP** and then I have to inspect it to decide which one I'll keep and so on... And you need to optimize images for the web.

And let me ask you this: What happens when you have to create a `srcset`!? Make the image responsive? You are responsible, right? Right?

## Install

```bash
npm install poops-images
```

## CLI

### Quick examples

No config file needed — just pass flags:

```bash
# Compress a single image (output defaults to current dir)
npx poops-images photo.jpg

# Specify input and output
npx poops-images --in src/images --out dist/images

# Convert to webp
npx poops-images --format webp --in photo.jpg --out dist/images

# Convert to webp at lower quality
npx poops-images --in photo.jpg --out dist/images --format webp --quality 60

# Process a directory with multiple size variants
npx poops-images src/images --out dist/images --widths 300,768,1024

# Multiple formats + per-format quality
npx poops-images --in src/images --out dist/images --widths 300,768,1024 --format webp,avif --quality webp:70,avif:50
```

### Options

```
Usage: poops-images [input] [options]

  -i, --in <path>        Input directory or file path (default: .)
  -o, --out <path>       Output directory (default: .)
  -s, --widths <list>    Comma-separated widths (e.g. 300,768,1024)
  -F, --format <format>  Output format(s): smart, webp, avif, or comma-separated (e.g. smart,avif)
  -Q, --quality <value>  Quality 1-100 (all formats) or per-format (e.g. webp:60,avif:40)
      --skip-original    Skip the original (non-resized) compressed image
  -c, --config <path>    Config file path (default: poops-images.json)
  -b, --build            Process all images and exit (default)
  -w, --watch            Watch for changes and process incrementally
  -f, --force            Ignore cache, regenerate everything
      --dry-run          Show what would be processed without writing
  -P, --preprocess <ops> Preprocess operations (e.g. blur:20,grayscale,sharpen:1.5)
  -q, --quiet            Suppress progress output
  -v, --version          Show version
  -h, --help             Show help
```

The first positional argument is treated as the input path:

```bash
npx poops-images photo.jpg                  # same as --in photo.jpg
npx poops-images src/images --out dist      # same as --in src/images --out dist
npx poops-images -c my-config.json --out /tmp/resized   # config file + override output dir
```

### Config file

For repeatable setups, create a `poops-images.json` in your project root:

```json
{
  "in": "src/images",
  "out": "dist/static/images",
  "sizes": [
    { "name": "thumbnail", "width": 150, "height": 150, "crop": true },
    { "name": "medium", "width": 300, "height": 300 },
    { "name": "large", "width": 1024, "height": 1024 }
  ]
}
```

```bash
npx poops-images
```

The config file is resolved in order:

1. Explicit path via `-c`
2. `poops-images.json` in the working directory
3. `images` key inside `poops.json`
4. `images` key inside `💩.json`

#### Full config example

```json
{
  "in": "src/images",
  "out": "dist/static/images",
  "sizes": [
    { "name": "thumbnail", "width": 150, "height": 150, "crop": true },
    { "name": "medium", "width": 300, "height": 300 },
    { "name": "medium_large", "width": 768, "height": 0 },
    { "name": "large", "width": 1024, "height": 1024 },
    { "name": "hero", "width": 1920, "height": 600, "crop": ["center", "top"] },
    {
      "name": "card",
      "width": 400,
      "height": 300,
      "crop": ["center", "center"]
    }
  ],
  "format": ["webp", "avif"],
  "quality": {
    "jpg": 82,
    "webp": 80,
    "avif": 60,
    "png": 90
  },
  "include": "**/*.{jpg,jpeg,png,tiff,tif,webp,heic,heif}",
  "exclude": [],
  "concurrency": 4,
  "skipOriginal": false,
  "cache": true,
  "preprocessors": [
    {
      "name": "lqip",
      "operations": [{ "type": "blur", "sigma": 30 }],
      "sizes": [{ "width": 32 }],
      "skipOriginal": true
    }
  ]
}
```

### Config options

| Field          | Type                   | Default                                         | Description                                                                                                                                           |
| -------------- | ---------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `in`           | `string`               | `"."`                                           | Source directory                                                                                                                                      |
| `out`          | `string`               | `"."`                                           | Output directory                                                                                                                                      |
| `sizes`        | `array`                | `[]`                                            | Size definitions (see below). Empty = conversion-only                                                                                                 |
| `format`       | `false\|string\|array` | `false`                                         | Output format(s). `false` = normalize to web-ready, `"smart"` = smallest of jpg/webp, or explicit format(s) like `"webp"` or `["webp", "avif"]`       |
| `quality`      | `number\|object`       | `{jpg: 82, webp: 80, avif: 60, png: 90}`        | Quality 1-100 for all formats, or per-format object                                                                                                   |
| `skipOriginal` | `boolean`              | `false`                                         | Skip the original (non-resized) compressed image                                                                                                      |
| `include`      | `string`               | `"**/*.{jpg,jpeg,png,tiff,tif,webp,heic,heif}"` | Glob pattern for source images                                                                                                                        |
| `exclude`      | `array`                | `[]`                                            | Glob patterns to exclude                                                                                                                              |
| `concurrency`  | `number`               | `4`                                             | Max parallel image operations                                                                                                                         |
| `preprocessors`| `array`                | `[]`                                            | Preprocessor definitions (see [Preprocessors](#preprocessors) below)                                                                                  |
| `cache`        | `true\|false\|string`  | `true`                                          | Cache behavior. `true` = default cache file in output dir, `false` = no cache, `"path"` = custom cache file path (relative to output dir or absolute) |

### Size definitions

The config API mirrors WordPress's `add_image_size(name, width, height, crop)`.

| Field    | Type          | Default | Description                                                                                 |
| -------- | ------------- | ------- | ------------------------------------------------------------------------------------------- |
| `name`   | `string`      | `""`    | Size identifier, appended to filename. Optional — omit or leave empty for width-only naming |
| `width`  | `number`      | `0`     | Target width in px. `0` = scale by height only                                              |
| `height` | `number`      | `0`     | Target height in px. `0` = scale by width only                                              |
| `crop`   | `bool\|[x,y]` | `false` | Crop mode                                                                                   |

When both `width` and `height` are `0` (or omitted), the image is processed at its original dimensions — useful for format conversion without resizing.

#### Crop modes

**`false`** — Soft crop. Proportional resize to fit within the bounding box. No content is lost. Output dimensions may differ from config.

**`true`** — Hard crop, centered. Exact dimensions, cropped from center.

**`["x", "y"]`** — Hard crop with anchor. 9 possible positions:

|                | `"left"`             | `"center"`             | `"right"`             |
| -------------- | -------------------- | ---------------------- | --------------------- |
| **`"top"`**    | `["left", "top"]`    | `["center", "top"]`    | `["right", "top"]`    |
| **`"center"`** | `["left", "center"]` | `["center", "center"]` | `["right", "center"]` |
| **`"bottom"`** | `["left", "bottom"]` | `["center", "bottom"]` | `["right", "bottom"]` |

#### Size examples

```json
{ "name": "medium_large", "width": 768, "height": 0 }
```

768px wide, height scaled proportionally. No cropping.

```json
{ "name": "thumb", "width": 150, "height": 150, "crop": true }
```

Always 150x150, cropped from center.

```json
{ "name": "hero", "width": 1920, "height": 600, "crop": ["center", "top"] }
```

Always 1920x600, anchored to top-center (preserves sky/header area).

## API

```javascript
import ImageProcessor from "poops-images";

// Minimal — compress images at original size
const processor = new ImageProcessor({
  in: "src/images",
  out: "dist/images",
});
await processor.processAll();

// With sizes and format conversion
const processor2 = new ImageProcessor({
  in: "src/images",
  out: "dist/images",
  sizes: [
    { name: "thumb", width: 150, height: 150, crop: true },
    { name: "large", width: 1024, height: 0 },
  ],
  format: "webp",
  quality: { jpg: 85, webp: 80 },
  preprocessors: [
    {
      name: "lqip",
      operations: [{ type: "blur", sigma: 30 }],
      sizes: [{ width: 32 }],
      skipOriginal: true,
    },
  ],
});

const stats = await processor2.processAll();
// { processed: 12, variants: 48, skipped: 0, bytes: 245760, elapsed: 2300 }

// Force reprocess (ignore cache)
await processor2.processAll({ force: true });

// Dry run (log what would be processed)
await processor2.processAll({ dryRun: true });

// Watch mode
processor2.watch();

// Stop watching
processor2.stopWatch();
```

The `ImageProcessor` constructor accepts the same config object as the JSON config file. See [Config options](#config-options) and [Size definitions](#size-definitions) above.

## Features

### Output naming

When `name` is provided:

```
{originalName}-{sizeName}-{actualWidth}w.{ext}
```

When `name` is omitted or empty:

```
{originalName}-{actualWidth}w.{ext}
```

When processing at original size (no resize):

```
{originalName}.{ext}
```

The width in the filename is the **actual** output width after resize, not the configured target. This matters for soft crops where the output may be smaller than the target due to aspect ratio.

#### Example output

Given `src/images/photo.jpg` (2000x1500) with `format: ["webp", "avif"]` and these sizes:

```json
[
  { "name": "medium", "width": 300, "height": 300 },
  { "name": "large", "width": 1024, "height": 1024 },
  { "width": 768 }
]
```

Produces:

```
dist/static/images/photo.webp                 # original, re-encoded
dist/static/images/photo.avif                 # original, re-encoded
dist/static/images/photo-medium-300w.webp
dist/static/images/photo-medium-300w.avif
dist/static/images/photo-large-1024w.webp
dist/static/images/photo-large-1024w.avif
dist/static/images/photo-768w.webp
dist/static/images/photo-768w.avif
```

The original (non-resized) image is always included, compressed and converted to the target format(s). Use `--skip-original` or `"skipOriginal": true` to omit it.

Without `format` set (default mode), only one file per size is produced in the normalized web format (e.g. jpg stays jpg, opaque PNG becomes jpg).

### Directory structure

Directory structure is preserved from source to output:

```
src/images/gallery/photo.jpg
  → dist/static/images/gallery/photo.jpg              (original, compressed)
  → dist/static/images/gallery/photo-medium-300w.jpg   (resized variant)
```

### No upscaling

Images are never upscaled. If the source is smaller than a target size:

- **Soft crop**: the size is skipped when the source is smaller than the target in both dimensions (sharp's `withoutEnlargement` handles the rest)
- **Hard crop**: the size is skipped when the source is smaller in either dimension

### Format conversion

The `format` option controls exactly which output formats are produced per size. When not set, the tool normalizes to a web-ready format (opaque PNG/GIF becomes JPEG, TIFF/HEIC/HEIF becomes JPEG/PNG) and re-encodes.

| `format` value      | Behavior                                       | Outputs per size |
| ------------------- | ---------------------------------------------- | ---------------- |
| _(not set / false)_ | Normalize to web-ready format, re-encode       | 1                |
| `"smart"`           | Compare jpg vs webp, keep whichever is smaller | 1                |
| `"webp"`            | Generate only webp                             | 1                |
| `["webp", "avif"]`  | Generate exactly webp and avif                 | 2                |
| `["smart", "avif"]` | Smart pick (webp or jpg) + avif, deduped       | 1-2              |

**Explicit formats** — generate exactly what you ask for, no size comparison:

```bash
# Single format
npx poops-images --format webp
# photo-medium-300w.webp

# Multiple formats
npx poops-images --format webp,avif
# photo-medium-300w.webp
# photo-medium-300w.avif
```

**`--format smart`** — for each variant, encodes both jpg and webp, keeps the smaller one. Transparent images always get webp. Smart never produces avif — combine with explicit formats if you want it:

```bash
# Smart selection only
npx poops-images --format smart
# photo-medium-300w.webp   (webp was smaller than jpg)

# Smart + explicit avif
npx poops-images --format smart,avif
# photo-medium-300w.webp   (smart pick)
# photo-medium-300w.avif   (explicit)
```

In config:

```json
{ "format": "webp" }
```

```json
{ "format": ["webp", "avif"] }
```

```json
{ "format": ["smart", "avif"] }
```

### Transparency detection

When processing a PNG or static GIF, the tool checks whether any pixel has transparency (alpha < 255). If the image is fully opaque, it's converted to JPEG instead — typically 5-10x smaller with no quality loss.

Transparent images stay as PNG (or webp/avif when `format` is set).

### EXIF metadata extraction

EXIF data is automatically extracted from JPEG and TIFF images and stored in the cache. The extracted fields are:

| Field             | Description                           |
| ----------------- | ------------------------------------- |
| `make`            | Camera manufacturer                   |
| `model`           | Camera model                          |
| `orientation`     | EXIF orientation tag (1-8)            |
| `resolution`      | `{ x, y }` DPI                        |
| `dateTime`        | Original capture date                 |
| `offsetTime`      | UTC offset string                     |
| `fNumber`         | Aperture (e.g. `1.78`)                |
| `exposure`        | `{ value, formatted }` — e.g. `1/125` |
| `iso`             | ISO speed                             |
| `focalLength`     | Focal length in mm                    |
| `focalLength35mm` | 35mm equivalent focal length          |
| `flash`           | `true`/`false` — whether flash fired  |
| `lensModel`       | Lens identifier string                |
| `software`        | Processing software                   |
| `gps`             | GPS block (see below)                 |

**GPS data** (when coordinates are present):

| Field           | Description                                                 |
| --------------- | ----------------------------------------------------------- |
| `latitude`      | `{ degrees, ref, decimal, formatted }` — both DMS and float |
| `longitude`     | `{ degrees, ref, decimal, formatted }` — both DMS and float |
| `altitude`      | `{ value, ref }` — meters above/below sea level             |
| `direction`     | Image direction in degrees                                  |
| `speed`         | `{ value, unit }` — km/h, mph, or knots                     |
| `dateTime`      | Combined datestamp + timestamp as ISO 8601 UTC              |
| `googleMapsUrl` | Direct link to coordinates on Google Maps                   |

This data is available in the cache file for downstream tools (e.g. nunjucks extensions) to generate image captions with camera info, location, etc.

### SVG minification

SVG files are automatically discovered and minified with [SVGO](https://github.com/svg/svgo) (multipass). They're copied to the output directory with the same directory structure. No resize variants are generated.

```
src/images/icons/logo.svg
  → dist/static/images/icons/logo.svg  (minified)
```

SVGs can also be processed by preprocessors that have `"svg": true` set. The SVG is rasterized at its native dimensions, run through the preprocessor operations, and saved as a raster image (PNG) at original size only. See [Preprocessors](#preprocessors) for details.

### GIF handling

**Static GIFs** (single-frame) are treated like any other raster image — resized, cropped, and format-converted. Opaque static GIFs become JPEG, transparent ones become PNG (or whatever `format` is set to).

**Animated GIFs** (multi-frame) are copied to the output directory unchanged. No resizing or format conversion — animated GIFs would lose their frames through sharp's raster pipeline.

### Preprocessors

Preprocessors apply sharp transformations to the source image **before** the resize/format pipeline runs. Each preprocessor generates its own set of variants alongside the untouched original's variants. This is useful for generating blurred placeholder images (LQIP), grayscale variants for hover effects, watermarked versions for public galleries, etc.

#### CLI usage

The `--preprocess` / `-P` flag is a quick way to add a single preprocessor:

```bash
# Blur all images
npx poops-images --in src/images --out dist --preprocess blur:20

# Grayscale
npx poops-images --in src/images --out dist --preprocess grayscale

# Chain operations
npx poops-images --in src/images --out dist --preprocess grayscale,blur:10
```

When used via CLI, the preprocessor is named `"preprocessed"` and produces files like `photo-preprocessed-medium-300w.jpg`.

#### Config usage

For full control, define preprocessors in the config file. Each preprocessor has a `name` (used in filenames) and an `operations` array:

```json
{
  "in": "src/images",
  "out": "dist/images",
  "sizes": [
    { "name": "small", "width": 480 },
    { "name": "medium", "width": 1024 }
  ],
  "preprocessors": [
    {
      "name": "blurred",
      "operations": [{ "type": "blur", "sigma": 15 }]
    },
    {
      "name": "lqip",
      "operations": [{ "type": "blur", "sigma": 30 }],
      "sizes": [{ "width": 32 }],
      "skipOriginal": true
    },
    {
      "name": "gray",
      "operations": [{ "type": "grayscale" }],
      "sizes": [{ "name": "thumb", "width": 200, "height": 200, "crop": true }],
      "skipOriginal": true
    }
  ]
}
```

This produces for `photo.jpg` (assuming it's large enough):

```
photo.jpg                          # original passthrough
photo-small-480w.jpg               # original sized
photo-medium-1024w.jpg             # original sized
photo-blurred.jpg                  # blurred passthrough
photo-blurred-small-480w.jpg       # blurred sized
photo-blurred-medium-1024w.jpg     # blurred sized
photo-lqip-32w.jpg                 # tiny blurred placeholder only
photo-gray-thumb-200w.jpg          # grayscale thumbnail only
```

#### Preprocessor definition

| Field          | Type      | Default   | Description                                                            |
| -------------- | --------- | --------- | ---------------------------------------------------------------------- |
| `name`         | `string`  | required  | Identifier used in output filenames. Must be unique, alphanumeric/dash/underscore only |
| `operations`   | `array`   | required  | Ordered list of operations to apply (see table below)                  |
| `sizes`        | `array`   | _(global)_ | Override the global `sizes` for this preprocessor                      |
| `format`       | same as global | _(global)_ | Override the global `format` for this preprocessor                |
| `quality`      | same as global | _(global)_ | Override the global `quality` for this preprocessor               |
| `skipOriginal` | `boolean` | _(global)_ | Override the global `skipOriginal` for this preprocessor               |
| `svg`          | `boolean` | `false`    | Also process SVG source files through this preprocessor (rasterize → preprocess → save at original size) |

Operations are composable — they chain in sequence on the sharp pipeline. For example, `[{ "type": "grayscale" }, { "type": "blur", "sigma": 5 }]` first desaturates, then blurs.

#### Available operations

All operations map directly to [sharp](https://sharp.pixelplumbing.com/) methods:

| Operation   | Parameters                                              | Description                                      |
| ----------- | ------------------------------------------------------- | ------------------------------------------------ |
| `blur`      | `sigma` (number, 0.3–1000)                              | Gaussian blur                                    |
| `grayscale` | _(none)_                                                | Convert to grayscale                             |
| `sharpen`   | `sigma` (number, optional)                              | Sharpen                                          |
| `tint`      | `color` (string, e.g. `"#ff0000"`)                      | Tint with a color                                |
| `modulate`  | `brightness`, `saturation`, `hue`, `lightness` (numbers) | Adjust brightness/saturation/hue                 |
| `negate`    | _(none)_                                                | Invert colors                                    |
| `normalize` | _(none)_                                                | Stretch contrast to full range                   |
| `rotate`    | `angle` (number, degrees)                               | Rotate by exact angle                            |
| `flip`      | _(none)_                                                | Flip vertically                                  |
| `flop`      | _(none)_                                                | Flip horizontally                                |
| `gamma`     | `value` (number)                                        | Apply gamma correction                           |
| `composite` | `input` (path), `gravity`, `blend`, `top`, `left`       | Overlay an image (e.g. watermark)                |
| _(path)_    | any extra params                                         | Run a custom JS handler — use a file path as the `type` (see below) |

The `composite` operation resolves the `input` path relative to the config file directory (or CWD). Example watermark config:

```json
{
  "name": "watermarked",
  "operations": [
    { "type": "composite", "input": "assets/watermark.png", "gravity": "southeast" }
  ]
}
```

#### Custom handlers

If the `type` is not a built-in operation, it's treated as a custom handler. Resolution order:

1. **Short name** — `"type": "halftone"` resolves to `handlers/halftone.js` relative to the config file directory (or CWD)
2. **File path** — `"type": "./effects/halftone.js"` resolves the path directly relative to the config file directory (or CWD)

A custom handler is a JS module that exports a function:

```javascript
/**
 * @param {Buffer} buffer - Current image as a raw buffer
 * @param {object} params - All extra properties from the operation config, plus { width, height }
 * @param {Function} sharp - The sharp module, for convenience
 * @returns {Promise<Buffer|{buffer: Buffer, sidecars: Array}>} - Transformed image buffer, or object with sidecars
 */
export default async function (buffer, params, sharp) {
  // Transform the image using any library
  return sharp(buffer).negate().png().toBuffer()
}
```

The handler receives:
- `buffer` — the current image as a Buffer (already EXIF-rotated, and with any prior operations applied)
- `params` — all extra properties from the operation config object (everything except `type`), plus `width` and `height` of the current image
- `sharp` — the sharp module, so you don't need to import it separately

The handler can return:
- A `Buffer` — the transformed image
- An object `{ buffer, sidecars }` — the transformed image plus extra files to save alongside it. Each sidecar is `{ ext, data }` where `ext` is the file extension (e.g. `"svg"`) and `data` is a `Buffer`. Sidecars are saved as `{name}-{ppName}.{ext}` in the output directory.

**Config example (short name):**

```json
{
  "name": "halftone",
  "operations": [
    {
      "type": "halftone",
      "dotSize": "0.8%",
      "spacing": "1%",
      "shape": "square",
      "foreground": "#43523d",
      "background": "#c7f0d8"
    }
  ],
  "sizes": [{ "name": "medium", "width": 1024 }],
  "svg": true
}
```

This looks for `handlers/halftone.js` in the config directory. The handler receives `{ dotSize: "0.8%", spacing: "1%", shape: "square", foreground: "#43523d", background: "#c7f0d8", width: ..., height: ... }` as `params`. The `svg: true` flag makes this preprocessor also process SVG source files (rasterized at their native dimensions).

**Chaining:** Custom handlers can be mixed with built-in operations in any order. When a handler operation is encountered, the pipeline flushes the current buffer, calls your handler, and creates a new sharp instance from the result:

```json
{
  "name": "styled",
  "operations": [
    { "type": "grayscale" },
    { "type": "halftone", "dotSize": 4 },
    { "type": "blur", "sigma": 1 }
  ]
}
```

**Bundled example handlers** (in the `handlers/` directory):

- `halftone` — converts images to a halftone dot pattern. Supports circular dots (classic newspaper print) and square dots (Nokia LCD look). Emits an SVG sidecar alongside the raster output. Params: `dotSize`, `spacing`, `shape` (`"circle"` or `"square"`), `background`, `foreground`. Both `dotSize` and `spacing` accept absolute pixels (e.g. `8`) or percentages relative to the shortest side (e.g. `"1%"`)
- `pixelate` — chunky pixel art / retro Nokia look via nearest-neighbor downscale/upscale. Params: `blockSize`, `colors` (palette limit), `grayscale`

#### Output naming

The preprocessor name is inserted between the source name and the size name:

```
Original:      {name}-{sizeName}-{width}w.{ext}      → photo-medium-1024w.jpg
Preprocessed:  {name}-{ppName}-{sizeName}-{width}w.{ext}  → photo-blurred-medium-1024w.jpg
```

#### Edge cases

- **SVGs** — preprocessors with `"svg": true` also process SVG source files. The SVG is rasterized via sharp, run through the preprocessor operations, and saved at its native dimensions only (no resize variants). The minified SVG is still saved separately. Preprocessors without `"svg": true` skip SVG files
- **Animated GIFs** — preprocessors do not apply (copied as-is). Static GIFs go through preprocessors normally
- **Cache invalidation** — adding, removing, or changing any preprocessor invalidates all cache entries

### Caching

A cache file (`.poops-images-cache.json`) is stored in the output directory. It tracks per image: source mtime, size, original dimensions, EXIF metadata, and generated outputs with their dimensions.

```json
{
  "configHash": "a1b2c3...",
  "entries": {
    "photo.jpg": {
      "mtime": 1709312400000,
      "size": 2450000,
      "width": 4032,
      "height": 3024,
      "exif": {
        "make": "Apple",
        "model": "iPhone 15 Pro",
        "fNumber": 1.78,
        "iso": 50,
        "gps": {
          "latitude": { "decimal": 48.8566, "formatted": "48° 51' 23.76\" N" },
          "longitude": { "decimal": 2.3522, "formatted": "2° 21' 7.92\" E" },
          "googleMapsUrl": "https://www.google.com/maps?q=48.8566,2.3522"
        }
      },
      "outputs": [
        { "path": "photo-thumb-150w.webp", "width": 150, "height": 112 },
        { "path": "photo-large-1024w.webp", "width": 1024, "height": 768 }
      ]
    }
  }
}
```

**Skip logic:**

1. `--force` — always reprocess
2. Config hash changed (sizes/format/quality/skipOriginal/preprocessors differ) — reprocess everything
3. Per file: skip if source mtime + size unchanged AND all expected outputs exist on disk
4. On source deletion (watch mode): remove all generated variants

**Cache configuration:**

```json
{ "cache": true }
```

Default. Cache file at `.poops-images-cache.json` in the output directory.

```json
{ "cache": false }
```

Disable caching entirely. No cache file is read or written. Every build reprocesses all images. Watch mode still only processes the changed file (chokidar handles that).

```json
{ "cache": ".cache/images.json" }
```

Custom cache path, relative to the output directory.

```json
{ "cache": "/tmp/poops-cache.json" }
```

Absolute path, used as-is.

## Poops Integration

Next to being a standalone tool, `poops-images` is designed to work with [poops](https://github.com/stamat/poops) SSG.

It generates responsive image variants that poops can consume via `discoverImageVariants()` for automatic `srcset` generation. Both the `srcset` filter and `image` extension use the naming convention `/^(.+)-(\d+)w\.([a-z0-9]+)$/` to discover variants.

### Running together

```bash
# Build once, then run poops
npx poops-images && npx poops

# Watch mode alongside poops
npx poops-images --watch & npx poops
```

### How it works

1. **poops-images** generates variants from the images source directory to the static directory.
2. Use either `image` extension to generate an image tag with `srcset` or `srcset` filter to generate `srcset` attribute for the image tag.
3. They both call `discoverImageVariants(imagePath, outputDir)` which scans the output directory for matching files.
4. The `srcset` attribute is constructed by the available width sizes options with `relativePathPrefix` appended by default.

### Nunjucks usage

```html
<!-- srcset filter -->
<img
  src="/images/photo.jpg"
  srcset="{{ 'images/photo.jpg' | srcset }}"
  sizes="100vw"
  alt="A photo"
/>

<!-- image extension (generates complete <img> with srcset) -->
{% image "images/photo.jpg", "A photo" %}
```

### Config in poops.json

Instead of a separate `poops-images.json`, you can embed the config in your `poops.json`:

```json
{
  "markup": { "...": "..." },
  "images": {
    "in": "src/images",
    "out": "dist/static/images",
    "sizes": [
      { "name": "thumb", "width": 300, "height": 300 },
      { "width": 800 }
      { "width": 1024 }
    ]
  }
}
```

If you deploy GitHub Pages, do not run `poops-images` in the GitHub Actions to waste resources. Do this instead: Output the images into the `static` directory and then use poops `copy` functionality to move the static files into dist. Commit the static directory and build with Actions.

## Comparison

| Feature                | **poops-images**                         | [sharp-cli](https://github.com/vseventer/sharp-cli) | [responsive-images-generator](https://www.npmjs.com/package/responsive-images-generator) | [responsive-image-builder](https://www.npmjs.com/package/responsive-image-builder) | [@11ty/eleventy-img](https://www.11ty.dev/docs/plugins/image/) |
| ---------------------- | ---------------------------------------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Multiple size variants | Config array, all at once                | One size per command                                | Config array                                                                             | Config-driven                                                                      | Config array                                                   |
| Output naming          | `{name}-{sizeName}-{width}w.{ext}`       | Manual                                              | Custom suffix                                                                            | Custom template                                                                    | Hash-based                                                     |
| Crop modes             | `false` / `true` / `[x,y]` (9 positions) | Via sharp flags                                     | `crop: true` only (center)                                                               | Basic                                                                              | None                                                           |
| WebP/AVIF conversion   | Auto, per variant                        | Manual per command                                  | Single format option                                                                     | WebP only                                                                          | WebP + AVIF                                                    |
| Smart format selection | `smart` picks smallest of jpg/webp       | No                                                  | No                                                                                       | No                                                                                 | No                                                             |
| Transparency detection | Auto JPEG if opaque                      | No                                                  | No                                                                                       | No                                                                                 | No                                                             |
| SVG minification       | SVGO built-in                            | No                                                  | No                                                                                       | No                                                                                 | SVG passthrough                                                |
| GIF handling           | Static: full pipeline; animated: copy    | Process (loses animation)                           | No                                                                                       | No                                                                                 | Passthrough                                                    |
| Watch mode             | Chokidar, incremental                    | No                                                  | No                                                                                       | No                                                                                 | Dev server integration                                         |
| Caching                | Manifest + mtime/size + config hash      | No                                                  | No                                                                                       | Fingerprinting                                                                     | In-memory + disk                                               |
| Config file            | JSON, poops.json fallback                | CLI flags only                                      | JS API only                                                                              | JSON                                                                               | JS API (Eleventy-coupled)                                      |
| CLI                    | Standalone                               | Standalone                                          | No (API only)                                                                            | No (API only)                                                                      | No (Eleventy plugin)                                           |
| Concurrency control    | Configurable worker count                | No                                                  | No                                                                                       | Multi-threaded                                                                     | Yes                                                            |
| Preprocessors          | Blur, grayscale, watermark, etc. per-image | No                                                | No                                                                                       | No                                                                                 | No                                                             |
| SSG coupling           | Designed for poops, usable standalone    | None                                                | None                                                                                     | None                                                                               | Tightly coupled to Eleventy                                    |
| Maintained             | Active                                   | Last publish 2022                                   | Last publish 2019                                                                        | Last publish 2018                                                                  | Active                                                         |

### Key differentiators

- **Smart format selection** — `smart` mode compares jpg vs webp and keeps whichever is smaller. Others write all formats blindly, sometimes producing larger files.
- **Transparency detection** — auto-converts opaque PNGs and static GIFs to JPEG. No other tool does this.
- **WordPress-style crop API** — full 9-position anchor grid (`["left", "top"]`), not just center crop.
- **Integrated SVG pipeline** — SVGO minification in the same tool. Others require a separate build step.
- **Convention-based naming** — `{name}-{sizeName}-{width}w.{ext}` is purpose-built for poops' `discoverImageVariants()` srcset generation.
- **Preprocessors** — generate LQIP placeholders, grayscale hover variants, or watermarked copies alongside originals, all from config. No other tool has a built-in preprocessor pipeline.
- **Standalone CLI + API** — works with any build system or none at all, unlike Eleventy-coupled or webpack-coupled alternatives.

## License

MIT

## P.S.

All my projects are 💩... Hopefully useful 💩. With this AI boost I could call it diarrhea. But I'm not going to be that rude. 🤣

Made with ❤️ by your's truly, @stamat.
