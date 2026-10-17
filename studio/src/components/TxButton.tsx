/**
 * Four-state transaction button: idle, pending, confirming, success/error.
 * Wraps the Arc Light CTA pattern from money-components.md.
 */
import React from 'react'
import { Loader2, CheckCircle, AlertCircle } from 'lucide-react'
import { CHAIN } from '@/app-config'

interface TxButtonProps {
  label: string
  onClick: () => void
  disabled?: boolean
  isPending?: boolean
  isConfirming?: boolean
  isSuccess?: boolean
  isError?: boolean
  wrongChain?: boolean
  onSwitchChain?: () => void
  className?: string
  variant?: 'primary' | 'secondary' | 'danger'
}

export function TxButton({
  label,
  onClick,
  disabled = false,
  isPending = false,
  isConfirming = false,
  isSuccess = false,
  isError = false,
  wrongChain = false,
  onSwitchChain,
  className = '',
  variant = 'primary',
}: TxButtonProps) {
  const busy = isPending || isConfirming
  const isDisabled = disabled || busy

  const base =
    'inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-semibold transition-all hover:scale-[1.01] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40 min-h-[44px]'

  const variants = {
    primary: 'text-white',
    secondary: 'border text-[var(--ink)]',
    danger: 'text-white',
  }

  const styles: Record<string, React.CSSProperties> = {
    primary: { background: 'var(--accent)' },
    secondary: { background: 'var(--surface)', borderColor: 'var(--border)' },
    danger: { background: 'var(--danger)' },
  }

  if (wrongChain) {
    return (
      <button
        type="button"
        onClick={onSwitchChain}
        className={`${base} ${variants.primary} ${className}`}
        style={styles.primary}
      >
        Switch to {CHAIN.name}
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isDisabled}
      className={`${base} ${variants[variant]} ${className}`}
      style={styles[variant]}
    >
      {isPending && <><Loader2 className="size-4 animate-spin" /> Confirm in wallet…</>}
      {isConfirming && <><Loader2 className="size-4 animate-spin" /> Confirming…</>}
      {isSuccess && !busy && <><CheckCircle className="size-4" /> Done</>}
      {isError && !busy && <><AlertCircle className="size-4" /> Failed — retry</>}
      {!busy && !isSuccess && !isError && label}
    </button>
  )
}
