/**
 * @openmnemo/sync — heartbeat daemon, config, lock, alert, and background sync.
 *
 * Ported from memorytree-workflow TS branch (src/heartbeat/*).
 */

// Modules to be ported from memorytree-workflow:
// - heartbeat: main loop, per-project processing, sensitive scan, git ops
// - config: ~/.memorytree/config.toml load/save/validate
// - lock: PID-based lock file
// - alert: alerts.json with dedup + threshold
// - log: leveled logging with daily rotation
