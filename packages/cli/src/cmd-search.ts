/**
 * CLI: openmnemo search — full-text search over the transcript index.
 * Uses three-layer search: commit_layer → metadata → content.
 */

import { resolve } from 'node:path'

import { defaultGlobalTranscriptRoot, searchRecall } from '@openmnemo/core'
import type { SearchRecallResult } from '@openmnemo/core'

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

  let result: SearchRecallResult
  try {
    result = searchRecall(globalRoot, query, options.limit)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    process.stderr.write(`search error: ${msg}\n`)
    return 1
  }

  if (options.format === 'json') {
    process.stdout.write(JSON.stringify({ query, ...result, count: result.results.length }) + '\n')
  } else {
    process.stdout.write(formatSearchText(query, result) + '\n')
  }
  return 0
}

function formatSearchText(query: string, result: SearchRecallResult): string {
  const { mode, source_counts: sourceCounts, results } = result
  const lines: string[] = [
    `query: ${query}`,
    `mode: ${mode}`,
    `source_counts: fts=${sourceCounts.fts} vector=${sourceCounts.vector} graph=${sourceCounts.graph}`,
    `count: ${results.length}`,
  ]
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
