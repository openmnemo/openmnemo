# @openmnemo/report

Generates a static HTML dashboard from an OpenMnemo `Memory/` directory.

Produces an interactive site with session timelines, knowledge graph, project dashboards, goals, todos, and full-text search — all from local Markdown and JSONL files, with no server required.

## Install

```bash
npm install @openmnemo/report
```

## Usage

```typescript
import { buildReport } from '@openmnemo/report'

await buildReport({
  root: '/path/to/repo',            // repository root containing Memory/
  output: '/path/to/Memory/07_reports',
  noAi: true,                       // skip AI-powered session summaries
  model: 'claude-haiku-4-5-20251001',
  locale: 'en',                     // 'en' or 'zh-CN'
})
```

### With AI summaries

Set `noAi: false` and provide `ANTHROPIC_API_KEY` in the environment. The `@anthropic-ai/sdk` package is a peer dependency and only required when `noAi` is `false`.

```typescript
await buildReport({
  root: '.',
  output: './Memory/07_reports',
  noAi: false,
  model: 'claude-haiku-4-5-20251001',
})
```

## Output structure

```
Memory/07_reports/
  index.html          Dashboard (session count, recent activity, top projects)
  graph.html          Knowledge graph (topics, entities, session links)
  search.html         Full-text search UI
  projects/           Per-project pages
  transcripts/        Per-session clean transcript viewers
  goals/              Goals tracking
  todos/              Todo list view
  knowledge/          Knowledge base pages
  archive/            Archived sessions
```

## CLI

The easiest way to use this package is via `@openmnemo/cli`:

```bash
openmnemo report build --root . --output ./Memory/07_reports --no-ai
openmnemo report serve --dir ./Memory/07_reports --port 10086
```

## GitHub Pages deployment

Set `ghPagesBranch` to deploy automatically:

```typescript
await buildReport({
  root: '.',
  output: './Memory/07_reports',
  noAi: true,
  model: 'claude-haiku-4-5-20251001',
  ghPagesBranch: 'gh-pages',
  cname: 'memory.mysite.com',        // optional custom domain
  webhookUrl: 'https://...',         // optional Feishu/Slack/Discord/Telegram notify
})
```

## License

MIT
