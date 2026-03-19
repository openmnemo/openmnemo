/**
 * CLI: openmnemo search — full-text search over the transcript index.
 * Uses three-layer search: commit_layer → metadata → content.
 */

import { resolve } from 'node:path'

import { defaultGlobalTranscriptRoot, searchRecall } from '@openmnemo/core'
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

  let layer: 1 | 2 | 3
  let results: SearchResult[]
  try {
    const result = searchRecall(globalRoot, query, options.limit)
    layer = result.layer
    results = result.results
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    process.stderr.write(`search error: ${msg}\n`)
    return 1
  }

  if (options.format === 'json') {
    process.stdout.write(JSON.stringify({ query, layer, results, count: results.length }) + '\n')
  } else {
    process.stdout.write(formatSearchText(query, layer, results) + '\n')
  }
  return 0
}

function formatSearchText(query: string, layer: number, results: SearchResult[]): string {
  const lines: string[] = [`query: ${query}`, `layer: ${layer}`, `count: ${results.length}`]
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
