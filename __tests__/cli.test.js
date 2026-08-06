// Covers the CLI process contract: exit codes. Deliberately not covered:
// flag parsing and config resolution, which config.test.js and processor
// tests own — spawning a process per case is too slow to repeat them here.
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals'
import fs from 'node:fs'
import path from 'node:path'
import { execFile } from 'node:child_process'
import sharp from 'sharp'

const BIN = path.join(import.meta.dirname, '..', 'poops-images.js')
const FIXTURES_DIR = path.join(import.meta.dirname, 'fixtures')
const TEST_INPUT = path.join(FIXTURES_DIR, 'cli-input')
const TEST_OUTPUT = path.join(FIXTURES_DIR, 'cli-output')

function cleanup(dir) {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
}

function run(args) {
  return new Promise((resolve) => {
    execFile(process.execPath, [BIN, ...args], (error, stdout, stderr) => {
      resolve({ code: error ? error.code : 0, stdout, stderr })
    })
  })
}

describe('cli exit codes', () => {
  beforeAll(async() => {
    cleanup(TEST_INPUT)
    cleanup(TEST_OUTPUT)
    fs.mkdirSync(TEST_INPUT, { recursive: true })
    await sharp({ create: { width: 100, height: 100, channels: 3, background: { r: 0, g: 120, b: 0 } } })
      .jpeg().toFile(path.join(TEST_INPUT, 'good.jpg'))
  })

  afterAll(() => {
    cleanup(TEST_INPUT)
    cleanup(TEST_OUTPUT)
  })

  it('a clean build exits 0', async() => {
    const { code } = await run(['--widths', '50', '--in', TEST_INPUT, '--out', TEST_OUTPUT])
    expect(code).toBe(0)
  })

  it('a build with a bad source exits 1 and still processes the rest', async() => {
    fs.writeFileSync(path.join(TEST_INPUT, 'garbage.jpg'), 'not an image')
    const { code } = await run(['--widths', '50', '--in', TEST_INPUT, '--out', TEST_OUTPUT, '--force'])
    expect(code).toBe(1)
    // The good file still went through — the bad one failed alone
    expect(fs.existsSync(path.join(TEST_OUTPUT, 'good-50w.jpg'))).toBe(true)
  })
})
