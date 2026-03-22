/**
 * CLI tests for cmd-search.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { captureOutput } from '../helpers/capture.js'

const MOCK_RESULTS = [
  {
    client: 'claude',
    project: 'myproject',
    session_id: 'sess-001',
    title: 'Authentication bug',
    cwd: '/home/user/project',
    branch: 'main',
    started_at: '2024-06-01T10:00:00Z',
  },
]

const MOCK_SEARCH_RESULT = {
  mode: 'mixed' as const,
  source_counts: {
    fts: 1,
    vector: 1,
    graph: 0,
  },
  results: MOCK_RESULTS,
}

describe('cmdSearch', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'cmd-search-test-'))
    vi.resetModules()
  })
  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it('returns 1 for empty query', async () => {
    const { cmdSearch } = await import('../../src/cmd-search.js')
    const cap = captureOutput()
    try {
      const code = await cmdSearch({ query: '   ', globalRoot: tmpDir, limit: 20, format: 'text' })
      expect(code).toBe(1)
      expect(cap.err()).toContain('must not be empty')
    } finally {
      cap.restore()
    }
  })

  it('returns 0 with text output for matching results', async () => {
    vi.doMock('@openmnemo/core', async (importOriginal) => {
      const original = await importOriginal<typeof import('@openmnemo/core')>()
      return {
        ...original,
        searchRecall: () => MOCK_SEARCH_RESULT,
      }
    })

    const { cmdSearch } = await import('../../src/cmd-search.js')
    const cap = captureOutput()
    try {
      const code = await cmdSearch({
        query: 'authentication',
        globalRoot: tmpDir,
        limit: 20,
        format: 'text',
      })
      expect(code).toBe(0)
      const out = cap.out()
      expect(out).toContain('query: authentication')
      expect(out).toContain('mode: mixed')
      expect(out).toContain('source_counts: fts=1 vector=1 graph=0')
      expect(out).toContain('count: 1')
      expect(out).toContain('[claude] myproject/sess-001')
      expect(out).toContain('title: Authentication bug')
      expect(out).toContain('branch: main')
    } finally {
      cap.restore()
    }
  })

  it('returns 0 with JSON output when format=json', async () => {
    vi.doMock('@openmnemo/core', async (importOriginal) => {
      const original = await importOriginal<typeof import('@openmnemo/core')>()
      return {
        ...original,
        searchRecall: () => MOCK_SEARCH_RESULT,
      }
    })

    const { cmdSearch } = await import('../../src/cmd-search.js')
    const cap = captureOutput()
    try {
      const code = await cmdSearch({
        query: 'auth',
        globalRoot: tmpDir,
        limit: 10,
        format: 'json',
      })
      expect(code).toBe(0)
      const parsed = JSON.parse(cap.out())
      expect(parsed.query).toBe('auth')
      expect(parsed.mode).toBe('mixed')
      expect(parsed.source_counts).toEqual({ fts: 1, vector: 1, graph: 0 })
      expect(parsed.count).toBe(1)
      expect(parsed.results[0].session_id).toBe('sess-001')
    } finally {
      cap.restore()
    }
  })

  it('returns 0 with count:0 when no results', async () => {
    vi.doMock('@openmnemo/core', async (importOriginal) => {
      const original = await importOriginal<typeof import('@openmnemo/core')>()
      return {
        ...original,
        searchRecall: () => ({
          mode: 'mixed' as const,
          source_counts: { fts: 0, vector: 0, graph: 0 },
          results: [],
        }),
      }
    })

    const { cmdSearch } = await import('../../src/cmd-search.js')
    const cap = captureOutput()
    try {
      const code = await cmdSearch({
        query: 'zzznomatch',
        globalRoot: tmpDir,
        limit: 20,
        format: 'text',
      })
      expect(code).toBe(0)
      expect(cap.out()).toContain('count: 0')
    } finally {
      cap.restore()
    }
  })

  it('returns 1 when searchRecall throws', async () => {
    vi.doMock('@openmnemo/core', async (importOriginal) => {
      const original = await importOriginal<typeof import('@openmnemo/core')>()
      return {
        ...original,
        searchRecall: () => { throw new Error('db error') },
      }
    })

    const { cmdSearch } = await import('../../src/cmd-search.js')
    const cap = captureOutput()
    try {
      const code = await cmdSearch({
        query: 'anything',
        globalRoot: tmpDir,
        limit: 20,
        format: 'text',
      })
      expect(code).toBe(1)
      expect(cap.err()).toContain('db error')
    } finally {
      cap.restore()
    }
  })
})
