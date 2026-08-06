---
layout: poops-docs-theme/docs
title: Poops integration
navTitle: Poops integration
description: How the output naming convention becomes a srcset in Poops — running the two together, the image extension, and the images key in poops.json.
order: 10
keywords: ["poops", "srcset", "nunjucks", "static site generator", "discoverImageVariants", "github pages"]
---

# Poops integration

Next to being a standalone tool, poops-images is built to work with
[Poops](https://github.com/stamat/poops).

It generates responsive variants that Poops consumes via `discoverImageVariants()` for
automatic `srcset` generation. Both the `srcset` filter and the `image` extension find
variants with one pattern:

```
/^(.+)-(\d+)w\.([a-z0-9]+)$/
```

Which is why [output naming](sizes#output-filenames) is a convention and not a preference:
rename the files and the srcset stops assembling itself.

## Running them together

```bash
# Build once, then run poops
npx poops-images && npx poops

# Watch mode alongside poops
npx poops-images --watch & npx poops
```

## How it works

1. **poops-images** generates variants from the image source directory into the static
   directory.
2. In your templates, use the `image` extension to generate a whole `<img>` tag with a
   `srcset`, or the `srcset` filter to generate only the attribute.
3. Both call `discoverImageVariants(imagePath, outputDir)`, which scans the output
   directory for matching files.
4. The `srcset` attribute is built from the widths that actually exist, with
   `relativePathPrefix` prepended by default.

## In a Nunjucks template

{% raw %}
```html
<!-- srcset filter -->
<img
  src="/images/photo.jpg"
  srcset="{{ 'images/photo.jpg' | srcset }}"
  sizes="100vw"
  alt="A photo"
/>

<!-- image extension (generates a complete <img> with srcset) -->
{% image "images/photo.jpg", "A photo" %}
```
{% endraw %}

## Config inside poops.json

Instead of a separate `poops-images.json`, the config can live under the `images` key of
your `poops.json`:

```json
{
  "markup": { "...": "..." },
  "images": {
    "in": "src/images",
    "out": "dist/static/images",
    "sizes": [
      { "name": "thumb", "width": 300, "height": 300 },
      { "width": 800 },
      { "width": 1024 }
    ]
  }
}
```

## Do not process images in CI

> [!TIP]
> If you deploy to GitHub Pages, do not run poops-images in the Actions run — it burns
> minutes re-encoding images that did not change. Output the images into the `static`
> directory, commit that directory, and let Poops' `copy` move the static files into
> `dist` during the build.
