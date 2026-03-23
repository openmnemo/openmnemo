import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import fg from 'fast-glob'
import type { ArchiveAnchor, MemoryUnit, SourceAsset } from '@openmnemo/types'
import type { MemoryExtractionBundle } from './extraction.js'
import { isMemoryExtractionBundle } from './domain.js'

function extractionGlob(globalRoot: string): string {
  return join(globalRoot, 'index', 'extracted', '**', '*.memory.json').replace(/\\/g, '/')
}

function readExtractionBundle(path: string): MemoryExtractionBundle | null {
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8')) as unknown
    return isMemoryExtractionBundle(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function listMemoryExtractionPaths(globalRoot: string): string[] {
  const root = join(globalRoot, 'index', 'extracted')
  if (!existsSync(root)) return []
  return fg.sync(extractionGlob(globalRoot), { onlyFiles: true, unique: true }).sort()
}

export function listMemoryExtractionBundles(globalRoot: string): MemoryExtractionBundle[] {
  return listMemoryExtractionPaths(globalRoot)
    .map((path) => readExtractionBundle(path))
    .filter((bundle): bundle is MemoryExtractionBundle => bundle !== null)
}

export function getMemoryUnit(globalRoot: string, id: string): MemoryUnit | null {
  for (const bundle of listMemoryExtractionBundles(globalRoot)) {
    const unit = bundle.memory_units.find((entry) => entry.id === id)
    if (unit) return unit
  }
  return null
}

export function getSourceAsset(globalRoot: string, id: string): SourceAsset | null {
  for (const bundle of listMemoryExtractionBundles(globalRoot)) {
    if (bundle.source_asset.id === id) return bundle.source_asset
  }
  return null
}

export function getArchiveAnchor(globalRoot: string, id: string): ArchiveAnchor | null {
  for (const bundle of listMemoryExtractionBundles(globalRoot)) {
    if (bundle.archive_anchor.id === id) return bundle.archive_anchor
  }
  return null
}
