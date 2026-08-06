# Changelog

All notable changes to poops-images are recorded here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
the project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Releases up to and including v1.2.1 predate this file; `git log v1.2.1` is the
record for those.

## Contributing an entry

Write your change under `## [Unreleased]`, grouped under `### Added`,
`### Changed`, `### Fixed`, `### Deprecated`, `### Removed` or `### Security`.
Give the heading a short title after an em dash and open with one paragraph
saying what was wrong before:

```markdown
## [Unreleased] — timeouts are configurable

Every request used the same hardcoded thirty seconds, which is too long for a
health check and too short for an upload.

### Added

- ...
```

Write it for the person upgrading, not for the person who wrote the code. What
they need is what changed for them: a renamed option, a different default, an
error that is now thrown, output that moved.

On `script/publish`, `script/changelog` cuts this section into a released entry
in the same commit as the version bump, and the entry becomes the body of the
GitHub release verbatim.

## [Unreleased] — the documentation is a site now

A 900-line README is where a fact goes to hide. Everything was in it and nothing
was findable: no search, no table of contents, and a crop anchor grid eleven
screens below the flag that needs it.

### Added

- A documentation site at <https://stamat.info/poops-images/>, built with
  [Poops](https://github.com/stamat/poops) from `site/src` and published by a
  GitHub Actions workflow on every push to `main`. Same content as the README,
  one page per topic, with search and a table of contents. `npm run docs`
  serves it locally on port 4041; `npm run docs:build` writes `site/dist`.
- A **Quick examples** page on that site — a recipe per job, runnable as
  written: a responsive srcset set, square thumbnails, an anchored hero crop, an
  LQIP placeholder, a watermark, watch mode. It is the only page without a
  README counterpart, because it composes documented facts rather than adding
  any.

### Security

- `sharp` moved from `^0.33.0` to `^0.35.0`, which closes four libvips
  vulnerabilities inherited by every 0.33 and 0.34 release
  ([GHSA-f88m-g3jw-g9cj](https://github.com/advisories/GHSA-f88m-g3jw-g9cj):
  CVE-2026-33327, CVE-2026-33328, CVE-2026-35590, CVE-2026-35591). There is no
  patched 0.33 line, so the upgrade is the only fix.

### Changed

- The default `include` glob now names `svg` and `gif` alongside the raster
  formats, because `include` governs every pipeline. If your config sets a
  custom `include` — say `"**/*.jpg"` — SVGs and GIFs are no longer processed
  unless the glob covers them; add them to the pattern to keep the old
  behavior.
- **Node ≥ 20.9 is now the minimum**, because sharp 0.35 dropped Node 18. On
  Node 18 the install now fails outright rather than half-working; `engines` in
  `package.json` says so, so npm warns before anything is written.
- AVIF output is not byte-for-byte what it was. sharp 0.35 retuned lossy AVIF
  around SSIMULACRA2 quality metrics, so the same `quality` number lands on a
  different file size — usually smaller. Nothing in the config changed; if you
  have a size budget pinned to a byte count, re-measure it.

### Fixed

- Pointing at one file means one file. `--in photo.jpg` used to run the raster
  pipeline on that file and then minify every SVG and copy every GIF found
  beside it, recursively, because SVG and GIF discovery ignored `include`. All
  three pipelines now read the same `include` glob.
- One truncated image no longer kills the whole build. A source whose header
  reads fine but whose body fails to decode used to abort `processAll()` — the
  remaining images went unprocessed and the cache unsaved. It is now counted in
  `stats.errors` like any other bad file, and a failed decode leaves the
  previous run's outputs and cache entry for that file untouched instead of
  sweeping them as stale.
- The `poops.json` example under **Poops Integration** in the README was missing
  a comma between two size objects, so copying it out produced invalid JSON. The
  test that checks every README config example against the schema parses each
  fence and skips what will not parse, which is exactly how a syntax error hid
  from it; it now reports on the docs site's examples as well.

## [1.3.0] - 2026-08-06 — the config file tells you when it is wrong

A misspelt key was silently ignored: `"quailty": 60` meant the default quality,
with nothing said about it, and the first sign was output that looked wrong.

### Added

- A [JSON Schema](https://json-schema.org) for the config, shipped in the
  package at `schema/poops-images.schema.json`. Point `$schema` at it and the
  editor completes and checks the whole config as you type — see the *Config
  file* section of the README for both the local and the GitHub URL.
- Unknown config keys are named as they load: `[info] unknown key "quailty" —
  ignored. Valid: …`, with the path for nested ones (`in sizes[0]`). Key names
  only; a wrong *type* still throws where it always did. A schema file that
  cannot be read leaves the config to load unadvised rather than taking the run
  down over a warning.

### Changed

- The config is validated once, in the `ImageProcessor` constructor, which is
  the one place that cannot trust what it is handed — a library caller can
  build a config without going through the file loader at all. `loadConfig()`
  now returns the file as read, so anything reading a default off its result
  before handing it to the processor sees `undefined` where it used to see the
  default. The CLI and the documented `new ImageProcessor(config)` path behave
  as they did, minus the duplicate warnings.
