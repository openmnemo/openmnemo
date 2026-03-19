import type { ManifestEntry } from '@openmnemo/types'
import type { SearchResult } from '../../transcript/db.js'
import { upsertSearchIndex, searchTranscripts } from '../../transcript/db.js'
import type { SearchAdapter, SearchOptions } from './search-adapter.js'

export class SqliteFtsAdapter implements SearchAdapter {
  constructor(private readonly dbPath: string) {}

  search(query: string, options: SearchOptions = {}): SearchResult[] {
    return searchTranscripts(this.dbPath, query, options.limit ?? 20)
  }

  upsert(manifest: ManifestEntry): void {
    upsertSearchIndex(this.dbPath, manifest)
  }

  close(): void {
    // stateless — db is opened/closed per-call in db.ts
  }
}
