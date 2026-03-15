/**
 * LocalAdapter — StorageAdapter backed by the local file system.
 */

import {
  appendFileSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { dirname } from 'node:path'
import type { StorageAdapter } from './adapter.js'

export class LocalAdapter implements StorageAdapter {
  async writeFile(path: string, content: string | Buffer): Promise<void> {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, content, typeof content === 'string' ? 'utf-8' : undefined)
  }

  async readFile(path: string): Promise<string> {
    return readFileSync(path, 'utf-8')
  }

  async exists(path: string): Promise<boolean> {
    return existsSync(path)
  }

  async mkdir(path: string): Promise<void> {
    mkdirSync(path, { recursive: true })
  }

  async copyFile(source: string, destination: string): Promise<void> {
    if (source === destination) return
    mkdirSync(dirname(destination), { recursive: true })
    copyFileSync(source, destination)
  }

  async appendFile(path: string, content: string): Promise<void> {
    mkdirSync(dirname(path), { recursive: true })
    appendFileSync(path, content, 'utf-8')
  }
}
