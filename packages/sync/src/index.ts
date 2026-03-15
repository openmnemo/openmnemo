/**
 * @openmnemo/sync — heartbeat daemon, config, lock, alert, and background sync.
 */

// Config
export {
  memorytreeRoot,
  configPath,
  loadConfig,
  saveConfig,
  intervalToSeconds,
  registerProject,
} from './config.js'

// Heartbeat
export {
  main as heartbeatMain,
  runHeartbeat,
  processProject,
  scanSensitive,
  gitCommitAndPush,
  tryPush,
} from './heartbeat.js'

// Lock
export {
  lockPath,
  acquireLock,
  releaseLock,
  readLockPid,
  isProcessAlive,
} from './lock.js'

// Alert
export {
  MAX_ALERTS,
  ALERT_TYPES,
  FAILURE_THRESHOLD,
  alertsPath,
  readAlerts,
  writeAlert,
  writeAlertWithThreshold,
  resetFailureCount,
  clearAlerts,
  formatAlertsForDisplay,
} from './alert.js'
export type { Alert } from './alert.js'

// Logging
export {
  setupLogging,
  getLogger,
  _resetLogger,
} from './log.js'
export type { LogLevel, Logger } from './log.js'
