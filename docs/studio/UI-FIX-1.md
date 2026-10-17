# RetentionVault UI — fix request 1 (verified locally)

Every change below was reproduced and verified outside Studio: Studio export of 16 Oct 22:52, `bun install --frozen-lockfile`, Vite dev server, browser checks; typecheck of `src/` clean; oxlint 0 errors (same 1 pre-existing warning). The exact patch is in the attached `ui-fix-1.diff`. **Do not change the contract.**

## A. Preview environment (no code change needed)
The Tailwind config in the export already works. Locally, Vite serves `/src/index.css` with `.rounded-3xl`, `.p-5`, `.grid-cols-3` generated and no raw `@tailwind` lines, and the cards render with 16 px radius and padding.

The unstyled preview came from the sandbox, not the code: a stale Vite process was holding port 5173. Before restarting, kill every Vite/bun process on 5173, clear `node_modules/.vite`, and start once from `/home/user/app`. Keep the current Tailwind/PostCSS config (any of your cwd-independent variants is fine). Do not add more config changes for styling.

## B. Code fixes (apply `ui-fix-1.diff`; if the context lines differ because of your last partial turn, apply the same changes by hand)
1. **`/record` crashes with a blank page** (`Cannot read properties of undefined (reading 'toString')`, `RecordPage.tsx`).
   - Cause: `record(address)` has two outputs, and viem decodes them as a tuple `[n, k]`, not `{ n, k }`, so `record.n` is undefined.
   - Fix: read `recordData?.[0].result` as `readonly [bigint, bigint]` and build `{ n: t[0], k: t[1] }`.
2. **`/record` label:** `zWad` is the prudence margin in standard deviations, not "credit damping". Show it as `(1.0000 σ prudence margin)`.
3. **Demo preset always reverts:** `minBps: '0'` is below `floorBps` (100).
   - Set Demo to `maxBps: '500'`, `minBps: '100'`, and Real to `maxBps: '500'`. 5 % is the design's maximum; the fixtures use 500.
   - Update the two preset descriptions: "Demo: 10 min guarantee period and 3 min windows…", "Real: 365-day guarantee period, 14-day windows, 5% max retention."
4. **Create-form validation:**
   - Arbiter is optional (empty → zero address, also in the `createAgreement` args).
   - Payee must differ from the connected payer.
   - A non-zero arbiter must differ from payer and payee.
   - `minBps` must be ≥ `floorBps`.
5. **`/agreement/:id` for an unknown id** showed a fake "Proposed" agreement with zero addresses. `agreement(id)` returns a zeroed struct, so show "not found" when `ag.payer` is the zero address.
6. Remove the unused `'approveOpenClaim'` action key (opening a claim moves no money, so it needs no approval).

## C. Acceptance (please paste the results)
- `bun run typecheck` errors only in `scripts/compass-deploy.ts` (missing `@circlefin/compass-chains`), none in `src/`.
- `bun run lint`: 0 errors.
- Reload the preview and confirm:
  - `/`: cards have rounded corners and padding.
  - `/record/0x0000000000000000000000000000000000000001`: shows n = 0, k = 0, the on-chain rate equals the replica, and the chart.
  - `/agreement/999`: shows "not found".
  - `/proof`: shows the live stats.
