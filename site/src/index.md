---
layout: poops-docs-theme/docs
title: poops-images
description: A CLI and library that prepares images for the web — resize, crop, convert, minify, cache. Built for Poops, works standalone.
jsonld:
  "@type": WebPage
---

# poops-images 💩📸

**One command between a folder of photos and a folder of web-ready variants.** Resize,
crop, convert, minify, cache — for a static site, a build script, or a directory you
just want smaller.

```bash
npm install poops-images
npx poops-images src/images --out dist/images --widths 300,768,1024 --format webp,avif
```

It exists because the alternative is Pixelmator Pro and ImageOptim both, and because
**sometimes JPEG is lighter than WebP** — which you only find out by encoding both and
looking. `--format smart` does the looking for you.

## Start here

- **[Introduction](docs/)** — what it does, what it refuses to do, the whole feature list.
- **[Quick examples](docs/quick-examples)** — a recipe per job, runnable as written.
- **[CLI](docs/cli)** — every flag and what it takes.
- **[Configuration](docs/configuration)** — `poops-images.json`, editor completion, every key.
- **[Preprocessors](docs/preprocessors)** — LQIP placeholders, grayscale hovers, halftone, your own handlers.
- **[Poops integration](docs/poops-integration)** — how the filenames become a `srcset`.

## What it will not become

An asset pipeline, a CDN client, an uploader, or a general image-editing library. It
reads a directory, writes variants next to a predictable name, and caches what it already
did. Anything that only makes sense inside [Poops](https://github.com/stamat/poops)
belongs in Poops. The line is drawn in
[CONTRIBUTING.md](https://github.com/stamat/poops-images/blob/main/CONTRIBUTING.md), and
it is checked before code is written rather than after.
