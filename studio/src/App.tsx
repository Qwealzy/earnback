import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AgreementsPage } from '@/pages/AgreementsPage'
import { AgreementPage } from '@/pages/AgreementPage'
import { RecordPage } from '@/pages/RecordPage'
import { ProofPage } from '@/pages/ProofPage'
import { HashToolPage } from '@/pages/HashToolPage'
import { IS_DEPLOYED, CHAIN } from '@/app-config'

export default function App() {
  if (!IS_DEPLOYED) {
    return (
      <div className="flex min-h-dvh items-center justify-center p-6" style={{ background: 'var(--bg-gradient)' }}>
        <div className="max-w-md rounded-3xl p-6 text-center" style={{ background: 'var(--surface)', color: 'var(--muted)' }}>
          <p className="display text-lg font-bold" style={{ color: 'var(--ink)' }}>Earnback</p>
          <p className="mt-2 text-sm">The {CHAIN.name} contract is not deployed yet. Set its address and deploy block in app-config.ts.</p>
        </div>
      </div>
    )
  }
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<AgreementsPage />} />
        <Route path="/agreement/:id" element={<AgreementPage />} />
        <Route path="/record/:address" element={<RecordPage />} />
        <Route path="/proof" element={<ProofPage />} />
        <Route path="/tools/hash" element={<HashToolPage />} />
      </Routes>
    </BrowserRouter>
  )
}
