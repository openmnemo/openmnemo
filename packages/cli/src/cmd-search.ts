/**
 * CLI: openmnemo search — full-text search over the transcript index.
 */

import { join, resolve } from 'node:path'

import { defaultGlobalTranscriptRoot, searchTranscripts } from '@openmnemo/core'
import type { SearchResult } from '@openmnemo/core'

export interface SearchOptions {
  query: string
  globalRoot: string
  limit: number
  format: string
}

export async function cmdSearch(options: SearchOptions): Promise<number> {
  const query = options.query.trim()
  if (!query) {
    process.stderr.write('--query must not be empty\n')
    return 1
  }

  const globalRoot = options.globalRoot ? resolve(options.globalRoot) : defaultGlobalTranscriptRoot()
  const dbPath = join(globalRoot, 'index', 'search.sqlite')

  let results: SearchResult[]
  try {
    results = await searchTranscripts(dbPath, query, options.limit)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    process.stderr.write(`search error: ${msg}\n`)
    return 1
  }

  if (options.format === 'json') {
    process.stdout.write(JSON.stringify({ query, results, count: results.length }) + '\n')
  } else {
    process.stdout.write(formatSearchText(query, results) + '\n')
  }
  return 0
}

function formatSearchText(query: string, results: SearchResult[]): string {
  const lines: string[] = [`query: ${query}`, `count: ${results.length}`]
  if (results.length > 0) {
    lines.push('results:')
    for (const r of results) {
      lines.push(`- [${r.client}] ${r.project}/${r.session_id}`)
      lines.push(`  title: ${r.title}`)
      lines.push(`  started_at: ${r.started_at}`)
      if (r.cwd) lines.push(`  cwd: ${r.cwd}`)
      if (r.branch) lines.push(`  branch: ${r.branch}`)
    }
  }
  return lines.join('\n')
}
