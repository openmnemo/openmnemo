# @openmnemo/types

Shared TypeScript types for the OpenMnemo ecosystem.

## Install

```bash
npm install @openmnemo/types
```

## Types

```typescript
import type {
  Client,
  ParsedTranscript,
  TranscriptMessage,
  TranscriptToolEvent,
  ManifestEntry,
} from '@openmnemo/types'
```

### `Client`

```typescript
type Client = 'codex' | 'claude' | 'gemini' | 'doubao'
```

### `ParsedTranscript`

Normalised representation of a parsed AI conversation file, regardless of the original client format.

```typescript
interface ParsedTranscript {
  client: Client
  session_id: string
  title: string
  started_at: string
  cwd: string
  branch: string
  messages: TranscriptMessage[]
  tool_events: TranscriptToolEvent[]
  source_path: string
}
```

### `TranscriptMessage`

```typescript
interface TranscriptMessage {
  role: string
  text: string
  timestamp: string | null
}
```

### `TranscriptToolEvent`

```typescript
interface TranscriptToolEvent {
  summary: string
  timestamp: string | null
}
```

### `ManifestEntry`

Metadata written to disk after a transcript is imported. Used by indexing and recall systems.

```typescript
interface ManifestEntry {
  client: string
  project: string
  session_id: string
  raw_sha256: string
  title: string
  started_at: string
  imported_at: string
  cwd: string
  branch: string
  raw_source_path: string
  raw_upload_permission: string
  global_raw_path: string
  global_clean_path: string
  global_manifest_path: string
  repo_raw_path: string
  repo_clean_path: string
  repo_manifest_path: string
  message_count: number
  tool_event_count: number
  cleaning_mode: string
  repo_mirror_enabled: boolean
}
```

## License

MIT
