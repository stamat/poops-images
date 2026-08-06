---
layout: poops-docs-theme/docs
title: Sizes and crops
navTitle: Sizes and crops
description: Size definitions, the 9-position crop anchor grid, what the output files are called, and why a crop is scaled down where a plain size is skipped.
order: 4
keywords: ["sizes", "crop", "anchor", "resize", "output naming", "srcset", "upscaling", "wordpress"]
---

# Sizes and crops

The config API mirrors WordPress's `add_image_size(name, width, height, crop)`.

| Field | Type | Default | Description |
| --- | --- | --- | --- |
| `name` | `string` | `""` | Size identifier, appended to the filename. Optional — omit or leave empty for width-only naming |
| `width` | `number` | `0` | Target width in px. `0` = scale by height only |
| `height` | `number` | `0` | Target height in px. `0` = scale by width only |
| `crop` | `bool\|[x,y]` | `false` | Crop mode |

When both `width` and `height` are `0` (or omitted), the image is processed at its
original dimensions — useful for format conversion without resizing.

## Crop modes

**`false`** — Soft crop. Proportional resize to fit within the bounding box. No content is
lost. Output dimensions may differ from the config.

**`true`** — Hard crop, centered. Exact dimensions, cropped from the center.

**`["x", "y"]`** — Hard crop with an anchor. Nine positions:

| | `"left"` | `"center"` | `"right"` |
| --- | --- | --- | --- |
| **`"top"`** | `["left", "top"]` | `["center", "top"]` | `["right", "top"]` |
| **`"center"`** | `["left", "center"]` | `["center", "center"]` | `["right", "center"]` |
| **`"bottom"`** | `["left", "bottom"]` | `["center", "bottom"]` | `["right", "bottom"]` |

## Examples

```json
{ "name": "medium_large", "width": 768, "height": 0 }
```

768px wide, height scaled proportionally. No cropping.

```json
{ "name": "thumb", "width": 150, "height": 150, "crop": true }
```

Always 150×150, cropped from the center.

```json
{ "name": "hero", "width": 1920, "height": 600, "crop": ["center", "top"] }
```

Always 1920×600, anchored to top-center — which preserves the sky or the header area.

## Output filenames

| Case | Pattern | Example |
| --- | --- | --- |
| Named size | `{name}-{sizeName}-{width}w.{ext}` | `photo-medium-300w.webp` |
| Unnamed size | `{name}-{width}w.{ext}` | `photo-960w.webp` |
| Original / conversion-only | `{name}.{ext}` | `photo.webp` |

The width in the filename is the **actual** output width after the resize, not the
configured target. That matters for soft crops, where the output may come out smaller than
the target because of the aspect ratio.

### Named-size groups

The largest of a named group drops the width suffix and becomes the canonical "main"
variant: `photo-{name}.{ext}`.

So two `thumb` sizes at 480 and 960 produce `photo-thumb-480w.webp` and `photo-thumb.webp`
(the 960, main). A single `thumb` size is trivially the largest, so it too is written as
`photo-thumb.webp`. This is what lets [Poops](poops-integration) assemble a `srcset` for
the whole named group with `size='thumb'` — the main's real width is read from the compile
cache.

### Example output

Given `src/images/photo.jpg` (2000×1500) with `format: ["webp", "avif"]` and these sizes:

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

The original (non-resized) image is always included, compressed and converted to the
target format(s). Use `--skip-original` or `"skipOriginal": true` to omit it. Without
`format` set, only one file per size is produced, in the normalized web format.

## Directory structure

The source directory structure is preserved in the output:

```
src/images/gallery/photo.jpg
  → dist/static/images/gallery/photo.jpg               (original, compressed)
  → dist/static/images/gallery/photo-medium-300w.jpg   (resized variant)
```

## No upscaling

Images are never upscaled. If the source is smaller than a target size:

- **Soft crop** — the size is skipped when the source is smaller than the target in both
  dimensions (sharp's `withoutEnlargement` handles the rest).
- **Hard crop** — the size is skipped when the source is smaller in either dimension.

### Crops on undersized sources

Soft and width-only sizes are never upscaled: a size larger than the source is skipped.
**Hard crops are different — they are scaled down to fit rather than skipped.** If the
source is smaller than the crop box on either axis, the box is scaled down proportionally
(keeping the crop's aspect ratio) and the image is cropped to the largest box that fits.

A `thumb` 960×960 crop from a 1083×726 source yields a 726×726 crop, not a dropped
variant.
