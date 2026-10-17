/**
 * Shared singleton event-log scanner for RetentionVault.
 *
 * Rules enforced here:
 *  - ONE public client, ONE request queue — never parallel getLogs calls.
 *  - 10,000-block ranges per request.
 *  - 300 ms pause between every request.
 *  - Exponential backoff on rate-limit errors (up to 5 retries: 1s, 2s, 4s, 8s, 16s).
 *  - In-memory cache: a completed full scan is reused by all callers.
 *  - Progress callbacks so UI can show readable progress.
 *
 * Usage:
 *   const results = await vaultScanner.scan()
 *   vaultScanner.subscribe(cb) / vaultScanner.unsubscribe(cb)
 */

import { createPublicClient, http, fallback, parseAbiItem, type AbiEvent } from 'viem'
import { arc, arcTestnet } from 'viem/chains'
import { DEPLOY_BLOCK, CHAIN_ID, VAULT_ADDRESS, SCAN_RPCS } from '@/app-config'

// ─── client (single instance) ────────────────────────────────────────────────
// For log scanning: quicknode first (tested with 10 k-block ranges), then the
// public primary. dRPC is excluded here — its free plan rejects eth_getLogs.
const viemChain = CHAIN_ID === 5042 ? arc : arcTestnet
const scanTransport = fallback(SCAN_RPCS.map(url => http(url)))
const client = createPublicClient({ chain: viemChain, transport: scanTransport })

// ─── ABI items ───────────────────────────────────────────────────────────────
export const EV_AGREEMENT_CREATED = parseAbiItem(
  'event AgreementCreated(uint256 indexed id, address indexed payer, address indexed payee, address arbiter, uint256 contractValue)'
)
export const EV_PROGRESS_PAID = parseAbiItem(
  'event ProgressPaid(uint256 indexed id, uint256 amount, uint256 cut, bytes32 ref)'
)
export const EV_WITHDRAWN = parseAbiItem(
  'event Withdrawn(address indexed payee, uint256 amount)'
)

// ─── types ────────────────────────────────────────────────────────────────────
export interface ScanProgress {
  scanned: bigint
  head: bigint
  done: boolean
}

export interface ScanResults {
  agreements: AgreementLog[]
  totalPaidIn: bigint
  totalWithdrawn: bigint
}

export interface AgreementLog {
  id: bigint
  payer: `0x${string}`
  payee: `0x${string}`
  arbiter: `0x${string}`
  contractValue: bigint
  blockNumber: bigint
}

type ProgressCallback = (p: ScanProgress) => void

// ─── constants ────────────────────────────────────────────────────────────────
const BATCH = 9_500n   // quicknode testnet cap is ~9,800; 9,500 gives a safe margin
const PAUSE_MS = 300
const MAX_RETRIES = 5

// ─── module-level state ───────────────────────────────────────────────────────
let cache: ScanResults | null = null
let scanPromise: Promise<ScanResults> | null = null
const subscribers = new Set<ProgressCallback>()

function notify(p: ScanProgress) {
  subscribers.forEach(cb => cb(p))
}

// ─── sleep helper ─────────────────────────────────────────────────────────────
function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}

// ─── rate-limit aware getLogs ─────────────────────────────────────────────────
function isRateLimit(e: unknown): boolean {
  const msg = String(e).toLowerCase()
  return msg.includes('rate limit') || msg.includes('429') || msg.includes('limitexceeded')
    || msg.includes('too many requests') || msg.includes('ratelimit')
}

interface ScanParams {
  address: `0x${string}`
  event: AbiEvent
  fromBlock: bigint
  toBlock: bigint
}

async function getLogsWithRetry(params: ScanParams) {
  let attempt = 0
  while (true) {
    try {
      return await client.getLogs(params)
    } catch (e) {
      attempt++
      if (!isRateLimit(e) || attempt > MAX_RETRIES) throw e
      const wait = Math.min(1000 * 2 ** (attempt - 1), 30_000)
      await sleep(wait)
    }
  }
}

// ─── core scan ────────────────────────────────────────────────────────────────
async function runScan(): Promise<ScanResults> {
  const head = await client.getBlockNumber()
  const from = BigInt(DEPLOY_BLOCK)

  const agreements: AgreementLog[] = []
  let totalPaidIn = 0n
  let totalWithdrawn = 0n

  for (let cur = from; cur <= head; cur += BATCH) {
    const to = cur + BATCH - 1n < head ? cur + BATCH - 1n : head

    notify({ scanned: cur, head, done: false })

    // ── AgreementCreated ──────────────────────────────────────────────────
    const createdLogs = await getLogsWithRetry({
      address: VAULT_ADDRESS,
      event: EV_AGREEMENT_CREATED,
      fromBlock: cur,
      toBlock: to,
    })
    await sleep(PAUSE_MS)

    for (const log of createdLogs) {
      const args = (log as { args?: Partial<AgreementLog & { id: bigint }> }).args ?? {}
      if (args.id !== undefined) {
        agreements.push({
          id: args.id,
          payer: args.payer ?? '0x0000000000000000000000000000000000000000',
          payee: args.payee ?? '0x0000000000000000000000000000000000000000',
          arbiter: args.arbiter ?? '0x0000000000000000000000000000000000000000',
          contractValue: args.contractValue ?? 0n,
          blockNumber: log.blockNumber ?? 0n,
        })
      }
    }

    // ── ProgressPaid ─────────────────────────────────────────────────────
    const paidLogs = await getLogsWithRetry({
      address: VAULT_ADDRESS,
      event: EV_PROGRESS_PAID,
      fromBlock: cur,
      toBlock: to,
    })
    await sleep(PAUSE_MS)

    for (const log of paidLogs) {
      const args = (log as { args?: { amount?: bigint } }).args ?? {}
      if (args.amount !== undefined) totalPaidIn += args.amount
    }

    // ── Withdrawn ────────────────────────────────────────────────────────
    const wdrLogs = await getLogsWithRetry({
      address: VAULT_ADDRESS,
      event: EV_WITHDRAWN,
      fromBlock: cur,
      toBlock: to,
    })
    await sleep(PAUSE_MS)

    for (const log of wdrLogs) {
      const args = (log as { args?: { amount?: bigint } }).args ?? {}
      if (args.amount !== undefined) totalWithdrawn += args.amount
    }
  }

  agreements.sort((a, b) => (a.id < b.id ? 1 : a.id > b.id ? -1 : 0))

  const results: ScanResults = { agreements, totalPaidIn, totalWithdrawn }
  cache = results
  notify({ scanned: head, head, done: true })
  return results
}

// ─── public API ───────────────────────────────────────────────────────────────
export const vaultScanner = {
  /** Returns cached results immediately, or starts/joins a scan in progress. */
  scan(): Promise<ScanResults> {
    if (cache) return Promise.resolve(cache)
    if (scanPromise) return scanPromise
    scanPromise = runScan().finally(() => { scanPromise = null })
    return scanPromise
  },

  /** Force a fresh scan (e.g. after user creates a new agreement). */
  refresh(): Promise<ScanResults> {
    cache = null
    scanPromise = null
    return this.scan()
  },

  subscribe(cb: ProgressCallback) { subscribers.add(cb) },
  unsubscribe(cb: ProgressCallback) { subscribers.delete(cb) },

  /** Synchronously read the last cached results without triggering a scan. */
  getCached(): ScanResults | null { return cache },
}
