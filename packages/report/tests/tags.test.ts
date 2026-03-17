import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import os from 'node:os'
import { join } from 'node:path'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'

// ---------------------------------------------------------------------------
// renderTagBadges tests (synchronous, no AI)
// ---------------------------------------------------------------------------

import { renderTagBadges } from '../src/tags.js'

describe('renderTagBadges', () => {
  it('returns empty string for empty tags', () => {
    expect(renderTagBadges([])).toBe('')
  })

  it('renders tag pills', () => {
    const html = renderTagBadges(['typescript', 'testing'])
    expect(html).toContain('class="tag"')
    expect(html).toContain('typescript')
    expect(html).toContain('testing')
  })

  it('escapes HTML special chars in tags', () => {
    const html = renderTagBadges(['a&b', '<test>'])
    expect(html).toContain('a&amp;b')
    expect(html).toContain('&lt;test&gt;')
    expect(html).not.toContain('<test>')
  })

  it('sets data-tag attribute', () => {
    const html = renderTagBadges(['typescript'])
    expect(html).toContain('data-tag="typescript"')
  })
})

// ---------------------------------------------------------------------------
// getTags tests
// ---------------------------------------------------------------------------

import { getTags } from '../src/tags.js'

describe('getTags', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(os.tmpdir(), 'mt-tags-test-'))
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('returns [] when noAi=true', async () => {
    const result = await getTags('abc123', 'some summary', { cacheDir: tmpDir, noAi: true, model: 'test' })
    expect(result).toEqual([])
  })

  it('returns [] when summary is empty', async () => {
    const result = await getTags('abc123', '', { cacheDir: tmpDir, noAi: false, model: 'test' })
    expect(result).toEqual([])
  })

  it('returns [] when summary is whitespace only', async () => {
    const result = await getTags('abc123', '   \n  ', { cacheDir: tmpDir, noAi: false, model: 'test' })
    expect(result).toEqual([])
  })

  it('returns [] when no API key set', async () => {
    const saved = process.env['ANTHROPIC_API_KEY']
    delete process.env['ANTHROPIC_API_KEY']
    try {
      const result = await getTags('abc123', 'a valid summary', { cacheDir: tmpDir, noAi: false, model: 'test' })
      expect(result).toEqual([])
    } finally {
      if (saved !== undefined) process.env['ANTHROPIC_API_KEY'] = saved
    }
  })

  it('returns cached tags without calling API', async () => {
    const sha256 = 'cached-sha256'
    // Write cache file
    const tagsDir = join(tmpDir, 'tags')
    mkdirSync(tagsDir, { recursive: true })
    writeFileSync(
      join(tagsDir, `${sha256}.json`),
      JSON.stringify({ sha256, tags: ['cached', 'tag'], generated_at: '2026-01-01T00:00:00Z' }),
    )
    // Even with a fake API key, cached result should be returned immediately
    const saved = process.env['ANTHROPIC_API_KEY']
    process.env['ANTHROPIC_API_KEY'] = 'fake-key'
    try {
      const result = await getTags(sha256, 'some summary', { cacheDir: tmpDir, noAi: false, model: 'test' })
      expect(result).toEqual(['cached', 'tag'])
    } finally {
      if (saved !== undefined) process.env['ANTHROPIC_API_KEY'] = saved
      else delete process.env['ANTHROPIC_API_KEY']
    }
  })
})
