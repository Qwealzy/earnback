# RetentionVault — change request D10: deemed provisional acceptance

Problem (found by your functional auditor, finding 2): if the payer never signs provisional acceptance, the retention stays in `Active` forever. This is exactly the withholding problem the product exists to solve. Apply the change below to `contracts/RetentionVault.sol`, keep every hard constraint of SPEC.md, and keep all existing tests green.

## New behaviour
Add `ProvisionalStatus { None, Requested, Disputed }` and per-agreement fields `provisionalStatus`, `provisionalDeadline`, `provisionalArbiterDeadline`, `provisionalObjectionHash`.

- `signProvisional(id)` (existing, payer or payee, `Active`):
  - When the **payee** signs and the payer has not: set `provisionalStatus = Requested`, `provisionalDeadline = now + responseWindow`.
  - When both have signed (in any order): accept provisional acceptance immediately (existing release logic).
  - The payer may sign while `Requested` (accepts). The payer may not sign while `Disputed`.
- `objectProvisional(id, bytes32 reasonHash)` — payer, `Active`, `provisionalStatus == Requested`, `now ≤ provisionalDeadline`: set `Disputed`, `provisionalArbiterDeadline = now + arbiterWindow`, store `reasonHash`.
- `arbiterDecideProvisional(id, bool accept)` — arbiter, `Disputed`, `now ≤ provisionalArbiterDeadline`:
  - accept → accept provisional acceptance;
  - reject → `payeeSigned = false`, `provisionalStatus = None` (the payee may request again later).
- `resolveProvisional(id)` — anyone:
  - `Requested` and `now > provisionalDeadline` → accept (silence = acceptance, reason "silence");
  - `Disputed` and (`arbiter == 0` or `now > provisionalArbiterDeadline`) → accept (reason "default");
  - otherwise revert.
- "Accept provisional acceptance" is one internal function used by all paths: release `pool/2` to payee, `defectEnd = now + defectPeriod`, state `DefectPeriod`, clear provisional status, emit `ProvisionalAccepted`.
- Events: `ProvisionalRequested(id, deadline)`, `ProvisionalObjected(id, reasonHash)`, `ProvisionalDecided(id, accepted)`, `ProvisionalResolved(id, reason)`.

## Also fix
- Constructor: require `priorA_ > 0` and `priorB_ > 0` (with `priorA = 0`, `rateFor` divides by zero and every `acceptAgreement` reverts).

## Tests to add
- Unit: each new path and revert (wrong role, wrong state, `now == deadline` and ±1 for both deadlines, payer cannot sign while `Disputed`, arbiter reject then payee re-request).
- Invariant R8: an agreement in `Active` with `provisionalStatus != None` always has a reachable path to `DefectPeriod` that does not need the payer (silence or default), except after an explicit arbiter rejection.
- Existing invariants I1–I6, R1, R2, R6, R7 must still hold.

## Report back (paste verbatim)
1. The final summary line(s) of `forge test` for all suites (passed / failed / skipped counts).
2. The same for `FOUNDRY_PROFILE=arc forge test`. If the arc profile cannot run in this environment, say so explicitly instead of skipping it silently.
3. Slither findings after the change.
4. Then redeploy to Arc testnet with the same demo constructor values and give the new address and tx hash.

Do not change anything else. Do not build a UI yet.
