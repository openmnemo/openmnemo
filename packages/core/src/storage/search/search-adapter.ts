import type { ManifestEntry } from '@openmnemo/types'
import type { SearchResult } from '../../transcript/db.js'

export interface SearchOptions {
  limit?: number
}

export interface SearchAdapter {
  search(query: string, options?: SearchOptions): SearchResult[]
  upsert(manifest: ManifestEntry): void
  close(): void
}
