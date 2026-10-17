/**
 * / — Agreement list + Create Agreement form.
 * Includes Demo / Real presets and a live rate preview using the BigInt replica.
 * Agreement list reads agreement(id) via multicall, newest-first, no event scan.
 */
import React, { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useSwitchChain, useReadContracts } from 'wagmi'
import { toast } from 'sonner'
import { Plus, RefreshCw, ExternalLink, ChevronRight } from 'lucide-react'
import { RETENTION_VAULT_ABI } from '@/abi/RetentionVault'
import { VAULT_ADDRESS, CHAIN_ID, txUrl } from '@/app-config'
import { useAgreementList } from '@/hooks/useAgreementList'
import { useVaultParams } from '@/hooks/useVaultRead'
import { Card, Inner, SectionTitle, Layout } from '@/components/Layout'
import { StateBadge } from '@/components/StateBadge'
import { TxButton } from '@/components/TxButton'
import { fmtUsdc, fmtAddr, fmtBps, parseUsdcInput, parseSeconds, parseBps } from '@/utils/format'
import { parseOnchainError } from '@/utils/onchainError'
import { computeRateFor, computeCredibilityWad, type VaultParams } from '@/utils/rateCalc'

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'
const WAD = 10n ** 18n

interface CreateForm {
  payee: string
  arbiter: string
  contractValue: string
  maxBps: string
  minBps: string
  defectPeriod: string
  responseWindow: string
  arbiterWindow: string
}

type Preset = 'demo' | 'real' | 'custom'

// maxAgreementValue on testnet = 50 USDC; use safe values that never hit the cap.
const DEMO_PRESET: Omit<CreateForm, 'payee' | 'arbiter'> = {
  contractValue: '2.00',
  maxBps: '500',
  minBps: '100',
  defectPeriod: '600',        // 10 min
  responseWindow: '180',      // 3 min
  arbiterWindow: '180',       // 3 min
}

const REAL_PRESET: Omit<CreateForm, 'payee' | 'arbiter'> = {
  contractValue: '50.00',     // at the contract cap; reduce if needed
  maxBps: '500',
  minBps: '100',
  defectPeriod: '31536000',  // 365 days
  responseWindow: '1209600', // 14 days
  arbiterWindow: '1209600',  // 14 days
}

const DEFAULTS: CreateForm = {
  payee: '',
  arbiter: '',
  ...DEMO_PRESET,
}

function isAddress(s: string): s is `0x${string}` {
  return /^0x[0-9a-fA-F]{40}$/.test(s)
}

function fmtWad(wad: bigint) { return (Number(wad) / Number(WAD)).toFixed(4) }

// ─── vaultBase for multicall reads ────────────────────────────────────────
const vaultBase = { address: VAULT_ADDRESS, abi: RETENTION_VAULT_ABI, chainId: CHAIN_ID } as const

