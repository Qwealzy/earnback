/**
 * /record/:address — Payee track record.
 * Shows: explanation paragraph, n/k counts, credibility, priorA/B/zWad params,
 * live rateFor vs replica check, and the rate-vs-agreements chart (2 curves).
 */
import React, { useState, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, ExternalLink, AlertTriangle, Info } from 'lucide-react'
import { usePayeeRecord, useRateFor, useVaultParams } from '@/hooks/useVaultRead'
import { Card, Inner, SectionTitle, DetailRow, Layout } from '@/components/Layout'
import { fmtBps, parseBps } from '@/utils/format'
import { addrUrl } from '@/app-config'
import { buildRateChart, computeRateFor, type VaultParams } from '@/utils/rateCalc'

const WAD = 10n ** 18n

function fmtWad(wad: bigint): string {
  return (Number(wad) / Number(WAD)).toFixed(4)
}

function fmtWadPct(wad: bigint): string {
  return ((Number(wad) / Number(WAD)) * 100).toFixed(2) + '%'
}

// ─── Minimal SVG sparkline chart ─────────────────────────────────────────
interface ChartRow { n: number; clean: number; oneClaim: number }

function RateChart({
  rows,
  currentN,
  currentK,
  chainRate,
}: {
  rows: ChartRow[]
  currentN: number
  currentK: number
  chainRate: number | undefined
}) {
  const W = 500
  const H = 180
  const PAD = { top: 16, right: 16, bottom: 28, left: 44 }
  const chartW = W - PAD.left - PAD.right
  const chartH = H - PAD.top - PAD.bottom

  if (rows.length < 2) return null

  const maxBps = Math.max(...rows.map(r => Math.max(r.clean, r.oneClaim)), 100)
  const minBps = Math.min(...rows.map(r => Math.min(r.clean, r.oneClaim)), 0)
  const range = maxBps - minBps || 1

  function x(n: number) { return PAD.left + (n / (rows.length - 1)) * chartW }
  function y(bps: number) { return PAD.top + (1 - (bps - minBps) / range) * chartH }

  function line(key: 'clean' | 'oneClaim') {
    return rows.map((r, i) => `${i === 0 ? 'M' : 'L'}${x(r.n).toFixed(1)},${y(r[key]).toFixed(1)}`).join(' ')
  }

  // Y-axis ticks
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(t => minBps + t * range)

  // Current point
  const curRow = rows.find(r => r.n === currentN)
  const curBps = curRow ? (currentK === 0 ? curRow.clean : curRow.oneClaim) : undefined

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      {/* Grid lines */}
      {yTicks.map((bps, i) => (
        <line key={i}
          x1={PAD.left} y1={y(bps).toFixed(1)}
          x2={PAD.left + chartW} y2={y(bps).toFixed(1)}
          stroke="rgba(18,45,69,0.06)" strokeWidth="1"
        />
      ))}
      {/* Y-axis labels */}
      {yTicks.map((bps, i) => (
        <text key={i} x={PAD.left - 6} y={y(bps) + 4} textAnchor="end" fontSize="9" fill="#6b7f96">
          {(bps / 100).toFixed(1)}%
        </text>
      ))}
      {/* X-axis labels */}
      {[0, 5, 10, 15, 20, 25, 30].filter(n => n < rows.length).map(n => (
        <text key={n} x={x(n)} y={H - 6} textAnchor="middle" fontSize="9" fill="#6b7f96">{n}</text>
      ))}
      {/* Axis labels */}
      <text x={PAD.left + chartW / 2} y={H} textAnchor="middle" fontSize="9" fill="#99aab8">closed agreements (n)</text>
      <text x={8} y={PAD.top + chartH / 2} textAnchor="middle" fontSize="9" fill="#99aab8"
        transform={`rotate(-90, 8, ${PAD.top + chartH / 2})`}>rate</text>

      {/* Clean series (blue) */}
      <path d={line('clean')} fill="none" stroke="#122d45" strokeWidth="2" strokeLinejoin="round" />
      {/* One-claim series (orange) */}
      <path d={line('oneClaim')} fill="none" stroke="#b45309" strokeWidth="1.5" strokeLinejoin="round" strokeDasharray="4 3" />

      {/* Current point */}
      {curBps !== undefined && (
        <circle
          cx={x(currentN).toFixed(1)}
          cy={y(curBps).toFixed(1)}
          r="5"
          fill={currentK > 0 ? '#b45309' : '#122d45'}
          stroke="white"
          strokeWidth="2"
        />
      )}

      {/* Chain rate indicator (if differs from replica) */}
      {chainRate !== undefined && curBps !== undefined && chainRate !== curBps && (
        <circle
          cx={x(currentN).toFixed(1)}
          cy={y(chainRate).toFixed(1)}
          r="4"
          fill="none"
          stroke="#c53030"
          strokeWidth="2"
        />
      )}

      {/* Legend */}
      <line x1={PAD.left} y1={H - 10} x2={PAD.left + 20} y2={H - 10} stroke="#122d45" strokeWidth="2" />
      <text x={PAD.left + 24} y={H - 6} fontSize="9" fill="#122d45">clean</text>
      <line x1={PAD.left + 70} y1={H - 10} x2={PAD.left + 90} y2={H - 10} stroke="#b45309" strokeWidth="1.5" strokeDasharray="4 3" />
      <text x={PAD.left + 94} y={H - 6} fontSize="9" fill="#b45309">1 upheld claim</text>
    </svg>
  )
}

