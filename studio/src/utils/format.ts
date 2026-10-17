/**
 * Display helpers for amounts, addresses, bps, and durations.
 * All amounts are bigint in 6-decimal USDC units unless stated.
 */
import { keccak256, toBytes } from 'viem'

/**
 * Convert user text to a bytes32 digest suitable for on-chain storage.
 * - If the input is already a 0x + 64 hex-char string, pass it through unchanged.
 * - Otherwise compute keccak256 of the UTF-8 bytes and return the hex digest.
 * Returns the hash string and a flag indicating whether hashing was applied.
 */
export function textToBytes32(s: string): { hex: `0x${string}`; hashed: boolean } {
  const trimmed = s.trim()
  if (/^0x[0-9a-fA-F]{64}$/.test(trimmed)) {
    return { hex: trimmed as `0x${string}`, hashed: false }
  }
  const hash = keccak256(toBytes(trimmed))
  return { hex: hash, hashed: true }
}

const USDC_DECIMALS = 6

/** Format a 6-decimal USDC raw value as "$1,234.56" */
export function fmtUsdc(raw: bigint, fractionDigits = 2): string {
  const whole = raw / BigInt(10 ** USDC_DECIMALS)
  const frac = raw % BigInt(10 ** USDC_DECIMALS)
  const fracStr = frac.toString().padStart(USDC_DECIMALS, '0').slice(0, fractionDigits)
  const wholeFmt = new Intl.NumberFormat('en-US').format(whole)
  return fractionDigits > 0 ? `$${wholeFmt}.${fracStr}` : `$${wholeFmt}`
}

/** Format basis points as "12.50%" */
export function fmtBps(bps: bigint | number): string {
  const n = typeof bps === 'bigint' ? Number(bps) : bps
  return `${(n / 100).toFixed(2)}%`
}

/** Short address: "0x1234…abcd" */
export function fmtAddr(addr: string): string {
  if (addr.length < 10) return addr
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

/** bytes32 hash as truncated hex: "0x1234…abcd" */
export function fmtHash(hash: string): string {
  if (hash === '0x' + '0'.repeat(64)) return '—'
  return `${hash.slice(0, 10)}…${hash.slice(-6)}`
}

/** Duration in seconds to human readable: "14d 3h 22m" */
export function fmtDuration(seconds: number): string {
  if (seconds <= 0) return 'Expired'
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const parts: string[] = []
  if (d > 0) parts.push(`${d}d`)
  if (h > 0) parts.push(`${h}h`)
  if (m > 0 || parts.length === 0) parts.push(`${m}m`)
  return parts.join(' ')
}

/** Unix timestamp to locale date string */
export function fmtDate(ts: bigint | number): string {
  const n = typeof ts === 'bigint' ? Number(ts) : ts
  if (n === 0) return '—'
  return new Date(n * 1000).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

/** Unix timestamp to locale datetime string */
export function fmtDatetime(ts: bigint | number): string {
  const n = typeof ts === 'bigint' ? Number(ts) : ts
  if (n === 0) return '—'
  return new Date(n * 1000).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Seconds remaining until a unix deadline */
export function secsUntil(deadlineTs: bigint | number): number {
  const n = typeof deadlineTs === 'bigint' ? Number(deadlineTs) : deadlineTs
  if (n === 0) return 0
  return Math.max(0, n - Math.floor(Date.now() / 1000))
}

/** Parse a decimal USDC string like "10.50" to bigint raw */
export function parseUsdcInput(value: string): bigint | null {
  const trimmed = value.trim()
  if (!trimmed || !/^\d*\.?\d*$/.test(trimmed)) return null
  const [whole = '0', frac = ''] = trimmed.split('.')
  if (frac.length > USDC_DECIMALS) return null
  const combined = BigInt(whole) * BigInt(10 ** USDC_DECIMALS) + BigInt(frac.padEnd(USDC_DECIMALS, '0'))
  return combined
}

/** Parse a seconds duration string like "86400" to bigint */
export function parseSeconds(value: string): bigint | null {
  const n = parseInt(value, 10)
  if (isNaN(n) || n < 0) return null
  return BigInt(n)
}

/** Parse a bps integer string like "500" to bigint */
export function parseBps(value: string): bigint | null {
  const n = parseInt(value, 10)
  if (isNaN(n) || n < 0) return null
  return BigInt(n)
}
