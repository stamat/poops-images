# poops-images — agent notes

A CLI and library that prepares images for the web: resize, crop, convert,
minify, cache.
Read [CONTRIBUTING.md](CONTRIBUTING.md) first — it defines what belongs in this
project and what a pull request needs.

## Commands

```bash
script/bootstrap # install what the project needs, from a fresh clone
script/test      # run the tests (pass a path or -t to narrow)
script/lint      # run the linters (the authority; CI runs it)
script/build     # a no-op — nothing is compiled, see the comment in it
```

```bash
npm run docs        # serve the docs site on :4041, watching site/src
npm run docs:build  # build it once into site/dist
```

`npm run build` is not `script/build`: it runs the tool over the local scratch
directories (`src/` → `dist/`, config in `poops-images.json`, all three ignored
by git) as a smoke test.

## Layout

| Path | What it is |
| --- | --- |
| [poops-images.js](poops-images.js) | The CLI: argument parsing, then straight into `ImageProcessor`. |
| [lib/](lib/) | Everything else, one concern per file. `processor.js` is the package entry (`main`) and the only class. |
| [schema/poops-images.schema.json](schema/poops-images.schema.json) | The config format. Shipped in the package; users point `$schema` at it. |
| [handlers/](handlers/) | Example preprocessor handlers. **Not shipped** — they are what a user's own `handlers/*.js` looks like, and the README points at them. |
| [__tests__/](__tests__/) | Jest, against real fixture images in `__tests__/fixtures/`. |
| [site/src/](site/src/) | The docs site content — one markdown page per topic. Built by [poops.json](poops.json) into `site/dist`, which is gitignored and rebuilt in CI. |

## Documentation

Two surfaces, no generated API reference: [README.md](README.md) is what npm and
GitHub show, and [site/src/](site/src/) is the same content split into pages,
published to <https://stamat.info/poops-images/> by
[pages.yml](.github/workflows/pages.yml).

- **Document in the same change as the code.** A behavior change that ships
  undocumented is unfinished.
- **Every fact on both surfaces.** A flag, a config key, a default, a behaviour:
  it lands in the README *and* on the docs site, or it has drifted the day it
  ships. The site may hold more than the README — `quick-examples` is
  compositions of documented facts, not new ones — but never a fact of its own.
  The schema test reads every ` ```json ` fence on both surfaces, so a config
  example that stops validating fails CI wherever it lives; prose has no such
  guard.
- **Edit the section that already covers it.** Do not add new README sections,
  new docs pages, summary files, or migration notes nobody asked for. A doc
  nobody asked for is a doc nobody maintains.
- **Write for the person using it**, not the person who wrote it: what it
  does, one example that runs, and the part that would otherwise surprise
  them.

## Principles

- **Test-driven.** The test is the spec; write it first. A failing test means
  the code is wrong — never weaken, skip, or delete a test to make it pass. If
  the test itself is wrong, say so and let review decide.
- **YAGNI.** Build only what the task needs — no speculative options,
  abstractions, or "for later" scaffolding.
- **Native / stdlib first.** In order: what's already in this repo → the
  platform → the standard library → new code. A new dependency is a last
  resort and needs a reason.
- **Root cause over symptom.** Fix where all callers route through, not the
  one path the bug report names.
- **Delete dead code.** No commented-out blocks, no "for later" exports — git
  remembers.

## Boundaries

- **Always:** run `script/lint` and `script/test` before calling work done;
  pair every fix or feature with a test; document anything user-visible in the
  README section that already covers it; add a changelog entry under
  `## [Unreleased]`.
- **Ask first:** changing the config format or the output naming convention —
  poops reads those names to build srcsets, so a rename breaks a downstream
  project; changing the `ImageProcessor` API; adding a dependency.
- **Never:** weaken, skip, or delete a test to make it pass; bump the version
  or publish — a tag does that; commit anything from `src/`, `dist/` or
  `poops-images.json`, which are the local scratch pit, or from `site/dist`,
  which CI builds.

## Before adding a feature

Run this checklist before writing any code; stop at the first "no".

1. **Does sharp, SVGO or the standard library already do it?** If so, there is
   no feature.
2. **Search for prior art.** How do similar projects do it? What interface do
   they expose? Cite what you found — a URL per fact, no guesses. How can we
   improve on it? If the answer is "we can't", would we benefit from having it
   here at all?
3. **Does it fit the project?** CONTRIBUTING.md says what this project is for
   and what it refuses to become — check against that paragraph, before
   building, not after.
4. **Still yes?** Build the smallest version that works.

## Non-obvious rules

- **A new config key touches four files**: `lib/config.js` reads it,
  `schema/poops-images.schema.json` describes it, and the README plus
  [site/src/docs/configuration.md](site/src/docs/configuration.md) document it.
  Miss the schema and the loader reports the new key to the user as a typo,
  because the unknown-key warning reads the schema to decide what is valid.
- **Validation happens once, in the `ImageProcessor` constructor.** `loadConfig`
  reads and returns; it does not validate or apply defaults. Adding a second
  validation pass double-reports every stray key.
- **`validateConfig` must be idempotent.** It normalises missing dimensions to
  `0`, so validating an already-validated config must not start rejecting it.
- **Windows is a supported platform and CI runs it.** Paths go through `path`,
  never string concatenation, and text read off disk gets its line endings
  normalised before anything parses it — `\r\n` is why the schema test stopped
  finding the README's code fences. Both are bugs that already happened.
- **libvips holds input file descriptors open**, so tests disable the sharp
  cache in [jest.setup.js](jest.setup.js) — without it, fixture cleanup fails
  with `EBUSY` on Windows.
- **Jest needs `--experimental-vm-modules`** for ESM; that is why `npm test`
  invokes the Jest binary directly instead of using the `jest` command.
