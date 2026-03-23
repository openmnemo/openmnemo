export const DEFAULT_VECTOR_DIMS = 1536

function tokenizeDeterministicText(text: string): string[] {
  const normalized = text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()

  return normalized ? normalized.split(/\s+/u).filter(Boolean) : []
}

function hashToken(token: string): number {
  let hash = 2166136261
  for (let i = 0; i < token.length; i++) {
    hash ^= token.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

export function deterministicTextEmbedding(
  text: string,
  dimensions = DEFAULT_VECTOR_DIMS,
): number[] {
  const tokens = tokenizeDeterministicText(text)
  if (tokens.length === 0) return Array(dimensions).fill(0)

  const vector = Array(dimensions).fill(0)
  for (const token of tokens) {
    const hash = hashToken(token)
    const index = hash % dimensions
    const sign = (hash & 1) === 0 ? 1 : -1
    vector[index] += sign
  }

  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0))
  if (norm === 0) return vector
  return vector.map((value) => value / norm)
}

export function isZeroVector(vector: number[]): boolean {
  return vector.every((value) => value === 0)
}
