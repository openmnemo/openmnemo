/**
 * OpenMnemo CLI — unified entry point.
 * Registers all subcommands via commander.
 */

import { createRequire } from 'node:module'
import { Command } from 'commander'

const _require = createRequire(import.meta.url)
const { version: cliVersion } = _require('../package.json') as { version: string }

const program = new Command()

program
  .name('openmnemo')
  .description('OpenMnemo — cross-platform AI conversation memory manager\n\nMost commands have short aliases (e.g. s=search, d=discover). Run <command> --help for details.')
  .version(cliVersion)

// ── init ──────────────────────────────────────────────────────────────────

program
  .command('init')
  .alias('i')
  .description('Initialize a MemoryTree workspace in a repository')
  .option('--root <path>', 'Target repository root', '.')
  .option('--project-name <name>', 'Project name', 'this project')
  .option('--goal-summary <text>', 'Initial goal summary', 'Describe the long-term project goal here.')
  .option('--locale <locale>', 'Template locale: auto, en, or zh-cn', 'auto')
  .option('--date <date>', 'Override date as YYYY-MM-DD')
  .option('--time <time>', 'Override time as HH:MM')
  .option('--skip-agents', 'Deprecated — use upgrade instead')
  .option('--force', 'Overwrite existing generated files')
  .action(async (opts) => {
    const { cmdInit } = await import('./cmd-init.js')
    process.exitCode = cmdInit({
      root: opts.root,
      projectName: opts.projectName,
      goalSummary: opts.goalSummary,
      locale: opts.locale,
      date: opts.date ?? '',
      time: opts.time ?? '',
      skipAgents: opts.skipAgents ?? false,
      force: opts.force ?? false,
    })
  })

// ── upgrade ───────────────────────────────────────────────────────────────

program
  .command('upgrade')
  .alias('up')
  .description('Upgrade a repository to MemoryTree without overwriting existing policy')
  .option('--root <path>', 'Target repository root', '.')
  .option('--project-name <name>', 'Project name', 'this project')
  .option('--goal-summary <text>', 'Fallback goal summary', 'Describe the long-term project goal here.')
  .option('--locale <locale>', 'Requested locale: auto, en, or zh-cn', 'auto')
  .option('--date <date>', 'Override date as YYYY-MM-DD')
  .option('--time <time>', 'Override time as HH:MM')
  .option('--format <format>', 'Output format: text or json', 'text')
  .action(async (opts) => {
    const { cmdUpgrade } = await import('./cmd-upgrade.js')
    process.exitCode = cmdUpgrade({
      root: opts.root,
      projectName: opts.projectName,
      goalSummary: opts.goalSummary,
      locale: opts.locale,
      date: opts.date ?? '',
      time: opts.time ?? '',
      format: opts.format,
    })
  })

// ── import ────────────────────────────────────────────────────────────────

program
  .command('import')
  .alias('imp')
  .description('Import one local transcript into MemoryTree archives')
  .requiredOption('--source <path>', 'Raw transcript source file path')
  .option('--root <path>', 'Target repository root', '.')
  .option('--client <client>', 'Transcript client: auto, codex, claude, gemini, doubao', 'auto')
  .option('--project-name <name>', 'Project label', '')
  .option('--global-root <path>', 'Override global transcript root')
  .option('--raw-upload-permission <perm>', 'Permission: not-set, approved, denied', 'not-set')
  .option('--format <format>', 'Output format: text or json', 'text')
  .action(async (opts) => {
    const { cmdImport } = await import('./cmd-import.js')
    process.exitCode = await cmdImport({
      root: opts.root,
      source: opts.source,
      client: opts.client,
      projectName: opts.projectName,
      globalRoot: opts.globalRoot ?? '',
      rawUploadPermission: opts.rawUploadPermission,
      format: opts.format,
    })
  })

// ── discover ──────────────────────────────────────────────────────────────

program
  .command('discover')
  .alias('d')
  .description('Discover and import local AI transcripts')
  .option('--root <path>', 'Target repository root', '.')
  .option('--client <client>', 'Client filter: all, codex, claude, gemini, doubao', 'all')
  .option('--scope <scope>', 'Scope: current-project or all-projects', 'all-projects')
  .option('--project-name <name>', 'Project label', '')
  .option('--global-root <path>', 'Override global transcript root')
  .option('--raw-upload-permission <perm>', 'Permission: not-set, approved, denied', 'not-set')
  .option('--limit <n>', 'Limit discovered sources', '0')
  .option('--format <format>', 'Output format: text or json', 'text')
  .action(async (opts) => {
    const { cmdDiscover } = await import('./cmd-discover.js')
    process.exitCode = await cmdDiscover({
      root: opts.root,
      client: opts.client,
      scope: opts.scope,
      projectName: opts.projectName,
      globalRoot: opts.globalRoot ?? '',
      rawUploadPermission: opts.rawUploadPermission,
      limit: parseInt(opts.limit, 10) || 0,
      format: opts.format,
    })
  })

// ── locale ────────────────────────────────────────────────────────────────

program
  .command('locale')
  .alias('l')
  .description('Detect the effective locale for a repository')
  .option('--root <path>', 'Target repository root', '.')
  .option('--locale <locale>', 'Requested locale value', 'auto')
  .option('--format <format>', 'Output format: text or json', 'text')
  .action(async (opts) => {
    const { cmdLocale } = await import('./cmd-locale.js')
    process.exitCode = cmdLocale({
      root: opts.root,
      locale: opts.locale,
      format: opts.format,
    })
  })