// ─── main page ────────────────────────────────────────────────────────────
export function RecordPage() {
  const { address } = useParams<{ address: string }>()
  const isValidAddr = /^0x[0-9a-fA-F]{40}$/.test(address ?? '')
  const payeeAddr = isValidAddr ? (address as `0x${string}`) : undefined

  const { data: recordData, isLoading } = usePayeeRecord(payeeAddr)
  const { data: paramsData } = useVaultParams()

  const [maxBpsInput, setMaxBpsInput] = useState('1000')
  const maxBps = parseBps(maxBpsInput) ?? 1000n

  const { data: chainRate } = useRateFor(payeeAddr, maxBps)

  // record() returns two outputs; viem decodes them as a tuple [n, k], not an object
  const recordTuple = recordData?.[0].result
  const record = recordTuple ? { n: recordTuple[0], k: recordTuple[1] } : undefined
  const credibility = recordData?.[1].result

  const priorA = (paramsData?.[0].result) ?? 0n
  const priorB = (paramsData?.[1].result) ?? 0n
  const zWad = (paramsData?.[2].result) ?? WAD
  const capBps = (paramsData?.[3].result) ?? 0n
  const floorBps = (paramsData?.[4].result) ?? 0n

  const vaultParams: VaultParams = { priorA, priorB, zWad, capBps, floorBps }

  // BigInt replica rate for current record
  const currentN = record ? Number(record.n) : 0
  const currentK = record ? Number(record.k) : 0
  const replicaRate = priorA > 0n ? computeRateFor(vaultParams, { n: record?.n ?? 0n, k: record?.k ?? 0n }, maxBps) : undefined

  // Rate mismatch warning
  const rateMismatch = replicaRate !== undefined && chainRate !== undefined && replicaRate !== chainRate

  // Chart data
  const chartRows = useMemo(() => {
    if (priorA === 0n) return []
    return buildRateChart(vaultParams, maxBps, 30)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [priorA.toString(), priorB.toString(), zWad.toString(), capBps.toString(), floorBps.toString(), maxBps.toString()])

  // Capital freed vs fixed max: (maxBps - replicaRate) / maxBps
  const capitalFreedPct = replicaRate !== undefined && maxBps > 0n
    ? Number((maxBps - replicaRate) * 10000n / maxBps) / 100
    : undefined

  if (!isValidAddr) {
    return (
      <Layout>
        <div className="py-10 text-center">
          <p style={{ color: 'var(--muted)' }}>Invalid address.</p>
          <Link to="/" className="mt-3 inline-flex items-center gap-1 text-sm" style={{ color: 'var(--accent)' }}>
            <ArrowLeft className="size-3.5" /> Back
          </Link>
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="mb-4 flex items-center gap-2">
        <Link to="/" className="inline-flex items-center gap-1 text-sm font-medium" style={{ color: 'var(--muted)' }}>
          <ArrowLeft className="size-3.5" /> Agreements
        </Link>
        <span style={{ color: 'var(--subtle)' }}>/</span>
        <span className="mono text-sm" style={{ color: 'var(--ink)' }}>Payee Record</span>
      </div>

      {/* ── Explanation ───────────────────────────────────── */}
      <Card className="mb-4">
        <div className="flex items-start gap-3">
          <Info className="size-4 mt-0.5 shrink-0" style={{ color: 'var(--accent)' }} />
          <div className="space-y-2 text-sm" style={{ color: 'var(--muted)' }}>
            <p>
              The vault uses a <strong style={{ color: 'var(--ink)' }}>Bayesian experience-rating formula</strong> to set each agreement's
              retention rate. The more agreements a payee completes without upheld claims, the lower the rate offered to them.
            </p>
            <p>
              The vault starts from a prior belief — <em>priorA</em> pseudo-successes and <em>priorB</em> pseudo-failures —
              representing what it "knows" before any data. As a payee builds a track record
              (<em>n</em> completed, <em>k</em> upheld claims), the formula updates credibility toward the observed proportion.
            </p>
            <p>
              The chart shows how the retention rate falls as the payee completes clean agreements
              (solid line) and how one upheld claim shifts the curve (dashed orange).
              The filled circle marks the current position; a red outline means the on-chain
              value differs from the BigInt replica — indicating a formula discrepancy.
            </p>
            <p>
              <strong style={{ color: 'var(--ink)' }}>Capital freed vs fixed max</strong> is the percentage of the max retention the
              payee has earned back through their track record: (maxBps − rate) / maxBps.
            </p>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ── Record card ──────────────────────────────────── */}
        <div className="flex flex-col gap-4">
          <Card>
            <SectionTitle>Payee Track Record</SectionTitle>
            <div className="mb-4">
              <a href={addrUrl(address!)} target="_blank" rel="noopener noreferrer"
                className="mono inline-flex items-center gap-1 text-sm font-medium break-all" style={{ color: 'var(--ink-2)' }}>
                {address} <ExternalLink className="size-3.5" />
              </a>
            </div>

            {isLoading && <p className="text-sm" style={{ color: 'var(--muted)' }}>Loading…</p>}

            {!isLoading && (
              <>
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <Inner>
                    <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--subtle)', letterSpacing: '0.07em' }}>Agreements (n)</p>
                    <p className="display text-2xl font-bold tabular-nums" style={{ color: 'var(--ink)' }}>
                      {record ? record.n.toString() : '—'}
                    </p>
                  </Inner>
                  <Inner>
                    <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--subtle)', letterSpacing: '0.07em' }}>Upheld claims (k)</p>
                    <p className="display text-2xl font-bold tabular-nums" style={{ color: 'var(--ink)' }}>
                      {record ? record.k.toString() : '—'}
                    </p>
                  </Inner>
                </div>

                <DetailRow label="Credibility">
                  {credibility !== undefined
                    ? <span className="mono tabular-nums">{fmtWad(credibility)} <span style={{ color: 'var(--subtle)' }}>({fmtWadPct(credibility)})</span></span>
                    : '—'
                  }
                </DetailRow>

                {record && record.n === 0n && (
                  <p className="mt-3 text-sm rounded-2xl p-3" style={{ background: 'var(--surface-muted)', color: 'var(--muted)' }}>
                    No completed agreements yet. The vault uses its prior ({fmtWad(priorA)} / {fmtWad(priorA + priorB)}) until a record is established.
                  </p>
                )}
              </>
            )}
          </Card>

          {/* ── Vault params ─────────────────────────────── */}
          <Card>
            <SectionTitle>Formula Parameters</SectionTitle>
            <p className="text-xs mb-3" style={{ color: 'var(--subtle)' }}>
              Demo deployment parameters — not tuned for production.
            </p>
            <DetailRow label="priorA">
              <span className="mono text-xs">{priorA.toString()}</span>
            </DetailRow>
            <DetailRow label="priorB">
              <span className="mono text-xs">{priorB.toString()}</span>
            </DetailRow>
            <DetailRow label="zWad">
              <span className="mono text-xs">{zWad.toString()} <span style={{ color: 'var(--subtle)' }}>({fmtWad(zWad)} σ prudence margin)</span></span>
            </DetailRow>
            <DetailRow label="capBps">{fmtBps(capBps)}</DetailRow>
            <DetailRow label="floorBps">{fmtBps(floorBps)}</DetailRow>
          </Card>
        </div>

        {/* ── Rate preview + chart ──────────────────────── */}
        <div className="flex flex-col gap-4">
          <Card>
            <SectionTitle>Retention Rate Preview</SectionTitle>

            <div className="flex flex-col gap-2 mb-4">
              <label className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--subtle)', letterSpacing: '0.07em' }}>
                Max bps for this agreement
              </label>
              <input
                className="w-full rounded-xl border px-3.5 py-2.5 text-sm outline-none focus:border-[var(--accent)] mono"
                style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)', color: 'var(--ink)' }}
                value={maxBpsInput}
                placeholder="1000"
                onChange={e => setMaxBpsInput(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <Inner>
                <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--subtle)', letterSpacing: '0.07em' }}>
                  On-chain rate
                </p>
                <p className="display text-2xl font-bold tabular-nums" style={{ color: 'var(--accent)', letterSpacing: '-0.02em' }}>
                  {chainRate !== undefined ? fmtBps(chainRate) : '—'}
                </p>
                {chainRate !== undefined && <p className="text-xs mt-0.5 mono" style={{ color: 'var(--subtle)' }}>{chainRate.toString()} bps</p>}
              </Inner>
              <Inner>
                <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--subtle)', letterSpacing: '0.07em' }}>
                  BigInt replica
                </p>
                <p className="display text-2xl font-bold tabular-nums" style={{ color: rateMismatch ? 'var(--danger)' : 'var(--ink-2)', letterSpacing: '-0.02em' }}>
                  {replicaRate !== undefined ? fmtBps(replicaRate) : '—'}
                </p>
                {replicaRate !== undefined && <p className="text-xs mt-0.5 mono" style={{ color: 'var(--subtle)' }}>{replicaRate.toString()} bps</p>}
              </Inner>
            </div>

            {capitalFreedPct !== undefined && (
              <Inner className="mb-4">
                <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--subtle)', letterSpacing: '0.07em' }}>
                  Capital freed vs fixed max
                </p>
                <p className="display text-xl font-bold tabular-nums" style={{ color: 'var(--success)', letterSpacing: '-0.02em' }}>
                  {capitalFreedPct.toFixed(1)}%
                </p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--subtle)' }}>
                  (maxBps − rate) / maxBps
                </p>
              </Inner>
            )}

            {rateMismatch && (
              <div className="flex items-start gap-2 rounded-2xl p-3 mb-4" style={{ background: 'rgba(197,48,48,0.06)' }}>
                <AlertTriangle className="size-4 shrink-0 mt-0.5" style={{ color: 'var(--danger)' }} />
                <p className="text-xs" style={{ color: 'var(--danger)' }}>
                  Replica rate ({replicaRate?.toString()} bps) differs from on-chain rate ({chainRate?.toString()} bps).
                  Check the rateCalc.ts formula against the deployed contract.
                </p>
              </div>
            )}
          </Card>

          {/* ── Chart card ───────────────────────────────── */}
          {chartRows.length > 0 && (
            <Card>
              <SectionTitle>Rate vs Track Record</SectionTitle>
              <p className="text-xs mb-3" style={{ color: 'var(--subtle)' }}>
                X-axis: closed agreements (n). Solid: zero upheld claims. Dashed: 1 upheld claim.
                Dot: current position.
              </p>
              <RateChart
                rows={chartRows}
                currentN={currentN}
                currentK={currentK}
                chainRate={chainRate !== undefined ? Number(chainRate) : undefined}
              />
            </Card>
          )}
        </div>
      </div>
    </Layout>
  )
}
