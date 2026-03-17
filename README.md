# OpenMnemo

[![CI](https://github.com/openmnemo/openmnemo/actions/workflows/ci.yml/badge.svg)](https://github.com/openmnemo/openmnemo/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@openmnemo/cli)](https://www.npmjs.com/package/@openmnemo/cli)
[![Node.js >= 20](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

**Cross-platform AI conversation memory manager.**

Automatically discovers, imports, and version-controls your AI coding sessions — Claude Code, Codex, Gemini CLI, and Doubao — then generates a searchable HTML dashboard from your conversation history.

> Named after Mnemosyne, the Greek goddess of memory.

---

## Quick Start

### 1. Install

```bash
npm install -g @openmnemo/cli
```

Verify:

```bash
openmnemo --version
```

### 2. Initialize your project

Run this inside any Git repository you want to track:

```bash
openmnemo init --root . --project-name "my-project"
```

This creates a `Memory/` directory structure in your repo for storing transcripts, notes, and reports.

### 3. Import your AI conversations

Auto-discover and import all local transcripts (Claude Code, Codex, Gemini CLI):

```bash
openmnemo discover --root .
```

To import a specific file manually:

```bash
openmnemo import --source /path/to/transcript.jsonl --root .
```

### 4. Generate an HTML report

```bash
openmnemo report build --root . --output ./Memory/07_reports --no-ai
```

Then open `Memory/07_reports/index.html` in your browser — you'll see a dashboard with all your sessions, charts, and a knowledge graph.

> Add `--model claude-haiku-4-5-20251001` (and set `ANTHROPIC_API_KEY`) to generate AI-powered summaries for each session.

---

## Automate with the Daemon

Set up a background heartbeat that automatically syncs new conversations every 30 minutes:

```bash
# Register with the OS scheduler (cron / launchd / Task Scheduler)
openmnemo daemon install

# Check status
openmnemo daemon status

# Run one sync cycle manually
openmnemo daemon run-once

# Remove the scheduled task
openmnemo daemon uninstall
```

The daemon runs `discover` on a schedule and optionally pushes to a Git remote (set `auto_push = true` in `~/.memorytree/config.toml`).

---

## Commands

### `openmnemo init`

Initialize a MemoryTree workspace in a repository.

```bash
openmnemo init --root <path> [options]

Options:
  --root <path>           Repository root (default: .)
  --project-name <name>   Project name shown in reports
  --goal-summary <text>   Initial goal description
  --locale <locale>       Language: auto, en, or zh-cn (default: auto)
  --force                 Overwrite existing generated files
```

### `openmnemo discover`

Scan your home directory for AI transcripts and import new ones.

```bash
openmnemo discover --root <path> [options]

Options:
  --root <path>           Repository root (default: .)
  --client <client>       Filter by client: all, codex, claude, gemini (default: all)
  --scope <scope>         current-project or all-projects (default: all-projects)
  --limit <n>             Import at most N transcripts
  --format <format>       Output: text or json (default: text)
```

### `openmnemo import`

Import a single transcript file.

```bash
openmnemo import --source <path> --root <path> [options]

Options:
  --source <path>         Path to the transcript file (required)
  --root <path>           Repository root (default: .)
  --client <client>       Override auto-detection: codex, claude, gemini, doubao
```

### `openmnemo report build`

Generate a static HTML dashboard from imported transcripts.

```bash
openmnemo report build --root <path> [options]

Options:
  --root <path>           Repository root (default: .)
  --output <path>         Output directory (default: ./Memory/07_reports)
  --no-ai                 Skip AI summaries (no API key needed)
  --model <model>         AI model for summaries (default: claude-haiku-4-5-20251001)
  --locale <locale>       Report language: en or zh-CN (default: en)
```

### `openmnemo report serve`

Serve the built report locally over HTTP.

```bash
openmnemo report serve --dir ./Memory/07_reports --port 3000
```

Then open `http://localhost:3000` in your browser.

### `openmnemo recall`

Show the most recent session summary (useful in AI agent hooks).

```bash
openmnemo recall --root . --project-name "my-project"
```

### `openmnemo upgrade`

Upgrade an existing repository to the latest MemoryTree structure without overwriting your policy files.

```bash
openmnemo upgrade --root .
```

---

## Supported AI Clients

| Client | Auto-discovery path | Transcript format |
|--------|--------------------|--------------------|
| Claude Code | `~/.claude/projects/` | JSONL |
| Codex | `~/.codex/sessions/` | JSONL |
| Gemini CLI | `~/.gemini/` | JSON / JSONL |
| Doubao | Manual (`--source`) | JSON |

> Doubao transcripts are not auto-discovered. Export them from the Doubao app and use `openmnemo import --source <file> --client doubao`.

---

## Configuration

Global settings are stored in `~/.memorytree/config.toml`:

```toml
heartbeat_interval = "30m"   # How often the daemon syncs
auto_push = false            # Push to Git remote after each sync
log_level = "info"           # debug | info | warn | error
generate_report = false      # Auto-rebuild HTML report on each sync
locale = "en"                # en or zh-CN
```

To enable auto-push and auto-report on every sync cycle:

```toml
auto_push = true
generate_report = true
```

---

## Deploy Report to GitHub Pages

Add these fields to `~/.memorytree/config.toml`:

```toml
gh_pages_branch = "gh-pages"          # Target branch for deployment
report_base_url = "https://you.github.io/your-repo"
cname = "memory.yoursite.com"         # Optional custom domain
webhook_url = "https://..."           # Optional: Feishu / Slack / Discord / Telegram
```

Then run:

```bash
openmnemo report build --root .
```

The report is pushed to `gh-pages` automatically after the build.

---

## Requirements

- **Node.js >= 20** — [nodejs.org](https://nodejs.org)
- **Git** — for version-controlled transcript storage

---

## Development

```bash
# Clone and install
git clone https://github.com/openmnemo/openmnemo.git
cd openmnemo
pnpm install     # requires pnpm >= 9

# Build all packages
pnpm build

# Run all tests
pnpm test

# Type-check
pnpm typecheck
```

### Package structure

```
packages/
  types/    @openmnemo/types    — shared TypeScript interfaces
  core/     @openmnemo/core     — transcript parsing, import, dedup, indexing
  report/   @openmnemo/report   — static HTML dashboard generation
  sync/     @openmnemo/sync     — heartbeat daemon, config, lock, background sync
  cli/      @openmnemo/cli      — unified CLI (openmnemo command)
```

---

## Release

All packages are versioned together. To publish a new release:

```bash
# 1. Bump version in every packages/*/package.json
# 2. Commit and tag
git add packages/*/package.json pnpm-lock.yaml
git commit -m "chore: bump version to 0.x.y"
git tag v0.x.y
git push origin main --tags
```

GitHub Actions publishes all packages to npm automatically on tag push.

> Requires `NPM_TOKEN` (Classic Automation token) set in repository Settings → Secrets → Actions.

---

## Related

- [memorytree-workflow](https://github.com/beyondchenlin/memorytree-workflow) — the Claude Code Skill that powers MemoryTree project memory

## License

MIT
