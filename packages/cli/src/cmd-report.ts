/**
 * CLI adapters for `memorytree report build` and `memorytree report serve`.
 */

import { createServer } from 'node:http'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { basename, dirname, extname, join, resolve, sep } from 'node:path'

import type { ChatEvent, ChatRequest, ChatScope } from '@openmnemo/types'

// ---------------------------------------------------------------------------
// Build command
// ---------------------------------------------------------------------------

export interface CmdReportBuildOptions {
  root: string
  output: string
  noAi: boolean
  model: string
  locale?: string
  reportBaseUrl?: string
}

export async function cmdReportBuild(opts: CmdReportBuildOptions): Promise<number> {
  const { buildReport } = await import('@openmnemo/report')
  try {
    const buildOptions = {
      root: resolve(opts.root),
      output: resolve(opts.output),
      noAi: opts.noAi,
      model: opts.model,
      ...(opts.locale ? { locale: opts.locale } : {}),
      ...(opts.reportBaseUrl ? { reportBaseUrl: opts.reportBaseUrl } : {}),
    }
    await buildReport(buildOptions)
    console.log(`Report generated at: ${resolve(opts.output)}`)
    console.log(`Open: ${join(resolve(opts.output), 'index.html')}`)
    return 0
  } catch (err: unknown) {
    console.error(`Report build failed: ${String(err)}`)
    return 1
  }
}

// ---------------------------------------------------------------------------
// Serve command
// ---------------------------------------------------------------------------

export interface CmdReportServeOptions {
  dir: string
  port: number
}

interface ReportChatStatus {
  provider: string
  model: string
  available: boolean
  reason?: string
  scope: ChatScope
}

interface ReportChatService {
  stream(request: ChatRequest): AsyncIterable<ChatEvent>
  getStatus(): ReportChatStatus
}

interface ReportChatRuntime {
  service?: ReportChatService
  status: ReportChatStatus
}

const MAX_CHAT_BODY_BYTES = 1024 * 1024

function findRepoRootFromReportDir(reportDir: string): string | null {
  let current = resolve(reportDir)

  while (true) {
    const memoryDir = join(current, 'Memory')
    if (existsSync(join(memoryDir, '01_goals')) || existsSync(join(memoryDir, '06_transcripts'))) {
      return current
    }

    const parent = dirname(current)
    if (parent === current) return null
    current = parent
  }
}

function normalizeScope(scope: ChatScope | undefined): ChatScope {
  return scope ?? {}
}

async function createReportChatRuntime(reportDir: string): Promise<ReportChatRuntime> {
  const repoRoot = findRepoRootFromReportDir(reportDir)
  if (!repoRoot) {
    return {
      status: {
        provider: 'anthropic',
        model: 'claude-haiku-4-5-20251001',
        available: false,
        reason: 'repo_root_not_found',
        scope: {},
      },
    }
  }

  const { createLocalChatService, defaultGlobalTranscriptRoot, slugify } = await import('@openmnemo/core')
  const defaultScope: ChatScope = {
    project: slugify(basename(repoRoot), 'project'),
  }
  const service = createLocalChatService({
    globalRoot: defaultGlobalTranscriptRoot(),
    defaultScope,
  })

  return {
    service,
    status: {
      ...service.getStatus(),
      scope: normalizeScope(service.getStatus().scope),
    },
  }
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  let size = 0

  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > MAX_CHAT_BODY_BYTES) {
      throw new Error('Request body too large.')
    }
    chunks.push(buffer)
  }

  const raw = Buffer.concat(chunks).toString('utf-8').trim()
  if (!raw) return {}
  return JSON.parse(raw) as unknown
}

function writeJson(res: ServerResponse, status: number, payload: Record<string, unknown>): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(payload))
}

function encodeSsePayload(event: ChatEvent): string {
  switch (event.type) {
    case 'meta':
      return JSON.stringify(event.meta)
    case 'retrieval':
      return JSON.stringify({ count: event.count })
    case 'delta':
      return JSON.stringify({ text: event.text })
    case 'citation':
      return JSON.stringify(event.citation)
    case 'done':
      return JSON.stringify({
        finish_reason: event.finish_reason,
        text: event.text,
      })
    case 'error':
      return JSON.stringify({
        message: event.message,
        ...(event.code ? { code: event.code } : {}),
      })
  }
}

function writeSseEvent(res: ServerResponse, event: ChatEvent): void {
  res.write(`event: ${event.type}\n`)
  res.write(`data: ${encodeSsePayload(event)}\n\n`)
}

