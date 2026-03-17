# OpenMnemo

[![CI](https://github.com/openmnemo/openmnemo/actions/workflows/ci.yml/badge.svg)](https://github.com/openmnemo/openmnemo/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@openmnemo/cli)](https://www.npmjs.com/package/@openmnemo/cli)

Cross-platform AI conversation memory — aggregate, search, and version-control your coding sessions across Claude Code, Codex, Gemini CLI, and Doubao.

> Named after Mnemosyne, the Greek goddess of memory.

## Architecture

Monorepo powered by pnpm workspaces + Turborepo.

```
packages/
  types/    @openmnemo/types    — shared TypeScript interfaces
  core/     @openmnemo/core     — transcript parsing, import, dedup, indexing
  report/   @openmnemo/report   — static HTML dashboard generation
  sync/     @openmnemo/sync     — heartbeat daemon, config, lock, background sync
  cli/      @openmnemo/cli      — unified CLI (openmnemo command)
```

## Package Dependency Graph

```
@openmnemo/types
    ↑              ↑
@openmnemo/core  @openmnemo/report  (both depend on types)
    ↑              ↑
@openmnemo/sync  (depends on types + core + report)
    ↑
@openmnemo/cli   (depends on types + core + report + sync)
```

## Supported Clients

| Client | Transcript Format | Status |
|--------|------------------|--------|
| Claude Code | JSONL | ✅ Supported |
| Codex | JSONL | ✅ Supported |
| Gemini CLI | JSON/JSONL | ✅ Supported |
| Doubao | JSON | ✅ Supported |

## Install

```bash
npx @openmnemo/cli --help
# or
npm install -g @openmnemo/cli
```

## Features

- Multi-client transcript discovery and incremental import
- Deterministic cleaning (no model tokens spent)
- SQLite full-text search index (sql.js, zero native deps)
- Background heartbeat daemon with OS-native scheduling
- Git-based version control for conversation history
- Cross-session context recall
- Sensitive info detection (warn-only, no auto-redact)
- Static HTML dashboard with charts, knowledge graph, and search
- GitHub Pages deploy + webhook notifications (Feishu / Slack / Discord / Telegram)

## Requirements

- Node.js >= 20
- pnpm >= 9

## Development

```bash
pnpm install
pnpm build
pnpm test
```

## Related

- [memorytree-workflow](https://github.com/beyondchenlin/memorytree-workflow) — the Skill that powers MemoryTree project memory (upstream source)

## License

MIT
