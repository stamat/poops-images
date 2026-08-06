---
layout: poops-docs-theme/docs
title: Comparison
navTitle: Comparison
description: poops-images against sharp-cli, responsive-images-generator, responsive-image-builder and @11ty/eleventy-img — feature by feature, including where it loses.
order: 11
keywords: ["comparison", "sharp-cli", "eleventy-img", "responsive-images-generator", "alternatives", "prior art"]
---

# Comparison

| Feature | **poops-images** | [sharp-cli](https://github.com/vseventer/sharp-cli) | [responsive-images-generator](https://www.npmjs.com/package/responsive-images-generator) | [responsive-image-builder](https://www.npmjs.com/package/responsive-image-builder) | [@11ty/eleventy-img](https://www.11ty.dev/docs/plugins/image/) |
| --- | --- | --- | --- | --- | --- |
| Multiple size variants | Config array, all at once | One size per command | Config array | Config-driven | Config array |
| Output naming | `{name}-{sizeName}-{width}w.{ext}` | Manual | Custom suffix | Custom template | Hash-based |
| Crop modes | `false` / `true` / `[x,y]` (9 positions) | Via sharp flags | `crop: true` only (center) | Basic | None |
| WebP/AVIF conversion | Auto, per variant | Manual per command | Single format option | WebP only | WebP + AVIF |
| Smart format selection | `smart` picks smallest of jpg/webp | No | No | No | No |
| Transparency detection | Auto JPEG if opaque | No | No | No | No |
| SVG minification | SVGO built-in | No | No | No | SVG passthrough |
| GIF handling | Static: full pipeline; animated: copy | Process (loses animation) | No | No | Passthrough |
| Watch mode | Chokidar, incremental | No | No | No | Dev server integration |
| Caching | Manifest + mtime/size + config hash | No | No | Fingerprinting | In-memory + disk |
| Config file | JSON, `poops.json` fallback | CLI flags only | JS API only | JSON | JS API (Eleventy-coupled) |
| CLI | Standalone | Standalone | No (API only) | No (API only) | No (Eleventy plugin) |
| Concurrency control | Configurable worker count | No | No | Multi-threaded | Yes |
| Preprocessors | Blur, grayscale, watermark, etc. per image | No | No | No | No |
| SSG coupling | Designed for Poops, usable standalone | None | None | None | Tightly coupled to Eleventy |
| Maintained | Active | Last publish 2022 | Last publish 2019 | Last publish 2018 | Active |

## Key differentiators

- **Smart format selection** — `smart` compares jpg vs webp and keeps whichever is
  smaller. The others write every format blindly, sometimes producing a larger file than
  the one they replaced.
- **Transparency detection** — opaque PNGs and static GIFs become JPEG automatically. No
  other tool in the table does this.
- **WordPress-style crop API** — the full 9-position anchor grid (`["left", "top"]`), not
  just a center crop.
- **Integrated SVG pipeline** — SVGO minification in the same tool. The others need a
  separate build step.
- **Convention-based naming** — `{name}-{sizeName}-{width}w.{ext}` is purpose-built for
  Poops' `discoverImageVariants()`.
- **Preprocessors** — LQIP placeholders, grayscale hover variants and watermarked copies
  alongside the originals, all from config. No other tool here has a preprocessor
  pipeline.
- **Standalone CLI and API** — works with any build system or none, unlike the
  Eleventy-coupled or webpack-coupled alternatives.

## Where it loses

`@11ty/eleventy-img` is the better choice inside an Eleventy project — it is coupled to
Eleventy on purpose, and that coupling buys you a shortcode that already knows your
build. `sharp-cli` exposes far more of sharp's surface, one operation per command, which
is what you want for a one-off transform rather than a repeatable pipeline.

poops-images is narrower than all of them by design: a directory in, predictable variants
out, a cache in between. What it refuses to become is written down in
[CONTRIBUTING.md](https://github.com/stamat/poops-images/blob/main/CONTRIBUTING.md).
