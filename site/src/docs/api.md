---
layout: poops-docs-theme/docs
title: API
navTitle: API
description: The ImageProcessor class — construct it with the same object the config file holds, then processAll, watch or stopWatch.
order: 9
keywords: ["api", "ImageProcessor", "processAll", "watch", "library", "node", "esm"]
---

# API

`ImageProcessor` is the package entry point and the only class. It takes the same config
object the [JSON config file](configuration) holds — the file is read into this, nothing
more.

```javascript
import ImageProcessor from "poops-images";

// Minimal — compress images at original size
const processor = new ImageProcessor({
  in: "src/images",
  out: "dist/images",
});
await processor.processAll();
```

```javascript
// With sizes and format conversion
const processor = new ImageProcessor({
  in: "src/images",
  out: "dist/images",
  sizes: [
    { name: "thumb", width: 150, height: 150, crop: true },
    { name: "large", width: 1024, height: 0 },
  ],
  format: "webp",
  quality: { jpg: 85, webp: 80 },
  preprocessors: [
    {
      name: "lqip",
      operations: [{ type: "blur", sigma: 30 }],
      sizes: [{ width: 32 }],
      skipOriginal: true,
    },
  ],
});

const stats = await processor.processAll();
// { processed: 12, variants: 48, skipped: 0, bytes: 245760, errors: 0, elapsed: 2300 }
```

## Methods

| Call | What it does |
| --- | --- |
| `processAll()` | Process everything, return the stats object above |
| `processAll({ force: true })` | Ignore the [cache](caching), regenerate everything |
| `processAll({ dryRun: true })` | Log what would be processed, write nothing |
| `watch()` | Watch the input directory and process incrementally |
| `stopWatch()` | Stop watching |

```javascript
await processor.processAll({ force: true });
await processor.processAll({ dryRun: true });

processor.watch();
processor.stopWatch();
```

> [!NOTE]
> Validation happens once, in the constructor — a config built in code is checked exactly
> as one read from disk is, because a library caller never passes through the file loader
> at all.

See [Configuration](configuration) for every key and [Sizes and crops](sizes) for the size
object.
