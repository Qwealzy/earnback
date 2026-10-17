/**
 * /proof — Vault proof-of-work page (UI-SPEC §4).
 * Wallet-free. Shows network info, live on-chain stats, scenario cards,
 * and editable honesty lines.
 */
import React, { useState } from 'react'
import { ExternalLink, Shield, Server, RefreshCw, ChevronDown, ChevronUp, Edit2, Check } from 'lucide-react'
import { Card, Inner, SectionTitle, DetailRow, Layout } from '@/components/Layout'
import { useVaultParams, useVaultGlobals } from '@/hooks/useVaultRead'
import { useVaultScan } from '@/hooks/useAgreementIds'
import { VAULT_ADDRESS, CHAIN, CHAIN_ID, SOURCIFY_REPO_URL, SOURCIFY_API_URL, addrUrl } from '@/app-config'
import { fmtUsdc, fmtAddr } from '@/utils/format'
import { PROOF_SCENARIOS, type ProofScenario } from '@/proof-scenarios'

// ─── live stat box ────────────────────────────────────────────────────────
function StatBox({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Inner className="flex flex-col gap-1">
      <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--subtle)', letterSpacing: '0.07em' }}>{label}</p>
      <p className="display text-xl font-bold tabular-nums" style={{ color: 'var(--ink)', letterSpacing: '-0.02em' }}>{value}</p>
      {sub && <p className="text-xs" style={{ color: 'var(--subtle)' }}>{sub}</p>}
    </Inner>
  )
}

// ─── editable honesty line ────────────────────────────────────────────────
function HonestyLine({ initial }: { initial: string }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(initial)
  const [saved, setSaved] = useState(initial)

  function save() {
    setSaved(value)
    setEditing(false)
  }

  return (
    <div className="flex items-start gap-2 mt-2">
      {editing ? (
        <>
          <input
            className="flex-1 rounded-xl border px-3 py-1.5 text-sm outline-none focus:border-[var(--accent)]"
            style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)', color: 'var(--ink)' }}
            value={value}
            onChange={e => setValue(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') save() }}
            autoFocus
          />
          <button onClick={save} className="rounded-xl p-1.5 transition-colors hover:bg-black/5" title="Save">
            <Check className="size-3.5" style={{ color: 'var(--success)' }} />
          </button>
        </>
      ) : (
        <>
          <p className="flex-1 text-sm italic" style={{ color: 'var(--muted)' }}>{saved}</p>
          <button onClick={() => setEditing(true)} className="rounded-xl p-1.5 transition-colors hover:bg-black/5" title="Edit">
            <Edit2 className="size-3.5" style={{ color: 'var(--subtle)' }} />
          </button>
        </>
      )}
    </div>
  )
}

// ─── scenario card ────────────────────────────────────────────────────────
function ScenarioCard({ scenario }: { scenario: ProofScenario }) {
  const [open, setOpen] = useState(false)

  return (
    <Card>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-start justify-between gap-3 text-left"
      >
        <div className="min-w-0">
          <p className="display font-bold" style={{ color: 'var(--ink)' }}>{scenario.title}</p>
          <p className="text-sm mt-0.5" style={{ color: 'var(--muted)' }}>{scenario.description}</p>
        </div>
        {open
          ? <ChevronUp className="size-4 shrink-0 mt-0.5" style={{ color: 'var(--subtle)' }} />
          : <ChevronDown className="size-4 shrink-0 mt-0.5" style={{ color: 'var(--subtle)' }} />
        }
      </button>

      {open && (
        <div className="mt-4 space-y-3">
          {/* Roles */}
          <Inner>
            <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--subtle)', letterSpacing: '0.07em' }}>Roles</p>
            <DetailRow label="Payer"><span className="mono text-xs">{scenario.roles.payer}</span></DetailRow>
            <DetailRow label="Payee"><span className="mono text-xs">{scenario.roles.payee}</span></DetailRow>
            {scenario.roles.arbiter && (
              <DetailRow label="Arbiter"><span className="mono text-xs">{scenario.roles.arbiter}</span></DetailRow>
            )}
          </Inner>

          {/* Transactions */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--subtle)', letterSpacing: '0.07em' }}>Transactions</p>
            <div className="space-y-2">
              {scenario.transactions.map((tx, i) => (
                <Inner key={i} className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="mono text-xs font-semibold" style={{ color: 'var(--ink)' }}>{tx.functionName}</p>
                    {tx.amountUsdc && <p className="text-xs tabular-nums mt-0.5" style={{ color: 'var(--muted)' }}>{tx.amountUsdc}</p>}
                    {tx.gasFeeUsdc && (
                      <p className="text-xs mt-0.5" style={{ color: 'var(--subtle)' }}>
                        Gas fee: <span className="tabular-nums">{tx.gasFeeUsdc}</span> USDC
                      </p>
                    )}
                  </div>
                  <a
                    href={tx.explorerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mono shrink-0 inline-flex items-center gap-1 text-xs"
                    style={{ color: 'var(--muted)' }}
                  >
                    {fmtAddr(tx.hash)} <ExternalLink className="size-3" />
                  </a>
                </Inner>
              ))}
            </div>
          </div>

          {/* Honesty line */}
          <Inner>
            <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--subtle)', letterSpacing: '0.07em' }}>Honesty note</p>
            <HonestyLine initial={scenario.honestyNote} />
          </Inner>
        </div>
      )}
    </Card>
  )
}

