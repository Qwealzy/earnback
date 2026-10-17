/**
 * /agreement/:id — Full agreement detail + all actions.
 */
import React, { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  useAccount, useWriteContract, useWaitForTransactionReceipt, useSwitchChain, useReadContract
} from 'wagmi'
import { toast } from 'sonner'
import { ArrowLeft, ExternalLink } from 'lucide-react'
import { RETENTION_VAULT_ABI } from '@/abi/RetentionVault'
import { VAULT_ADDRESS, CHAIN_ID, txUrl, addrUrl } from '@/app-config'
import { useAgreement, useAgreementAmounts, useWithdrawable } from '@/hooks/useVaultRead'
import { Card, Inner, SectionTitle, DetailRow, Layout } from '@/components/Layout'
import { StateBadge } from '@/components/StateBadge'
import { TxButton } from '@/components/TxButton'
import { Countdown } from '@/components/Countdown'
import {
  fmtUsdc, fmtAddr, fmtDatetime, fmtBps, fmtHash,
  parseUsdcInput, secsUntil, textToBytes32,
} from '@/utils/format'
import { parseOnchainError } from '@/utils/onchainError'

const USDC_ADDR = '0x3600000000000000000000000000000000000000' as `0x${string}`
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

// Contract enums (RetentionVault.sol). Keep in sync with StateBadge.
const S_PROPOSED = 0, S_ACTIVE = 1, S_DEFECT = 2
const C_NONE = 0, C_OPEN = 1, C_DISPUTED = 2
const P_REQUESTED = 1, P_DISPUTED = 2

