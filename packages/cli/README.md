# @openmnemo/cli

OpenMnemo unified CLI — manage AI conversation memory across Claude, Codex, Gemini, and Doubao.

## Install

```bash
npm install -g @openmnemo/cli
```

## Commands

### `openmnemo init`

Initialise a MemoryTree workspace in a repository.

```bash
openmnemo init --root . --project-name "my-project" --locale en
```

### `openmnemo upgrade`

Upgrade an existing workspace without overwriting policy files.

```bash
openmnemo upgrade --root .
```

### `openmnemo import`

Import a single transcript file into Memory.

```bash
openmnemo import --source ~/.codex/conversations/abc.jsonl --client codex
openmnemo import --source ~/doubao_session.txt --client doubao
```

### `openmnemo discover`

Scan default client directories and import all matching transcripts.

```bash
# Import all transcripts for the current project
openmnemo discover --scope current-project

# Import everything, all clients (claude, codex, gemini)
openmnemo discover --client all --scope all-projects
```

### `openmnemo search`

Full-text search over imported sessions.

```bash
openmnemo search --query "authentication bug"
openmnemo search --query "database migration" --limit 10 --format json
```

### `openmnemo recall`

Sync transcripts and return the most recent session for the current project.

```bash
openmnemo recall
openmnemo recall --format json
```

### `openmnemo report build`

Build a static HTML report from `Memory/`.

```bash
openmnemo report build --root . --output ./Memory/07_reports --no-ai
openmnemo report build --root . --output ./Memory/07_reports --locale zh-CN
```

### `openmnemo report serve`

Serve a built report over HTTP.

```bash
openmnemo report serve --dir ./Memory/07_reports --port 3000
```

### `openmnemo daemon`

Manage the background heartbeat that auto-imports transcripts.

```bash
openmnemo daemon install          # register with OS scheduler (every 10 min)
openmnemo daemon uninstall        # remove scheduled task
openmnemo daemon run-once         # run a single heartbeat cycle now
openmnemo daemon status           # show registration and lock state
```

## Supported clients

| Client | Format | Auto-discovery |
|--------|--------|----------------|
| Claude | JSONL | `~/.claude/projects/` |
| Codex (OpenAI) | JSONL | `~/.codex/conversations/` |
| Gemini | JSON | `~/.gemini/conversations/` |
| Doubao | TXT | via `openmnemo import --client doubao` |

## License

MIT
