---
layout: poops-docs-theme/docs
title: Configuration
navTitle: Configuration
description: The poops-images.json config file — where it is looked for, every key it reads, and the editor completion that catches a typo before the run.
order: 3
keywords: ["config", "poops-images.json", "poops.json", "$schema", "json schema", "quality", "concurrency", "include", "exclude"]
---

# Configuration

For a repeatable setup, create a `poops-images.json` in your project root:

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

## Where the config is looked for

In this order, first hit wins:

1. An explicit path via `-c`
2. `poops-images.json` in the working directory
3. The `images` key inside `poops.json`
4. The `images` key inside `💩.json`

## A misspelt key used to fail quietly

Most of this config fails quietly rather than loudly. A misspelt key is spread into the
config and ignored — `skipOriginals` never skips anything. A missing operation parameter
is worse: `{ "type": "blur" }` validates fine at load and throws mid-pipeline, per image,
once the run is already going.

poops-images names the misspelt ones when the config loads, against the schema it ships:

```
[info] unknown key "quailty" — ignored. Valid: $schema, in, out, sizes, format, quality, skipOriginal, include, exclude, concurrency, cache, preprocessors, verbose, configDir
[info] unknown key "widht" in sizes[0] — ignored. Valid: name, width, height, crop
```

Key names only — a wrong *type* is caught by the checks that already throw, and a missing
operation parameter is still the pipeline's to find. The same warnings appear when Poops
runs poops-images, since both go through the same config path.

## Editor completion

Point `$schema` at the shipped [JSON Schema](https://json-schema.org) and the editor
catches all of it as you type, before the run:

```json
{
  "$schema": "./node_modules/poops-images/schema/poops-images.schema.json",
  "in": "src/images",
  "out": "dist/static/images"
}
```

Or at the copy on GitHub, which needs nothing installed — it tracks `main`, so it
describes the latest release rather than the version you have pinned:

```
https://raw.githubusercontent.com/stamat/poops-images/main/schema/poops-images.schema.json
```

It covers the whole config, so it fits `poops-images.json` directly. Inside a `poops.json`
the same object is the `images` value — [Poops' own schema](https://stamat.info/poops/poops.schema.json)
describes that key loosely, and a local file gets you both, checked properly:

```json
{
  "allOf": [{ "$ref": "https://stamat.info/poops/poops.schema.json" }],
  "properties": {
    "images": { "$ref": "https://raw.githubusercontent.com/stamat/poops-images/main/schema/poops-images.schema.json" }
  }
}
```

A test keeps the schema honest against `validateConfig`: everything the schema accepts,
the validator accepts. It is stricter in one direction on purpose — the validator ignores
unknown keys, and the schema flags them, which is the entire point.

## Full example

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
  "include": "**/*.{jpg,jpeg,png,tiff,tif,webp,heic,heif,svg,gif}",
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

## Every key

| Field | Type | Default | Description |
| --- | --- | --- | --- |
| `in` | `string` | `"."` | Source directory |
| `out` | `string` | `"."` | Output directory |
| `sizes` | `array` | `[]` | [Size definitions](sizes). Empty = conversion-only |
| `format` | `false\|string\|array` | `false` | [Output format(s)](formats). `false` = normalize to web-ready, `"smart"` = smallest of jpg/webp, or explicit format(s) like `"webp"` or `["webp", "avif"]` |
| `quality` | `number\|object` | `{jpg: 82, webp: 80, avif: 60, png: 90}` | Quality 1-100 for all formats, or per-format object |
| `skipOriginal` | `boolean` | `false` | Skip the original (non-resized) compressed image |
| `include` | `string` | `"**/*.{jpg,jpeg,png,tiff,tif,webp,heic,heif,svg,gif}"` | Glob pattern for source images. Governs every pipeline — a narrowed include narrows SVG and GIF processing too |
| `exclude` | `array` | `[]` | Glob patterns to exclude |
| `concurrency` | `number` | `4` | Max parallel image operations |
| `preprocessors` | `array` | `[]` | [Preprocessor definitions](preprocessors) |
| `cache` | `true\|false\|string` | `true` | [Cache behavior](caching). `true` = default cache file in output dir, `false` = no cache, `"path"` = custom cache file path (relative to output dir or absolute) |
| `verbose` | `boolean` | `false` | Per-file progress logs. `false` = only the end-of-run summary and errors are printed (enable with CLI `--verbose`) |
