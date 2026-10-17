# RetentionVault — UI spec (Build mode)

Build the web app for the already-deployed `RetentionVault` contract in this project. **Do not change `contracts/RetentionVault.sol`.** Use the existing stack: React 18, wagmi + viem, connectkit, Tailwind, sonner, and the helpers in `src/onchain-money.ts` (`parseUsdc`, `formatUsdc`), `src/onchain-wait.ts`, `src/onchain-facts.ts`. UI language: English. Static site, no backend, no secrets in the frontend.

## Config (one file, `src/app-config.ts`)
- `APP_NAME = "RetentionVault"` (working title; must be changeable in one place).
- `NETWORK = "testnet"` with two entries: testnet (chain 5042002, current address `0xfA5E10d370140AcBDfe977437be6742908449b39`, `DEPLOY_BLOCK = 67543436`) and mainnet (chain 5042, `rpc.mainnet.arc.io`, `explorer.arc.io`, address and block left empty for now). Build the mainnet chain with `defineChain` from `onchain-facts.ts` values. Only the active network is used.
- ABI: use the compiled artifact `contracts/out/RetentionVault.sol/RetentionVault.json`.
- USDC: `0x3600…0000`, 6 decimals. Never use native 18-decimal values in the UI.

## Global rules
- Wallet: injected (MetaMask, Rabby) via connectkit; prompt to add/switch to the active Arc network.
- Approvals: before `payProgress`, request `approve` for **exactly** the payment amount (never unlimited). Show allowance state.
- Every write button has four states: idle, waiting for signature, pending onchain, confirmed/failed (with explorer link). Use sonner toasts.
- Fees shown in USD (gas is USDC on Arc), never gwei.
- Amounts always as USDC with 2–6 decimals; percentages from bps (500 → 5.00%).
- Every pending step shows a live countdown and one sentence: "When this ends: …".
- Trust line in the header/footer: "Funds sit in the contract. No admin key. When the period ends, the retention goes to the payee automatically."
- Wording: "retention", "guarantee period", "defect claim", "provisional acceptance". Do not use insurance words (insurance, policy, premium).
- Responsive (mobile 375 px), accessible labels, keep the "Built with Arc Studio" badge.

## Routes
### 1. `/` — Agreements
- Hero (one sentence): "Retention money that no one can freeze, no one can spend, and that shrinks as your track record grows."
- Wallet-connected list of agreements where the user is payer, payee or arbiter (read `AgreementCreated` logs from `DEPLOY_BLOCK` in chunks of 10,000 blocks with a short delay; cache in memory). Columns: id, role, counterparty, value, rate, state badge, next deadline.
- "New agreement" form → `createAgreement`. Fields: payee, arbiter (optional), contract value (USDC), max %, min %, guarantee period, response window, arbiter window. Presets: **Demo** (10 min / 3 min / 3 min) and **Real** (365 days / 14 days / 14 days).
- Live preview under the form for the entered payee: record `n`, `k`, `rateFor(payee, maxBps)`, credibility `Z`, and **"Capital freed vs fixed max: X USDC"** = `(maxBps − rate) × value`.

### 2. `/agreement/:id` — Agreement
- State badge derived only from the contract's `State`, `ProvisionalStatus` and `ClaimStatus` enums (no other source): Proposed, Active, Provisional requested, Provisional disputed, Guarantee period, Defect claim open, Defect claim disputed, Closed, Cancelled.
- Money panel: value, paid, retention rate, retained, in pool, released to payee, awarded to payer, available, your withdrawable balance.
- Timeline from events (`ProgressPaid`, `ProvisionalSigned`, `ProvisionalRequested`, `ProvisionalObjected`, `ProvisionalDecided`, `ProvisionalResolved`, `ProvisionalAccepted`, `ClaimOpened`, `ClaimAnswered`, `ClaimDecided`, `ClaimResolved`, `Finalized`, `Withdrawn`) with explorer links.
- Role-based actions (show only what the connected address may do now):
  - payer: pay progress (approve + pay, optional reference text → `bytes32` keccak), sign provisional acceptance, object (reason file → hash), open defect claim (amount + evidence file → hash), cancel proposal;
  - payee: accept agreement (show the rate that will be frozen first), sign provisional acceptance, accept/reject claim;
  - arbiter: decide provisional dispute, split a disputed claim (slider 0…amount);
  - anyone: resolve provisional (after deadline), resolve unanswered claim, resolve by default, finalize;
  - everyone with a balance: withdraw.
- Evidence and reason files are hashed **locally** with `keccak256` over the file bytes; the file is never uploaded. Show the hash.

### 3. `/record/:address` — Track record (the actuarial panel)
- Show `n`, `k`, posterior mean `p̂`, credibility `Z`, prudent upper bound `p_upper`, rate for max 5%.
- Explain in 4 lines: Beta-Binomial experience rating; a new payee pays the maximum; the rate falls as the prudent estimate of defect-claim frequency falls; a claim pushes it back up. Show the prior used (`priorA`, `priorB`, `zWad`) and the note "demo parameters; production uses Beta(1, 11.5)".
- Chart: rate vs number of clean closed agreements (0…30) and the same with 1 upheld claim. Compute it client-side with a BigInt replica of `pUpper`/`rateFor` (same integer steps as the contract) and verify the current point equals `rateFor` from the chain; show a warning if not.

### 4. `/proof` — Proof page (works with no wallet)
- Network name, contract address (explorer link), Sourcify link placeholder, live `totalHeld()`, number of agreements, total paid in, total withdrawn.
- Scenario cards from a config list (`src/proof-scenarios.ts`, initially empty): title, roles, list of tx hashes; each tx shows function, amount, USD fee and explorer link.
- Honesty lines (editable in config): "Roles were played by N different people with their own wallets", "Demo parameters (minutes instead of months)", "Unaudited, amounts capped at 50 USDC per agreement and 500 USDC in total".

## Deliverables
- Pages above, `bun run typecheck` and `bun run lint` clean, preview working against the testnet contract.
- Update `AGENTS.md` with the UI file map. Do not add features that are not in this spec; if something is ambiguous, ask first.