// ─── Sourcify status, read live (no wallet, no key) ───────────────────────
type SourcifyState = 'checking' | 'exact_match' | 'match' | 'not_verified' | 'unavailable'
function useSourcifyStatus(): SourcifyState {
  const [state, setState] = useState<SourcifyState>('checking')
  React.useEffect(() => {
    let live = true
    fetch(`${SOURCIFY_API_URL}/v2/contract/${CHAIN_ID}/${VAULT_ADDRESS}`)
      .then(r => r.json())
      .then((j: { match?: string | null }) => {
        if (!live) return
        setState(j.match === 'exact_match' ? 'exact_match' : j.match === 'match' ? 'match' : 'not_verified')
      })
      .catch(() => { if (live) setState('unavailable') })
    return () => { live = false }
  }, [])
  return state
}

const SOURCIFY_LABEL: Record<SourcifyState, string> = {
  checking: 'Checking…',
  exact_match: 'Verified (exact match)',
  match: 'Verified (partial match)',
  not_verified: 'Not verified',
  unavailable: 'Sourcify unavailable',
}

// ─── main page ────────────────────────────────────────────────────────────
export function ProofPage() {
  const sourcify = useSourcifyStatus()
  const { data: paramsData } = useVaultParams()
  const { data: globalsData } = useVaultGlobals()
  // ONE call to the shared scanner — never call two shims from the same component.
  const { agreements, totalPaidIn, totalWithdrawn, loading: scanLoading, error: scanError, refresh: scanRefresh } = useVaultScan()

  const totalHeld = (globalsData?.[0].result) ?? 0n
  const maxTotalHeld = (globalsData?.[1].result) ?? 0n

  return (
    <Layout>
      {/* ── page header ───────────────────────────────────── */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <Shield className="size-5" style={{ color: 'var(--accent)' }} />
          <h1 className="display text-2xl font-bold" style={{ color: 'var(--ink)', letterSpacing: '-0.02em' }}>
            Earnback — Proof of Work
          </h1>
        </div>
        <p className="text-sm mb-1 max-w-2xl font-medium" style={{ color: 'var(--muted)' }}>
          Retention that pays back: a neutral escrow for construction and software holdbacks. Clean track records earn lower retention.
        </p>
        <p className="text-sm max-w-2xl" style={{ color: 'var(--muted)' }}>
          Independently verify the Earnback contract on-chain. No wallet required.
          Every figure on this page is read directly from {CHAIN.name}.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* ── LEFT: network + contract info ─────────────── */}
        <div className="flex flex-col gap-4 lg:col-span-1">

          <Card>
            <div className="flex items-center gap-2 mb-3">
              <Server className="size-4" style={{ color: 'var(--accent)' }} />
              <SectionTitle>Network</SectionTitle>
            </div>
            <DetailRow label="Chain">{CHAIN.name}</DetailRow>
            <DetailRow label="Chain ID"><span className="mono">{CHAIN.chainId}</span></DetailRow>
            <DetailRow label="Contract">
              <a
                href={addrUrl(VAULT_ADDRESS)}
                target="_blank"
                rel="noopener noreferrer"
                className="mono inline-flex items-center gap-1 text-xs"
                style={{ color: 'var(--ink-2)' }}
              >
                {fmtAddr(VAULT_ADDRESS)} <ExternalLink className="size-3" />
              </a>
            </DetailRow>
            <DetailRow label="Sourcify">
              <a
                href={`${SOURCIFY_REPO_URL}/${CHAIN_ID}/${VAULT_ADDRESS}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs"
                style={{ color: sourcify === 'exact_match' || sourcify === 'match' ? 'var(--success)' : 'var(--muted)' }}
              >
                {SOURCIFY_LABEL[sourcify]} <ExternalLink className="size-3" />
              </a>
            </DetailRow>
          </Card>

          {/* Vault params */}
          <Card>
            <SectionTitle>Vault Parameters</SectionTitle>
            <DetailRow label="priorA">
              <span className="mono text-xs">{paramsData?.[0].result !== undefined ? (paramsData[0].result).toString() : '—'}</span>
            </DetailRow>
            <DetailRow label="priorB">
              <span className="mono text-xs">{paramsData?.[1].result !== undefined ? (paramsData[1].result).toString() : '—'}</span>
            </DetailRow>
            <DetailRow label="zWad">
              <span className="mono text-xs">{paramsData?.[2].result !== undefined ? (paramsData[2].result).toString() : '—'}</span>
            </DetailRow>
            <DetailRow label="capBps">{paramsData?.[3].result !== undefined ? `${Number(paramsData[3].result) / 100}%` : '—'}</DetailRow>
            <DetailRow label="floorBps">{paramsData?.[4].result !== undefined ? `${Number(paramsData[4].result) / 100}%` : '—'}</DetailRow>
            <DetailRow label="maxAgreement">{paramsData?.[5].result !== undefined ? fmtUsdc(paramsData[5].result) : '—'}</DetailRow>
            <DetailRow label="maxTotalHeld">{paramsData?.[6].result !== undefined ? fmtUsdc(paramsData[6].result) : '—'}</DetailRow>
            <DetailRow label="minRecordValue">{paramsData?.[7].result !== undefined ? fmtUsdc(paramsData[7].result) : '—'}</DetailRow>
          </Card>
        </div>

        {/* ── RIGHT: live stats + scenarios ─────────────── */}
        <div className="flex flex-col gap-4 lg:col-span-2">

          {/* Live stats */}
          <Card>
            <div className="flex items-center justify-between mb-3">
              <SectionTitle>Live Stats</SectionTitle>
              <button
                onClick={scanRefresh}
                disabled={scanLoading}
                className="rounded-xl p-1.5 transition-colors hover:bg-black/5 disabled:opacity-40"
                title="Refresh scan"
              >
                <RefreshCw className={`size-3.5 ${scanLoading ? 'animate-spin' : ''}`} style={{ color: 'var(--muted)' }} />
              </button>
            </div>
            {scanError && (
              <div className="mb-3 rounded-xl px-3 py-2 text-sm" style={{ background: 'var(--surface-muted)', color: 'var(--danger)' }}>
                Scan error: {scanError}
              </div>
            )}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <StatBox
                label="Total Held"
                value={fmtUsdc(totalHeld)}
                sub={`of ${fmtUsdc(maxTotalHeld)} cap`}
              />
              <StatBox
                label="Agreements"
                value={scanLoading ? '…' : agreements.length.toString()}
                sub="AgreementCreated events"
              />
              <StatBox
                label="Total Paid In"
                value={scanLoading ? '…' : fmtUsdc(totalPaidIn)}
                sub="sum of ProgressPaid"
              />
              <StatBox
                label="Total Withdrawn"
                value={scanLoading ? '…' : fmtUsdc(totalWithdrawn)}
                sub="sum of Withdrawn"
              />
            </div>
          </Card>

          {/* Scenario cards */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <SectionTitle>Proof Scenarios</SectionTitle>
              {scanLoading && <RefreshCw className="size-3.5 animate-spin" style={{ color: 'var(--muted)' }} />}
            </div>

            {PROOF_SCENARIOS.length === 0 ? (
              <Card>
                <p className="text-sm text-center py-6" style={{ color: 'var(--muted)' }}>
                  No scenarios yet. Populate <span className="mono text-xs">src/proof-scenarios.ts</span> with
                  real transaction hashes from this deployment to build a verifiable audit trail.
                </p>
              </Card>
            ) : (
              <div className="space-y-3">
                {PROOF_SCENARIOS.map(s => (
                  <ScenarioCard key={s.id} scenario={s} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  )
}
