# RetentionVault — contract spec (Smart Contract mode, max preset)

Build one Solidity contract, `RetentionVault`, plus Foundry tests. Purpose: a retention (holdback) amount cut from each progress payment is held by this contract, not by the payer. Half is released at provisional acceptance, the rest automatically after the defect period. During the defect period the payer may open one claim at a time. The retention rate is set by an actuarial experience-rating formula from the payee's record in this contract.

## Hard constraints
- Solidity 0.8.28, evm `paris`, optimizer on (200 runs), OpenZeppelin v5 (`SafeERC20`, `ReentrancyGuard`, `Math.sqrt`).
- Token: USDC ERC-20 passed in constructor (Arc: `0x3600000000000000000000000000000000000000`, 6 decimals). No `payable`, `receive`, `fallback`, `delegatecall`, upgradeability, randomness.
- No owner, no admin, no pause, no sweep or emergency withdraw. All global parameters are immutable constructor arguments.
- Pull payments only: every payout increases `withdrawable[account]`; tokens leave only via `withdraw()`. No external calls inside loops.
- Checks-effects-interactions + `nonReentrant` on every state-changing external function. Accounting uses internal counters, never `balanceOf(this)`.
- Custom errors, explicit role checks on every function. Multiply before divide.

## Constructor (immutable)
`usdc, priorA, priorB, zWad` (WAD = 1e18), `capBps` (≤10000), `floorBps` (>0, ≤capBps), `maxAgreementValue`, `maxTotalHeld`, `minRecordValue` (token units, 6 decimals). Validate all.

## Agreement
Fields: `payer, payee, arbiter` (arbiter may be zero; must differ from payer and payee), `contractValue` (>0, ≤maxAgreementValue), `maxBps` (≤capBps), `minBps` (floorBps ≤ minBps ≤ maxBps), `defectPeriod` (60 s … 730 days), `responseWindow`, `arbiterWindow` (60 s … 30 days), `retentionBps` (set at accept), `paid, retained, releasedToPayee, awardedToPayer`, `payerSigned, payeeSigned, defectEnd`, `state`, `claim {amount, evidenceHash, openedAt, responseDeadline, arbiterDeadline, status}`, `upheld` (bool).
States: `Proposed, Active, DefectPeriod, Closed, Cancelled`. Claim status: `None, Open, Disputed`.
`pool(id) = retained − releasedToPayee − awardedToPayer`. `available(id) = pool(id) − openClaimAmount`.

