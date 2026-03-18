/**
 * CLI tests for cmd-discover.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { captureOutput } from '../helpers/capture.js'

describe('cmdDiscover', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'cmd-discover-test-'))
  })
  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it('returns 1 when root does not exist', async () => {
    const { cmdDiscover } = await import('../../src/cmd-discover.js')
    const cap = captureOutput()
    try {
      const code = await cmdDiscover({
        root: join(tmpDir, 'no-such-dir'),
        client: 'all',
        scope: 'all-projects',
        projectName: '',
        globalRoot: tmpDir,
        rawUploadPermission: 'not-set',
        limit: 0,
        format: 'text',
      })
      expect(code).toBe(1)
      expect(cap.err()).toContain('does not exist')
    } finally {
      cap.restore()
    }
  })

  it('returns 0 with zero discovered when client dirs are empty', async () => {
    vi.doMock('@openmnemo/core', async (importOriginal) => {
      const original = await importOriginal<typeof import('@openmnemo/core')>()
      return {
        ...original,
        discoverSourceFiles: () => [],
      }
    })

    const { cmdDiscover } = await import('../../src/cmd-discover.js')
    const cap = captureOutput()
    try {
      const code = await cmdDiscover({
        root: tmpDir,
        client: 'all',
        scope: 'all-projects',
        projectName: '',
        globalRoot: tmpDir,
        rawUploadPermission: 'not-set',
        limit: 0,
        format: 'text',
      })
      expect(code).toBe(0)
      const out = cap.out()
      expect(out).toContain('discovered_count: 0')
      expect(out).toContain('imported_count: 0')
    } finally {
      cap.restore()
    }
  })

  it('returns JSON when format=json', async () => {
    vi.doMock('@openmnemo/core', async (importOriginal) => {
      const original = await importOriginal<typeof import('@openmnemo/core')>()
      return {
        ...original,
        discoverSourceFiles: () => [],
      }
    })

    const { cmdDiscover } = await import('../../src/cmd-discover.js')
    const cap = captureOutput()
    try {
      const code = await cmdDiscover({
        root: tmpDir,
        client: 'claude',
        scope: 'current-project',
        projectName: 'myproj',
        globalRoot: tmpDir,
        rawUploadPermission: 'not-set',
        limit: 0,
        format: 'json',
      })
      expect(code).toBe(0)
      const parsed = JSON.parse(cap.out())
      expect(parsed.client_filter).toBe('claude')
      expect(parsed.scope).toBe('current-project')
      expect(parsed.imported_count).toBe(0)
    } finally {
      cap.restore()
    }
  })
})
