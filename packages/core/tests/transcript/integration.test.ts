import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import { tmpdir } from 'node:os'
import Database from 'better-sqlite3'

import {
  parseCodexTranscript,
  parseGeminiTranscript,
  parseDoubaoTranscript,
} from '../../src/transcript/parse.js'
import { importTranscript, transcriptHasContent } from '../../src/transcript/import.js'
import { inferProjectSlug } from '../../src/transcript/discover.js'

describe('integration: parse → import → verify', () => {
  let tmpDir: string
  let repoRoot: string
  let globalRoot: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'integration-'))
    repoRoot = join(tmpDir, 'repo')
    globalRoot = join(tmpDir, 'global')
  })
  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('end-to-end: create JSONL → parse → import → verify files', async () => {
    // 1. Create a realistic Codex JSONL transcript
    const sourceFile = join(tmpDir, 'test-session.jsonl')
    const records = [
      { type: 'session_meta', payload: { id: 'sess-001', title: 'Fix bug', cwd: '/home/user/myproject', git: { branch: 'main' }, timestamp: '2024-06-15T10:00:00Z' } },
      { type: 'response_item', timestamp: '2024-06-15T10:00:01Z', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Fix the login bug' }] } },
      { type: 'response_item', timestamp: '2024-06-15T10:00:02Z', payload: { type: 'message', role: 'assistant', content: [{ type: 'text', text: 'I will fix the login bug for you.' }] } },
      { type: 'response_item', timestamp: '2024-06-15T10:00:03Z', payload: { type: 'function_call', name: 'read_file', arguments: { path: 'login.ts' } } },
      { type: 'response_item', timestamp: '2024-06-15T10:00:04Z', payload: { type: 'function_call_output', name: 'read_file', output: 'file contents here' } },
    ]
    writeFileSync(sourceFile, records.map(r => JSON.stringify(r)).join('\n') + '\n')

    // 2. Parse
    const parsed = parseCodexTranscript(sourceFile)
    expect(parsed.client).toBe('codex')
    expect(parsed.session_id).toBe('sess-001')
    expect(parsed.title).toBe('Fix bug')
    expect(parsed.cwd).toBe('/home/user/myproject')
    expect(parsed.branch).toBe('main')
    expect(parsed.messages).toHaveLength(2)
    expect(parsed.tool_events).toHaveLength(2)
    expect(transcriptHasContent(parsed)).toBe(true)

    // 3. Infer project slug
    const slug = inferProjectSlug(parsed)
    expect(slug).toBe('myproject')

    // 4. Import
    const manifest = await importTranscript(parsed, repoRoot, globalRoot, slug, 'none', true)

    // 5. Verify manifest fields
    expect(manifest.client).toBe('codex')
    expect(manifest.project).toBe('myproject')
    expect(manifest.session_id).toBe('sess-001')
    expect(manifest.message_count).toBe(2)
    expect(manifest.tool_event_count).toBe(2)
    expect(manifest.cleaning_mode).toBe('deterministic-code')
    expect(manifest.repo_mirror_enabled).toBe(true)

    // 6. Verify raw file copied to repo + global
    expect(existsSync(join(repoRoot, manifest.repo_raw_path))).toBe(true)

    // 7. Verify clean markdown has correct frontmatter
    const cleanContent = readFileSync(join(repoRoot, manifest.repo_clean_path), 'utf-8')
    expect(cleanContent).toContain('---')
    expect(cleanContent).toContain('client: codex')
    expect(cleanContent).toContain('project: myproject')
    expect(cleanContent).toContain('## Messages')
    expect(cleanContent).toContain('### 1. user')
    expect(cleanContent).toContain('Fix the login bug')
    expect(cleanContent).toContain('### 2. assistant')
    expect(cleanContent).toContain('I will fix the login bug for you.')
    expect(cleanContent).toContain('## Tool Events')
    expect(cleanContent).toContain('read_file')

    // 8. Verify manifest JSON written
    const manifestContent = JSON.parse(
      readFileSync(join(repoRoot, manifest.repo_manifest_path), 'utf-8'),
    )
    expect(manifestContent.client).toBe('codex')
    expect(manifestContent.project).toBe('myproject')

    // 9. Verify SQLite index updated
    const dbPath = join(globalRoot, 'index', 'search.sqlite')
    expect(existsSync(dbPath)).toBe(true)
    const db = new Database(dbPath, { readonly: true })
    const rows = db.prepare('SELECT client, project, session_id FROM transcripts').all() as Record<string, unknown>[]
    expect(rows).toHaveLength(1)
    expect([rows[0]!['client'], rows[0]!['project'], rows[0]!['session_id']]).toEqual(['codex', 'myproject', 'sess-001'])
    db.close()

    // 10. Verify event log written
    const eventLogPath = join(globalRoot, 'index', 'sessions.jsonl')
    expect(existsSync(eventLogPath)).toBe(true)
    const eventLines = readFileSync(eventLogPath, 'utf-8').trim().split('\n')
    expect(eventLines).toHaveLength(1)
    const event = JSON.parse(eventLines[0]!)
    expect(event.client).toBe('codex')
  })

  it('idempotent re-import preserves imported_at', async () => {
    const sourceFile = join(tmpDir, 'idem.jsonl')
    writeFileSync(sourceFile, '{"type":"session_meta","payload":{"id":"s1","title":"test"}}\n')

    const parsed = parseCodexTranscript(sourceFile)
    const first = await importTranscript(parsed, repoRoot, globalRoot, 'proj', 'none')
    const second = await importTranscript(parsed, repoRoot, globalRoot, 'proj', 'none')

    expect(second.imported_at).toBe(first.imported_at)
  })

  it('Claude transcript end-to-end', async () => {
    const sourceFile = join(tmpDir, 'claude-session.jsonl')
    const records = [
      { type: 'user', sessionId: 'cs1', cwd: '/proj', gitBranch: 'dev', timestamp: '2024-06-15T10:00:00Z', message: { role: 'user', content: 'Hello Claude' } },
      { type: 'assistant', sessionId: 'cs1', timestamp: '2024-06-15T10:00:01Z', message: { role: 'assistant', content: [{ type: 'text', text: 'Hello!' }] } },
    ]
    writeFileSync(sourceFile, records.map(r => JSON.stringify(r)).join('\n') + '\n')

    const { parseClaudeTranscript } = await import('../../src/transcript/parse.js')
    const parsed = parseClaudeTranscript(sourceFile)
    expect(parsed.client).toBe('claude')
    expect(parsed.messages).toHaveLength(2)

    const manifest = await importTranscript(parsed, repoRoot, globalRoot, 'test-proj', 'none')
    expect(manifest.client).toBe('claude')
    expect(manifest.message_count).toBe(2)
  })

  // ---------------------------------------------------------------------------
  // Gemini
  // ---------------------------------------------------------------------------

  it('Gemini JSON transcript end-to-end', async () => {
    // Place source under a named directory — this becomes the parent-dir slug
    // when cwd is absent (tested separately below).  Here cwd is present and
    // drives the slug via the cwd-first path in inferProjectSlug.
    const geminiDir = join(tmpDir, 'myproject')
    mkdirSync(geminiDir, { recursive: true })
    const sourceFile = join(geminiDir, 'conversation.json')

    const geminiData = {
      sessionId: 'gemini-sess-001',
      cwd: '/home/user/myproject',
      branch: 'main',
      timestamp: '2024-08-10T09:00:00Z',
      history: [
        {
          role: 'user',
          timestamp: '2024-08-10T09:00:01Z',
          parts: [{ text: 'How do I write a unit test?' }],
        },
        {
          role: 'model',
          timestamp: '2024-08-10T09:00:02Z',
          parts: [{ text: 'Use a testing framework like Vitest or Jest.' }],
          toolUse: { name: 'read_file', input: { path: 'test.ts' } },
        },
      ],
    }
    writeFileSync(sourceFile, JSON.stringify(geminiData))

    // 2. Parse
    const parsed = parseGeminiTranscript(sourceFile)
    expect(parsed.client).toBe('gemini')
    expect(parsed.session_id).toBe('gemini-sess-001')
    expect(parsed.cwd).toBe('/home/user/myproject')
    expect(parsed.branch).toBe('main')
    expect(parsed.messages).toHaveLength(2)
    expect(parsed.messages.find(m => m.role === 'user')?.text).toContain('unit test')
    expect(parsed.messages.find(m => m.role === 'assistant')?.text).toContain('Vitest')
    expect(parsed.tool_events).toHaveLength(1)
    expect(parsed.tool_events[0]!.summary).toContain('read_file')
    expect(transcriptHasContent(parsed)).toBe(true)

    // 3. Slug is derived from cwd (cwd-first path in inferProjectSlug)
    const slug = inferProjectSlug(parsed)
    expect(slug).toBe('myproject')

    // 4. Import
    const manifest = await importTranscript(parsed, repoRoot, globalRoot, slug, 'none', true)

    // 5. Verify manifest fields
    expect(manifest.client).toBe('gemini')
    expect(manifest.project).toBe('myproject')
    expect(manifest.session_id).toBe('gemini-sess-001')
    expect(manifest.title).toBe('conversation')   // stem fallback — no title field in Gemini JSON
    expect(manifest.message_count).toBe(2)
    expect(manifest.tool_event_count).toBe(1)
    // repo paths are relative (not absolute)
    expect(isAbsolute(manifest.repo_clean_path)).toBe(false)
    expect(manifest.repo_clean_path.startsWith('Memory/')).toBe(true)

    // 6. Verify clean markdown content
    const cleanContent = readFileSync(join(repoRoot, manifest.repo_clean_path), 'utf-8')
    expect(cleanContent).toContain('client: gemini')
    expect(cleanContent).toContain('project: myproject')
    expect(cleanContent).toContain('## Messages')
    expect(cleanContent).toContain('unit test')
    expect(cleanContent).toContain('Vitest')
    expect(cleanContent).toContain('read_file')   // tool event appears in clean markdown

    // 7. Verify SQLite index row (client, project, session_id)
    const dbPath = join(globalRoot, 'index', 'search.sqlite')
    expect(existsSync(dbPath)).toBe(true)
    const db = new Database(dbPath, { readonly: true })
    const rows = db.prepare("SELECT client, project, session_id FROM transcripts WHERE client='gemini'").all() as Record<string, unknown>[]
    expect(rows).toHaveLength(1)
    expect([rows[0]!['client'], rows[0]!['project'], rows[0]!['session_id']]).toEqual(['gemini', 'myproject', 'gemini-sess-001'])
    db.close()

    // 8. Verify event log
    const eventLogPath = join(globalRoot, 'index', 'sessions.jsonl')
    expect(existsSync(eventLogPath)).toBe(true)
    const event = JSON.parse(readFileSync(eventLogPath, 'utf-8').trim().split('\n')[0]!)
    expect(event.client).toBe('gemini')
  })

  it('Gemini: inferProjectSlug uses parent directory name when cwd is absent', async () => {
    // This test exercises the Gemini-specific slug fallback in inferProjectSlug
    // (discover.ts lines 117-122) which kicks in only when cwd is empty.
    const geminiDir = join(tmpDir, 'slug-from-dir')
    mkdirSync(geminiDir, { recursive: true })
    const sourceFile = join(geminiDir, 'session.json')
    // No 'cwd' field — triggers the parent-directory slug path for gemini
    writeFileSync(sourceFile, JSON.stringify({
      sessionId: 'g-no-cwd',
      history: [
        { role: 'user', parts: [{ text: 'Hello' }] },
        { role: 'model', parts: [{ text: 'Hi there' }] },
      ],
    }))

    const parsed = parseGeminiTranscript(sourceFile)
    expect(parsed.cwd).toBe('')

    const slug = inferProjectSlug(parsed)
    expect(slug).toBe('slug-from-dir')
  })

  // ---------------------------------------------------------------------------
  // Doubao
  // ---------------------------------------------------------------------------

  it('Doubao TXT transcript end-to-end', async () => {
    const sourceFile = join(tmpDir, 'doubao_chat_38416801786598914.txt')
    const doubaoContent = [
      'Title: TypeScript 最佳实践',
      'URL: https://www.doubao.com/chat/38416801786598914',
      'Platform: 豆包',
      'Created: 2026-03-16 10:22:17',
      'Messages: 2',
      '',
      'User: [2026-03-16 10:22:17]',
      '',
      'TypeScript 中如何处理可选链？',
      '',
      'AI: [2026-03-16 10:23:45]',
      '',
      '可选链操作符 ?. 可以安全访问深层属性，避免 TypeError。',
      '例如：obj?.foo?.bar',
      '',
    ].join('\n')
    writeFileSync(sourceFile, doubaoContent, 'utf-8')

    // 2. Parse
    const parsed = parseDoubaoTranscript(sourceFile)
    expect(parsed.client).toBe('doubao')
    expect(parsed.session_id).toBe('38416801786598914')
    expect(parsed.title).toBe('TypeScript 最佳实践')
    // Doubao exports user-local time with no timezone — stored as naive ISO (no Z)
    expect(parsed.started_at).toBe('2026-03-16T10:22:17')
    expect(parsed.messages).toHaveLength(2)
    expect(parsed.messages[0]!.role).toBe('user')
    expect(parsed.messages[0]!.text).toContain('可选链')
    // Message timestamps are also naive ISO (no Z suffix)
    expect(parsed.messages[0]!.timestamp).toBe('2026-03-16T10:22:17')
    expect(parsed.messages[1]!.role).toBe('assistant')
    expect(parsed.messages[1]!.text).toContain('?.')
    expect(parsed.messages[1]!.timestamp).toBe('2026-03-16T10:23:45')
    expect(parsed.tool_events).toHaveLength(0)
    expect(transcriptHasContent(parsed)).toBe(true)

    // 3. No cwd → slug falls back to 'unknown-project'
    const slug = inferProjectSlug(parsed)
    expect(slug).toBe('unknown-project')

    // 4. Import (not mirrored to repo — Doubao is a global-only import)
    const manifest = await importTranscript(parsed, repoRoot, globalRoot, slug, 'none', false)

    // 5. Verify manifest fields
    expect(manifest.client).toBe('doubao')
    expect(manifest.session_id).toBe('38416801786598914')
    expect(manifest.message_count).toBe(2)
    expect(manifest.tool_event_count).toBe(0)
    // When mirrorToRepo=false, repo paths must be empty strings
    expect(manifest.repo_raw_path).toBe('')
    expect(manifest.repo_clean_path).toBe('')
    expect(manifest.repo_manifest_path).toBe('')
    // global_clean_path is absolute
    expect(isAbsolute(manifest.global_clean_path)).toBe(true)

    // 6. Verify clean markdown content (read via absolute global_clean_path)
    const cleanContent = readFileSync(manifest.global_clean_path, 'utf-8')
    expect(cleanContent).toContain('client: doubao')
    expect(cleanContent).toContain('## Messages')
    expect(cleanContent).toContain('可选链')
    expect(cleanContent).toContain('?.')

    // 7. Verify SQLite index row (Chinese title stored correctly)
    const dbPath = join(globalRoot, 'index', 'search.sqlite')
    expect(existsSync(dbPath)).toBe(true)
    const db = new Database(dbPath, { readonly: true })
    const rows = db.prepare("SELECT client, session_id, title FROM transcripts WHERE client='doubao'").all() as Record<string, unknown>[]
    expect(rows).toHaveLength(1)
    expect([rows[0]!['client'], rows[0]!['session_id'], rows[0]!['title']]).toEqual(['doubao', '38416801786598914', 'TypeScript 最佳实践'])
    db.close()

    // 8. Verify event log
    const eventLogPath = join(globalRoot, 'index', 'sessions.jsonl')
    expect(existsSync(eventLogPath)).toBe(true)
    const event = JSON.parse(readFileSync(eventLogPath, 'utf-8').trim().split('\n')[0]!)
    expect(event.client).toBe('doubao')
  })

  it('Doubao CRLF transcript parses and imports correctly', async () => {
    const sourceFile = join(tmpDir, 'doubao_crlf.txt')
    const lines = [
      'Title: CRLF Test',
      'URL: https://www.doubao.com/chat/99999',
      'Platform: 豆包',
      'Created: 2026-03-17 08:00:00',
      'Messages: 2',
      '',
      'User: [2026-03-17 08:00:00]',
      '',
      'Hello CRLF world',
      '',
      'AI: [2026-03-17 08:01:00]',
      '',
      'CRLF response here',
      '',
    ]
    writeFileSync(sourceFile, lines.join('\r\n'), 'utf-8')

    // 2. Parse — CRLF must be stripped cleanly
    const parsed = parseDoubaoTranscript(sourceFile)
    expect(parsed.session_id).toBe('99999')
    expect(parsed.messages).toHaveLength(2)
    expect(parsed.messages[0]!.text).toBe('Hello CRLF world')
    expect(parsed.messages[1]!.text).toBe('CRLF response here')

    // 3. Import
    const manifest = await importTranscript(parsed, repoRoot, globalRoot, 'test-proj', 'none', false)
    expect(manifest.client).toBe('doubao')
    expect(manifest.message_count).toBe(2)

    // 4. Verify the written clean markdown is free of carriage returns
    const cleanContent = readFileSync(manifest.global_clean_path, 'utf-8')
    expect(cleanContent).not.toContain('\r')
    expect(cleanContent).toContain('Hello CRLF world')
    expect(cleanContent).toContain('CRLF response here')
  })
})
