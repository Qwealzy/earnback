# Earnback UI — fix request 6 (mainnet proof scenarios)

Attachment: [`ui-fix-6/proof-scenarios.ts`](ui-fix-6/proof-scenarios.ts), sent to Studio as `proof-scenarios.ts.txt` (8,144 characters). Generated from the vault's mainnet event log ([`../mainnet-scenario-txs.json`](../mainnet-scenario-txs.json)): four scenario cards (S1, S4, S5, S7), 34 transactions with the fee actually paid, and an ownership note on every card. **The contract does not change.**

Checked locally before sending, in a mainnet build (`VITE_NETWORK=mainnet`): `/proof` shows the four cards and 34 explorer links; oxlint 0 errors. In testnet builds `PROOF_SCENARIOS` is empty by design, so the Studio preview (testnet) shows "No scenarios yet".

Prompt (one line):

> UI-FIX-6: Replace src/proof-scenarios.ts with the attached file (proof-scenarios.ts.txt) exactly as is, byte for byte, and change no other file. It adds four real Arc mainnet scenarios (S1, S4, S5, S7) for the /proof page, generated from the vault's event logs and checked locally in a mainnet build. On testnet builds PROOF_SCENARIOS is empty by design, so the testnet preview should still show "No scenarios yet". The contract does not change. After applying, run tsc and oxlint and report the results; do not rewrite or reformat the file.

Result: Studio applied it; the exported `studio/src/proof-scenarios.ts` differs from the attachment only in writing `’` as the escape `’` (the same string at runtime). No other source file changed.
