# Earnback UI — fix request 3 (from the testnet walkthrough)

We ran all eight scenarios end to end on Arc Testnet against the deployed vault (`0xfa5e…9b39`), eight agreements, about 70 transactions, every result read back from the chain. **The contract behaved exactly as specified, including the actuarial rate (364, 421 and 500 bps matched the reference). Do not change the contract.** All problems were in the UI.

Part A is already fixed and verified locally: apply the attached `ui-fix-3.diff.txt` (6 files). Locally: `tsc` clean in `src/`, oxlint 0 errors (the same 1 pre-existing warning). Part B still needs your changes. Part C renames the product.

## A. Apply the diff (verified in the walkthrough)

1. **Agreement actions follow the contract enums** (`AgreementPage.tsx`, `StateBadge.tsx`). The UI assumed `State 2 = Disputed` and `ClaimStatus 0 = Open`. The contract has `State {Proposed, Active, DefectPeriod, Closed, Cancelled}`, `ClaimStatus {None, Open, Disputed}` and `ProvisionalStatus {None, Requested, Disputed}`. Before the fix no agreement could be completed. Every button is now gated exactly like the contract check:

| Button | Shown when |
|---|---|
| Cancel / Accept Agreement | `Proposed`, payer / payee |
| Approve (exact), then Pay Progress | `Active`, payer; Pay only once the USDC allowance covers the amount |
| Request / Sign Provisional Acceptance | `Active`, that party has not signed; payer not while objected |
| Object | payer, `Requested`, `now <= provisionalDeadline` |
| Decide: Accept / Reject (provisional) | arbiter, objected, `now <= provisionalArbiterDeadline` |
| Resolve Provisional (deemed accepted) | `Active` and the request or objection deadline has passed (D10) |
| Open Claim | `DefectPeriod`, payer, no claim, `now < defectEnd`; amount `<= available(id)` |
| Accept / Reject Claim | payee, claim `Open`, `now <= responseDeadline` |
| Decide (claim) | arbiter, claim `Disputed`, `now <= arbiterDeadline`; payer share 0 allowed |
| Resolve Unanswered / Resolve By Default | claim `Open` past response deadline / `Disputed` past arbiter deadline or no arbiter |
| Finalize | `DefectPeriod`, no claim, `now >= defectEnd` (anyone) |
| **Withdraw** (was missing everywhere) | connected account has `withdrawable > 0` |

   A 5-second timer re-renders deadline buttons; each transaction is handled once (by hash); the pay amount is kept after Approve.
2. **`utils/rateCalc.ts` rewritten.** The old "BigInt replica" was a different formula and added `n`, `k` to WAD priors unscaled. It was right only for a payee with no record: for record (2, 0) the chain said 364 bps, the replica 500. It now mirrors `pUpper` and `rateFor` step by step (floor `isqrt` like OpenZeppelin `Math.sqrt`, same division order) and matches the reference on 13 fixtures. The record page, the chart and the form preview use it.
3. **Form preview "Credibility Z"** showed the prior mean (0.08); a new payee has Z = 0.
4. **RPC fallback** (`config.ts`, `lib/vaultScanner.ts`). The primary endpoint rate-limited us during the walkthrough. Reads now use `fallback([drpc, quicknode, primary])`, all from docs.arc.io/arc/references/rpc-endpoints. Do the same for mainnet when its address is set.

## B. Still to change (not in the diff)

5. **Agreement list is empty after creating an agreement.** `vaultScanner` caches the scan at first load, and a full log scan from the deploy block is slow and rate-limited. Replace the list source: read `agreement(id)` for `id = 0, 1, 2…` until `payer == 0x0` (batched multicall), newest first. Keep the log scan only for the proof page totals. Refresh the list after a successful `createAgreement`.
6. **Wrong event signature in `vaultScanner`.** It searches `ProgressPaid(uint256 indexed id, address indexed payer, uint256 amount, bytes32 ref)`. The contract emits `ProgressPaid(uint256 indexed id, uint256 amount, uint256 cut, bytes32 ref)`, so total paid-in on `/proof` is always 0. Use the contract's ABI events.
7. **Evidence and objection fields write raw text into `bytes32`** (truncated at 32 bytes and public). Per the design only a digest goes on chain: if the input is not a 0x bytes32, store `keccak256(toBytes(text))` and say so under the field.
8. **Form preview ignores the payee.** It always shows the new-payee rate (n = 0). Once the payee address is valid, read `record(payee)` and `rateFor(payee, maxBps)` and show n, k, Z, the rate and "capital freed vs max" for that payee.

## C. Rename to **Earnback**

- `APP_NAME`, page title, header and footer: "Earnback". Keep "Built with Arc Studio".
- Tagline under the title on `/` and `/proof`: "Retention that pays back: a neutral escrow for construction and software holdbacks. Clean track records earn lower retention."
- Do not rename the contract or its ABI.

## D. Acceptance (paste the actual outputs)

- `bun run typecheck`: errors only in `scripts/compass-deploy.ts`. `bun run lint`: 0 errors.
- Preview console after a clean restart: no errors.
- `/`: lists agreements #0–#7 (all "Closed"). `/agreement/7`: badge "Closed", no action buttons for a non-party.
- `/record/0x6bc18be75bFF8a9fd4636E006d520f8F5a491d9A` with max bps 500: n = 2, k = 0, on-chain rate and replica both **3.64%**.
- `/proof`: total paid-in is non-zero.
