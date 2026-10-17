/**
 * Live countdown timer that ticks every second.
 */
import React, { useEffect, useState } from 'react'
import { fmtDuration, secsUntil } from '@/utils/format'
import { Clock } from 'lucide-react'

interface CountdownProps {
  deadline: bigint | number
  label?: string
  expiredLabel?: string
  className?: string
}

export function Countdown({ deadline, label, expiredLabel = 'Expired', className = '' }: CountdownProps) {
  const [secs, setSecs] = useState(() => secsUntil(deadline))

  useEffect(() => {
    const id = setInterval(() => setSecs(secsUntil(deadline)), 1000)
    return () => clearInterval(id)
  }, [deadline])

  if (secs <= 0) {
    return (
      <span className={`inline-flex items-center gap-1 text-xs font-medium ${className}`} style={{ color: 'var(--danger)' }}>
        <Clock className="size-3" />
        {expiredLabel}
      </span>
    )
  }

  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium tabular-nums ${className}`} style={{ color: 'var(--muted)' }}>
      <Clock className="size-3" />
      {label && <span>{label}: </span>}
      {fmtDuration(secs)}
    </span>
  )
}
