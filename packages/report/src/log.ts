/**
 * Minimal logger for @openmnemo/report (no external dependencies).
 */

export interface Logger {
  debug(msg: string): void
  info(msg: string): void
  warn(msg: string): void
  error(msg: string): void
}

export function getLogger(): Logger {
  const prefix = (): string => new Date().toISOString().slice(0, 19).replace('T', ' ')
  return {
    debug: (m) => console.debug(`${prefix()} [DEBUG] ${m}`),
    info:  (m) => console.info(`${prefix()} [INFO]  ${m}`),
    warn:  (m) => console.warn(`${prefix()} [WARN]  ${m}`),
    error: (m) => console.error(`${prefix()} [ERROR] ${m}`),
  }
}
