/**
 * Renders a pill badge for the contract State / ClaimStatus / ProvisionalStatus enums.
 */
import React from 'react'

// Mirrors RetentionVault.sol: State { Proposed, Active, DefectPeriod, Closed, Cancelled }
export const STATE_LABELS: Record<number, string> = {
  0: 'Proposed',
  1: 'Active',
  2: 'Guarantee period',
  3: 'Closed',
  4: 'Cancelled',
}

const STATE_COLORS: Record<number, string> = {
  0: 'bg-amber-100 text-amber-800',
  1: 'bg-emerald-100 text-emerald-800',
  2: 'bg-blue-100 text-blue-700',
  3: 'bg-slate-100 text-slate-600',
  4: 'bg-slate-100 text-slate-400',
}

// Mirrors RetentionVault.sol: ClaimStatus { None, Open, Disputed }
export const CLAIM_STATUS_LABELS: Record<number, string> = {
  0: 'None',
  1: 'Open',
  2: 'Disputed',
}

const CLAIM_STATUS_COLORS: Record<number, string> = {
  0: 'bg-slate-50 text-slate-400',
  1: 'bg-amber-100 text-amber-800',
  2: 'bg-red-100 text-red-700',
}

// Mirrors RetentionVault.sol: ProvisionalStatus { None, Requested, Disputed }
export const PROV_STATUS_LABELS: Record<number, string> = {
  0: 'None',
  1: 'Requested',
  2: 'Objected',
}

const PROV_STATUS_COLORS: Record<number, string> = {
  0: 'bg-slate-50 text-slate-400',
  1: 'bg-blue-100 text-blue-700',
  2: 'bg-orange-100 text-orange-700',
}

interface StateBadgeProps {
  value: number
  type?: 'state' | 'claim' | 'provisional'
  className?: string
}

export function StateBadge({ value, type = 'state', className = '' }: StateBadgeProps) {
  const labels = type === 'state' ? STATE_LABELS : type === 'claim' ? CLAIM_STATUS_LABELS : PROV_STATUS_LABELS
  const colors = type === 'state' ? STATE_COLORS : type === 'claim' ? CLAIM_STATUS_COLORS : PROV_STATUS_COLORS
  const label = labels[value] ?? `Unknown(${value})`
  const color = colors[value] ?? 'bg-slate-100 text-slate-500'

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold tracking-wide ${color} ${className}`}
    >
      {label}
    </span>
  )
}
