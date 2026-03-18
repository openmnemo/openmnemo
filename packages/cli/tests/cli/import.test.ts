/**
 * CLI tests for cmd-import.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { cmdImport } from '../../src/cmd-import.js'
import { captureOutput } from '../helpers/capture.js'

describe('cmdImport', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'cmd-import-test-'))
  })
  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it('returns 1 when root does not exist', async () => {
    const cap = captureOutput()
    try {
      const code = await cmdImport({
        root: join(tmpDir, 'nonexistent'),
        source: join(tmpDir, 'file.jsonl'),
        client: 'auto',
        projectName: '',
        globalRoot: tmpDir,
        rawUploadPermission: 'not-set',
        format: 'text',
      })
      expect(code).toBe(1)
      expect(cap.err()).toContain('does not exist')
    } finally {
      cap.restore()
    }
  })

  it('returns 1 when source file does not exist', async () => {
    const cap = captureOutput()
    try {
      const code = await cmdImport({
        root: tmpDir,
        source: join(tmpDir, 'missing.jsonl'),
        client: 'auto',
        projectName: '',
        globalRoot: tmpDir,
        rawUploadPermission: 'not-set',
        format: 'text',
      })
      expect(code).toBe(1)
      expect(cap.err()).toContain('does not exist')
    } finally {
      cap.restore()
    }
  })

  it('returns 1 when transcript has no importable content', async () => {
    // Codex JSONL with only session_meta — no response_item entries.
    // transcriptHasContent returns false → cmdImport returns 1.
    const source = join(tmpDir, 'empty-session.jsonl')
    writeFileSync(source,
      JSON.stringify({ type: 'session_meta', payload: { id: 'sess-empty', title: 'Empty' } }) + '\n',
    )

    const cap = captureOutput()
    try {
      const code = await cmdImport({
        root: tmpDir,
        source,
        client: 'codex',
        projectName: '',
        globalRoot: tmpDir,
        rawUploadPermission: 'not-set',
        format: 'text',
      })
      expect(code).toBe(1)
      expect(cap.err()).toContain('does not contain any importable messages')
    } finally {
      cap.restore()
    }
  })

  it('returns 0 and prints manifest fields for a valid Codex transcript', async () => {
    // Create minimal Codex JSONL
    const source = join(tmpDir, 'rollout-session.jsonl')
    writeFileSync(source, [
      JSON.stringify({ type: 'session_meta', payload: { id: 'sess-x', title: 'Test', cwd: tmpDir, git: { branch: 'main' } } }),
      JSON.stringify({ type: 'response_item', timestamp: '2024-01-01T00:00:00Z', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Hello' }] } }),
      JSON.stringify({ type: 'response_item', timestamp: '2024-01-01T00:00:01Z', payload: { type: 'message', role: 'assistant', content: [{ type: 'text', text: 'Hi' }] } }),
    ].join('\n') + '\n')

    const cap = captureOutput()
    try {
      const code = await cmdImport({
        root: tmpDir,
        source,
        client: 'codex',
        projectName: 'myproject',
        globalRoot: tmpDir,
        rawUploadPermission: 'not-set',
        format: 'text',
      })
      expect(code).toBe(0)
      const out = cap.out()
      expect(out).toContain('client: codex')
      expect(out).toContain('session_id: sess-x')
      expect(out).toContain('message_count: 2')
    } finally {
      cap.restore()
    }
  })

  it('returns JSON output when format=json', async () => {
    const source = join(tmpDir, 'rollout-json.jsonl')
    writeFileSync(source, [
      JSON.stringify({ type: 'session_meta', payload: { id: 'sess-json', title: 'JSON test' } }),
      JSON.stringify({ type: 'response_item', timestamp: '2024-01-01T00:00:00Z', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'test' }] } }),
    ].join('\n') + '\n')

    const cap = captureOutput()
    try {
      const code = await cmdImport({
        root: tmpDir,
        source,
        client: 'codex',
        projectName: '',
        globalRoot: tmpDir,
        rawUploadPermission: 'not-set',
        format: 'json',
      })
      expect(code).toBe(0)
      const parsed = JSON.parse(cap.out())
      expect(parsed.client).toBe('codex')
      expect(parsed.session_id).toBe('sess-json')
    } finally {
      cap.restore()
    }
  })
})
