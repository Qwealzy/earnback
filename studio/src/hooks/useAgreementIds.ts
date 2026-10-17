/**
 * React hooks that sit on top of the shared vaultScanner singleton.
 * All event-log reads go through one serialised queue with rate-limit backoff.
 */
import { useEffect, useState, useCallback, useRef } from 'react'
import { vaultScanner, type AgreementLog, type ScanProgress, type ScanResults } from '@/lib/vaultScanner'

// Re-export so callers that imported AgreementSummary keep working
export type AgreementSummary = AgreementLog
export type { ScanResults }

// ─── useVaultScan: master hook — all pages use this ──────────────────────────
export interface VaultScanState {
  agreements: AgreementLog[]
  totalPaidIn: bigint
  totalWithdrawn: bigint
  loading: boolean
  error: string | null
  progress: ScanProgress | null
  refresh: () => void
}

export function useVaultScan(): VaultScanState {
  const [state, setState] = useState<VaultScanState>({
    agreements: [],
    totalPaidIn: 0n,
    totalWithdrawn: 0n,
    loading: true,
    error: null,
    progress: null,
    refresh: () => { /* filled in below */ },
  })

  const runScan = useCallback((force = false) => {
    setState(s => ({ ...s, loading: true, error: null }))

    const promise = force ? vaultScanner.refresh() : vaultScanner.scan()

    const onProgress = (p: ScanProgress) => {
      setState(s => ({ ...s, progress: p }))
    }
    vaultScanner.subscribe(onProgress)

    promise
      .then((results: ScanResults) => {
        setState(s => ({
          ...s,
          agreements: results.agreements,
          totalPaidIn: results.totalPaidIn,
          totalWithdrawn: results.totalWithdrawn,
          loading: false,
          error: null,
          progress: null,
        }))
      })
      .catch((e: unknown) => {
        const raw = String(e)
        const friendly = raw.toLowerCase().includes('rate limit') || raw.toLowerCase().includes('429')
          ? 'RPC rate limit reached — retrying automatically…'
          : raw.replace(/^Error:\s*/i, '')
        setState(s => ({ ...s, loading: false, error: friendly }))
      })
      .finally(() => {
        vaultScanner.unsubscribe(onProgress)
      })
  }, [])

  const refresh = useCallback(() => { runScan(true) }, [runScan])

  // Store refresh in a ref so the effect below can reference it without
  // including it in the dep array (avoids infinite re-scan loop).
  const refreshRef = useRef(refresh)
  useEffect(() => { refreshRef.current = refresh }, [refresh])

  useEffect(() => {
    // If cache is already warm, populate synchronously (still inside effect, not render)
    const cached = vaultScanner.getCached()
    if (cached) {
      setState(s => ({
        ...s,
        agreements: cached.agreements,
        totalPaidIn: cached.totalPaidIn,
        totalWithdrawn: cached.totalWithdrawn,
        loading: false,
        error: null,
        progress: null,
        refresh: refreshRef.current,
      }))
    } else {
      setState(s => ({ ...s, refresh: refreshRef.current }))
      runScan(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runScan])

  return state
}

// ─── useAgreementIds: backward-compat shim ────────────────────────────────────
export function useAgreementIds() {
  const { agreements, loading, error, progress, refresh } = useVaultScan()
  return { summaries: agreements, loading, error, progress, refresh }
}

// ─── useVaultEventTotals: backward-compat shim ────────────────────────────────
export interface VaultEventTotals {
  totalPaidIn: bigint
  totalWithdrawn: bigint
  loading: boolean
  error: string | null
}

export function useVaultEventTotals(): VaultEventTotals {
  const { totalPaidIn, totalWithdrawn, loading, error } = useVaultScan()
  return { totalPaidIn, totalWithdrawn, loading, error }
}
