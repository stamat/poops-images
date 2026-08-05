// Covers: the published JSON Schema being a valid JSON Schema, accepting the
// configs this repo ships, and agreeing with validateConfig — anything the
// schema lets through, the validator must accept, and the shapes the validator
// throws on must be flagged.
//
// The agreement is deliberately one-directional. validateConfig spreads unknown
// keys into the config and ignores them, while the schema closes the root: a
// misspelt `skipOriginals` is silently useless at runtime and flagged in the
// editor, which is the whole reason the schema exists.
//
// Deliberately not covered: custom handler parameters. An operation `type` that
// is not built in names a handler module, and its parameters are whatever that
// module reads — unknowable from here, which is why `operation` stays open.

import { describe, it, expect } from '@jest/globals'
import Ajv from 'ajv'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { validateConfig } from '../lib/config.js'
import { VALID_OPERATIONS } from '../lib/preprocess.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const schema = JSON.parse(fs.readFileSync(path.join(ROOT, 'schema/poops-images.schema.json'), 'utf-8'))

// strict:false — the schema is written for editors, which accept `examples` and
// long descriptions ajv's strict mode would flag.
const ajv = new Ajv({ allErrors: true, strict: false })
const validate = ajv.compile(schema)

const accepts = (config) => validate(config)
const errors = () => ajv.errorsText(validate.errors)

describe('the published schema', () => {
  it('is itself a valid JSON Schema', () => {
    expect(ajv.validateSchema(schema)).toBe(true)
  })

  it('leaves no description beside a $ref, where draft-07 would discard it', () => {
    const orphaned = []
    const walk = (node, at) => {
      if (Array.isArray(node)) return node.forEach((item, i) => walk(item, `${at}/${i}`))
      if (!node || typeof node !== 'object') return
      if (node.$ref && Object.keys(node).length > 1) orphaned.push(at)
      Object.entries(node).forEach(([key, value]) => walk(value, `${at}/${key}`))
    }
    walk(schema, '')
    expect(orphaned).toEqual([])
  })

  // The repo's own poops-images.json is gitignored, so the README is the richest
  // config that actually ships — and the one people copy out of.
  it('accepts every config example in the README', () => {
    const source = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf-8')
    // A preprocessor is documented on its own as well as inside a config, so a
    // block is checked against whichever of the two it is. Everything else under
    // a ```json fence — the cache file, EXIF output — has neither shape.
    const validatePreprocessorDef = ajv.compile({ ...schema.definitions.preprocessor, definitions: schema.definitions })
    const CONFIG_KEYS = ['in', 'out', 'sizes', 'preprocessors', 'format', 'quality']
    const examples = []
    for (const match of source.matchAll(/```json\n([\s\S]*?)```/g)) {
      let doc
      try { doc = JSON.parse(match[1]) } catch { continue }
      if (!doc || typeof doc !== 'object' || Array.isArray(doc)) continue
      const isPreprocessor = 'operations' in doc
      if (!isPreprocessor && !CONFIG_KEYS.some((key) => key in doc)) continue
      examples.push({ line: source.slice(0, match.index).split('\n').length, doc, isPreprocessor })
    }

    expect(examples.length).toBeGreaterThan(3)
    const rejected = examples
      .filter(({ doc, isPreprocessor }) => !(isPreprocessor ? validatePreprocessorDef(doc) : accepts(doc)))
      .map(({ line, isPreprocessor }) =>
        `README.md:${line} — ${ajv.errorsText((isPreprocessor ? validatePreprocessorDef : validate).errors)}`)
    expect(rejected).toEqual([])
  })

  it('names every built-in operation, so completion offers what the registry runs', () => {
    const listed = schema.definitions.operation.properties.type.examples
    expect([...listed].sort()).toEqual([...VALID_OPERATIONS].sort())
  })
})

