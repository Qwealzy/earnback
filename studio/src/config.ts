/**
 * wagmi configuration
 * Built with Arc Studio — https://studio.arc.io
 */

import { http, fallback, createConfig } from 'wagmi'
import { mainnet } from 'wagmi/chains'
import { arc, arcTestnet } from 'viem/chains'
import { injected } from 'wagmi/connectors'
import { registerChain } from './tracing'
import { IS_TESTNET } from './app-config'

// Pre-register chain RPC URLs so trace events show correct chain names immediately
registerChain(arcTestnet.id, arcTestnet.rpcUrls.default.http[0])
registerChain(arc.id, arc.rpcUrls.default.http[0])

// Official endpoints (docs.arc.io/arc/references/rpc-endpoints); the active network's chain comes first
const testnetTransport = fallback([
  http('https://rpc.drpc.testnet.arc.io'),
  http('https://rpc.quicknode.testnet.arc.io'),
  http('https://rpc.testnet.arc.io'),
])
const mainnetTransport = fallback([
  http('https://rpc.mainnet.arc.io'),
  http('https://rpc.quicknode.mainnet.arc.io'),
  http('https://rpc.drpc.mainnet.arc.io'),
])

export const config = createConfig({
  // Ethereum mainnet stays for ENS resolution only
  chains: IS_TESTNET ? [arcTestnet, arc, mainnet] : [arc, arcTestnet, mainnet],
  connectors: [injected()],
  transports: {
    [arcTestnet.id]: testnetTransport,
    [arc.id]: mainnetTransport,
    [mainnet.id]: http(), // ENS resolution uses mainnet
  },
})
