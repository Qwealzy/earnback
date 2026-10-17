/**
 * Typed wagmi hooks for reading RetentionVault state.
 */
import { useReadContract, useReadContracts } from 'wagmi'
import { RETENTION_VAULT_ABI } from '@/abi/RetentionVault'
import { VAULT_ADDRESS, CHAIN_ID } from '@/app-config'

const vaultBase = {
  address: VAULT_ADDRESS,
  abi: RETENTION_VAULT_ABI,
  chainId: CHAIN_ID,
} as const

// ─── single agreement ──────────────────────────────────────────────────────
export function useAgreement(id: bigint | undefined) {
  return useReadContract({
    ...vaultBase,
    functionName: 'agreement',
    args: id !== undefined ? [id] : undefined,
    query: { enabled: id !== undefined },
  })
}

// ─── pool / available for one agreement ───────────────────────────────────
export function useAgreementAmounts(id: bigint | undefined) {
  return useReadContracts({
    contracts: [
      { ...vaultBase, functionName: 'pool', args: id !== undefined ? [id] : [0n] },
      { ...vaultBase, functionName: 'available', args: id !== undefined ? [id] : [0n] },
    ],
    query: { enabled: id !== undefined },
  })
}

// ─── payee record + credibility ───────────────────────────────────────────
export function usePayeeRecord(payee: `0x${string}` | undefined) {
  return useReadContracts({
    contracts: [
      { ...vaultBase, functionName: 'record', args: payee ? [payee] : ['0x0000000000000000000000000000000000000000'] },
      { ...vaultBase, functionName: 'credibilityWad', args: payee ? [payee] : ['0x0000000000000000000000000000000000000000'] },
    ],
    query: { enabled: !!payee },
  })
}

// ─── global vault params ──────────────────────────────────────────────────
export function useVaultParams() {
  return useReadContracts({
    contracts: [
      { ...vaultBase, functionName: 'priorA' },
      { ...vaultBase, functionName: 'priorB' },
      { ...vaultBase, functionName: 'zWad' },
      { ...vaultBase, functionName: 'capBps' },
      { ...vaultBase, functionName: 'floorBps' },
      { ...vaultBase, functionName: 'maxAgreementValue' },
      { ...vaultBase, functionName: 'maxTotalHeld' },
      { ...vaultBase, functionName: 'minRecordValue' },
      { ...vaultBase, functionName: 'totalHeld' },
    ],
  })
}

// ─── withdrawable balance for connected wallet ────────────────────────────
export function useWithdrawable(address: `0x${string}` | undefined) {
  return useReadContract({
    ...vaultBase,
    functionName: 'withdrawable',
    args: address ? [address] : ['0x0000000000000000000000000000000000000000'],
    query: { enabled: !!address },
  })
}

// ─── vault-level stats: params that appear on the proof page ────────────────
// (totalPaidIn / totalWithdrawn are not in the ABI; derive from event log scan)
export function useVaultGlobals() {
  return useReadContracts({
    contracts: [
      { ...vaultBase, functionName: 'totalHeld' },
      { ...vaultBase, functionName: 'maxTotalHeld' },
      { ...vaultBase, functionName: 'priorA' },
      { ...vaultBase, functionName: 'priorB' },
      { ...vaultBase, functionName: 'zWad' },
      { ...vaultBase, functionName: 'capBps' },
      { ...vaultBase, functionName: 'floorBps' },
    ],
  })
}

// ─── rateFor preview ──────────────────────────────────────────────────────
export function useRateFor(payee: `0x${string}` | undefined, maxBps: bigint | undefined) {
  return useReadContract({
    ...vaultBase,
    functionName: 'rateFor',
    args:
      payee && maxBps !== undefined
        ? [payee, maxBps]
        : ['0x0000000000000000000000000000000000000000', 0n],
    query: { enabled: !!payee && maxBps !== undefined },
  })
}
