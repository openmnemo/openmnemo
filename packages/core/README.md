# @openmnemo/core

Transcript parsing, import, dedup, full-text search, and recall for OpenMnemo.

## Install

```bash
npm install @openmnemo/core
```

## Features

- Parse transcripts from Claude (JSONL), Codex/OpenAI (JSONL), Gemini (JSON), and Doubao (TXT)
- Import into a structured `Memory/` directory with deduplication
- Full-text search over imported sessions via SQLite FTS4
- Recall the most recent session for a project

## Parsing

```typescript
import { inferClient, parseTranscript } from '@openmnemo/core'

const client = inferClient('auto', '/path/to/file.jsonl')  // 'claude' | 'codex' | ...
const transcript = parseTranscript(client, '/path/to/file.jsonl')
// → ParsedTranscript { client, session_id, title, messages, tool_events, ... }
```

## Discovery

```typescript
import { discoverSourceFiles, defaultGlobalTranscriptRoot } from '@openmnemo/core'

// Scan default client directories (~/.claude/projects, ~/.codex/conversations, ...)
const sources = discoverSourceFiles()  // [['claude', '/path/a.jsonl'], ...]
```

## Import

```typescript
import { importTranscript, transcriptHasContent } from '@openmnemo/core'

if (transcriptHasContent(transcript)) {
  const manifest = await importTranscript(
    transcript,
    '/path/to/repo',      // repository root
    '/path/to/Memory',    // global transcript root
    'my-project',         // project slug
    'not-set',            // raw upload permission
    true,                 // mirror to repo
  )
}
```

## Full-text Search

```typescript
import { searchTranscripts, sanitizeFtsQuery } from '@openmnemo/core'

const results = await searchTranscripts(
  '/path/to/Memory/index/search.sqlite',
  'authentication bug',
  20,  // limit
)
// → SearchResult[] { client, project, session_id, title, cwd, branch, started_at }
```

## Recall

```typescript
import { recall, formatRecallText } from '@openmnemo/core'

const result = await recall(
  '/path/to/repo',
  'my-project',
  '/path/to/Memory',
  new Date().toISOString(),
)
// → RecallResult { found, session_id, title, client, clean_content, ... }

console.log(formatRecallText(result))
```

## License

MIT
