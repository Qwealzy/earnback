# Earnback

**Retention that pays back.** A neutral, non-custodial escrow for retention (holdback) money in construction and software work, on Arc. Contractors with a clean track record earn a lower retention rate, priced with an actuarial (Bayesian experience-rating) model that runs on chain.

Built with Arc Studio for *Arc Microgrants 2*.

| | |
|---|---|
| Arc mainnet contract | [`0xd8EA0473Cfd03FfB21BeDFfCf3A4882FF7CB9e81`](https://explorer.arc.io/address/0xd8EA0473Cfd03FfB21BeDFfCf3A4882FF7CB9e81) (chain 5042) |
| Source verification | [Sourcify: exact match](https://repo.sourcify.dev/5042/0xd8EA0473Cfd03FfB21BeDFfCf3A4882FF7CB9e81) (creation and runtime bytecode) |
| Deploy transaction | [`0x8761d0d4…548b`](https://explorer.arc.io/tx/0x8761d0d431eea820354366f32a5833936397a0d09fe0a87015ca560a5e8a548b), block 26,510,136 |
| Live app | _link added after hosting_ |
| Testnet vault (rehearsal, 8 agreements) | [`0xfA5E10d3…9b39`](https://explorer.testnet.arc.io/address/0xfa5e10d370140acbdfe977437be6742908449b39), Sourcify exact match |

## The problem

A share of every progress payment (typically 2.5–10%) is held back as a guarantee until the defect period ends. Today the client holds that money: it can be paid late, used as leverage, or lost if the client fails. Every contractor pays the same rate, whatever their record.

## What Earnback does

1. **The retention sits in a contract, not with either party.** Each progress payment goes in; the contractor's share is immediately withdrawable, the retention stays in the vault.
2. **Release is automatic.** Half is released at provisional acceptance, the rest when the defect period ends. Anyone can trigger an expired step, so nobody can stall.
3. **Disputes have deadlines.** The client may open a defect claim during the defect period. The contractor accepts or rejects; an optional arbiter splits the amount. Silence has a defined outcome at every step:
   - contractor silent on a claim → claim accepted;
   - arbiter silent or absent → amount returns to the contractor;
   - client silent on provisional acceptance → deemed accepted.
4. **Clean records earn lower retention.** The rate is frozen when the contractor accepts the agreement:

```
a' = a + k,  b' = b + n − k          (n closed agreements, k with an upheld claim)
p̂  = a' / (a' + b')                  posterior mean, Beta-Binomial
sd = sqrt(a' b' / ((a' + b')² (a' + b' + 1)))
p_upper = p̂ + z · sd                 prudent upper bound on the claim probability
rate = clamp(maxBps · p_upper / p_upper(n = 0, k = 0), floorBps, maxBps)
```

With the deployed demo prior Beta(0.4, 4.6), z = 1, max 5%, floor 1%:

| Track record | Retention rate |
|---|---|
| new contractor | 5.00% |
| 1 clean job | 4.21% |
| 2 clean jobs | 3.64% |
| 3 clean jobs | 3.21% |
| 10 clean jobs | 1.75% |
| 10 jobs, 1 upheld claim | 4.35% |

Integer math in WAD, same operation order as the reference implementation [`araclar/kesinti_orani.py`](araclar/kesinti_orani.py); the UI shows the on-chain rate next to a BigInt replica of the same formula.

## How it was verified

| Check | Result |
|---|---|
| Foundry tests (unit, rate fixtures, invariants) | 148 passing, also under Arc rules (`FOUNDRY_PROFILE=arc`, Arc Foundry `arc-forge`) |
| Testnet fork tests with real Arc USDC (blocklist isolation, 18/6-decimal views, deemed acceptance) | 5/5 — [`arc-testleri/RetentionVaultFork.t.sol`](arc-testleri/RetentionVaultFork.t.sol) |
| Mainnet fork rehearsal with real mainnet USDC | 5/5, and the Arc Foundry build equals the Studio artifact byte for byte — [`arc-testleri/RetentionVaultMainnetFork.t.sol`](arc-testleri/RetentionVaultMainnetFork.t.sol) |
| End-to-end testnet walkthrough of every flow (8 agreements, ~70 transactions) | every result read back from chain; on-chain rates 364 / 421 / 500 bps equal the reference — [`docs/PROVA-SONUC.md`](docs/PROVA-SONUC.md) |
| Mainnet deploy | creation input = Studio artifact + intended constructor args; runtime code = Studio testnet vault (immutables masked) — [`arc-testleri/deploy_dogrula.py`](arc-testleri/deploy_dogrula.py) |

## Built with Arc Studio

- Arc Studio wrote the contract (Smart Contract mode, with its auditors and Slither), the tests and the React app, and deployed the testnet vault. The export is in [`studio/`](studio/), including `AGENTS.md` and the compiled artifact.
- Every later UI change was sent to Studio as a written fix request and applied there: [`docs/studio/`](docs/studio/) (UI-FIX-1 … UI-FIX-5, with the exact diffs).
- Outside Studio, as the hackathon rules require for mainnet: the deploy, from the author's own wallet, with a local page that deploys the Studio artifact unchanged ([`deploy/`](deploy/)); source verification ([`verify/`](verify/)); and the checks above.
- Studio's `compass-deploy --mode verify` mainnet rehearsal could not run because its `@circlefin/compass-chains` registry package is not available (npm 404). The mainnet fork rehearsal was done with Arc Foundry instead.

## Security and current limits

- **Unaudited hackathon contract.** No external audit.
- **No amount caps** (`maxAgreementValue` = `maxTotalHeld` = 1,000,000,000 USDC), a deliberate choice for this demo. **Use small amounts only.**
- **No admin, no pause, no upgrade, no owner.** All parameters are fixed in the constructor. Pull payments only (`withdraw`); a blocklisted payee cannot block anyone else.
- **Demo parameters.** The prior Beta(0.4, 4.6) is chosen so that a few clean jobs visibly change the rate; a production prior would be Beta(1, 11.5).
- **Track records are per address.** One party could build a record with its own wallets; the client can always raise the floor with `minBps`.
- **Mainnet demo transactions use the author's own wallets** for every role.
- Evidence and objection texts are stored only as keccak256 hashes; the documents stay off chain.

## Repository layout

| Path | What |
|---|---|
| `studio/` | Arc Studio export: `contracts/RetentionVault.sol`, Foundry tests, compiled artifact, React app (`src/`) |
| `araclar/` | Reference implementation of the rate formula and its tests (Python) |
| `arc-testleri/` | Fork tests (testnet, mainnet) and chain-reading / verification scripts |
| `deploy/` | Local deploy page (MetaMask, no recompilation) |
| `verify/` | Sourcify inputs and submit script |
| `docs/` | Design document, testnet walkthrough and results, mainnet plan, Studio fix requests (design notes are in Turkish) |

## Run locally

```bash
# rate formula reference and tests
python araclar/kesinti_orani.py
python -m unittest discover -s araclar

# contract tests under Arc rules (Arc Foundry; OpenZeppelin 5.1.0 comes with bun install,
# forge-std is expected in studio/lib/forge-std)
cd studio && bun install --frozen-lockfile --ignore-scripts
FOUNDRY_PROFILE=arc arc-forge test --no-match-path "contracts/test/fork/*"

# app (testnet by default; VITE_NETWORK=mainnet for Arc mainnet)
cd studio && bun install --frozen-lockfile && bun run dev
```

## License

MIT. OpenZeppelin Contracts (MIT) are included under `verify/sourcify/sources/` for source verification.
