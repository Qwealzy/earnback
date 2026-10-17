/**
 * BigInt replica of RetentionVault.pUpper() and RetentionVault.rateFor().
 * Mirrors the Solidity integer math step by step (same order, floor division,
 * floor square root like OpenZeppelin Math.sqrt), so the result equals the
 * on-chain value exactly. Reference implementation: araclar/kesinti_orani.py.
 *
 * Solidity (RetentionVault.sol):
 *
 *   function pUpper(uint256 a1, uint256 b1) internal view returns (uint256) {
 *     uint256 s = a1 + b1;
 *     uint256 pHat = a1 * WAD / s;
 *     uint256 variance = (a1 * WAD / s) * (b1 * WAD / s) / WAD * WAD / (s + WAD);
 *     uint256 sd = Math.sqrt(variance * WAD);
 *     return pHat + zWad * sd / WAD;
 *   }
 *
 *   function rateFor(address payee, uint256 maxBps) public view returns (uint256 bps) {
 *     (uint256 n, uint256 k) = record(payee);
 *     uint256 pu = pUpper(priorA + k * WAD, priorB + (n - k) * WAD);
 *     uint256 p0 = pUpper(priorA, priorB);
 *     bps = maxBps * pu / p0;
 *     if (bps > maxBps) bps = maxBps;
 *     if (bps < floorBps) bps = floorBps;
 *   }
 *
 * Beta-Binomial experience rating: the posterior mean plus z standard deviations
 * is a prudent upper bound on the payee's claim probability; the rate scales the
 * agreement's max by that bound relative to a payee with no record.
 */

const WAD = 10n ** 18n

export interface VaultParams {
  priorA: bigint
  priorB: bigint
  zWad: bigint
  capBps: bigint
  floorBps: bigint
}

export interface RecordPoint {
  n: bigint
  k: bigint
}

/** Floor integer square root (same result as OpenZeppelin Math.sqrt). */
export function isqrt(x: bigint): bigint {
  if (x < 2n) return x
  let r = x
  let y = (r + 1n) / 2n
  while (y < r) {
    r = y
    y = (r + x / r) / 2n
  }
  return r
}

/** Prudent upper bound on the claim probability (WAD-scaled), Beta(a1, b1) with WAD-scaled a1, b1. */
export function pUpper(a1: bigint, b1: bigint, zWad: bigint): bigint {
  const s = a1 + b1
  const pHat = (a1 * WAD) / s
  const variance = ((((a1 * WAD) / s) * ((b1 * WAD) / s)) / WAD) * WAD / (s + WAD)
  const sd = isqrt(variance * WAD)
  return pHat + (zWad * sd) / WAD
}

/** Retention rate in bps for a payee record and the agreement's maxBps, exactly as rateFor(). */
export function computeRateFor(params: VaultParams, rec: RecordPoint, maxBps: bigint): bigint {
  const pu = pUpper(params.priorA + rec.k * WAD, params.priorB + (rec.n - rec.k) * WAD, params.zWad)
  const p0 = pUpper(params.priorA, params.priorB, params.zWad)
  if (p0 === 0n) return maxBps
  let bps = (maxBps * pu) / p0
  if (bps > maxBps) bps = maxBps
  if (bps < params.floorBps) bps = params.floorBps
  return bps
}

/** Credibility Z = n / (n + a + b), WAD-scaled, as credibilityWad(). */
export function computeCredibilityWad(params: VaultParams, n: bigint): bigint {
  const denom = n * WAD + params.priorA + params.priorB
  return denom === 0n ? 0n : (n * WAD * WAD) / denom
}

/**
 * Build chart data: rate (bps) vs n (0..maxN closed agreements).
 * Two series:
 *   "clean"    — k = 0 for all n (no upheld claims)
 *   "oneClaim" — k = 1 starting from n = 1 (one upheld claim)
 */
export function buildRateChart(
  params: VaultParams,
  maxBps: bigint,
  maxN = 30,
): Array<{ n: number; clean: number; oneClaim: number }> {
  const rows: Array<{ n: number; clean: number; oneClaim: number }> = []
  for (let n = 0; n <= maxN; n++) {
    const bn = BigInt(n)
    const cleanRate = computeRateFor(params, { n: bn, k: 0n }, maxBps)
    const oneClaimK = n >= 1 ? 1n : 0n
    const oneClaimRate = computeRateFor(params, { n: bn, k: oneClaimK }, maxBps)
    rows.push({ n, clean: Number(cleanRate), oneClaim: Number(oneClaimRate) })
  }
  return rows
}
