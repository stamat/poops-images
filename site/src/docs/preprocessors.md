---
layout: poops-docs-theme/docs
title: Preprocessors
navTitle: Preprocessors
description: Apply sharp transformations before the resize pipeline — LQIP placeholders, grayscale hover variants, watermarks, halftone, and custom JS handlers.
order: 6
keywords: ["preprocessors", "lqip", "blur", "grayscale", "watermark", "halftone", "pixelate", "ascii", "handlers", "resizeFirst", "sidecar"]
---

# Preprocessors

Preprocessors apply sharp transformations to the source image **before** the resize and
format pipeline runs. Each preprocessor generates its own set of variants alongside the
untouched original's variants — blurred placeholders (LQIP), grayscale variants for hover
effects, watermarked versions for public galleries.

## From the CLI

`--preprocess` / `-P` is a quick way to add a single preprocessor:

```bash
# Blur all images
npx poops-images --in src/images --out dist --preprocess blur:20

# Grayscale
npx poops-images --in src/images --out dist --preprocess grayscale

# Chain operations
npx poops-images --in src/images --out dist --preprocess grayscale,blur:10
```

From the CLI the preprocessor is named `"preprocessed"`, and produces files like
`photo-preprocessed-medium-300w.jpg`.

## From the config

For full control, define preprocessors in the config file. Each one has a `name` (used in
filenames) and an `operations` array:

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

For `photo.jpg`, assuming it is large enough, that produces:

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

## Definition

| Field | Type | Default | Description |
| --- | --- | --- | --- |
| `name` | `string` | required | Identifier used in output filenames. Must be unique; alphanumeric, dash and underscore only |
| `operations` | `array` | required | Ordered list of operations to apply |
| `sizes` | `array` | *(global)* | Override the global `sizes` for this preprocessor |
| `format` | same as global | *(global)* | Override the global `format` for this preprocessor |
| `quality` | same as global | *(global)* | Override the global `quality` for this preprocessor |
| `skipOriginal` | `boolean` | *(global)* | Override the global `skipOriginal` for this preprocessor |
| `svg` | `boolean` | `false` | Also process SVG source files (rasterize → preprocess → save at original size) |
| `resizeFirst` | `boolean\|object` | `false` | Resize before preprocessing instead of after |

Operations are composable — they chain in sequence on the sharp pipeline. For example,
`[{ "type": "grayscale" }, { "type": "blur", "sigma": 5 }]` first desaturates, then blurs.

## Output naming

The preprocessor name is inserted between the source name and the size name:

```
Original:      {name}-{sizeName}-{width}w.{ext}          → photo-medium-1024w.jpg
Preprocessed:  {name}-{ppName}-{sizeName}-{width}w.{ext} → photo-blurred-medium-1024w.jpg
```

## resizeFirst — the order of resize and operations

By default, operations run once on the full-size source, and size variants are generated
from that result. That is the right order for most filters — blur, tint and grayscale look
the same either way. But effects with a **fixed pixel scale** — pixelate blocks, halftone
dots, ASCII cells — come out at a different visual density on every variant.
`resizeFirst` flips the order:

| Value | Behavior |
| --- | --- |
| `false` (default) | Preprocess the full-size source once, then resize into variants |
| `true` | Resize each variant first, then preprocess it — pixel-scale effects look identical across variants |
| `{ width, height, crop }` | Resize the source to this base size once, preprocess once, then generate variants from the base — one preprocessing pass, and variants never exceed the base dimensions |

```json
{
  "preprocessors": [
    {
      "name": "pixel",
      "operations": [{ "type": "pixelate", "blockSize": 8 }],
      "resizeFirst": true
    },
    {
      "name": "lqip",
      "operations": [{ "type": "blur", "sigma": 10 }],
      "resizeFirst": { "width": 64 },
      "sizes": [{ "width": 32 }],
      "skipOriginal": true
    }
  ]
}
```

With `"resizeFirst": true`, the 8-pixel blocks are 8 output pixels in every variant.
Without it, blocks are 8 pixels *of the source*, so a 4000px source downscaled to 480px
shows roughly 1px blocks.

The object form accepts the same shape as a size definition (`width` and/or `height`,
optional `crop`) and never upscales — a base larger than the source is clamped to the
source, keeping the crop aspect ratio. It is also a performance lever: expensive
operations run once on a small base instead of once per variant or once at full size.

