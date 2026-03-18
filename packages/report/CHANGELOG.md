# @openmnemo/report

## 0.4.1

### Patch Changes

- @openmnemo/types@0.4.1

## 0.4.0

### Patch Changes

- @openmnemo/types@0.4.0

## 0.3.1

### Patch Changes

- @openmnemo/types@0.3.1

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
  - @openmnemo/types@0.3.0
