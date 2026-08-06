---
layout: poops-docs-theme/docs
title: EXIF metadata
navTitle: EXIF metadata
description: Every EXIF field poops-images extracts from JPEG and TIFF sources — camera, lens, exposure and GPS — and where to read it back.
order: 8
keywords: ["exif", "metadata", "gps", "camera", "lens", "exposure", "iso", "captions"]
---

# EXIF metadata

EXIF data is extracted automatically from JPEG and TIFF sources and stored in the
[cache file](caching). Nothing is written into the output images — this is the data your
own tooling reads back to build captions.

| Field | Description |
| --- | --- |
| `make` | Camera manufacturer |
| `model` | Camera model |
| `orientation` | EXIF orientation tag (1–8) |
| `resolution` | `{ x, y }` DPI |
| `dateTime` | Original capture date |
| `offsetTime` | UTC offset string |
| `fNumber` | Aperture, e.g. `1.78` |
| `exposure` | `{ value, formatted }` — e.g. `1/125` |
| `iso` | ISO speed |
| `focalLength` | Focal length in mm |
| `focalLength35mm` | 35mm equivalent focal length |
| `flash` | `true`/`false` — whether the flash fired |
| `lensModel` | Lens identifier string |
| `software` | Processing software |
| `gps` | GPS block, below |

## GPS

Present when the source carries coordinates:

| Field | Description |
| --- | --- |
| `latitude` | `{ degrees, ref, decimal, formatted }` — both DMS and float |
| `longitude` | `{ degrees, ref, decimal, formatted }` — both DMS and float |
| `altitude` | `{ value, ref }` — meters above or below sea level |
| `direction` | Image direction in degrees |
| `speed` | `{ value, unit }` — km/h, mph or knots |
| `dateTime` | Combined datestamp and timestamp, as ISO 8601 UTC |
| `googleMapsUrl` | Direct link to the coordinates on Google Maps |

> [!WARNING]
> GPS coordinates in a public cache file are a home address. The cache lives in the output
> directory — if that directory is deployed, so is the location every photo was taken.
> Move it out of the deployed tree with `{ "cache": "/tmp/poops-cache.json" }`, or strip
> the coordinates before publishing.

Both blocks are read back from the cache by downstream tools — a Nunjucks extension
generating captions with camera and location, for instance.
