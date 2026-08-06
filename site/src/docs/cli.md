---
layout: poops-docs-theme/docs
title: CLI
navTitle: CLI
description: Every poops-images flag and the positional input argument — the reference, with the recipes on their own page.
order: 2
keywords: ["cli", "flags", "options", "watch", "dry-run", "force", "verbose", "npx"]
---

# CLI

No config file needed — pass flags. This page is the reference for every one of them; for
the compositions worth copying, see [Quick examples](quick-examples).

## Options

```
Usage: poops-images [input] [options]

  -i, --in <path>        Input directory or file path (default: .)
  -o, --out <path>       Output directory (default: .)
  -s, --widths <list>    Comma-separated widths (e.g. 300,768,1024)
  -F, --format <format>  Output format(s): smart, webp, avif, or comma-separated (e.g. smart,avif)
  -q, --quality <value>  Quality 1-100 (all formats) or per-format (e.g. webp:60,avif:40)
      --skip-original    Skip the original (non-resized) compressed image
  -c, --config <path>    Config file path (default: poops-images.json)
  -b, --build            Process all images and exit (default)
  -w, --watch            Watch for changes and process incrementally
  -f, --force            Ignore cache, regenerate everything
      --dry-run          Show what would be processed without writing
  -P, --preprocess <ops> Preprocess operations (e.g. blur:20,grayscale,sharpen:1.5)
      --verbose          Show per-file progress output
  -v, --version          Show version
  -h, --help             Show help
```

## The positional argument

The first positional argument is the input path:

```bash
npx poops-images photo.jpg                  # same as --in photo.jpg
npx poops-images src/images --out dist      # same as --in src/images --out dist
npx poops-images -c my-config.json --out /tmp/resized   # config file + override output dir
```

## Breaking change

- `--quiet` was removed. Quiet is now the default.
- `--verbose` shows per-file progress logs.
- `-q` is now the short flag for `--quality`.

The build exits `1` when any file failed to process (and says which on stderr), so CI
catches corrupt sources; `0` otherwise.

> [!TIP]
> `--dry-run` prints what would be written without writing it, and `--force` ignores the
> [cache](caching) entirely. Reach for the pair when the output looks wrong and you want
> to know whether the cache is lying to you.