// Minimal USDC ABI: exact approve and the allowance it creates
const USDC_APPROVE_ABI = [
  {
    type: 'function', name: 'approve',
    inputs: [{ name: 'spender', type: 'address' }, { name: 'value', type: 'uint256' }],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function', name: 'allowance',
    inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
] as const

type ActionKey =
  | 'cancel' | 'accept' | 'signProvisional' | 'pay' | 'finalize'
  | 'openClaim' | 'respondAccept' | 'respondReject' | 'arbiterDecide'
  | 'resolveUnanswered' | 'resolveByDefault'
  | 'objectProvisional' | 'arbiterDecideProvisional_accept' | 'arbiterDecideProvisional_reject'
  | 'resolveProvisional' | 'withdraw'
  | 'approvePay'

export function AgreementPage() {
  const { id } = useParams<{ id: string }>()
  const agreementId = id !== undefined ? BigInt(id) : undefined

  const { address, chainId } = useAccount()
  const wrongChain = !!address && chainId !== CHAIN_ID
  const { switchChain } = useSwitchChain()

  const { data: ag, isLoading, refetch } = useAgreement(agreementId)
  const { data: amounts, refetch: refetchAmounts } = useAgreementAmounts(agreementId)

  const pool = (amounts?.[0].result) ?? 0n
  const available = (amounts?.[1].result) ?? 0n

  const { data: myWithdrawable, refetch: refetchWithdrawable } = useWithdrawable(address)
  const { data: usdcAllowance, refetch: refetchAllowance } = useReadContract({
    address: USDC_ADDR, abi: USDC_APPROVE_ABI, functionName: 'allowance',
    args: [address ?? ZERO_ADDRESS, VAULT_ADDRESS],
    query: { enabled: !!address },
  })

  // Re-render every 5 s so deadline-gated buttons appear without a manual reload
  const [now, setNow] = useState(() => BigInt(Math.floor(Date.now() / 1000)))
  React.useEffect(() => {
    const t = setInterval(() => setNow(BigInt(Math.floor(Date.now() / 1000))), 5000)
    return () => clearInterval(t)
  }, [])

  const { writeContract, data: txHash, isPending, reset: resetWrite } = useWriteContract()
  const { isLoading: isConfirming, isSuccess, isError: isTxError } = useWaitForTransactionReceipt({ hash: txHash })

  const [payAmount, setPayAmount] = useState('')
  const [payRef, setPayRef] = useState('')
  const [claimAmount, setClaimAmount] = useState('')
  const [claimEvidence, setClaimEvidence] = useState('')
  const [arbiterShare, setArbiterShare] = useState('')
  const [objReason, setObjReason] = useState('')
  const [pendingAction, setPendingAction] = useState<ActionKey | null>(null)
  // The action behind the current tx, and the last tx already handled (the effect must act once per tx)
  const lastActionRef = React.useRef<ActionKey | null>(null)
  const handledTxRef = React.useRef<string | undefined>(undefined)

  // eslint-disable-next-line react/set-state-in-effect -- post-tx cleanup, runs once per tx hash
  React.useEffect(() => {
    if (!txHash || handledTxRef.current === txHash) return
    if (isSuccess) {
      handledTxRef.current = txHash
      toast.success('Transaction confirmed')
      void refetch()
      void refetchAmounts()
      void refetchWithdrawable()
      void refetchAllowance()
      setPendingAction(null)
      // Keep the amount after an approve: the next step (Pay Progress) needs the same value
      if (lastActionRef.current !== 'approvePay') {
        setPayAmount('')
        setPayRef('')
      }
      setClaimAmount('')
      setClaimEvidence('')
      setArbiterShare('')
      setObjReason('')
    }
    if (isTxError) {
      handledTxRef.current = txHash
      toast.error('Transaction failed')
    }
  }, [txHash, isSuccess, isTxError, refetch, refetchAmounts, refetchWithdrawable, refetchAllowance])

  function write(action: ActionKey, fn: () => void) {
    lastActionRef.current = action
    setPendingAction(action)
    resetWrite()
    try { fn() } catch (e) { toast.error(parseOnchainError(e)); setPendingAction(null) }
  }

  function txBtn(action: ActionKey, label: string, onClick: () => void, variant: 'primary' | 'secondary' | 'danger' = 'primary') {
    return (
      <TxButton
        key={action}
        label={label}
        onClick={() => write(action, onClick)}
        isPending={isPending && pendingAction === action}
        isConfirming={isConfirming && pendingAction === action}
        isSuccess={isSuccess && pendingAction === action}
        wrongChain={wrongChain}
        onSwitchChain={() => switchChain({ chainId: CHAIN_ID })}
        variant={variant}
      />
    )
  }

  if (isLoading || agreementId === undefined) {
    return (
      <Layout>
        <div className="flex h-48 items-center justify-center">
          <p className="text-sm" style={{ color: 'var(--muted)' }}>Loading agreement #{id}…</p>
        </div>
      </Layout>
    )
  }

  // agreement(id) returns a zeroed struct for unknown ids, so check the payer too
  if (!ag || ag.payer === '0x0000000000000000000000000000000000000000') {
    return (
      <Layout>
        <div className="py-10 text-center">
          <p style={{ color: 'var(--muted)' }}>Agreement #{id} not found.</p>
          <Link to="/" className="mt-3 inline-flex items-center gap-1 text-sm" style={{ color: 'var(--accent)' }}>
            <ArrowLeft className="size-3.5" /> Back to list
          </Link>
        </div>
      </Layout>
    )
  }

  const state = ag.state
  const isPayer = address?.toLowerCase() === ag.payer.toLowerCase()
  const isPayee = address?.toLowerCase() === ag.payee.toLowerCase()
  const isArbiter = address?.toLowerCase() === ag.arbiter.toLowerCase()
  const claimStatus = ag.claim.status
  const provStatus = ag.provisionalStatus
  const hasArbiter = ag.arbiter !== ZERO_ADDRESS
  // Deadline rules mirror the contract: claims open while now < defectEnd, finalize at now >= defectEnd,
  // answers and decisions are valid up to and including the deadline, resolvers need now > deadline.
  const inDefectWindow = state === S_DEFECT && now < ag.defectEnd
  const canFinalize = state === S_DEFECT && claimStatus === C_NONE && now >= ag.defectEnd
  const responseOpen = claimStatus === C_OPEN && now <= ag.claim.responseDeadline
  const responseLapsed = claimStatus === C_OPEN && now > ag.claim.responseDeadline
  const arbiterOpen = claimStatus === C_DISPUTED && hasArbiter && now <= ag.claim.arbiterDeadline
  const arbiterLapsed = claimStatus === C_DISPUTED && (!hasArbiter || now > ag.claim.arbiterDeadline)
  const provRequestOpen = provStatus === P_REQUESTED && now <= ag.provisionalDeadline
  const provArbiterOpen = provStatus === P_DISPUTED && hasArbiter && now <= ag.provisionalArbiterDeadline
  const provResolvable = state === S_ACTIVE && (
    (provStatus === P_REQUESTED && now > ag.provisionalDeadline) ||
    (provStatus === P_DISPUTED && (!hasArbiter || now > ag.provisionalArbiterDeadline))
  )
  const canSignAsPayer = state === S_ACTIVE && isPayer && !ag.payerSigned && provStatus !== P_DISPUTED
  const canSignAsPayee = state === S_ACTIVE && isPayee && !ag.payeeSigned
  const withdrawableAmt = (myWithdrawable) ?? 0n
  const payAmt = parseUsdcInput(payAmount)
  const allowanceCoversPay = payAmt !== null && payAmt > 0n && ((usdcAllowance) ?? 0n) >= payAmt

  // ── helper: text → bytes32 (keccak256 unless already a hex digest) ────
  function toBytes32(s: string): `0x${string}` {
    return textToBytes32(s).hex
  }

  return (
    <Layout>
      <div className="mb-4 flex items-center gap-2">
        <Link to="/" className="inline-flex items-center gap-1 text-sm font-medium" style={{ color: 'var(--muted)' }}>
          <ArrowLeft className="size-3.5" /> Agreements
        </Link>
        <span style={{ color: 'var(--subtle)' }}>/</span>
        <span className="display text-sm font-bold" style={{ color: 'var(--ink)' }}>#{id}</span>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* ── LEFT COLUMN: details ─────────────────────────── */}
        <div className="flex flex-col gap-4 lg:col-span-2">

          {/* State & amounts hero */}
          <Card>
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <p className="display text-2xl font-bold tabular-nums" style={{ color: 'var(--ink)', letterSpacing: '-0.02em' }}>
                  {fmtUsdc(ag.contractValue)}
                </p>
                <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>Contract value</p>
              </div>
              <div className="flex flex-col items-end gap-1.5">
                <StateBadge value={state} type="state" />
                {provStatus > 0 && <StateBadge value={provStatus} type="provisional" />}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <Inner>
                <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--subtle)', letterSpacing: '0.07em' }}>Paid</p>
                <p className="display text-base font-bold tabular-nums" style={{ color: 'var(--ink)' }}>{fmtUsdc(ag.paid)}</p>
              </Inner>
              <Inner>
                <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--subtle)', letterSpacing: '0.07em' }}>Pool</p>
                <p className="display text-base font-bold tabular-nums" style={{ color: 'var(--ink)' }}>{fmtUsdc(pool)}</p>
              </Inner>
              <Inner>
                <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--subtle)', letterSpacing: '0.07em' }}>Available</p>
                <p className="display text-base font-bold tabular-nums" style={{ color: 'var(--ink)' }}>{fmtUsdc(available)}</p>
              </Inner>
            </div>
          </Card>

          {/* Agreement details */}
          <Card>
            <SectionTitle>Details</SectionTitle>
            <DetailRow label="Payer">
              <a href={addrUrl(ag.payer)} target="_blank" rel="noopener noreferrer"
                className="mono inline-flex items-center gap-1" style={{ color: 'var(--ink-2)' }}>
                {fmtAddr(ag.payer)} <ExternalLink className="size-3" />
              </a>
            </DetailRow>
            <DetailRow label="Payee">
              <a href={addrUrl(ag.payee)} target="_blank" rel="noopener noreferrer"
                className="mono inline-flex items-center gap-1" style={{ color: 'var(--ink-2)' }}>
                {fmtAddr(ag.payee)} <ExternalLink className="size-3" />
              </a>
            </DetailRow>
            <DetailRow label="Arbiter">
              <a href={addrUrl(ag.arbiter)} target="_blank" rel="noopener noreferrer"
                className="mono inline-flex items-center gap-1" style={{ color: 'var(--ink-2)' }}>
                {fmtAddr(ag.arbiter)} <ExternalLink className="size-3" />
              </a>
            </DetailRow>
            <DetailRow label="Retention Rate">
              {state >= S_ACTIVE ? fmtBps(ag.retentionBps) : '— (pending acceptance)'}
            </DetailRow>
            <DetailRow label="Max / Min Bps">
              {fmtBps(ag.maxBps)} / {fmtBps(ag.minBps)}
            </DetailRow>
            <DetailRow label="Defect Period">{ag.defectPeriod.toString()}s</DetailRow>
            <DetailRow label="Response Window">{ag.responseWindow.toString()}s</DetailRow>
            <DetailRow label="Arbiter Window">{ag.arbiterWindow.toString()}s</DetailRow>
            <DetailRow label="Payer Signed">{ag.payerSigned ? 'Yes' : 'No'}</DetailRow>
            <DetailRow label="Payee Signed">{ag.payeeSigned ? 'Yes' : 'No'}</DetailRow>
            {ag.defectEnd > 0n && (
              <DetailRow label="Defect End">
                {fmtDatetime(ag.defectEnd)}
                {secsUntil(ag.defectEnd) > 0 && (
                  <Countdown deadline={ag.defectEnd} className="ml-2" />
                )}
              </DetailRow>
            )}
            {ag.releasedToPayee > 0n && (
              <DetailRow label="Released to Payee">{fmtUsdc(ag.releasedToPayee)}</DetailRow>
            )}
            {ag.awardedToPayer > 0n && (
              <DetailRow label="Awarded to Payer">{fmtUsdc(ag.awardedToPayer)}</DetailRow>
            )}
          </Card>

          {/* Claim section */}
          {claimStatus !== C_NONE && (
            <Card>
              <div className="flex items-center justify-between mb-3">
                <SectionTitle>Defect Claim</SectionTitle>
                <StateBadge value={claimStatus} type="claim" />
              </div>
              <DetailRow label="Amount">{fmtUsdc(ag.claim.amount)}</DetailRow>
              <DetailRow label="Evidence Hash">{fmtHash(ag.claim.evidenceHash)}</DetailRow>
              <DetailRow label="Opened At">{fmtDatetime(ag.claim.openedAt)}</DetailRow>
              {ag.claim.responseDeadline > 0n && (
                <DetailRow label="Response Deadline">
                  {fmtDatetime(ag.claim.responseDeadline)}
                  <Countdown deadline={ag.claim.responseDeadline} className="ml-2" expiredLabel="Passed" />
                </DetailRow>
              )}
              {ag.claim.arbiterDeadline > 0n && (
                <DetailRow label="Arbiter Deadline">
                  {fmtDatetime(ag.claim.arbiterDeadline)}
                  <Countdown deadline={ag.claim.arbiterDeadline} className="ml-2" expiredLabel="Passed" />
                </DetailRow>
              )}
              {ag.upheld && <DetailRow label="Upheld">Yes</DetailRow>}
            </Card>
          )}

          {/* Provisional section */}
          {provStatus > 0 && (
            <Card>
              <SectionTitle>Provisional Acceptance</SectionTitle>
              <DetailRow label="Status"><StateBadge value={provStatus} type="provisional" /></DetailRow>
              {ag.provisionalDeadline > 0n && (
                <DetailRow label="Deadline">
                  {fmtDatetime(ag.provisionalDeadline)}
                  <Countdown deadline={ag.provisionalDeadline} className="ml-2" expiredLabel="Passed" />
                </DetailRow>
              )}
              {ag.provisionalArbiterDeadline > 0n && (
                <DetailRow label="Arbiter Deadline">
                  {fmtDatetime(ag.provisionalArbiterDeadline)}
                  <Countdown deadline={ag.provisionalArbiterDeadline} className="ml-2" expiredLabel="Passed" />
                </DetailRow>
              )}
              {ag.provisionalObjectionHash !== '0x' + '0'.repeat(64) && (
                <DetailRow label="Objection Hash">{fmtHash(ag.provisionalObjectionHash)}</DetailRow>
              )}
            </Card>
          )}
        </div>

        {/* ── RIGHT COLUMN: actions ─────────────────────────── */}
        <div className="flex flex-col gap-4">
          <Card>
            <SectionTitle>Actions</SectionTitle>

            {!address && (
              <p className="text-sm" style={{ color: 'var(--muted)' }}>Connect wallet to act.</p>
            )}

            {address && (
              <div className="flex flex-col gap-3">

                {/* Proposed: payer may cancel, payee accepts (rate is frozen at acceptance) */}
                {state === S_PROPOSED && isPayer && txBtn('cancel', 'Cancel Proposal', () => writeContract({
                  address: VAULT_ADDRESS, abi: RETENTION_VAULT_ABI,
                  functionName: 'cancelProposal', args: [agreementId],
                }), 'danger')}

                {state === S_PROPOSED && isPayee && txBtn('accept', 'Accept Agreement', () => writeContract({
                  address: VAULT_ADDRESS, abi: RETENTION_VAULT_ABI,
                  functionName: 'acceptAgreement', args: [agreementId],
                }))}

                {/* Active: payer pays progress (exact approve first) */}
                {state === S_ACTIVE && isPayer && (
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--subtle)', letterSpacing: '0.07em' }}>
                      Pay amount (USDC)
                    </label>
                    <input
                      className="w-full rounded-xl border px-3.5 py-2.5 text-sm outline-none focus:border-[var(--accent)] mono"
                      style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)', color: 'var(--ink)' }}
                      placeholder="100.00"
                      value={payAmount}
                      onChange={e => setPayAmount(e.target.value)}
                    />
                    <input
                      className="w-full rounded-xl border px-3.5 py-2.5 text-sm outline-none focus:border-[var(--accent)] mono"
                      style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)', color: 'var(--ink)' }}
                      placeholder="Payment ref (text or 0x bytes32)"
                      value={payRef}
                      onChange={e => setPayRef(e.target.value)}
                    />
                    {/* Step 1 until the allowance covers the amount, then step 2 */}
                    {!allowanceCoversPay && txBtn('approvePay', 'Step 1 of 2: Approve ' + (payAmount ? '$' + payAmount : 'USDC') + ' (exact)', () => {
                      const amt = parseUsdcInput(payAmount)
                      if (!amt) return toast.error('Enter an amount first')
                      writeContract({ address: USDC_ADDR, abi: USDC_APPROVE_ABI, functionName: 'approve', args: [VAULT_ADDRESS, amt] })
                    }, 'secondary')}
                    {allowanceCoversPay && txBtn('pay', 'Step 2 of 2: Pay Progress', () => {
                      const amt = parseUsdcInput(payAmount)
                      if (!amt) return toast.error('Invalid amount')
                      writeContract({
                        address: VAULT_ADDRESS, abi: RETENTION_VAULT_ABI,
                        functionName: 'payProgress', args: [agreementId, amt, toBytes32(payRef)],
                      })
                    })}
                  </div>
                )}

                {/* Active: provisional acceptance. Payee signing first starts the payer's deadline (D10). */}
                {canSignAsPayee && txBtn('signProvisional', ag.payerSigned ? 'Sign Provisional Acceptance' : 'Request Provisional Acceptance', () => writeContract({
                  address: VAULT_ADDRESS, abi: RETENTION_VAULT_ABI,
                  functionName: 'signProvisional', args: [agreementId],
                }))}
                {canSignAsPayer && txBtn('signProvisional', 'Sign Provisional Acceptance', () => writeContract({
                  address: VAULT_ADDRESS, abi: RETENTION_VAULT_ABI,
                  functionName: 'signProvisional', args: [agreementId],
                }))}

                {/* Active: payer may object to a provisional request before its deadline */}
                {state === S_ACTIVE && isPayer && provRequestOpen && (
                  <div className="flex flex-col gap-2">
                    <div>
                      <input
                        className="w-full rounded-xl border px-3.5 py-2.5 text-sm outline-none focus:border-[var(--accent)] mono"
                        style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)', color: 'var(--ink)' }}
                        placeholder="Reason hash (0x…64) or text to hash"
                        value={objReason}
                        onChange={e => setObjReason(e.target.value)}
                      />
                      <span className="text-xs mt-0.5" style={{ color: 'var(--subtle)' }}>
                        {objReason && !(/^0x[0-9a-fA-F]{64}$/.test(objReason.trim()))
                          ? 'Will store keccak256 of this text on-chain'
                          : 'Enter a 0x bytes32 hash, or type any text to hash it'}
                      </span>
                      <Link to="/tools/hash" className="text-xs mt-0.5 inline-block hover:underline" style={{ color: 'var(--muted)' }}>
                        Need a hash? Use the hash tool →
                      </Link>
                    </div>
                    {txBtn('objectProvisional', 'Object', () => writeContract({
                      address: VAULT_ADDRESS, abi: RETENTION_VAULT_ABI,
                      functionName: 'objectProvisional', args: [agreementId, toBytes32(objReason)],
                    }), 'danger')}
                  </div>
                )}

                {/* Active: arbiter decides a provisional objection */}
                {state === S_ACTIVE && isArbiter && provArbiterOpen && (
                  <div className="flex flex-col gap-2">
                    {txBtn('arbiterDecideProvisional_accept', 'Decide: Accept', () => writeContract({
                      address: VAULT_ADDRESS, abi: RETENTION_VAULT_ABI,
                      functionName: 'arbiterDecideProvisional', args: [agreementId, true],
                    }))}
                    {txBtn('arbiterDecideProvisional_reject', 'Decide: Reject', () => writeContract({
                      address: VAULT_ADDRESS, abi: RETENTION_VAULT_ABI,
                      functionName: 'arbiterDecideProvisional', args: [agreementId, false],
                    }), 'danger')}
                  </div>
                )}

                {/* Active: anyone resolves a lapsed provisional request or objection (deemed acceptance) */}
                {provResolvable && txBtn('resolveProvisional', 'Resolve Provisional (deemed accepted)', () => writeContract({
                  address: VAULT_ADDRESS, abi: RETENTION_VAULT_ABI,
                  functionName: 'resolveProvisional', args: [agreementId],
                }))}

                {/* Defect period: payer opens a claim before defectEnd */}
                {inDefectWindow && isPayer && claimStatus === C_NONE && (
                  <div className="flex flex-col gap-2 mt-1">
                    <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--subtle)', letterSpacing: '0.07em' }}>Open Defect Claim</p>
                    <input
                      className="w-full rounded-xl border px-3.5 py-2.5 text-sm outline-none focus:border-[var(--accent)] mono"
                      style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)', color: 'var(--ink)' }}
                      placeholder={'Claim amount (USDC, max ' + fmtUsdc(available) + ')'}
                      value={claimAmount}
                      onChange={e => setClaimAmount(e.target.value)}
                    />
                    <div>
                      <input
                        className="w-full rounded-xl border px-3.5 py-2.5 text-sm outline-none focus:border-[var(--accent)] mono"
                        style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)', color: 'var(--ink)' }}
                        placeholder="Evidence hash (0x…64) or text to hash"
                        value={claimEvidence}
                        onChange={e => setClaimEvidence(e.target.value)}
                      />
                      <span className="text-xs mt-0.5" style={{ color: 'var(--subtle)' }}>
                        {claimEvidence && !(/^0x[0-9a-fA-F]{64}$/.test(claimEvidence.trim()))
                          ? 'Will store keccak256 of this text on-chain'
                          : 'Enter a 0x bytes32 hash, or type any text to hash it'}
                      </span>
                      <Link to="/tools/hash" className="text-xs mt-0.5 inline-block hover:underline" style={{ color: 'var(--muted)' }}>
                        Need a hash? Use the hash tool →
                      </Link>
                    </div>
                    {txBtn('openClaim', 'Open Claim', () => {
                      const amt = parseUsdcInput(claimAmount)
                      if (!amt) return toast.error('Invalid claim amount')
                      if (amt > available) return toast.error(`Claim exceeds the available retention (${fmtUsdc(available)})`)
                      writeContract({
                        address: VAULT_ADDRESS, abi: RETENTION_VAULT_ABI,
                        functionName: 'openClaim',
                        args: [agreementId, amt, toBytes32(claimEvidence)],
                      })
                    }, 'danger')}
                  </div>
                )}

                {/* Open claim: payee answers up to the response deadline */}
                {isPayee && responseOpen && (
                  <div className="flex flex-col gap-2">
                    {txBtn('respondAccept', 'Accept Claim', () => writeContract({
                      address: VAULT_ADDRESS, abi: RETENTION_VAULT_ABI,
                      functionName: 'respondClaim', args: [agreementId, true],
                    }))}
                    {txBtn('respondReject', 'Reject Claim', () => writeContract({
                      address: VAULT_ADDRESS, abi: RETENTION_VAULT_ABI,
                      functionName: 'respondClaim', args: [agreementId, false],
                    }), 'danger')}
                  </div>
                )}

                {/* Disputed claim: arbiter splits the claim amount up to the arbiter deadline */}
                {isArbiter && arbiterOpen && (
                  <div className="flex flex-col gap-2">
                    <input
                      className="w-full rounded-xl border px-3.5 py-2.5 text-sm outline-none focus:border-[var(--accent)] mono"
                      style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)', color: 'var(--ink)' }}
                      placeholder="Payer share (USDC, 0 = all back to payee)"
                      value={arbiterShare}
                      onChange={e => setArbiterShare(e.target.value)}
                    />
                    {txBtn('arbiterDecide', 'Decide', () => {
                      const amt = parseUsdcInput(arbiterShare)
                      if (amt === null) return toast.error('Invalid share')
                      writeContract({
                        address: VAULT_ADDRESS, abi: RETENTION_VAULT_ABI,
                        functionName: 'arbiterDecide', args: [agreementId, amt],
                      })
                    })}
                  </div>
                )}

                {/* Permissionless resolvers */}
                {responseLapsed && txBtn('resolveUnanswered', 'Resolve Unanswered (claim accepted)', () => writeContract({
                  address: VAULT_ADDRESS, abi: RETENTION_VAULT_ABI,
                  functionName: 'resolveUnanswered', args: [agreementId],
                }))}

                {arbiterLapsed && txBtn('resolveByDefault', 'Resolve By Default (back to payee)', () => writeContract({
                  address: VAULT_ADDRESS, abi: RETENTION_VAULT_ABI,
                  functionName: 'resolveByDefault', args: [agreementId],
                }))}

                {canFinalize && txBtn('finalize', 'Finalize', () => writeContract({
                  address: VAULT_ADDRESS, abi: RETENTION_VAULT_ABI,
                  functionName: 'finalize', args: [agreementId],
                }))}

                {/* Pull payment: any account with a balance withdraws it */}
                {withdrawableAmt > 0n && txBtn('withdraw', `Withdraw ${fmtUsdc(withdrawableAmt)}`, () => writeContract({
                  address: VAULT_ADDRESS, abi: RETENTION_VAULT_ABI,
                  functionName: 'withdraw', args: [],
                }))}

              </div>
            )}
          </Card>

          {/* Payee record link */}
          <Card>
            <SectionTitle>Payee Record</SectionTitle>
            <Link
              to={`/record/${ag.payee}`}
              className="inline-flex items-center gap-1 text-sm font-medium"
              style={{ color: 'var(--accent)' }}
            >
              View {fmtAddr(ag.payee)}'s track record
              <ExternalLink className="size-3.5" />
            </Link>
          </Card>

          {/* Explorer link — kept here to replace the removed withdraw card tail */}
          {txHash && (
            <Inner>
              <p className="text-xs mb-1" style={{ color: 'var(--subtle)' }}>Last transaction</p>
              <a href={txUrl(txHash)} target="_blank" rel="noopener noreferrer"
                className="mono inline-flex items-center gap-1 text-xs break-all" style={{ color: 'var(--muted)' }}>
                {txHash.slice(0, 18)}… <ExternalLink className="size-3" />
              </a>
            </Inner>
          )}
        </div>
      </div>
    </Layout>
  )
}