async function handleChatHealth(
  res: ServerResponse,
  chatRuntimePromise: Promise<ReportChatRuntime>,
): Promise<void> {
  const runtime = await chatRuntimePromise
  writeJson(res, 200, {
    enabled: Boolean(runtime.service),
    ready: runtime.status.available,
    provider: runtime.status.provider,
    model: runtime.status.model,
    scope: runtime.status.scope,
    ...(runtime.status.reason ? { reason: runtime.status.reason } : {}),
  })
}

async function handleChatRequest(
  req: IncomingMessage,
  res: ServerResponse,
  chatRuntimePromise: Promise<ReportChatRuntime>,
): Promise<void> {
  const runtime = await chatRuntimePromise
  if (!runtime.service) {
    writeJson(res, 503, {
      error: 'AI Chat is unavailable because the report server could not infer the repository root.',
      code: 'repo_root_not_found',
    })
    return
  }

  let body: unknown
  try {
    body = await readJsonBody(req)
  } catch (error: unknown) {
    writeJson(res, 400, {
      error: error instanceof Error ? error.message : 'Invalid request body.',
      code: 'bad_request',
    })
    return
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
  })

  try {
    for await (const event of runtime.service.stream(body as ChatRequest)) {
      writeSseEvent(res, event)
    }
  } catch (error: unknown) {
    writeSseEvent(res, {
      type: 'error',
      message: error instanceof Error ? error.message : 'Unknown chat transport error.',
    })
  } finally {
    res.end()
  }
}

function isApiRequest(urlPath: string): boolean {
  return urlPath === '/api/chat' || urlPath === '/api/chat/health'
}

export function createReportServer(opts: CmdReportServeOptions): import('node:http').Server {
  const root = resolve(opts.dir)
  const port = opts.port
  const chatRuntimePromise = createReportChatRuntime(root).catch((error: unknown) => {
    console.warn(`[report serve] Chat runtime initialization failed: ${String(error)}`)
    return {
      status: {
        provider: 'anthropic',
        model: 'claude-haiku-4-5-20251001',
        available: false,
        reason: 'chat_runtime_init_failed',
        scope: {},
      },
    } satisfies ReportChatRuntime
  })

  const MIME: Record<string, string> = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
  }

  const server = createServer((req, res) => {
    let urlPath: string
    try {
      urlPath = decodeURIComponent((req.url ?? '/').split('?')[0] ?? '/')
    } catch {
      res.writeHead(400, { 'Content-Type': 'text/plain' })
      res.end('Bad request')
      return
    }

    if (isApiRequest(urlPath)) {
      if (req.method === 'GET' && urlPath === '/api/chat/health') {
        void handleChatHealth(res, chatRuntimePromise).catch((error: unknown) => {
          writeJson(res, 500, {
            error: error instanceof Error ? error.message : 'Chat health failed.',
            code: 'chat_health_failed',
          })
        })
        return
      }

      if (req.method === 'POST' && urlPath === '/api/chat') {
        void handleChatRequest(req, res, chatRuntimePromise).catch((error: unknown) => {
          if (!res.headersSent) {
            writeJson(res, 500, {
              error: error instanceof Error ? error.message : 'Chat request failed.',
              code: 'chat_request_failed',
            })
            return
          }

          writeSseEvent(res, {
            type: 'error',
            message: error instanceof Error ? error.message : 'Chat request failed.',
            code: 'chat_request_failed',
          })
          res.end()
        })
        return
      }

      res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end('Method not allowed')
      return
    }

    let filePath = join(root, urlPath)

    // Containment check: reject paths that escape the serve root
    // Use sep (\ on Windows, / on Unix) so the check works cross-platform.
    if (!filePath.startsWith(root + sep) && filePath !== root) {
      res.writeHead(403, { 'Content-Type': 'text/plain' })
      res.end('Forbidden')
      return
    }

    // Serve index.html for directory requests
    if (existsSync(filePath) && statSync(filePath).isDirectory()) {
      filePath = join(filePath, 'index.html')
    }

    if (!existsSync(filePath)) {
      res.writeHead(404, { 'Content-Type': 'text/plain' })
      res.end('Not found')
      return
    }

    const ext = extname(filePath)
    const contentType = MIME[ext] ?? 'application/octet-stream'
    res.writeHead(200, { 'Content-Type': contentType })
    const stream = createReadStream(filePath)
    stream.on('error', () => { res.destroy() })
    stream.pipe(res)
  })

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`Error: port ${port} is already in use.`)
      process.exit(1)
    }
    console.error(`Server error: ${String(err)}`)
    process.exit(1)
  })

  server.listen(port, () => {
    console.log(`Serving ${root}`)
    console.log(`Open: http://localhost:${port}/`)
    console.log('Press Ctrl+C to stop.')
  })

  return server
}

export function cmdReportServe(opts: CmdReportServeOptions): number {
  createReportServer(opts)
  return 0
}