export function AgreementsPage() {
  const { address, chainId } = useAccount()
  const wrongChain = !!address && chainId !== CHAIN_ID
  const { switchChain } = useSwitchChain()

  const { list: summaries, loading, error, refresh } = useAgreementList()
  const { data: paramsData } = useVaultParams()

  const maxAgreementValue = (paramsData?.[5].result) ?? 0n
  const maxTotalHeld = (paramsData?.[6].result) ?? 0n
  const totalHeld = (paramsData?.[8].result) ?? 0n

  const priorA = (paramsData?.[0].result) ?? 0n
  const priorB = (paramsData?.[1].result) ?? 0n
  const zWad = (paramsData?.[2].result) ?? WAD
  const capBps = (paramsData?.[3].result) ?? 0n
  const floorBps = (paramsData?.[4].result) ?? 0n

  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState<CreateForm>(DEFAULTS)
  const [formError, setFormError] = useState<string | null>(null)
  const [preset, setPreset] = useState<Preset>('demo')

  const { writeContract, data: txHash, isPending } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash })

  // eslint-disable-next-line react/set-state-in-effect -- post-tx cleanup, guarded by isSuccess flag
  React.useEffect(() => {
    if (isSuccess) {
      toast.success('Agreement created!')
      setForm(DEFAULTS)
      setShowCreate(false)
      void refresh()
    }
  }, [isSuccess, refresh])

  // ── Payee record lookup (B8) ──────────────────────────────────────────
  const validPayee = isAddress(form.payee) ? form.payee : undefined
  const previewMaxBps = parseBps(form.maxBps) ?? 500n
  const { data: payeeData } = useReadContracts({
    contracts: [
      { ...vaultBase, functionName: 'record' as const, args: [validPayee ?? ZERO_ADDRESS] },
      { ...vaultBase, functionName: 'rateFor' as const, args: [validPayee ?? ZERO_ADDRESS, previewMaxBps] },
    ],
    query: { enabled: !!validPayee && priorA > 0n },
  })

  // ── Live rate preview ────────────────────────────────────────────────
  const vaultParams: VaultParams = useMemo(
    () => ({ priorA, priorB, zWad, capBps, floorBps }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [priorA.toString(), priorB.toString(), zWad.toString(), capBps.toString(), floorBps.toString()]
  )
  const previewValue = parseUsdcInput(form.contractValue) ?? 0n

  // Use payee's actual record if available, else fall back to n=0
  const payeeRecord = useMemo(() => {
    if (!payeeData?.[0] || payeeData[0].status !== 'success') return { n: 0n, k: 0n }
    const t = payeeData[0].result as readonly [bigint, bigint] | undefined
    if (!t) return { n: 0n, k: 0n }
    return { n: t[0], k: t[1] }
  }, [payeeData])

  const chainRate = useMemo(() => {
    if (!payeeData?.[1] || payeeData[1].status !== 'success') return undefined
    return payeeData[1].result
  }, [payeeData])

  const previewRate = useMemo(() => {
    if (priorA === 0n) return undefined
    // If payee address is valid, use replica with their record; else use n=0
    const rec = validPayee ? payeeRecord : { n: 0n, k: 0n }
    return computeRateFor(vaultParams, rec, previewMaxBps)
  }, [vaultParams, payeeRecord, previewMaxBps, priorA, validPayee])

  const credibilityWad = useMemo(() => {
    if (priorA === 0n) return 0n
    return computeCredibilityWad(vaultParams, payeeRecord.n)
  }, [vaultParams, payeeRecord.n, priorA])

  const previewRetained = previewRate !== undefined && previewValue > 0n
    ? (previewValue * previewRate) / 10000n
    : undefined

  const previewReleased = previewRetained !== undefined && previewValue > 0n
    ? previewValue - previewRetained
    : undefined

  const capitalFreedPct = previewRate !== undefined && previewMaxBps > 0n
    ? Number((previewMaxBps - previewRate) * 10000n / previewMaxBps) / 100
    : undefined

  // Rate mismatch warning (replica vs on-chain)
  const rateMismatch = chainRate !== undefined && previewRate !== undefined
    && chainRate !== previewRate

  function applyPreset(p: Preset) {
    setPreset(p)
    if (p === 'demo') setForm(f => ({ ...f, ...DEMO_PRESET }))
    if (p === 'real') setForm(f => ({ ...f, ...REAL_PRESET }))
  }

  function validate(): boolean {
    if (!isAddress(form.payee)) { setFormError('Invalid payee address'); return false }
    const arbiterAddr = form.arbiter.trim() === '' ? ZERO_ADDRESS : form.arbiter.trim()
    if (!isAddress(arbiterAddr)) { setFormError('Invalid arbiter address'); return false }
    const me = address?.toLowerCase()
    if (me && form.payee.toLowerCase() === me) { setFormError('Payee must differ from you (the payer)'); return false }
    if (arbiterAddr !== ZERO_ADDRESS && (arbiterAddr.toLowerCase() === me || arbiterAddr.toLowerCase() === form.payee.toLowerCase())) {
      setFormError('Arbiter must differ from payer and payee'); return false
    }

    const val = parseUsdcInput(form.contractValue)
    if (!val || val === 0n) { setFormError('Invalid contract value'); return false }
    if (maxAgreementValue > 0n && val > maxAgreementValue) {
      setFormError(`Contract value exceeds max (${fmtUsdc(maxAgreementValue)})`); return false
    }

    const maxB = parseBps(form.maxBps)
    if (!maxB || maxB === 0n) { setFormError('Invalid max bps'); return false }
    if (capBps > 0n && maxB > capBps) {
      setFormError(`Max bps exceeds vault cap (${capBps} bps)`); return false
    }
    const minB = parseBps(form.minBps) ?? 0n
    if (minB > maxB) { setFormError('Min bps must be ≤ max bps'); return false }
    if (floorBps > 0n && minB < floorBps) { setFormError(`Min bps must be ≥ vault floor (${floorBps} bps)`); return false }

    const defect = parseSeconds(form.defectPeriod)
    if (!defect || defect < 60n || defect > 63072000n) {
      setFormError('Defect period must be 60 s – 730 days'); return false
    }
    const resp = parseSeconds(form.responseWindow)
    if (!resp || resp < 60n || resp > 2592000n) {
      setFormError('Response window must be 60 s – 30 days'); return false
    }
    const arb = parseSeconds(form.arbiterWindow)
    if (!arb || arb < 60n || arb > 2592000n) {
      setFormError('Arbiter window must be 60 s – 30 days'); return false
    }

    setFormError(null)
    return true
  }

  function handleCreate() {
    if (!validate()) return
    try {
      writeContract({
        address: VAULT_ADDRESS,
        abi: RETENTION_VAULT_ABI,
        functionName: 'createAgreement',
        args: [
          form.payee as `0x${string}`,
          (form.arbiter.trim() === '' ? ZERO_ADDRESS : form.arbiter.trim()) as `0x${string}`,
          parseUsdcInput(form.contractValue)!,
          parseBps(form.maxBps)!,
          parseBps(form.minBps) ?? 0n,
          parseSeconds(form.defectPeriod) ?? 2592000n,
          parseSeconds(form.responseWindow) ?? 604800n,
          parseSeconds(form.arbiterWindow) ?? 604800n,
        ],
      })
    } catch (e) {
      toast.error(parseOnchainError(e))
    }
  }

  const field = (key: keyof CreateForm, label: string, placeholder: string, hint?: string) => (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--subtle)', letterSpacing: '0.07em' }}>
        {label}
      </label>
      <input
        className="w-full rounded-xl border px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-[var(--accent)] mono"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--ink)' }}
        value={form[key]}
        placeholder={placeholder}
        onChange={e => { setForm(f => ({ ...f, [key]: e.target.value })); setPreset('custom') }}
      />
      {hint && <span className="text-xs" style={{ color: 'var(--subtle)' }}>{hint}</span>}
    </div>
  )

  // Preview label: payee-specific if address valid, else "new payee (n=0)"
  const previewLabel = validPayee
    ? `Live Preview — ${fmtAddr(validPayee)} (n=${payeeRecord.n}, k=${payeeRecord.k})`
    : 'Live Preview — new payee (n=0)'

  return (
    <Layout>
      {/* ── tagline ───────────────────────────────────────── */}
      <p className="mb-5 text-sm" style={{ color: 'var(--muted)' }}>
        Retention that pays back: a neutral escrow for construction and software holdbacks. Clean track records earn lower retention.
      </p>

      {/* ── vault stats bar ────────────────────────────────── */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard label="Total Held" value={fmtUsdc(totalHeld)} />
        <StatCard label="Vault Cap" value={fmtUsdc(maxTotalHeld)} />
        <StatCard label="Max Agreement" value={fmtUsdc(maxAgreementValue)} className="col-span-2 sm:col-span-1" />
      </div>

      {/* ── header row ────────────────────────────────────── */}
      <div className="mb-4 flex items-center justify-between">
        <SectionTitle>Agreements</SectionTitle>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { void refresh() }}
            className="inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-black/5"
            style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}
          >
            <RefreshCw className="size-3.5" />
            Refresh
          </button>
          {address && (
            <button
              onClick={() => setShowCreate(s => !s)}
              className="inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-semibold text-white transition-colors"
              style={{ background: 'var(--accent)' }}
            >
              <Plus className="size-3.5" />
              New Agreement
            </button>
          )}
        </div>
      </div>

      {/* ── create form ───────────────────────────────────── */}
      {showCreate && (
        <Card className="mb-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="display text-base font-bold" style={{ color: 'var(--ink)' }}>New Agreement</h3>
            {/* Preset tabs */}
            <div className="flex gap-1 rounded-xl p-1" style={{ background: 'var(--surface-muted)' }}>
              {(['demo', 'real', 'custom'] as Preset[]).map(p => (
                <button
                  key={p}
                  onClick={() => applyPreset(p)}
                  className="rounded-lg px-3 py-1 text-xs font-semibold capitalize transition-all"
                  style={{
                    background: preset === p ? 'var(--surface)' : 'transparent',
                    color: preset === p ? 'var(--ink)' : 'var(--muted)',
                    boxShadow: preset === p ? '0 1px 3px rgba(18,45,69,0.08)' : undefined,
                  }}
                >
                  {p === 'demo' ? 'Demo' : p === 'real' ? 'Real' : 'Custom'}
                </button>
              ))}
            </div>
          </div>

          {preset === 'demo' && (
            <p className="mb-4 text-xs rounded-2xl px-3 py-2" style={{ background: 'var(--surface-muted)', color: 'var(--muted)' }}>
              Demo: 10 min guarantee period and 3 min windows for fast testnet walkthroughs. Replace addresses before submitting.
            </p>
          )}
          {preset === 'real' && (
            <p className="mb-4 text-xs rounded-2xl px-3 py-2" style={{ background: 'var(--surface-muted)', color: 'var(--muted)' }}>
              Real: 365-day guarantee period, 14-day windows, 5% max retention. Suitable for production-style agreements.
            </p>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            {field('payee', 'Payee Address', '0x…')}
            {field('arbiter', 'Arbiter Address (optional)', '0x… or leave blank')}
            {field('contractValue', 'Contract Value (USDC)', '2.00', 'Full value before retention')}
            {field('maxBps', 'Max Retention (bps)', '500', '500 = 5%')}
            {field('minBps', 'Min Retention (bps)', '100')}
            {field('defectPeriod', 'Defect Period (sec)', '600', '600 = 10 min')}
            {field('responseWindow', 'Response Window (sec)', '180', '180 = 3 min')}
            {field('arbiterWindow', 'Arbiter Window (sec)', '180', '180 = 3 min')}
          </div>

          {/* ── live preview ─────────────────────────────── */}
          {previewRate !== undefined && (
            <div className="mt-4 rounded-2xl p-4" style={{ background: 'var(--surface-muted)' }}>
              <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--subtle)', letterSpacing: '0.07em' }}>
                {previewLabel}
              </p>
              {rateMismatch && (
                <p className="mb-2 text-xs px-2 py-1 rounded-lg" style={{ background: 'rgba(234,179,8,0.1)', color: 'var(--warning)' }}>
                  Warning: on-chain rate ({fmtBps(chainRate)}) differs from replica ({fmtBps(previewRate)}). Check RPC.
                </p>
              )}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div>
                  <p className="text-xs" style={{ color: 'var(--subtle)' }}>n</p>
                  <p className="mono font-bold" style={{ color: 'var(--ink)' }}>{payeeRecord.n.toString()}</p>
                </div>
                <div>
                  <p className="text-xs" style={{ color: 'var(--subtle)' }}>k</p>
                  <p className="mono font-bold" style={{ color: 'var(--ink)' }}>{payeeRecord.k.toString()}</p>
                </div>
                <div>
                  <p className="text-xs" style={{ color: 'var(--subtle)' }}>Credibility Z</p>
                  <p className="mono font-bold" style={{ color: 'var(--ink)' }}>{fmtWad(credibilityWad)}</p>
                </div>
                <div>
                  <p className="text-xs" style={{ color: 'var(--subtle)' }}>Rate</p>
                  <p className="mono font-bold" style={{ color: 'var(--accent)' }}>{fmtBps(previewRate)}</p>
                </div>
                {previewRetained !== undefined && (
                  <div>
                    <p className="text-xs" style={{ color: 'var(--subtle)' }}>Retained</p>
                    <p className="mono font-bold" style={{ color: 'var(--warning)' }}>{fmtUsdc(previewRetained)}</p>
                  </div>
                )}
                {previewReleased !== undefined && (
                  <div>
                    <p className="text-xs" style={{ color: 'var(--subtle)' }}>Released</p>
                    <p className="mono font-bold" style={{ color: 'var(--success)' }}>{fmtUsdc(previewReleased)}</p>
                  </div>
                )}
                {capitalFreedPct !== undefined && (
                  <div>
                    <p className="text-xs" style={{ color: 'var(--subtle)' }}>Capital freed vs max</p>
                    <p className="mono font-bold" style={{ color: 'var(--ink-2)' }}>{capitalFreedPct.toFixed(1)}%</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {formError && (
            <p className="mt-3 text-sm font-medium" style={{ color: 'var(--danger)' }}>{formError}</p>
          )}

          {/* Create button — no USDC approval needed; createAgreement moves no funds */}
          <div className="mt-4 flex flex-wrap gap-2">
            <TxButton
              label="Create Agreement"
              onClick={handleCreate}
              isPending={isPending}
              isConfirming={isConfirming}
              isSuccess={isSuccess}
              wrongChain={wrongChain}
              onSwitchChain={() => switchChain({ chainId: CHAIN_ID })}
            />
            <button
              onClick={() => setShowCreate(false)}
              className="rounded-2xl border px-5 py-3 text-sm font-semibold transition-colors hover:bg-black/5"
              style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}
            >
              Cancel
            </button>
          </div>

          {txHash && (
            <div className="mt-2">
              <a href={txUrl(txHash)} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs" style={{ color: 'var(--muted)' }}>
                View tx <ExternalLink className="size-3" />
              </a>
            </div>
          )}
        </Card>
      )}

      {/* ── agreement list ────────────────────────────────── */}
      <Card>
        {loading && (
          <div className="flex flex-col items-center gap-3 py-10">
            <RefreshCw className="size-6 animate-spin" style={{ color: 'var(--muted)' }} />
            <p className="text-xs" style={{ color: 'var(--subtle)' }}>Loading agreements…</p>
          </div>
        )}
        {error && !loading && (
          <p className="py-6 text-center text-sm" style={{ color: 'var(--danger)' }}>
            Error loading agreements: {error}
          </p>
        )}
        {!loading && !error && summaries.length === 0 && (
          <p className="py-10 text-center text-sm" style={{ color: 'var(--subtle)' }}>
            No agreements found. Connect a wallet and create the first one.
          </p>
        )}
        {!loading && summaries.length > 0 && (
          <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
            {summaries.map(s => (
              <Link
                key={s.id.toString()}
                to={`/agreement/${s.id}`}
                className="flex items-center justify-between gap-4 py-3.5 transition-colors hover:bg-black/[0.02]"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="display text-sm font-bold tabular-nums shrink-0" style={{ color: 'var(--ink)' }}>
                    #{s.id.toString()}
                  </span>
                  <StateBadge value={s.state} type="state" />
                  <div className="min-w-0">
                    <p className="text-xs mono truncate" style={{ color: 'var(--muted)' }}>
                      {fmtAddr(s.payer)} → {fmtAddr(s.payee)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-sm font-semibold tabular-nums" style={{ color: 'var(--ink-2)' }}>
                    {fmtUsdc(s.contractValue)}
                  </span>
                  <ChevronRight className="size-4" style={{ color: 'var(--subtle)' }} />
                </div>
              </Link>
            ))}
          </div>
        )}
      </Card>
    </Layout>
  )
}

function StatCard({ label, value, className = '' }: { label: string; value: string; className?: string }) {
  return (
    <Inner className={className}>
      <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--subtle)', letterSpacing: '0.07em' }}>{label}</p>
      <p className="display text-lg font-bold tabular-nums" style={{ color: 'var(--ink)' }}>{value}</p>
    </Inner>
  )
}
