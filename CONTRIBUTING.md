# Contributing to poops-images

Issues and pull requests are welcome. Taking part means keeping to the
[Code of Conduct](CODE_OF_CONDUCT.md).

poops-images prepares images for the web and stops there: it reads a directory,
writes resized and converted variants next to a predictable name, and caches
what it already did. It is built for [poops](https://github.com/stamat/poops)
and works standalone, which is the line it keeps — anything that only makes
sense inside poops belongs in poops. It will not become an asset pipeline, a
CDN client, an uploader, or a general image-editing library. Its whole extension
surface is a config file and a handler module the config points at; there is no
registration API to call and there is not going to be one, because the two we
have already cover the case. New knobs earn their place against that, before
the code is written.

## Getting set up

```bash
git clone https://github.com/stamat/poops-images.git
cd poops-images
script/bootstrap
```

```bash
script/test      # run the tests
script/lint      # run the linters
script/build     # nothing to build — a no-op, see the comment in it
```

Trying it on real images takes a scratch pit that is not in git: `src/` for
input, `dist/` for output, `poops-images.json` for the config, then
`npm run build`. All three are ignored, so fill them with whatever you like.

The docs site lives in [site/src/](site/src/) and is built with
[Poops](https://github.com/stamat/poops) itself:

```bash
npm run docs        # serve on http://localhost:4041, watching site/src
npm run docs:build  # build once into site/dist
```

Pushing to `main` publishes it to <https://stamat.info/poops-images/>.

`sharp` is the one dependency with a native binary; if `script/bootstrap` fails,
it is almost always that.

## Reporting a bug

[Open an issue](../../issues/new/choose) — the form asks for what you ran, what
you expected, the version and the environment, because those are the four things
every fix starts from. A reproduction is worth more than a description of one.
An input image that shows it beats both.

## Pull requests

- **Add a test.** A bug fix gets a test that fails without the fix. Tests live
  in [__tests__/](__tests__/) and run against real fixture images.
- **Match the surrounding style.** `script/lint` is the authority, and CI runs it.
- **Add a changelog entry** under `## [Unreleased]` in
  [CHANGELOG.md](CHANGELOG.md) — that file explains the format.
- **Keep the diff about one thing.** A rename bundled with a fix is two reviews
  wearing one hat.
- **A new config key touches four files**, not one:
  [lib/config.js](lib/config.js) to read it,
  [schema/poops-images.schema.json](schema/poops-images.schema.json) to describe
  it, and both the README and
  [site/src/docs/configuration.md](site/src/docs/configuration.md) to document
  it. The schema is what editors complete from, and a key missing from it is
  reported to the user as a typo. The README and the docs site hold the same
  facts — landing in one and not the other is how the two drift apart.
- **Agent-written code is welcome — you still own it.** It meets the same bar
  as handwritten code: tests, lint, CI green. You understand every line well
  enough to answer review questions; "the agent wrote it" is not an answer.
  Point your agent at [AGENTS.md](AGENTS.md) before it starts.

Commit messages are freeform, write something that says what changed.

## How a release works

Maintainer flow, recorded here so the automation isn't a mystery:

`script/publish [version]` takes the current version from the last `v*` tag,
writes the new one with `script/version`, runs `script/changelog` to cut
`[Unreleased]` into a released entry, builds, commits, tags and pushes. Pushing
the tag triggers [publish.yml](.github/workflows/publish.yml), which publishes
via trusted publishing — OIDC, no tokens stored anywhere. The changelog entry
becomes the body of the GitHub release verbatim.
