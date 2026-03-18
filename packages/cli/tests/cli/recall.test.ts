/**
 * CLI tests for cmd-recall.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { captureOutput } from '../helpers/capture.js'

const MOCK_RECALL_RESULT = {
  found: true,
  project: 'myproject',
  repo: '/home/user/project',
  imported_count: 0,
  client: 'claude',
  session_id: 'sess-recall-001',
  title: 'My Session',
  started_at: '2024-06-01T10:00:00Z',
  cwd: '/home/user/project',
  branch: 'main',
  message_count: 5,
  tool_event_count: 2,
  global_clean_path: '/global/clean/file.md',
  clean_content: 'Session summary text',
}

const MOCK_RECALL_NOT_FOUND = {
  found: false,
  project: 'myproject',
  repo: '/home/user/project',
  imported_count: 0,
  message: 'No previous session found for this project.',
}

describe('cmdRecall', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'cmd-recall-test-'))
    vi.resetModules()
  })
  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it('returns 1 when root does not exist', async () => {
    const { cmdRecall } = await import('../../src/cmd-recall.js')
    const cap = captureOutput()
    try {
      const code = await cmdRecall({
        root: join(tmpDir, 'no-such-dir'),
        projectName: '',
        globalRoot: tmpDir,
        activationTime: '',
        format: 'text',
      })
      expect(code).toBe(1)
      expect(cap.err()).toContain('does not exist')
    } finally {
      cap.restore()
    }
  })

  it('returns 0 and outputs recall result in text format', async () => {
    vi.doMock('@openmnemo/core', async (importOriginal) => {
      const original = await importOriginal<typeof import('@openmnemo/core')>()
      return {
        ...original,
        recall: async () => MOCK_RECALL_RESULT,
        formatRecallText: (r: typeof MOCK_RECALL_RESULT) =>
          `session_id: ${r.session_id}\ntitle: ${r.title}\nclient: ${r.client}`,
      }
    })

    const { cmdRecall } = await import('../../src/cmd-recall.js')
    const cap = captureOutput()
    try {
      const code = await cmdRecall({
        root: tmpDir,
        projectName: 'myproject',
        globalRoot: tmpDir,
        activationTime: '',
        format: 'text',
      })
      expect(code).toBe(0)
      const out = cap.out()
      expect(out).toContain('session_id: sess-recall-001')
      expect(out).toContain('title: My Session')
      expect(out).toContain('client: claude')
    } finally {
      cap.restore()
    }
  })

  it('returns 0 and outputs JSON when format=json, activationTime forwarded', async () => {
    const recallArgs: unknown[][] = []
    vi.doMock('@openmnemo/core', async (importOriginal) => {
      const original = await importOriginal<typeof import('@openmnemo/core')>()
      return {
        ...original,
        recall: async (...args: unknown[]) => { recallArgs.push(args); return MOCK_RECALL_RESULT },
        formatRecallText: () => '',
      }
    })

    const { cmdRecall } = await import('../../src/cmd-recall.js')
    const cap = captureOutput()
    try {
      const code = await cmdRecall({
        root: tmpDir,
        projectName: '',
        globalRoot: tmpDir,
        activationTime: '2024-06-01T09:00:00Z',
        format: 'json',
      })
      expect(code).toBe(0)
      const parsed = JSON.parse(cap.out())
      expect(parsed.session_id).toBe('sess-recall-001')
      expect(parsed.client).toBe('claude')
    } finally {
      cap.restore()
    }
    // Verify activationTime was forwarded as the 4th argument to recall()
    expect(recallArgs[0]?.[3]).toBe('2024-06-01T09:00:00Z')
  })

  it('returns 0 with "not found" result when recall returns found=false', async () => {
    vi.doMock('@openmnemo/core', async (importOriginal) => {
      const original = await importOriginal<typeof import('@openmnemo/core')>()
      return {
        ...original,
        recall: async () => MOCK_RECALL_NOT_FOUND,
        formatRecallText: (r: typeof MOCK_RECALL_NOT_FOUND) =>
          `project: ${r.project}\nresult: ${r.message ?? ''}`,
      }
    })

    const { cmdRecall } = await import('../../src/cmd-recall.js')
    const cap = captureOutput()
    try {
      const code = await cmdRecall({
        root: tmpDir,
        projectName: 'myproject',
        globalRoot: tmpDir,
        activationTime: '',
        format: 'text',
      })
      expect(code).toBe(0)
      expect(cap.out()).toContain('No previous session found')
    } finally {
      cap.restore()
    }
  })
})
