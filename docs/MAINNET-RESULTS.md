# Earnback — mainnet scenarios

**Network: Arc mainnet (chain 5042), real USDC.** Vault [`0xd8EA0473Cfd03FfB21BeDFfCf3A4882FF7CB9e81`](https://explorer.arc.io/address/0xd8EA0473Cfd03FfB21BeDFfCf3A4882FF7CB9e81), 18 Oct 2026.

**Every role is one of the author's own wallets.** Amounts are deliberately small (0.50–1.00 USDC per agreement).

| Role | Address |
|---|---|
| E (client, payer) | `0x451eB23355E37Eb4F8CA21778f0c68D467E93912` |
| Y (contractor) | `0x6bc18be75bFF8a9fd4636E006d520f8F5a491d9A` |
| T (subcontractor) | `0x51f83314748aacb4479043ad46b6f2Ffa4c6a5c6` |
| H (arbiter) | `0xB77aD296072f6c2ff915DBB378F5c21ACCCf4E6e` |

Settings for every agreement: max retention 500 bps, min 100 bps, defect period 600 s, response and arbiter windows 180 s (the app's Demo preset).

## Results

Read back from chain with [`arc-tests/read_agreement.sh`](../arc-tests/read_agreement.sh) (`VAULT=0xd8EA…`) and [`arc-tests/scenario_txs.py`](../arc-tests/scenario_txs.py).

| # | Scenario | Parties | Rate | Outcome |
|---|---|---|---|---|
| 0 | S1 clean completion | E → Y, 1.00 USDC in two payments | 500 bps (new contractor) | Closed; the full retention (0.05) went to Y. Record Y: n = 1, k = 0 |
| 1 | S4 claim, rejected, arbiter | E → T, arbiter H, 0.50 | 500 | Claim 0.01 → T rejected → H awarded 0.005 to E (upheld). Closed. Record T: n = 1, k = 1 |
| 2 | S7 clean record, lower rate | E → Y, 0.50 | **421 bps** | Rate frozen at acceptance from Y's record (1, 0); equals [`tools/retention_rate.py`](../tools/retention_rate.py). Closed; full retention (0.02105) to Y. Record Y: n = 2, k = 0 |
| 3 | S5 unanswered claim | E → T, no arbiter, 0.50 | 500 | Claim 0.01 → no answer in 180 s → `resolveUnanswered` → 0.01 to E (upheld). Closed. Record T: n = 2, k = 2 |

End state: all four agreements closed, every pool 0. `totalHeld` = 0.0025 USDC, T's unwithdrawn balance (T withdrew before the last finalize).

Transactions: **34 vault transactions, all status 1**, fees 0.082814 USDC in total (about 0.0024 per transaction; USDC `approve` transactions not counted). Full list with block, event, agreement, sender and fee: [`mainnet-scenario-txs.json`](mainnet-scenario-txs.json). The same transactions are listed per scenario on the live proof page: [earnback.numeralabs.xyz/proof](https://earnback.numeralabs.xyz/proof).

## Key transactions

| Scenario | Step | Transaction |
|---|---|---|
| S1 | create | [`0xff9e7f62…0e17`](https://explorer.arc.io/tx/0xff9e7f62f7054cdad98ead3625799102b00e34ae626da3408e400b1cdf5f0e17) |
| S1 | finalize | [`0x0b70c7f0…07df`](https://explorer.arc.io/tx/0x0b70c7f07366189eba7382ca72da912435926c873e579c345bdcd8c4ec3907df) |
| S4 | claim (E) | [`0x965f8532…358d`](https://explorer.arc.io/tx/0x965f853226b96cfe2cb51c088e370fb21bda7453a894ba103d2c0a412750358d) |
| S4 | reject (T) | [`0x17de00dc…f685`](https://explorer.arc.io/tx/0x17de00dc2e2b985b94f7f986b333f3472cf58297e41311eb9b7cb9c0c4b9f685) |
| S4 | arbiter decision (H) | [`0xde15e6ba…3a70`](https://explorer.arc.io/tx/0xde15e6ba5c7cff58156f08565e23d94a5c4279328cf51e59891d98e4de3c3a70) |
| S7 | accept, rate frozen at 421 bps | [`0x89341c23…1277`](https://explorer.arc.io/tx/0x89341c233d270d6a61d4f1eaf6e93e9a38ac9a19d3293263e94917e1269b1277) |
| S5 | claim (E) | [`0xb0b14133…bcaf`](https://explorer.arc.io/tx/0xb0b14133dd7dd2adfcf545d659af700ceb1da1b2db49d8fd55ab22458d06bcaf) |
| S5 | resolve unanswered | [`0x9c350bb3…1c6c`](https://explorer.arc.io/tx/0x9c350bb34a85a64a8bd65da209e97a7b2a490c686cbf2307c4a98bd3db1c1c6c) |

The testnet walkthrough ([`TESTNET-RESULTS.md`](TESTNET-RESULTS.md)) covers the remaining flows (subcontractor chain, accepted claim, silent arbiter, deemed provisional acceptance).
