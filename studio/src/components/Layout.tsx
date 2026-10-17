/**
 * App shell: top nav bar with wallet connect, chain name, and vault address chip.
 * Also provides the page container and content areas.
 */
import React from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ConnectKitButton } from 'connectkit'
import { FileText, Shield, ExternalLink } from 'lucide-react'
import { VAULT_ADDRESS, CHAIN, addrUrl } from '@/app-config'
import { fmtAddr } from '@/utils/format'

const NAV_LINKS = [
  { to: '/', label: 'Agreements', icon: FileText },
  { to: '/proof', label: 'Proof', icon: Shield },
]
// Hash tool is accessible via /tools/hash but not in primary nav (utility page)

export function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation()

  return (
    <div className="min-h-dvh" style={{ background: 'var(--bg-gradient)' }}>
      {/* ── nav ─────────────────────────────────────────────── */}
      <header
        className="sticky top-0 z-40 border-b"
        style={{
          background: 'var(--surface-strong)',
          backdropFilter: 'blur(20px) saturate(180%)',
          WebkitBackdropFilter: 'blur(20px) saturate(180%)',
          borderColor: 'var(--border)',
        }}
      >
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4">
          {/* wordmark */}
          <Link to="/" className="display text-base font-bold tracking-tight" style={{ color: 'var(--ink)' }}>
            Earnback
          </Link>

          {/* chain pill */}
          <span
            className="hidden rounded-full px-2.5 py-0.5 text-xs font-semibold sm:inline-block"
            style={{ background: 'var(--surface-muted)', color: 'var(--muted)' }}
          >
            {CHAIN.name}
          </span>

          {/* vault address chip */}
          <a
            href={addrUrl(VAULT_ADDRESS)}
            target="_blank"
            rel="noopener noreferrer"
            className="hidden items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-mono font-medium md:inline-flex"
            style={{ background: 'var(--surface-muted)', color: 'var(--muted)' }}
          >
            {fmtAddr(VAULT_ADDRESS)}
            <ExternalLink className="size-3" />
          </a>

          <nav className="ml-4 flex items-center gap-0.5">
            {NAV_LINKS.map(({ to, label, icon: Icon }) => {
              const active = to === '/'
                ? location.pathname === '/'
                : location.pathname.startsWith(to)
              return (
                <Link
                  key={to}
                  to={to}
                  className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-medium transition-colors ${
                    active ? 'font-semibold' : 'hover:bg-black/5'
                  }`}
                  style={{
                    color: active ? 'var(--accent)' : 'var(--muted)',
                    background: active ? 'rgba(18,45,69,0.06)' : undefined,
                  }}
                >
                  <Icon className="size-3.5" />
                  {label}
                </Link>
              )
            })}
          </nav>

          <div className="ml-auto">
            <ConnectKitButton />
          </div>
        </div>
      </header>

      {/* ── page content ────────────────────────────────────── */}
      <main className="mx-auto max-w-6xl px-4 py-6">
        {children}
      </main>

      {/* ── footer trust line ───────────────────────────────── */}
      <footer className="border-t mt-auto py-4 px-4" style={{ borderColor: 'var(--border)' }}>
        <div className="mx-auto max-w-6xl flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs" style={{ color: 'var(--subtle)' }}>
            Contract:{' '}
            <a
              href={addrUrl(VAULT_ADDRESS)}
              target="_blank"
              rel="noopener noreferrer"
              className="mono inline-flex items-center gap-0.5 hover:underline"
              style={{ color: 'var(--muted)' }}
            >
              {fmtAddr(VAULT_ADDRESS)} <ExternalLink className="size-2.5" />
            </a>
            {' '}·{' '}
            <span style={{ color: 'var(--subtle)' }}>{CHAIN.name}</span>
            {' '}·{' '}
            <span>Gas paid in USDC</span>
          </p>
          <p className="text-xs" style={{ color: 'var(--subtle)' }}>
            Funds are non-custodial and held on-chain only. Earnback has no admin, no pause, no upgrade. Built with Arc Studio.
          </p>
          <p className="text-xs w-full" style={{ color: 'var(--warning)' }}>
            Unaudited hackathon contract with no amount caps. Use small amounts only.
          </p>
        </div>
      </footer>
    </div>
  )
}

/** Reusable glass card */
export function Card({
  children,
  className = '',
  style,
}: {
  children: React.ReactNode
  className?: string
  style?: React.CSSProperties
}) {
  return (
    <section
      className={`rounded-3xl border p-5 ${className}`}
      style={{
        background: 'var(--surface)',
        backdropFilter: 'blur(24px) saturate(200%)',
        WebkitBackdropFilter: 'blur(24px) saturate(200%)',
        borderColor: 'var(--border)',
        ...style,
      }}
    >
      {children}
    </section>
  )
}

/** Reusable inner surface (inside a card) */
export function Inner({
  children,
  className = '',
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={`rounded-2xl border p-4 ${className}`}
      style={{
        background: 'var(--surface-muted)',
        borderColor: 'var(--border)',
      }}
    >
      {children}
    </div>
  )
}

/** Section heading */
export function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2
      className="display mb-4 text-lg font-bold tracking-tight"
      style={{ color: 'var(--ink)', letterSpacing: '-0.02em' }}
    >
      {children}
    </h2>
  )
}

/** Key-value detail row */
export function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 border-b last:border-0" style={{ borderColor: 'var(--border)' }}>
      <span className="text-xs font-semibold uppercase tracking-widest shrink-0" style={{ color: 'var(--subtle)', letterSpacing: '0.07em' }}>
        {label}
      </span>
      <span className="text-sm text-right tabular-nums break-all" style={{ color: 'var(--ink-2)' }}>
        {children}
      </span>
    </div>
  )
}
