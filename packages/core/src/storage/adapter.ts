/**
 * StorageAdapter — abstract file-system interface for transcript storage.
 *
 * Implementations handle the underlying I/O (local FS, Gitea API, etc.)
 * so that import/export logic remains storage-agnostic.
 */

export interface StorageAdapter {
  writeFile(path: string, content: string | Buffer): Promise<void>
  readFile(path: string): Promise<string>
  exists(path: string): Promise<boolean>
  mkdir(path: string): Promise<void>
  copyFile(source: string, destination: string): Promise<void>
  appendFile(path: string, content: string): Promise<void>
}