// ── search ────────────────────────────────────────────────────────────────

program
  .command('search')
  .alias('s')
  .description('Full-text search over the imported transcript index')
  .requiredOption('--query <text>', 'Search query')
  .option('--global-root <path>', 'Override global transcript root')
  .option('--limit <n>', 'Maximum results to return (0 = no limit)', '20')
  .option('--format <format>', 'Output format: text or json', 'text')
  .action(async (opts) => {
    const { cmdSearch } = await import('./cmd-search.js')
    const n = parseInt(opts.limit, 10)
    process.exitCode = await cmdSearch({
      query: opts.query,
      globalRoot: opts.globalRoot ?? '',
      limit: !Number.isNaN(n) && n > 0 ? n : 20,
      format: opts.format,
    })
  })

// ── recall ────────────────────────────────────────────────────────────────

program
  .command('recall')
  .alias('r')
  .description('On-demand transcript sync and latest session recall')
  .option('--root <path>', 'Target repository root', '.')
  .option('--project-name <name>', 'Project label', '')
  .option('--global-root <path>', 'Override global transcript root')
  .option('--activation-time <time>', 'ISO timestamp of session activation')
  .option('--format <format>', 'Output format: text or json', 'text')
  .action(async (opts) => {
    const { cmdRecall } = await import('./cmd-recall.js')
    process.exitCode = await cmdRecall({
      root: opts.root,
      projectName: opts.projectName,
      globalRoot: opts.globalRoot ?? '',
      activationTime: opts.activationTime ?? '',
      format: opts.format,
    })
  })

// ── daemon ────────────────────────────────────────────────────────────────

const daemon = program
  .command('daemon')
  .alias('dm')
  .description('Manage the MemoryTree heartbeat lifecycle')

daemon
  .command('install')
  .alias('ins')
  .description('Register heartbeat with the OS scheduler')
  .option('--interval <interval>', 'Override heartbeat interval (e.g., "5m")')
  .option('--auto-push <bool>', 'Override auto_push setting (true/false)')
  .action(async (opts) => {
    const { cmdInstall } = await import('./cmd-daemon.js')
    process.exitCode = cmdInstall({
      interval: opts.interval,
      autoPush: opts.autoPush,
    })
  })

daemon
  .command('uninstall')
  .alias('un')
  .description('Remove the heartbeat scheduled task')
  .action(async () => {
    const { cmdUninstall } = await import('./cmd-daemon.js')
    process.exitCode = cmdUninstall()
  })

daemon
  .command('run-once')
  .alias('ro')
  .description('Execute a single heartbeat cycle now')
  .action(async () => {
    const { cmdRunOnce } = await import('./cmd-daemon.js')
    process.exitCode = await cmdRunOnce()
  })

daemon
  .command('watch')
  .alias('w')
  .description('Continuous heartbeat loop (development only)')
  .option('--interval <interval>', 'Override interval')
  .action(async (opts) => {
    const { cmdWatch } = await import('./cmd-daemon.js')
    process.exitCode = await cmdWatch({ interval: opts.interval })
  })

daemon
  .command('status')
  .alias('st')
  .description('Show heartbeat registration and lock state')
  .action(async () => {
    const { cmdStatus } = await import('./cmd-daemon.js')
    process.exitCode = cmdStatus()
  })

// ── report ────────────────────────────────────────────────────────────────

const report = program
  .command('report')
  .alias('rp')
  .description('Generate and serve MemoryTree HTML reports\n\nQuick start:\n  openmnemo report build --root . --no-ai\n  openmnemo report serve\n  Then open http://localhost:10086 in your browser.')

report
  .command('build')
  .alias('b')
  .description('Build a static HTML report from Memory/ directory.\nOutput defaults to ./Memory/07_reports. Use "openmnemo report serve" to view.')
  .option('--root <path>', 'Repository root (contains Memory/)', '.')
  .option('--output <path>', 'Output directory', './Memory/07_reports')
  .option('--no-ai', 'Skip AI summarization')
  .option('--model <model>', 'AI model for summaries', 'claude-haiku-4-5-20251001')
  .option('--locale <locale>', 'Report locale: en or zh-CN', 'en')
  .option('--report-base-url <url>', 'Base URL for RSS/OG links')
  .action(async (opts) => {
    const { cmdReportBuild } = await import('./cmd-report.js')
    process.exitCode = await cmdReportBuild({
      root: opts.root,
      output: opts.output,
      noAi: opts.ai === false,
      model: opts.model,
      locale: opts.locale,
      reportBaseUrl: opts.reportBaseUrl,
    })
  })

report
  .command('serve')
  .alias('sv')
  .description('Serve a built report over HTTP.\nOpen http://localhost:10086 (or custom --port) in your browser to view.')
  .option('--dir <path>', 'Report directory to serve', './Memory/07_reports')
  .option('--port <n>', 'HTTP port', '10086')
  .action(async (opts) => {
    const { cmdReportServe } = await import('./cmd-report.js')
    process.exitCode = cmdReportServe({
      dir: opts.dir,
      port: parseInt(opts.port, 10) || 10086,
    })
  })

program.parse()
