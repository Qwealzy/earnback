# Earnback UI — fix request 4 (Arc mainnet support)

Patch: `ui-fix-4.diff` (7 files, 188 lines). Verified locally on the 18 Oct export: `tsc` clean in `src/`, oxlint 0 errors (1 pre-existing warning); testnet mode `/proof` shows 8 agreements, $4.50 paid in, $4.50 withdrawn; mainnet mode (`VITE_NETWORK=mainnet`) shows the "not deployed yet" notice with no console errors. **The contract does not change.**

## What changes

1. **Network from the build environment:** `VITE_NETWORK=mainnet` builds for Arc mainnet (5042); anything else builds for testnet (default). `VITE_NETWORK` is public and holds no secret.
2. **Per-network RPC lists** in `app-config.ts` (official endpoints, docs.arc.io/arc/references/rpc-endpoints):
   - testnet reads: dRPC, QuickNode, primary; testnet log scans: QuickNode, primary.
   - mainnet reads: primary, QuickNode, dRPC; mainnet log scans: primary, QuickNode.
   - dRPC is never used for `eth_getLogs` (its free plan rejects every call; checked on testnet and mainnet, 18 Oct).
3. **wagmi config** knows both Arc chains (viem `arc` 5042 and `arcTestnet`), active one first; Ethereum mainnet stays for ENS only.
4. **`vaultScanner.ts`** takes chain and scan endpoints from `app-config.ts`.
5. **Wrong-network button** says "Switch to Arc" or "Switch to Arc Testnet" depending on the build.
6. **Not deployed yet:** while the mainnet address is empty, `App.tsx` shows a notice instead of running any read.
7. **Honesty line** in the footer: "Unaudited hackathon contract with no amount caps. Use small amounts only." (decision K1, `docs/MAINNET-PLAN.md`).
8. `/proof` texts name the active chain instead of "Arc Testnet".

## Checked on chain (18 Oct)

- `rpc.mainnet.arc.io`: chain id 0x13b2 (5042), 9,000-block `eth_getLogs` works.
- Multicall3 `0xcA11bde05977b3631167028862bE2a173976CA11` exists on mainnet (3,808 bytes), so the multicall agreement list works there.

## After the mainnet deploy

Set `NETWORK_CONFIG.mainnet.vaultAddress` and `deployBlock` in `app-config.ts`, then build with `VITE_NETWORK=mainnet`.
