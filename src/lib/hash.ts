/** A bytes32 of zeros. The contract rejects this as a content hash. */
export const ZERO_HASH = `0x${'0'.repeat(64)}` as const

/** True for a 0x-prefixed 32-byte hex string that is not all zeros. */
export function isValidContentHash(value: string): value is `0x${string}` {
  return /^0x[0-9a-fA-F]{64}$/.test(value) && value.toLowerCase() !== ZERO_HASH
}

/** Accepts "abc..." or "0xabc..." and returns a lowercase 0x-prefixed value. */
export function normalizeHash(value: string): string {
  const v = value.trim().toLowerCase()
  return v.startsWith('0x') ? v : `0x${v}`
}

/**
 * SHA-256 of a file, computed locally in the browser (the file is never
 * uploaded). The result is a 32-byte value that fits the contract's bytes32.
 */
export async function sha256File(file: File): Promise<`0x${string}`> {
  const buffer = await file.arrayBuffer()
  const digest = await crypto.subtle.digest('SHA-256', buffer)
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  return `0x${hex}`
}
