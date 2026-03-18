# @openmnemo/cli

## 0.3.1

### Patch Changes

- 0c6c387: Change default report serve port from 3000 to 10086 and improve help text with Quick Start usage
  - @openmnemo/types@0.3.1
  - @openmnemo/core@0.3.1
  - @openmnemo/sync@0.3.1
  - @openmnemo/report@0.3.1

## 0.3.0

### Minor Changes

- Add full-text search, report build/serve, recall commands, Doubao parser, and @openmnemo/report package.

  - `@openmnemo/core`: FTS4 full-text search (`searchTranscripts`, `sanitizeFtsQuery`), Doubao TXT parser, Gemini improvements
  - `@openmnemo/report`: new package — generates static HTML dashboard from Memory/ directory
  - `@openmnemo/cli`: `search`, `recall`, `report build`, `report serve` subcommands
  - `@openmnemo/sync`: remove internal helpers (`processProject`, `scanSensitive`, `gitCommitAndPush`, `tryPush`) from public barrel; add report config fields
  - `@openmnemo/types`: add `'doubao'` to `Client` union

### Patch Changes

- Updated dependencies
  - @openmnemo/core@0.3.0
  - @openmnemo/sync@0.3.0
  - @openmnemo/report@0.3.0
  - @openmnemo/types@0.3.0
