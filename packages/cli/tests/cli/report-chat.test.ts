import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as http from 'node:http'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

describe('report serve chat routes', () => {
  let repoRoot: string
  let reportDir: string
  let server: http.Server | null = null

  beforeEach(() => {
    repoRoot = mkdtempSync(join(tmpdir(), 'report-chat-test-'))
    reportDir = join(repoRoot, 'Memory', '07_reports')
    mkdirSync(join(repoRoot, 'Memory', '01_goals'), { recursive: true })
    mkdirSync(reportDir, { recursive: true })
    writeFileSync(join(reportDir, 'index.html'), '<html><body>ok</body></html>', 'utf-8')
    vi.resetModules()
  })

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()))
      server = null
    }
    vi.restoreAllMocks()
    vi.resetModules()
    rmSync(repoRoot, { recursive: true, force: true })
  })

  it('serves chat health metadata', async () => {
    vi.doMock('@openmnemo/core', () => ({
      createLocalChatService: () => ({
        getStatus: () => ({
          provider: 'anthropic',
          model: 'test-model',
          available: true,
          scope: { project: 'demo-project' },
        }),
        async *stream() {
          yield { type: 'done', finish_reason: 'stop', text: '' }
        },
      }),
      defaultGlobalTranscriptRoot: () => repoRoot,
      slugify: () => 'demo-project',
    }))

    const { createReportServer } = await import('../../src/cmd-report.js')
    server = createReportServer({ dir: reportDir, port: 0 })
    await new Promise<void>((resolve) => server!.once('listening', resolve))

    const address = server.address() as { port: number }
    const payload = await new Promise<Record<string, unknown>>((resolve, reject) => {
      http.get(`http://localhost:${address.port}/api/chat/health`, (res) => {
        let data = ''
        res.on('data', (chunk: Buffer) => { data += chunk.toString() })
        res.on('end', () => resolve(JSON.parse(data) as Record<string, unknown>))
      }).on('error', reject)
    })

    expect(payload).toMatchObject({
      enabled: true,
      ready: true,
      provider: 'anthropic',
      model: 'test-model',
      scope: { project: 'demo-project' },
    })
  })

  it('streams SSE chat events', async () => {
    const receivedRequests: unknown[] = []

    vi.doMock('@openmnemo/core', () => ({
      createLocalChatService: () => ({
        getStatus: () => ({
          provider: 'anthropic',
          model: 'test-model',
          available: true,
          scope: { project: 'demo-project' },
        }),
        async *stream(request: unknown) {
          receivedRequests.push(request)
          yield { type: 'meta', meta: { model: 'test-model', scope: { project: 'demo-project' }, retrieval_count: 1 } }
          yield { type: 'delta', text: 'hello' }
          yield { type: 'citation', citation: { kind: 'memory_unit', id: 'mu:1', title: 'Unit 1' } }
          yield { type: 'done', finish_reason: 'stop', text: 'hello' }
        },
      }),
      defaultGlobalTranscriptRoot: () => repoRoot,
      slugify: () => 'demo-project',
    }))

    const { createReportServer } = await import('../../src/cmd-report.js')
    server = createReportServer({ dir: reportDir, port: 0 })
    await new Promise<void>((resolve) => server!.once('listening', resolve))

    const address = server.address() as { port: number }
    const body = await new Promise<string>((resolve, reject) => {
      const req = http.request(
        `http://localhost:${address.port}/api/chat`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        },
        (res) => {
          let data = ''
          res.on('data', (chunk: Buffer) => { data += chunk.toString() })
          res.on('end', () => resolve(data))
        },
      )

      req.on('error', reject)
      req.write(JSON.stringify({
        messages: [{ role: 'user', content: 'hello' }],
      }))
      req.end()
    })

    expect(receivedRequests).toEqual([
      {
        messages: [{ role: 'user', content: 'hello' }],
      },
    ])
    expect(body).toContain('event: meta')
    expect(body).toContain('event: delta')
    expect(body).toContain('event: citation')
    expect(body).toContain('event: done')
  })
})
