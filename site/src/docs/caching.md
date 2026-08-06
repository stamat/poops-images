---
layout: poops-docs-theme/docs
title: Caching
navTitle: Caching
description: What the cache file records, the four rules that decide whether an image is reprocessed, and how to move or switch off the cache.
order: 7
keywords: ["cache", "incremental", "watch", "force", "config hash", "mtime"]
---

# Caching

A cache file (`.poops-images-cache.json`) is written to the output directory. It records,
per image: source mtime, source size, original dimensions, [EXIF metadata](metadata), and
the generated outputs with their dimensions.

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

## What gets skipped

In order:

1. `--force` — always reprocess.
2. The config hash changed — `sizes`, `format`, `quality`, `skipOriginal` or
   `preprocessors` differ. Everything is reprocessed.
3. Per file: skip if the source mtime **and** size are unchanged **and** every expected
   output still exists on disk.
4. On source deletion in watch mode: remove all generated variants.

> [!NOTE]
> Rule 3 checks the outputs, not just the source. Delete a variant by hand and the next
> run puts it back, without `--force`.

## Configuring it

```json
{ "cache": true }
```

The default. Cache file at `.poops-images-cache.json` in the output directory.

```json
{ "cache": false }
```

No cache file is read or written, and every build reprocesses every image. Watch mode
still only processes the changed file — chokidar handles that, not the cache.

```json
{ "cache": ".cache/images.json" }
```

A custom path, relative to the output directory.

```json
{ "cache": "/tmp/poops-cache.json" }
```

An absolute path, used as-is.
