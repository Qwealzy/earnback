/**
 * Central configuration for the RetentionVault UI.
 * Switch between testnet and mainnet by changing ACTIVE_NETWORK.
 * All chain-specific facts come from @/onchain-facts so this file stays thin.
 */

import { requireChain, buildTxExplorerUrl, buildAddressExplorerUrl } from '@/onchain-facts'

export const APP_NAME = 'Earnback'

// Sourcify: public file browser and the v2 lookup API (CORS open), both keyed by chain id + address
export const SOURCIFY_REPO_URL = 'https://repo.sourcify.dev'
export const SOURCIFY_API_URL = 'https://sourcify.dev/server'

// ─── network switch ────────────────────────────────────────────────────────
// Build with VITE_NETWORK=mainnet for Arc mainnet; anything else means testnet.
type Network = 'testnet' | 'mainnet'
export const ACTIVE_NETWORK: Network = import.meta.env.VITE_NETWORK === 'mainnet' ? 'mainnet' : 'testnet'

// ─── per-network config ────────────────────────────────────────────────────
const NETWORK_CONFIG = {
  testnet: {
    chainId: 5042002,      // Arc Testnet
    vaultAddress: '0xfa5e10d370140acbdfe977437be6742908449b39' as `0x${string}`,
    deployBlock: 67543436,
    // eth_call: official endpoints (docs.arc.io/arc/references/rpc-endpoints)
    readRpcs: ['https://rpc.drpc.testnet.arc.io', 'https://rpc.quicknode.testnet.arc.io', 'https://rpc.testnet.arc.io'],
    // eth_getLogs: dRPC's free plan rejects every getLogs call, so it is not used here
    scanRpcs: ['https://rpc.quicknode.testnet.arc.io', 'https://rpc.testnet.arc.io'],
  },
  mainnet: {
    chainId: 5042,         // Arc Mainnet
    // Deployed 18 Oct 2026 by the user's EOA, tx 0x8761d0d431eea820354366f32a5833936397a0d09fe0a87015ca560a5e8a548b
    vaultAddress: '0xd8EA0473Cfd03FfB21BeDFfCf3A4882FF7CB9e81' as `0x${string}`,
    deployBlock: 26510136,
    readRpcs: ['https://rpc.mainnet.arc.io', 'https://rpc.quicknode.mainnet.arc.io', 'https://rpc.drpc.mainnet.arc.io'],
    scanRpcs: ['https://rpc.mainnet.arc.io', 'https://rpc.quicknode.mainnet.arc.io'],
  },
}

// ─── exported constants ────────────────────────────────────────────────────
export const cfg = NETWORK_CONFIG[ACTIVE_NETWORK]
export const CHAIN = requireChain(cfg.chainId)
export const VAULT_ADDRESS = cfg.vaultAddress
export const DEPLOY_BLOCK = cfg.deployBlock
export const CHAIN_ID = cfg.chainId
export const READ_RPCS = cfg.readRpcs
export const SCAN_RPCS = cfg.scanRpcs
export const IS_TESTNET = ACTIVE_NETWORK === 'testnet'
/** False until the mainnet address is filled in; the app then shows a notice instead of reading. */
export const IS_DEPLOYED = /^0x[0-9a-fA-F]{40}$/.test(VAULT_ADDRESS)

export function txUrl(hash: string): string {
  return buildTxExplorerUrl(CHAIN_ID, hash)
}
export function addrUrl(address: string): string {
  return buildAddressExplorerUrl(CHAIN_ID, address)
}
