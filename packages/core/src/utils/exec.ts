/**
 * Subprocess execution wrapper for git and other commands.
 * Port of heartbeat.py _git() and daemon subprocess calls.
 */

import { execFileSync } from 'node:child_process'

export function execCommand(
  command: string,
  args: readonly string[],
  options?: { cwd?: string; timeout?: number; allowFailure?: boolean },
): string {
  const cwd = options?.cwd
  const timeout = options?.timeout ?? 120_000
  const allowFailure = options?.allowFailure ?? false

  try {
    const stdout = execFileSync(command, [...args], {
      cwd,
      timeout,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    return stdout
  } catch (err: unknown) {
    if (allowFailure) {
      const e = err as { stdout?: string }
      return typeof e.stdout === 'string' ? e.stdout : ''
    }
    throw err
  }
}

export function git(cwd: string, ...args: string[]): string {
  const allowFailure = args[0] === 'status' || args[0] === 'remote'
  return execCommand('git', args, { cwd, allowFailure })
}

/**
 * Build a commit_layer string for FTS indexing.
 * Collects the last N commit messages + changed file paths from the repo at cwd.
 * Returns empty string if cwd is not a git repo or git is unavailable.
 */
export function buildCommitLayer(cwd: string, maxCommits = 10): string {
  try {
    // Get last N commit messages
    const log = execCommand('git', ['log', `--max-count=${maxCommits}`, '--pretty=format:%s'], {
      cwd,
      allowFailure: true,
      timeout: 10_000,
    })
    // Get changed files from last N commits (deduplicated)
    const files = execCommand('git', ['log', `--max-count=${maxCommits}`, '--name-only', '--pretty=format:'], {
      cwd,
      allowFailure: true,
      timeout: 10_000,
    })

    const parts: string[] = []
    if (log.trim()) parts.push(log.trim())
    if (files.trim()) {
      const uniqueFiles = [...new Set(
        files.split('\n').map(l => l.trim()).filter(Boolean)
      )].join('\n')
      if (uniqueFiles) parts.push(uniqueFiles)
    }
    return parts.join('\n')
  } catch {
    return ''
  }
}
