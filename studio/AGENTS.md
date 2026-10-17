# RetentionVault

> Built with Arc Studio

A holdback/retention contract. A percentage of each progress payment is retained by the contract; half is released at provisional acceptance and the rest after the defect period expires. During the defect period the payer may open one claim at a time. Retention rate is set by an actuarial experience-rating formula.

---

## What This App Does

RetentionVault manages payment retentions in construction/services contracts. Key flows:
- Payer creates agreement, payee accepts (retention rate set by Bayesian formula)
- Payer makes progress payments; retention is held, remainder released to payee immediately
- Either party signs provisional acceptance; if only payee signs, a countdown starts (D10: deemed acceptance)
- Payer may object during that window; arbiter decides; if no response, silence = acceptance
- During defect period, payer may file one claim at a time (arbiter resolution path)
- After defect period ends, remaining pool released to payee; record updated for future rate-setting

## Contracts

### RetentionVault (D10)
- **Source:** `contracts/RetentionVault.sol`
- **Arc Testnet (D10):** `0xfa5e10d370140acbdfe977437be6742908449b39`
  - Tx: `0x8c12dccbffcd17fba5fab6a792d6e0effdee4f5f0f609dda197400bb937fcbc0`
  - Explorer: https://explorer.testnet.arc.io/address/0xfa5e10d370140acbdfe977437be6742908449b39
- **Arc Testnet (original, pre-D10):** `0xdfc694cc97aea11238f0933e07e493ecd79f5891`

### Constructor parameters (demo / testnet)
| Parameter | Value |
|---|---|
| usdc | 0x3600000000000000000000000000000000000000 |
| priorA | 4e17 (400000000000000000) |
| priorB | 46e17 (4600000000000000000) |
| zWad | 1e18 (1000000000000000000) |
| capBps | 1000 |
| floorBps | 100 |
| maxAgreementValue | 50000000 (50 USDC) |
| maxTotalHeld | 500000000 (500 USDC) |
| minRecordValue | 500000 (0.5 USDC) |

## Tech Stack

- Contracts: Solidity 0.8.28, OpenZeppelin v5.1.0 (SafeERC20, ReentrancyGuard, Math.sqrt), Foundry
- Chain: Arc Testnet (Chain ID: 5042002)
- Token: USDC at 0x3600000000000000000000000000000000000000 (6 decimals)

## Tests

- `contracts/test/RetentionVaultUnit.t.sol` — unit + D10 path tests (148 tests)
- `contracts/test/RetentionVaultFixtures.t.sol` — rateFor fixture table (both prior sets A+B, end-to-end)
- `contracts/test/RetentionVaultInvariant.t.sol` — invariants I1–I6, R1, R2, R6, R7, R8 (handler pattern)
- `contracts/test/MockUSDC.sol` — 6-decimal ERC-20 with blocklist

Run with:
```bash
bun run contracts:test
# or
forge test
```

## Key Files

- `contracts/RetentionVault.sol` — main contract
- `contracts/contract-metadata/RetentionVault.json` — deployment metadata
- `foundry.toml` — includes [profile.arc] network="arc", invariant runs=256 depth=100
- `docs/security-review.md` — full security review notes

## UI (built this session)

Routes:
- `/` — Agreement list (event log scan) + Create Agreement form
- `/agreement/:id` — Full agreement detail + all state-machine actions
- `/record/:address` — Payee track record + live `rateFor` preview
- `/proof` — Local keccak256 hash tool for evidence/objection hashes

Key source files:
- `src/App.tsx` — BrowserRouter with 4 routes
- `src/app-config.ts` — Network switch (testnet/mainnet), vault address, deploy block
- `src/abi/RetentionVault.ts` — Full typed ABI
- `src/hooks/useVaultRead.ts` — useAgreement, useAgreementAmounts, usePayeeRecord, useVaultParams, useWithdrawable, useRateFor
- `src/hooks/useAgreementIds.ts` — Log scanner (AgreementCreated events, batched 2000 blocks)
- `src/components/Layout.tsx` — Nav shell, Card, Inner, DetailRow, SectionTitle, Layout
- `src/components/StateBadge.tsx` — State/ClaimStatus/ProvisionalStatus pills
- `src/components/TxButton.tsx` — 4-state transaction button
- `src/components/Countdown.tsx` — Live countdown timer
- `src/utils/format.ts` — fmtUsdc, fmtAddr, fmtBps, fmtHash, fmtDatetime, etc.
- `src/utils/onchainError.ts` — wagmi/viem error parser

Design: Arc Light mode, Space Grotesk display, DM Sans body, JetBrains Mono for hashes/numbers.
