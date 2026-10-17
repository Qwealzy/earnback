/**
 * /tools/hash — Evidence hash tool (keccak256 of a file or text).
 * Moved here from /proof to keep that route as the vault dashboard.
 */
import React, { useState, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Shield, Upload, Copy, CheckCircle } from 'lucide-react'
import { Card, Inner, Layout } from '@/components/Layout'
import { keccak256 } from 'viem'

type HashMode = 'file' | 'text'

export function HashToolPage() {
  const [mode, setMode] = useState<HashMode>('file')
  const [text, setText] = useState('')
  const [fileName, setFileName] = useState<string | null>(null)
  const [hash, setHash] = useState<string | null>(null)
  const [computing, setComputing] = useState(false)
  const [copied, setCopied] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const computeFromBytes = useCallback((bytes: Uint8Array) => {
    setComputing(true)
    try {
      const result = keccak256(bytes)
      setHash(result)
    } finally {
      setComputing(false)
    }
  }, [])

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    setHash(null)
    const reader = new FileReader()
    reader.onload = ev => {
      const buf = ev.target?.result
      if (buf instanceof ArrayBuffer) computeFromBytes(new Uint8Array(buf))
    }
    reader.readAsArrayBuffer(file)
  }

  function handleText() {
    if (!text.trim()) return
    computeFromBytes(new TextEncoder().encode(text))
  }

  function copyHash() {
    if (!hash) return
    void navigator.clipboard.writeText(hash).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <Layout>
      <div className="max-w-xl mx-auto">
        <div className="mb-4 flex items-center gap-2">
          <Link to="/" className="inline-flex items-center gap-1 text-sm font-medium" style={{ color: 'var(--muted)' }}>
            <ArrowLeft className="size-3.5" /> Agreements
          </Link>
        </div>

        <div className="mb-5 flex items-center gap-2">
          <Shield className="size-5" style={{ color: 'var(--accent)' }} />
          <h1 className="display text-xl font-bold" style={{ color: 'var(--ink)', letterSpacing: '-0.02em' }}>
            Evidence Hash Tool
          </h1>
        </div>
        <p className="mb-6 text-sm" style={{ color: 'var(--muted)' }}>
          Generate a keccak256 hash of a file or text string. Use this hash as the{' '}
          <code className="mono mx-0.5 rounded px-1 py-0.5 text-xs" style={{ background: 'var(--surface-muted)' }}>evidenceHash</code>
          {' '}when opening a defect claim, or as the{' '}
          <code className="mono mx-0.5 rounded px-1 py-0.5 text-xs" style={{ background: 'var(--surface-muted)' }}>reasonHash</code>
          {' '}when objecting to provisional acceptance.
          The hash is computed locally — nothing is uploaded.
        </p>

        <Card>
          <div className="flex gap-1 mb-5 rounded-2xl p-1" style={{ background: 'var(--surface-muted)' }}>
            {(['file', 'text'] as HashMode[]).map(m => (
              <button
                key={m}
                onClick={() => { setMode(m); setHash(null) }}
                className="flex-1 rounded-xl py-2 text-sm font-semibold capitalize transition-all"
                style={{
                  background: mode === m ? 'var(--surface)' : 'transparent',
                  color: mode === m ? 'var(--ink)' : 'var(--muted)',
                  boxShadow: mode === m ? '0 1px 4px rgba(18,45,69,0.08)' : undefined,
                }}
              >
                {m}
              </button>
            ))}
          </div>

          {mode === 'file' && (
            <div>
              <input ref={fileRef} type="file" className="sr-only" onChange={handleFile} />
              <button
                onClick={() => fileRef.current?.click()}
                className="w-full flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed py-10 transition-colors hover:border-[var(--accent)]/40"
                style={{ borderColor: 'var(--border)' }}
              >
                <Upload className="size-6" style={{ color: 'var(--muted)' }} />
                <span className="text-sm font-medium" style={{ color: 'var(--muted)' }}>
                  {fileName ?? 'Click or drop a file'}
                </span>
                {fileName && <span className="text-xs" style={{ color: 'var(--subtle)' }}>Click to replace</span>}
              </button>
            </div>
          )}

          {mode === 'text' && (
            <div className="flex flex-col gap-3">
              <textarea
                rows={5}
                className="w-full rounded-2xl border px-4 py-3 text-sm outline-none focus:border-[var(--accent)] resize-none mono"
                style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)', color: 'var(--ink)' }}
                placeholder="Paste or type your evidence text…"
                value={text}
                onChange={e => setText(e.target.value)}
              />
              <button
                onClick={handleText}
                disabled={!text.trim() || computing}
                className="self-start rounded-2xl px-5 py-3 text-sm font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: 'var(--accent)' }}
              >
                {computing ? 'Computing…' : 'Compute Hash'}
              </button>
            </div>
          )}

          {hash && (
            <Inner className="mt-5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-widest mb-1.5" style={{ color: 'var(--subtle)', letterSpacing: '0.07em' }}>
                    keccak256
                  </p>
                  <p className="mono text-sm break-all" style={{ color: 'var(--ink)' }}>{hash}</p>
                </div>
                <button onClick={copyHash} className="shrink-0 rounded-xl p-2 transition-colors hover:bg-black/5" title="Copy">
                  {copied
                    ? <CheckCircle className="size-4" style={{ color: 'var(--success)' }} />
                    : <Copy className="size-4" style={{ color: 'var(--muted)' }} />
                  }
                </button>
              </div>
            </Inner>
          )}
        </Card>
        <p className="mt-4 text-xs" style={{ color: 'var(--subtle)' }}>
          Retain the original file or text. The on-chain hash can be verified later by anyone who has the pre-image.
        </p>
      </div>
    </Layout>
  )
}
