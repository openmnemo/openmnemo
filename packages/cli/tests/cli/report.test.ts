/**
 * CLI tests for cmd-report.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import * as http from 'node:http'
import * as net from 'node:net'

import { cmdReportServe, createReportServer, type CmdReportBuildOptions } from '../../src/cmd-report.js'
import { captureOutput } from '../helpers/capture.js'

// ---------------------------------------------------------------------------
// cmdReportBuild (with mocked @openmnemo/report)
// ---------------------------------------------------------------------------

describe('cmdReportBuild', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'cmd-report-test-'))
    vi.resetModules()
  })
  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it('returns 0 when buildReport succeeds', async () => {
    vi.doMock('@openmnemo/report', () => ({
      buildReport: async () => undefined,
    }))

    const { cmdReportBuild } = await import('../../src/cmd-report.js')
    const opts: CmdReportBuildOptions = {
      root: tmpDir,
      output: join(tmpDir, 'out'),
      noAi: true,
      model: 'claude-haiku-4-5-20251001',
    }
    const cap = captureOutput()
    try {
      const code = await cmdReportBuild(opts)
      expect(code).toBe(0)
      expect(cap.out()).toContain('Report generated at:')
      expect(cap.out()).toContain('Open:')
    } finally {
      cap.restore()
    }
  })

  it('returns 1 when buildReport throws', async () => {
    vi.doMock('@openmnemo/report', () => ({
      buildReport: async () => { throw new Error('build failed') },
    }))

    const { cmdReportBuild } = await import('../../src/cmd-report.js')
    const opts: CmdReportBuildOptions = {
      root: tmpDir,
      output: join(tmpDir, 'out'),
      noAi: true,
      model: 'claude-haiku-4-5-20251001',
    }
    const cap = captureOutput()
    try {
      const code = await cmdReportBuild(opts)
      expect(code).toBe(1)
      expect(cap.err()).toContain('Report build failed:')
      expect(cap.err()).toContain('build failed')
    } finally {
      cap.restore()
    }
  })

  it('passes locale and reportBaseUrl when provided', async () => {
    const receivedOptions: unknown[] = []
    vi.doMock('@openmnemo/report', () => ({
      buildReport: async (o: unknown) => { receivedOptions.push(o) },
    }))

    const { cmdReportBuild } = await import('../../src/cmd-report.js')
    const cap = captureOutput()
    try {
      await cmdReportBuild({
        root: tmpDir,
        output: join(tmpDir, 'out'),
        noAi: true,
        model: 'claude-haiku-4-5-20251001',
        locale: 'zh-CN',
        reportBaseUrl: 'https://example.com',
      })
    } finally {
      cap.restore()
    }

    expect(receivedOptions).toHaveLength(1)
    const opts = receivedOptions[0] as Record<string, unknown>
    expect(opts['locale']).toBe('zh-CN')
    expect(opts['reportBaseUrl']).toBe('https://example.com')
    expect(opts['noAi']).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// cmdReportServe
// ---------------------------------------------------------------------------

describe('cmdReportServe', () => {
  let tmpDir: string
  let server: http.Server | null = null

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'cmd-serve-test-'))
  })
  afterEach(async () => {
    if (server) {
      await new Promise<void>(resolve => server!.close(() => resolve()))
      server = null
    }
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('returns 0 synchronously (server starts in background)', () => {
    // cmdReportServe delegates to createReportServer and returns 0.
    // Use port 0 so the OS picks a free port — no conflict risk.
    const code = cmdReportServe({ dir: tmpDir, port: 0 })
    expect(code).toBe(0)
    // The background server is released when the test worker process exits.
  })

  it('serves an HTML file and returns 200', async () => {
    writeFileSync(join(tmpDir, 'index.html'), '<html><body>Hello</body></html>')

    // Use createReportServer to obtain a handle for cleanup.
    server = createReportServer({ dir: tmpDir, port: 0 })
    await new Promise<void>(resolve => server!.once('listening', resolve))

    const { port } = server.address() as { port: number }
    const body = await new Promise<string>((resolve, reject) => {
      http.get(`http://localhost:${port}/index.html`, (res) => {
        let data = ''
        res.on('data', (chunk: Buffer) => { data += chunk.toString() })
        res.on('end', () => resolve(data))
      }).on('error', reject)
    })
    expect(body).toContain('Hello')
  })

  it('returns 404 for missing file', async () => {
    server = createReportServer({ dir: tmpDir, port: 0 })
    await new Promise<void>(resolve => server!.once('listening', resolve))

    const { port } = server.address() as { port: number }
    const statusCode = await new Promise<number>((resolve, reject) => {
      http.get(`http://localhost:${port}/no-such-file.html`, (res) => {
        resolve(res.statusCode ?? 0)
        res.resume()
      }).on('error', reject)
    })
    expect(statusCode).toBe(404)
  })

  it('returns 403 for path traversal attempts', async () => {
    server = createReportServer({ dir: tmpDir, port: 0 })
    await new Promise<void>(resolve => server!.once('listening', resolve))

    const { port } = server.address() as { port: number }

    // Use raw TCP to bypass http.get's client-side path normalization
    const rawGet = (rawPath: string) =>
      new Promise<number>((resolve, reject) => {
        const sock = net.createConnection(port, '127.0.0.1', () => {
          sock.write(`GET ${rawPath} HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n`)
        })
        let buf = ''
        sock.on('data', (d) => { buf += d.toString() })
        sock.on('end', () => {
          const m = buf.match(/^HTTP\/1\.1 (\d+)/)
          resolve(m ? Number(m[1]) : 0)
        })
        sock.on('error', reject)
      })

    expect(await rawGet('/../../../etc/passwd')).toBe(403)
    expect(await rawGet('/..%2F..%2Fetc%2Fpasswd')).toBe(403)
    expect(await rawGet('/%2e%2e/%2e%2e/etc/passwd')).toBe(403)
  })
})
