/**
 * useAgreementList: reads agreements by sequential id via multicall.
 * Probes batches of 20 ids at a time; stops when payer === zero address.
 * Much faster and cheaper than a full event-log scan.
 */
import { useState, useCallback, useEffect, useRef } from 'react'
import { useReadContracts } from 'wagmi'
import { RETENTION_VAULT_ABI } from '@/abi/RetentionVault'
import { VAULT_ADDRESS, CHAIN_ID } from '@/app-config'

const ZERO = '0x0000000000000000000000000000000000000000'
const BATCH = 20

export interface AgreementSummary {
  id: bigint
  payer: `0x${string}`
  payee: `0x${string}`
  contractValue: bigint
  state: number
}

// ─── low-level: probe a batch of ids ──────────────────────────────────────
function useBatch(ids: bigint[], enabled: boolean) {
  return useReadContracts({
    contracts: ids.map(id => ({
      address: VAULT_ADDRESS,
      abi: RETENTION_VAULT_ABI,
      functionName: 'agreement' as const,
      args: [id] as const,
      chainId: CHAIN_ID,
    })),
    query: { enabled: enabled && ids.length > 0 },
  })
}

// ─── main hook ────────────────────────────────────────────────────────────
export function useAgreementList() {
  const [list, setList] = useState<AgreementSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // how many batches we've committed to probing
  const [batchCount, setBatchCount] = useState(1)
  const [done, setDone] = useState(false)
  // generation counter: incrementing forces a full re-probe (used by refresh)
  const [gen, setGen] = useState(0)

  const refresh = useCallback(() => {
    setList([])
    setLoading(true)
    setError(null)
    setBatchCount(1)
    setDone(false)
    setGen(g => g + 1)
  }, [])

  // build the ids for the current generation's batches
  const ids = done ? [] : Array.from({ length: batchCount * BATCH }, (_, i) => BigInt(i))

  const { data, isLoading, isError } = useBatch(ids, !done)

  // ref to prevent stale-closure issues in the effect
  const batchCountRef = useRef(batchCount)
  useEffect(() => { batchCountRef.current = batchCount }, [batchCount])

  useEffect(() => {
    if (isLoading || !data) return
    if (isError) {
      setError('Failed to load agreements')
      setLoading(false)
      return
    }

    const summaries: AgreementSummary[] = []
    let foundEnd = false

    for (let i = 0; i < data.length; i++) {
      const result = data[i]
      if (result.status !== 'success' || !result.result) continue
      // wagmi decodes the struct fields — check payer
      const ag = result.result as {
        payer: `0x${string}`
        payee: `0x${string}`
        contractValue: bigint
        state: number
      }
      if (!ag.payer || ag.payer === ZERO) {
        foundEnd = true
        break
      }
      summaries.push({
        id: BigInt(i),
        payer: ag.payer,
        payee: ag.payee,
        contractValue: ag.contractValue,
        state: ag.state,
      })
    }

    if (foundEnd || data.length < batchCountRef.current * BATCH) {
      // All agreements found — done
      setList([...summaries].reverse()) // newest first
      setDone(true)
      setLoading(false)
    } else {
      // Full batch was non-zero: probe one more batch
      setBatchCount(c => c + 1)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, isLoading, isError, gen])

  return { list, loading, error, refresh }
}