Sidecar-emitting handlers (like `halftone`'s SVG) write their sidecar once per
preprocessor: from the full-size pass by default, from the first variant with
`resizeFirst: true`, or from the base with the object form.

## Available operations

All operations map directly to [sharp](https://sharp.pixelplumbing.com/) methods:

| Operation | Parameters | Description |
| --- | --- | --- |
| `blur` | `sigma` (number, 0.3–1000) | Gaussian blur |
| `grayscale` | *(none)* | Convert to grayscale |
| `sharpen` | `sigma` (number, optional) | Sharpen |
| `tint` | `color` (string, e.g. `"#ff0000"`) | Tint with a color |
| `modulate` | `brightness`, `saturation`, `hue`, `lightness` (numbers) | Adjust brightness/saturation/hue |
| `negate` | *(none)* | Invert colors |
| `normalize` | *(none)* | Stretch contrast to the full range |
| `rotate` | `angle` (number, degrees) | Rotate by an exact angle |
| `flip` | *(none)* | Flip vertically |
| `flop` | *(none)* | Flip horizontally |
| `gamma` | `value` (number) | Apply gamma correction |
| `composite` | `input` (path), `gravity`, `blend`, `top`, `left` | Overlay an image, e.g. a watermark |
| *(path)* | any extra params | Run a custom JS handler — use a file path as the `type` |

`composite` resolves the `input` path relative to the config file directory, or the
working directory:

```json
{
  "name": "watermarked",
  "operations": [
    { "type": "composite", "input": "assets/watermark.png", "gravity": "southeast" }
  ]
}
```

## Custom handlers

If the `type` is not a built-in operation, it is treated as a custom handler. Resolution
order:

1. **Short name** — `"type": "halftone"` resolves to `handlers/halftone.js` relative to
   the config file directory (or the working directory).
2. **File path** — `"type": "./effects/halftone.js"` resolves the path directly, relative
   to the same.

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

- `buffer` — the current image as a Buffer, already EXIF-rotated, with any prior
  operations applied
- `params` — every extra property from the operation config object (everything except
  `type`), plus the `width` and `height` of the current image
- `sharp` — the sharp module, so you do not need to import it separately

The handler can return:

- A `Buffer` — the transformed image
- An object `{ buffer, sidecars }` — the transformed image plus extra files to save
  alongside it. Each sidecar is `{ ext, data }`, where `ext` is the file extension (e.g.
  `"svg"`) and `data` is a `Buffer`. Sidecars are saved as `{name}-{ppName}.{ext}` in the
  output directory.

Config example, by short name:

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

This looks for `handlers/halftone.js` in the config directory. The handler receives
`{ dotSize: "0.8%", spacing: "1%", shape: "square", foreground: "#43523d", background: "#c7f0d8", width: …, height: … }`
as `params`. The `svg: true` flag makes this preprocessor also process SVG source files,
rasterized at their native dimensions.

### Chaining

Custom handlers can be mixed with built-in operations in any order. When a handler
operation is reached, the pipeline flushes the current buffer, calls your handler, and
creates a new sharp instance from the result:

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

### Bundled examples

Three handlers ship in the repository's
[handlers/](https://github.com/stamat/poops-images/tree/main/handlers) directory. They are
**not** part of the published package — they are what your own `handlers/*.js` looks like:

- **`halftone`** — converts images to a halftone dot pattern. Circular dots (classic
  newspaper print) or square dots (Nokia LCD look). Emits an SVG sidecar alongside the
  raster output. Params: `dotSize`, `spacing`, `shape` (`"circle"` or `"square"`),
  `background`, `foreground`. Both `dotSize` and `spacing` accept absolute pixels (e.g.
  `8`) or percentages relative to the shortest side (e.g. `"1%"`).
- **`pixelate`** — chunky pixel art via nearest-neighbor downscale and upscale. Params:
  `blockSize`, `colors` (palette limit), `grayscale`.
- **`ascii`** — converts images to ASCII character art (dark-to-light ramp `@%#*+=-:. `).
  Outputs a raster image plus two sidecars: plain text (`.txt`) and a monospace-text SVG
  (`.svg`). Params: `fontSize`, `foreground`, `background`.

## Edge cases

- **SVGs** — preprocessors with `"svg": true` also process SVG source files. The SVG is
  rasterized via sharp, run through the operations, and saved at its native dimensions
  only, with no resize variants. The minified SVG is still saved separately.
  Preprocessors without `"svg": true` skip SVG files entirely.
- **Animated GIFs** — preprocessors do not apply; the file is copied as-is. Static GIFs go
  through preprocessors normally.
- **Cache invalidation** — adding, removing or changing any preprocessor invalidates every
  [cache](caching) entry.
