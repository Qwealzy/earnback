# RetentionVault — Security Review

## Summary

**117 tests passed, 0 failed** across unit, fixture, and invariant suites.  
Security review: max severity (Critical + High + Medium + Low), both rule-corpus and functional audits.  
Static analysis: 0 actionable findings (2 informational-only noise categories).  
One Low finding applied (USDC constructor code-presence check).

---

## Hard Rules and How They Were Tested

| Rule | Implementation | Tested by |
|---|---|---|
| No owner/admin/pause/sweep | No `Ownable`, no privileged roles, all params immutable | Audit (functional + rule-corpus): no privileged-role entry points found |
| Pull payments only | Every payout writes `withdrawable[account]`; tokens leave only via `withdraw()` | Unit: payProgress, signProvisional, respondClaim, resolveUnanswered, arbiterDecide, finalize all tested; Invariant I1, I2 |
| No `payable`, `receive`, `fallback` | Not present in source | Rule-corpus audit confirmed |
| `nonReentrant` on every state-changing external function | All 13 state-changing functions carry the modifier | Slither: no reentrancy findings; audit confirmed |
| Checks-effects-interactions | CEI order enforced: all state mutations happen before `safeTransferFrom`/`safeTransfer` | Rule-corpus audit confirmed; unit tests exercise all transfer paths |
| Accounting via internal counters | `_totalHeld`, `withdrawable`, `retained`, `releasedToPayee`, `awardedToPayer` — never `balanceOf(this)` | Invariant I2 (ghost vs. counter parity); I6 (direct transfer doesn't change totalHeld) |
| Custom errors | All 23 custom errors defined; no `require(msg, "string")` | Unit tests cover all error paths |
| Explicit role checks | `NotPayer`, `NotPayee`, `NotArbiter`, `NotParty` on every role-gated function | Unit: all wrong-role paths; Invariant I4 |
| Multiply before divide | Rate formula and cut calculation use mul-before-div where possible | Slither: `divide-before-multiply` in `pUpper` — this is the spec-mandated formula; reordering would break the fixture table. Not actionable. |
| `rateFor` fixture accuracy | Exact formula from spec copied character-for-character | Fixture tests: Set A (10 fixtures) + Set B (10 fixtures), all matching spec table exactly |

## Security Review Findings

### Applied
| Severity | Finding | Fix Applied |
|---|---|---|
| Low | Constructor did not validate `usdc` is a contract (`code.length > 0`) | Added `if (usdc_.code.length == 0) revert InvalidValue()` |

### Accepted (not actionable)
| Severity | Finding | Reason |
|---|---|---|
| Critical (functional) | `resolveUnanswered`, `resolveByDefault`, `finalize` have no role gate | Spec-intentional: these are permissionless timeout/default functions. Anyone can call them — this is the spec requirement, not a defect. |
| High (functional) | No provisional-acceptance timeout in Active state | Spec is intentionally silent on this; it is marked Out of Scope. Adding it would introduce features not in the spec. |
| Medium (rule-corpus) | Centralized stablecoin issuer can blocklist vault address | Inherent to custodying any centralized stablecoin. Cannot be fixed at the contract layer without violating other hard constraints (no upgradeability, no sweep). Operational mitigation: use USDC only on chains with acceptable trust assumptions. |
| Low (functional) | MockUSDC.mint/setBlocked have no access control | MockUSDC is a test helper, intentionally open for fuzzing. Not deployed to production. |

### Slither (static analysis)
| Finding | Category | Disposition |
|---|---|---|
| `divide-before-multiply` in `pUpper` | Medium (Slither) | Spec-mandated formula — must match fixture table exactly. Reordering changes output. Accepted. |
| `timestamp` comparisons in 6 functions | Low (Slither) | All deadline logic is inherently time-based. Accepted. |

## Invariant Coverage

| ID | Invariant | Status |
|---|---|---|
| I1 | `usdc.balanceOf(vault) >= vault.totalHeld()` | PASS (256 runs × 100 depth) |
| I2 | `totalHeld == Σdeposited − Σwithdrawn` (ghost) | PASS |
| I3 | Per agreement: `retained == releasedToPayee + awardedToPayer + pool` | PASS |
| I4 | Non-role calls on role-gated functions revert | PASS |
| I5 | Blocklisted payee cannot block others' withdrawals | PASS |
| I6 | Direct token transfer to vault does not change `totalHeld` | PASS |
| R1 | `floorBps ≤ retentionBps ≤ maxBps`, unchanged after accept | PASS |
| R2 | Arbiter can only split between payer and payee | PASS |
| R6 | `n` increases exactly once per closed agreement | PASS |
| R7 | `paid ≤ contractValue`, `totalHeld ≤ maxTotalHeld` | PASS |

## Important Operational Notes

1. **Stablecoin custody risk**: The vault holds pooled USDC. If Circle were to blocklist the vault's address, all `withdrawable` balances would be locked. This is an inherent risk of custodying centralized stablecoins and cannot be mitigated at the contract layer without violating the no-upgrade/no-sweep constraints.

2. **No provisional timeout**: If either party refuses to call `signProvisional`, the retained funds remain locked in the vault indefinitely. This is a known design limitation, explicitly out of scope per the spec.

3. **Rate formula integer math**: The `pUpper` function uses intermediate divisions that Slither flags. This is intentional and required to match the spec's fixture table. The formula is reproduced character-for-character from the spec and tested against 20 exact fixtures.

4. **`max` security review is best-effort** — it is not a substitute for an independent paid third-party audit before deploying with real user funds on mainnet.

## Audit Provenance

| Subagent | Dispatched | Files audited | Corpus rules cited |
|---|---|---|---|
| solidity-auditor | yes | 2 | sensitive-mutator-missing-explicit-access-control, centralized-stable-blocklist-frozen-vault, missing-validation-of-critical-assumptions |
| functional-auditor | yes | 2 | — |