describe('what the schema accepts, validateConfig accepts', () => {
  const CONFIGS = [
    { in: 'src', out: 'dist' },
    { in: 'src', out: 'dist', sizes: [] },
    { in: 'src', out: 'dist', sizes: [{ width: 0, height: 0 }] },
    { in: 'src', out: 'dist', sizes: [{ name: 'thumb', width: 200, height: 200, crop: true }] },
    { in: 'src', out: 'dist', sizes: [{ name: 'banner', width: 1200, height: 400, crop: ['center', 'top'] }] },
    { in: 'src', out: 'dist', format: false },
    { in: 'src', out: 'dist', format: 'smart' },
    { in: 'src', out: 'dist', format: ['webp', 'avif'] },
    { in: 'src', out: 'dist', quality: 75 },
    { in: 'src', out: 'dist', quality: { webp: 70, avif: 50 } },
    { in: 'src', out: 'dist', exclude: 'private/**' },
    { in: 'src', out: 'dist', exclude: ['private/**', 'tmp/**'] },
    { in: 'src', out: 'dist', cache: false },
    { in: 'src', out: 'dist', cache: '.cache.json' },
    { in: 'src', out: 'dist', concurrency: 8, skipOriginal: true, verbose: true },
    { in: 'src', out: 'dist', preprocessors: [{ name: 'blurred', operations: [{ type: 'blur', sigma: 15 }] }] },
    {
      in: 'src',
      out: 'dist',
      preprocessors: [{
        name: 'lqip',
        operations: [{ type: 'blur', sigma: 30 }],
        sizes: [{ width: 32 }],
        skipOriginal: true,
        resizeFirst: { width: 1024 }
      }]
    },
    { in: 'src', out: 'dist', preprocessors: [{ name: 'custom', operations: [{ type: 'halftone', dotSize: '0.8%' }], svg: true }] }
  ]

  it.each(CONFIGS.map((c, i) => [i, c]))('config %i', (_i, config) => {
    expect(accepts(config) ? [] : errors()).toEqual([])
    expect(() => validateConfig({ ...config })).not.toThrow()
  })
})

describe('what validateConfig throws on, the schema flags', () => {
  const BAD = [
    ['a width that is not a number', { in: 'src', out: 'dist', sizes: [{ width: '200' }] }],
    ['a crop anchor that does not exist', { in: 'src', out: 'dist', sizes: [{ width: 10, height: 10, crop: ['middle', 'top'] }] }],
    ['a crop array of the wrong length', { in: 'src', out: 'dist', sizes: [{ width: 10, height: 10, crop: ['left'] }] }],
    ['a quality outside 1-100', { in: 'src', out: 'dist', quality: 300 }],
    ['an output format that is not supported', { in: 'src', out: 'dist', format: 'bmp' }],
    ['a preprocessor with no operations', { in: 'src', out: 'dist', preprocessors: [{ name: 'x', operations: [] }] }],
    ['a preprocessor name with a space in it', { in: 'src', out: 'dist', preprocessors: [{ name: 'my blur', operations: [{ type: 'blur', sigma: 1 }] }] }],
    ['an operation with no type', { in: 'src', out: 'dist', preprocessors: [{ name: 'x', operations: [{ sigma: 1 }] }] }],
    ['a resizeFirst box of zero', { in: 'src', out: 'dist', preprocessors: [{ name: 'x', operations: [{ type: 'blur', sigma: 1 }], resizeFirst: { width: 0, height: 0 } }] }]
  ]

  it.each(BAD)('%s', (_why, config) => {
    expect(accepts(config)).toBe(false)
    expect(() => validateConfig({ ...config })).toThrow()
  })
})

describe('the schema flags what only fails once sharp runs', () => {
  // These parse — validateConfig never looks inside an operation beyond `type` —
  // and blow up mid-pipeline, per image, after the run has already started.
  const LATE = [
    ['blur without its sigma', { type: 'blur' }],
    ['blur with a sigma out of range', { type: 'blur', sigma: 0.1 }],
    ['tint without its color', { type: 'tint' }],
    ['rotate without its angle', { type: 'rotate' }],
    ['gamma without its value', { type: 'gamma' }],
    ['composite without its input', { type: 'composite' }]
  ]

  it.each(LATE)('%s', (_why, operation) => {
    const config = { in: 'src', out: 'dist', preprocessors: [{ name: 'x', operations: [operation] }] }
    expect(accepts(config)).toBe(false)
    expect(() => validateConfig({ ...config })).not.toThrow()
  })

  it('still allows a custom handler to take whatever parameters it likes', () => {
    const config = {
      in: 'src',
      out: 'dist',
      preprocessors: [{ name: 'x', operations: [{ type: 'ascii', fontSize: 10, foreground: '#00ff00' }] }]
    }
    expect(accepts(config) ? [] : errors()).toEqual([])
  })

  it('closes the root, which validateConfig does not', () => {
    const typo = { in: 'src', out: 'dist', skipOriginals: true }
    expect(accepts(typo)).toBe(false)
    expect(() => validateConfig({ ...typo })).not.toThrow()
  })
})