## Functions
- `createAgreement(payee, arbiter, contractValue, maxBps, minBps, defectPeriod, responseWindow, arbiterWindow) → id` — caller is payer; payer ≠ payee; state `Proposed`.
- `cancelProposal(id)` — payer, `Proposed` → `Cancelled`.
- `acceptAgreement(id)` — payee, `Proposed`. `retentionBps = min(maxBps, max(minBps, rateFor(payee, maxBps)))`, frozen forever. → `Active`.
- `payProgress(id, amount, bytes32 ref)` — payer, `Active`, amount>0, `paid+amount ≤ contractValue`, `totalHeld+amount ≤ maxTotalHeld`. `safeTransferFrom(payer, this, amount)`. `cut = amount*retentionBps/10000` (round down); `withdrawable[payee] += amount−cut`; `retained += cut`; `paid += amount`.
- `signProvisional(id)` — payer or payee, `Active`, each once. When both signed: `half = pool/2` (round down) released to payee; `defectEnd = now + defectPeriod`; → `DefectPeriod`.
- `openClaim(id, amount, bytes32 evidenceHash)` — payer, `DefectPeriod`, `now < defectEnd`, no open claim, `0 < amount ≤ available`. Status `Open`, `responseDeadline = now + responseWindow`.
- `respondClaim(id, bool accept)` — payee, `Open`, `now ≤ responseDeadline`. Accept → award `amount` to payer. Reject → `Disputed`, `arbiterDeadline = now + arbiterWindow`.
- `resolveUnanswered(id)` — anyone, `Open`, `now > responseDeadline`: silence = acceptance → award to payer.
- `arbiterDecide(id, payerShare)` — arbiter, `Disputed`, `now ≤ arbiterDeadline`, `payerShare ≤ amount`: award `payerShare` to payer; the rest stays in the pool (payee's).
- `resolveByDefault(id)` — anyone, `Disputed`, and (`arbiter == 0` or `now > arbiterDeadline`): whole amount stays in the pool (payee's). Nothing to payer.
- `finalize(id)` — anyone, `DefectPeriod`, `now ≥ defectEnd`, no open/disputed claim: remaining pool → payee; → `Closed`; update record.
- `withdraw()` — sends caller's whole `withdrawable` balance.
"Award to payer" = `awardedToPayer += x; withdrawable[payer] += x; upheld = true` (only if x>0). Closing a claim resets claim status to `None`.

## Record and rate (must match exactly)
Record per payee: `n` = closed agreements, `k` = closed agreements with `upheld`. Count only if `payer ≠ payee` and `contractValue ≥ minRecordValue`; once per agreement.
```
function pUpper(uint a1, uint b1) internal view returns (uint) {   // WAD
    uint s = a1 + b1;
    uint pHat = a1 * WAD / s;
    uint variance = (a1 * WAD / s) * (b1 * WAD / s) / WAD * WAD / (s + WAD);
    uint sd = Math.sqrt(variance * WAD);
    return pHat + zWad * sd / WAD;
}
function rateFor(address payee, uint maxBps) public view returns (uint bps) {
    (uint n, uint k) = record(payee);
    uint pu  = pUpper(priorA + k * WAD, priorB + (n - k) * WAD);
    uint p0  = pUpper(priorA, priorB);
    bps = maxBps * pu / p0;
    if (bps > maxBps) bps = maxBps;
    if (bps < floorBps) bps = floorBps;
}
```
Also expose `record(address)`, `credibilityWad(address) = n*WAD*WAD/(n*WAD+priorA+priorB)`.

## Views
`agreement(id)`, `pool(id)`, `available(id)`, `totalHeld()` (= Σ withdrawable + Σ pools), `rateFor`, `record`.

## Events
`AgreementCreated(id,payer,payee,arbiter,contractValue)`, `AgreementAccepted(id,retentionBps,n,k)`, `AgreementCancelled(id)`, `ProgressPaid(id,amount,cut,ref)`, `ProvisionalSigned(id,signer)`, `ProvisionalAccepted(id,released,defectEnd)`, `ClaimOpened(id,amount,evidenceHash)`, `ClaimAnswered(id,accepted)`, `ClaimDecided(id,payerShare)`, `ClaimResolved(id,payerShare,reason)` (reason: accepted, silence, arbiter, default), `Finalized(id,released)`, `Withdrawn(account,amount)`.

## Tests (Foundry)
Use a MockUSDC (6 decimals) with a blocklist that reverts transfers from/to blocked addresses.
1. Unit: every function's happy path and every revert (wrong role, wrong state, deadlines). Boundary tests at `now == deadline` and `±1` for `defectEnd`, `responseDeadline`, `arbiterDeadline`.
2. Rate fixtures, `capBps=1000, floorBps=100, zWad=1e18, maxBps=500`:
   - priorA=4e17, priorB=46e17: (n,k)→bps (0,0)=500 (1,0)=421 (3,0)=321 (5,0)=259 (10,0)=175 (10,1)=435 (10,3)=500 (20,0)=106 (50,1)=121 (1000,0)=100
   - priorA=1e18, priorB=115e17: (0,0)=500 (1,0)=464 (3,0)=406 (5,0)=361 (10,0)=282 (10,1)=479 (10,3)=500 (20,0)=196 (50,1)=175 (1000,0)=100
   Test `rateFor` via a test harness that sets the record directly; also one end-to-end test where 3 real closed agreements give 321.
3. Invariants (handler pattern, `fail_on_revert=false`):
   - I1 `usdc.balanceOf(vault) ≥ totalHeld`
   - I2 `totalHeld == Σdeposited − Σwithdrawn` (ghost)
   - I3 per agreement `retained == releasedToPayee + awardedToPayer + pool`
   - I4 no call by a non-role address ever succeeds
   - I5 a blocklisted payee cannot block others' withdrawals
   - I6 a direct token transfer to the vault does not change `totalHeld`
   - R1 `floorBps ≤ retentionBps ≤ maxBps`, unchanged after accept
   - R2 arbiter can only split between payer and payee
   - R6 `n` increases once per closed agreement
   - R7 `paid ≤ contractValue`, `totalHeld ≤ maxTotalHeld`
4. `foundry.toml`: add `[profile.arc] network = "arc"` and invariant settings `runs=256, depth=100`.

## Deliverables
`src/RetentionVault.sol`, `test/` (unit, fixtures, invariants, MockUSDC), a filled `AGENTS.md`, and a README "Security" section listing the rules above and how they were tested. Deploy to Arc testnet with demo constructor values: priorA=4e17, priorB=46e17, zWad=1e18, capBps=1000, floorBps=100, maxAgreementValue=50e6, maxTotalHeld=500e6, minRecordValue=5e5.

Out of scope: advances against retention, automatic subcontractor routing, multiple concurrent claims, any UI (built later).
