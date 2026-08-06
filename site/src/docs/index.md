---
layout: poops-docs-theme/docs
title: Introduction
navTitle: Introduction
description: What poops-images does, why it exists, and how to install it — the CLI and library that prepares images for the web.
order: 0
keywords: ["poops-images", "images", "sharp", "svgo", "webp", "avif", "responsive images", "srcset"]
---

# Introduction

**poops-images prepares images for the web.** Point it at a directory, get back
compressed, resized, cropped and converted variants under names a `srcset` can be built
from. It leans on [sharp](https://sharp.pixelplumbing.com/) for raster work and
[SVGO](https://github.com/svg/svgo) for vectors, and keeps a cache so the second run does
almost nothing.

## Why

Built because I hate opening Pixelmator Pro and ImageOptim both. I want to convert the
format and optimise the image in one go, regardless of the source format. Also
**sometimes JPEG is lighter than WebP** — and then I have to inspect it to decide which
one I'll keep, and so on.

And let me ask you this: what happens when you have to create a `srcset`? Make the image
responsive? You are responsible, right? Right?

## Install

```bash
npm install poops-images
```

Node ≥ 18. `sharp` is the one dependency with a native binary; if the install fails, that
is almost always what failed.

## What it does

- Compresses, generates size variants and crops
- WordPress-like notation for resizing and cropping, with a
  [9-position anchor grid](sizes#crop-modes)
- [Smart format selection](formats#smart-jpeg-vs-webp) — compares JPEG vs WebP, keeps
  whichever is smaller
- [Transparency detection](formats#transparency-detection) — auto-converts opaque PNGs
  and static GIFs to JPEG
- [Never upscales](sizes#no-upscaling) — skips oversized plain sizes, scales oversized
  crops down to fit instead
- [Preprocessors](preprocessors) — blur, grayscale, watermark, halftone or a custom
  handler applied before the variants are generated
- Watch mode with incremental processing, and configurable concurrency
- A [cache](caching) that tracks source dimensions, output dimensions and generated
  variants, plus the [EXIF metadata](metadata) it read on the way

## Supported input formats

| Input | What comes out |
| --- | --- |
| JPEG, PNG, WebP | Resized, cropped and converted like anything else |
| HEIC / HEIF | JPEG when opaque, PNG when transparent |
| TIFF | JPEG when opaque, PNG when transparent |
| SVG | Minified with SVGO, no crops — see [SVG minification](formats#svg-minification) |
| GIF (static) | JPEG when opaque, PNG when transparent; resized and cropped like other raster images |
| GIF (animated) | Copied as-is. No compression, no crops — the raster pipeline would drop the frames |

## Where to next

[Quick examples](quick-examples) is the fastest way in: a recipe per job, each one runnable
as written. Past that, two ways to drive it, and they are the same tool:

- **No config file** — pass flags and go. Every flag is on the [CLI](cli) page.
- **Repeatable setup** — a `poops-images.json` in the project root. Every key is on the
  [Configuration](configuration) page.

If you are here because of [Poops](https://github.com/stamat/poops), the part you want is
[Poops integration](poops-integration) — the naming convention is what makes
`discoverImageVariants()` work.
