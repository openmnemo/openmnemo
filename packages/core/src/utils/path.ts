import { normalize } from 'node:path'

/**
 * Convert a file path to posix format (forward slashes).
 */
export function toPosixPath(p: string): string {
  return normalize(p).replace(/\\/g, '/') 
}
