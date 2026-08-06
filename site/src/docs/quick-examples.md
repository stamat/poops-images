---
layout: poops-docs-theme/docs
title: Quick examples
navTitle: Quick examples
description: Copy-paste recipes for the jobs poops-images gets used for — a responsive srcset set, square thumbnails, an anchored hero crop, LQIP placeholders, watermarks and watch mode.
order: 1
keywords: ["examples", "recipes", "srcset", "thumbnails", "lqip", "watermark", "watch", "webp", "avif"]
---

# Quick examples

Every recipe below runs as written. The flags are documented on the [CLI](cli) page and
the keys on [Configuration](configuration) — this page is only the composition.

## Squash one image

Output defaults to the current directory, so this rewrites nothing and drops the compressed
copy where you are:

```bash
npx poops-images photo.jpg --out ./out
```

## Squash a whole directory

Structure is preserved, so `src/images/gallery/photo.jpg` lands at
`dist/images/gallery/photo.jpg`:

```bash
npx poops-images --in src/images --out dist/images
```

## Convert to WebP, and go lighter

```bash
npx poops-images --in src/images --out dist/images --format webp
npx poops-images --in src/images --out dist/images --format webp -q 60
```

## Let it pick the smaller file

`smart` encodes both JPEG and WebP for every variant and keeps whichever came out smaller —
which is the only honest way to answer the question, because the answer changes per image:

```bash
npx poops-images --in src/images --out dist/images --format smart
```

Add AVIF next to the smart pick when you want the modern format as well:

```bash
npx poops-images --in src/images --out dist/images --format smart,avif
```

## A responsive set for a srcset

Three widths, two formats, per-format quality — six variants per image plus the original:

```bash
npx poops-images src/images --out dist/images \
  --widths 300,768,1024 \
  --format webp,avif \
  --quality webp:70,avif:50
```

The filenames come out as `photo-300w.webp`, `photo-768w.webp`, … which is exactly what
[Poops reads](poops-integration) to assemble the `srcset` for you.

## Square thumbnails, cropped from the center

Widths on the command line are proportional; a hard crop needs a config file:

```json
{
  "in": "src/images",
  "out": "dist/images",
  "sizes": [
    { "name": "thumb", "width": 300, "height": 300, "crop": true }
  ]
}
```

```bash
npx poops-images
```

## A hero banner that keeps the sky

A wide, short crop anchored to the top, so the horizon survives and the ground is what goes:

```json
{
  "in": "src/images",
  "out": "dist/images",
  "sizes": [
    { "name": "hero", "width": 1920, "height": 600, "crop": ["center", "top"] }
  ]
}
```

The other eight anchors are in [Sizes and crops](sizes#crop-modes).

## A WordPress-shaped size set

The four sizes WordPress gives you, if that is the vocabulary already in your head:

```json
{
  "in": "src/images",
  "out": "dist/static/images",
  "sizes": [
    { "name": "thumbnail", "width": 150, "height": 150, "crop": true },
    { "name": "medium", "width": 300, "height": 300 },
    { "name": "medium_large", "width": 768, "height": 0 },
    { "name": "large", "width": 1024, "height": 1024 }
  ]
}
```

## A blurred placeholder to load first

The LQIP trick: a 32px-wide blurred copy, small enough to inline, shown until the real
image arrives. `skipOriginal` keeps it from also emitting a full-size blur nobody wants:

```json
{
  "in": "src/images",
  "out": "dist/images",
  "sizes": [{ "name": "large", "width": 1600 }],
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

Out comes `photo-large-1600w.jpg` and `photo-lqip-32w.jpg`.

## A grayscale copy for a hover effect

```json
{
  "name": "gray",
  "operations": [{ "type": "grayscale" }],
  "sizes": [{ "name": "card", "width": 400, "height": 300, "crop": true }],
  "skipOriginal": true
}
```

## Watermark a public gallery

`input` resolves relative to the config file, so the watermark travels with the config:

```json
{
  "name": "watermarked",
  "operations": [
    { "type": "composite", "input": "assets/watermark.png", "gravity": "southeast" }
  ]
}
```

## A one-off filter with no config file

```bash
npx poops-images --in src/images --out dist --preprocess blur:20
npx poops-images --in src/images --out dist --preprocess grayscale,blur:10
```

Files come out named `photo-preprocessed-…`, because a CLI preprocessor has no name to
give them.

## Work while you work

Watch mode processes only what changed, and removes the variants of a source you delete:

```bash
npx poops-images --in src/images --out dist/images --watch
```

## Find out what it would do

`--dry-run` writes nothing and logs the plan. Pair it with `--force` when the output looks
stale and you want to know whether the [cache](caching) is the reason:

```bash
npx poops-images --in src/images --out dist/images --dry-run
npx poops-images --in src/images --out dist/images --force --verbose
```

> [!TIP]
> `--verbose` is worth having on any run you are debugging — quiet is the default, so
> without it a skipped file and a processed file look identical from outside.
