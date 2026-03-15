/**
 * GiteaAdapter — StorageAdapter backed by the Gitea API.
 *
 * Uses the Gitea Contents API to read/write files in a remote repository.
 * Requires a base URL and API token for authentication.
 */

import type { StorageAdapter } from './adapter.js'

export interface GiteaAdapterOptions {
  baseUrl: string
  owner: string
  repo: string
  token: string
  branch?: string
}

export class GiteaAdapter implements StorageAdapter {
  private readonly baseUrl: string
  private readonly owner: string
  private readonly repo: string
  private readonly token: string
  private readonly branch: string

  constructor(options: GiteaAdapterOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '')
    this.owner = options.owner
    this.repo = options.repo
    this.token = options.token
    this.branch = options.branch ?? 'main'
  }

  async writeFile(path: string, content: string | Buffer): Promise<void> {
    const base64Content = Buffer.from(content).toString('base64')
    const normalizedPath = normalizePath(path)
    const existing = await this.getFileSha(normalizedPath)

    const body: Record<string, unknown> = {
      content: base64Content,
      message: `update ${normalizedPath}`,
      branch: this.branch,
    }
    if (existing) {
      body['sha'] = existing
    }

    const method = existing ? 'PUT' : 'POST'
    const url = `${this.baseUrl}/api/v1/repos/${this.owner}/${this.repo}/contents/${normalizedPath}`

    const response = await fetch(url, {
      method,
      headers: this.headers(),
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Gitea API ${method} ${normalizedPath} failed (${response.status}): ${text}`)
    }
  }

  async readFile(path: string): Promise<string> {
    const normalizedPath = normalizePath(path)
    const url = `${this.baseUrl}/api/v1/repos/${this.owner}/${this.repo}/contents/${normalizedPath}?ref=${this.branch}`

    const response = await fetch(url, { headers: this.headers() })
    if (!response.ok) {
      throw new Error(`Gitea API GET ${normalizedPath} failed (${response.status})`)
    }

    const data = (await response.json()) as { content?: string; encoding?: string }
    if (data.encoding === 'base64' && data.content) {
      return Buffer.from(data.content, 'base64').toString('utf-8')
    }
    return data.content ?? ''
  }

  async exists(path: string): Promise<boolean> {
    const normalizedPath = normalizePath(path)
    const url = `${this.baseUrl}/api/v1/repos/${this.owner}/${this.repo}/contents/${normalizedPath}?ref=${this.branch}`

    const response = await fetch(url, { headers: this.headers() })
    return response.ok
  }

  async mkdir(_path: string): Promise<void> {
    // Gitea auto-creates directories when files are written
  }

  async copyFile(source: string, destination: string): Promise<void> {
    const content = await this.readFile(source)
    await this.writeFile(destination, content)
  }

  async appendFile(path: string, content: string): Promise<void> {
    let existing = ''
    if (await this.exists(path)) {
      existing = await this.readFile(path)
    }
    await this.writeFile(path, existing + content)
  }

  private headers(): Record<string, string> {
    return {
      'Authorization': `token ${this.token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    }
  }

  private async getFileSha(path: string): Promise<string | null> {
    const url = `${this.baseUrl}/api/v1/repos/${this.owner}/${this.repo}/contents/${path}?ref=${this.branch}`
    const response = await fetch(url, { headers: this.headers() })
    if (!response.ok) return null
    const data = (await response.json()) as { sha?: string }
    return data.sha ?? null
  }
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\/+/, '')
}
