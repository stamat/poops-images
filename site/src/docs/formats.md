---
layout: poops-docs-theme/docs
title: Formats
navTitle: Formats
description: Format conversion, smart JPEG-vs-WebP selection, transparency detection, SVG minification and what happens to a GIF.
order: 5
keywords: ["webp", "avif", "jpeg", "png", "smart", "transparency", "svg", "svgo", "gif", "format"]
---

# Formats

The `format` option controls exactly which output formats are produced per size. When it
is not set, the tool normalizes to a web-ready format — opaque PNG or GIF becomes JPEG,
TIFF/HEIC/HEIF becomes JPEG or PNG — and re-encodes.

| `format` value | Behavior | Outputs per size |
| --- | --- | --- |
| *(not set / `false`)* | Normalize to a web-ready format, re-encode | 1 |
| `"smart"` | Compare jpg vs webp, keep whichever is smaller | 1 |
| `"webp"` | Generate only webp | 1 |
| `["webp", "avif"]` | Generate exactly webp and avif | 2 |
| `["smart", "avif"]` | Smart pick (webp or jpg) + avif, deduped | 1–2 |

## Explicit formats

Generate exactly what you ask for, with no size comparison:

```bash
# Single format
npx poops-images --format webp
# photo-medium-300w.webp

# Multiple formats
npx poops-images --format webp,avif
# photo-medium-300w.webp
# photo-medium-300w.avif
```

In config:

```json
{ "format": "webp" }
```

```json
{ "format": ["webp", "avif"] }
```

## Smart — JPEG vs WebP

For each variant, `smart` encodes both jpg and webp and keeps the smaller one.
Transparent images always get webp. **Smart never produces avif** — combine it with an
explicit format if you want one:

```bash
# Smart selection only
npx poops-images --format smart
# photo-medium-300w.webp   (webp was smaller than jpg)

# Smart + explicit avif
npx poops-images --format smart,avif
# photo-medium-300w.webp   (smart pick)
# photo-medium-300w.avif   (explicit)
```

```json
{ "format": ["smart", "avif"] }
```

## Transparency detection

When processing a PNG or a static GIF, the tool checks whether any pixel has transparency
(alpha < 255). If the image is fully opaque, it is converted to JPEG instead — typically
5–10× smaller with no visible quality loss.

Transparent images stay as PNG, or as webp/avif when `format` is set.

## SVG minification

SVG files matching `include` (the default covers `*.svg`) are minified with
[SVGO](https://github.com/svg/svgo) (multipass). They are copied to the output directory
with the same directory structure. No resize variants are generated.

```
src/images/icons/logo.svg
  → dist/static/images/icons/logo.svg  (minified)
```

SVGs can also be processed by [preprocessors](preprocessors) that set `"svg": true`. The
SVG is rasterized at its native dimensions, run through the preprocessor operations, and
saved as a raster image at original size only.

## GIF handling

**Static GIFs** (single-frame) are treated like any other raster image — resized, cropped
and format-converted. Opaque static GIFs become JPEG, transparent ones become PNG, or
whatever `format` is set to.

**Animated GIFs** (multi-frame) are copied to the output directory unchanged. No resizing,
no format conversion — an animated GIF would lose its frames through sharp's raster
pipeline, so it is left alone rather than quietly flattened.
