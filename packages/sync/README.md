# @openmnemo/sync

Heartbeat daemon, config management, and background sync for OpenMnemo.

Runs periodically to discover new AI transcripts, import them into `Memory/`, commit changes to git, and optionally generate HTML reports.

## Install

```bash
npm install @openmnemo/sync
```

This package is primarily consumed by `@openmnemo/cli` via the `openmnemo daemon` commands. Direct usage is for programmatic control.

## Config

Config is stored in `~/.memorytree/config.toml`.

```typescript
import { loadConfig, saveConfig, memorytreeRoot } from '@openmnemo/sync'

const config = loadConfig()
// {
//   heartbeat_interval: '5m',
//   auto_push: true,
//   generate_report: false,
//   locale: 'en',
//   ai_summary_model: 'claude-haiku-4-5-20251001',
//   ...
// }
```

### Config fields

| Field | Default | Description |
|-------|---------|-------------|
| `heartbeat_interval` | `'5m'` | Heartbeat interval (e.g. `'5m'`, `'1h'`) |
| `auto_push` | `true` | Git push after each import |
| `generate_report` | `false` | Build HTML report on each heartbeat |
| `locale` | `'en'` | Report locale (`'en'` or `'zh-CN'`) |
| `ai_summary_model` | `'claude-haiku-4-5-20251001'` | Model for AI session summaries |
| `gh_pages_branch` | `''` | Deploy report to this branch (empty = skip) |
| `cname` | `''` | Custom domain for GitHub Pages |
| `webhook_url` | `''` | Notify Feishu/Slack/Discord/Telegram on publish |
| `report_base_url` | `''` | Base URL for report RSS/OG links |

## Programmatic heartbeat

```typescript
import { runHeartbeat } from '@openmnemo/sync'

await runHeartbeat()
```

## Lock management

```typescript
import { acquireLock, releaseLock, readLockPid } from '@openmnemo/sync'

const acquired = acquireLock()
if (acquired) {
  // run heartbeat
  releaseLock()
}
```

## Alerts

```typescript
import { readAlerts, writeAlert, clearAlerts } from '@openmnemo/sync'

const alerts = readAlerts()
writeAlert({ type: 'sensitive-content', message: 'API key detected', project: 'my-project' })
clearAlerts()
```

## License

MIT
