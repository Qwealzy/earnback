/**
 * Earnback local deploy page: deploys the Studio artifact as-is from the user's MetaMask EOA.
 * No recompilation, no secrets, no server: the wallet signs, the page only builds the transaction.
 * Build: deploy/build.sh (bundles viem from the project's lockfile). Serve on http://127.0.0.1:8080.
 */
import {
  createPublicClient, createWalletClient, custom, fallback, http, keccak256,
  encodeDeployData, formatUnits, parseGwei, getAddress, type Abi, type Hex, type Chain,
} from 'viem'
import { arc, arcTestnet } from 'viem/chains'

// keccak256 of contracts/out/RetentionVault.sol/RetentionVault.json bytecode.object (18 Oct export)
const EXPECTED_CREATION_HASH = '0x848dc721a0c2e31e4c562292640b6a28e05632632f19f1dae2f6fc5ee28d9f2f'
// Testnet vault deployed by Studio from the same artifact: the runtime code reference
const REFERENCE = { chain: arcTestnet, address: '0xfa5e10d370140acbdfe977437be6742908449b39' as const }
const USDC = '0x3600000000000000000000000000000000000000' as const
const WAD = 10n ** 18n

// Decision K1 (docs/MAINNET-PLAN.md): no amount caps (1 billion USDC), demo prior, 5% max, 1% floor
const ARGS = [
  { name: 'usdc_', value: USDC, note: 'Arc USDC (ERC-20 view, 6 decimals)' },
  { name: 'priorA_', value: 4n * WAD / 10n, note: '0.4 (WAD), demo prior Beta(0.4, 4.6)' },
  { name: 'priorB_', value: 46n * WAD / 10n, note: '4.6 (WAD)' },
  { name: 'zWad_', value: WAD, note: '1.0 standard deviation prudence margin' },
  { name: 'capBps_', value: 500n, note: '5% highest retention rate' },
  { name: 'floorBps_', value: 100n, note: '1% lowest retention rate' },
  { name: 'maxAgreementValue_', value: 10n ** 15n, note: '1,000,000,000 USDC: no practical cap' },
  { name: 'maxTotalHeld_', value: 10n ** 15n, note: '1,000,000,000 USDC: no practical cap' },
  { name: 'minRecordValue_', value: 500_000n, note: '0.5 USDC: smallest job that counts in a track record' },
] as const

const RPCS: Record<number, string[]> = {
  [arcTestnet.id]: ['https://rpc.testnet.arc.io', 'https://rpc.quicknode.testnet.arc.io', 'https://rpc.drpc.testnet.arc.io'],
  [arc.id]: ['https://rpc.mainnet.arc.io', 'https://rpc.quicknode.mainnet.arc.io', 'https://rpc.drpc.mainnet.arc.io'],
}
const EXPLORER: Record<number, string> = { [arcTestnet.id]: 'https://explorer.testnet.arc.io', [arc.id]: 'https://explorer.arc.io' }

type Eth = { request: (a: { method: string; params?: unknown[] }) => Promise<unknown> }
const eth = (window as unknown as { ethereum?: Eth }).ethereum

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const log = (msg: string, kind: 'ok' | 'bad' | 'info' = 'info') => {
  const li = document.createElement('li')
  li.textContent = msg
  li.className = kind
  $('log').appendChild(li)
}
const publicClient = (chain: Chain) => createPublicClient({ chain, transport: fallback(RPCS[chain.id].map(u => http(u))) })

let abi: Abi | undefined
let bytecode: Hex | undefined
let immutableRefs: Array<{ start: number; length: number }> = []

function selectedChain(): Chain {
  return $<HTMLSelectElement>('network').value === 'mainnet' ? arc : arcTestnet
}

function refreshButton() {
  const mainnet = selectedChain().id === arc.id
  const confirmed = !mainnet || $<HTMLInputElement>('mainnetConfirm').checked
  $('mainnetBox').style.display = mainnet ? 'block' : 'none'
  $<HTMLButtonElement>('deploy').disabled = !(abi && bytecode && confirmed)
}

// ── 1. artifact ─────────────────────────────────────────────────────────────
$<HTMLInputElement>('artifact').addEventListener('change', async e => {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  abi = undefined; bytecode = undefined
  try {
    const j = JSON.parse(await file.text())
    const code = j.bytecode?.object as Hex
    const hash = keccak256(code)
    if (hash !== EXPECTED_CREATION_HASH) {
      log(`Artifact hash ${hash} does not match the expected ${EXPECTED_CREATION_HASH}. Deploy stays disabled.`, 'bad')
    } else {
      abi = j.abi as Abi
      bytecode = code
      immutableRefs = Object.values(j.deployedBytecode?.immutableReferences ?? {}).flat() as typeof immutableRefs
      log(`Artifact OK: ${(code.length - 2) / 2} bytes, hash matches, ${immutableRefs.length} immutable positions.`, 'ok')
      $('encoded').textContent = encodeDeployData({ abi, bytecode, args: ARGS.map(a => a.value) }).slice(2 + (code.length - 2)).replace(/(.{64})/g, '$1\n')
    }
  } catch (err) {
    log(`Could not read the artifact: ${String(err)}`, 'bad')
  }
  refreshButton()
})

// ── 2. deploy ───────────────────────────────────────────────────────────────
$<HTMLButtonElement>('deploy').addEventListener('click', async () => {
  if (!eth) return log('No browser wallet found. Open this page in Chrome with MetaMask.', 'bad')
  if (!abi || !bytecode) return
  const chain = selectedChain()
  const pc = publicClient(chain)
  $<HTMLButtonElement>('deploy').disabled = true
  try {
    const [account] = (await eth.request({ method: 'eth_requestAccounts' })) as `0x${string}`[]
    log(`Wallet account ${account}`)
    const code = await pc.getCode({ address: account })
    if (code && code !== '0x') throw new Error('This account has code (smart account). Use a plain EOA for deployment.')
    log('Account is a plain EOA.', 'ok')

    const hexId = `0x${chain.id.toString(16)}`
    try {
      await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: hexId }] })
    } catch {
      await eth.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: hexId, chainName: chain.name, rpcUrls: [RPCS[chain.id][0]],
          nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 }, blockExplorerUrls: [EXPLORER[chain.id]],
        }],
      })
    }
    const walletChain = Number(await eth.request({ method: 'eth_chainId' }))
    if (walletChain !== chain.id) throw new Error(`Wallet is on chain ${walletChain}, expected ${chain.id}.`)
    log(`Wallet on ${chain.name} (${chain.id}).`, 'ok')

    const balance = await pc.getBalance({ address: account })
    log(`Balance ${formatUnits(balance, 18)} USDC (gas is paid in USDC).`)

    // Arc drops transactions under 20 gwei maxFeePerGas: base fee x2 + 1 gwei, never below 21 gwei
    const block = await pc.getBlock()
    const base = block.baseFeePerGas ?? parseGwei('20')
    let maxFeePerGas = base * 2n + parseGwei('1')
    if (maxFeePerGas < parseGwei('21')) maxFeePerGas = parseGwei('21')
    const maxPriorityFeePerGas = parseGwei('1')
    log(`Fees: base ${formatUnits(base, 9)} gwei, maxFee ${formatUnits(maxFeePerGas, 9)} gwei, priority 1 gwei.`)

    const wc = createWalletClient({ account, chain, transport: custom(eth) })
    log('Confirm "Deploy a contract" in MetaMask: site 127.0.0.1, network ' + chain.name + ', value 0.')
    const hash = await wc.deployContract({
      abi, bytecode, args: ARGS.map(a => a.value), maxFeePerGas, maxPriorityFeePerGas,
    })
    log(`Transaction sent: ${hash}`, 'ok')
    addLink(`${EXPLORER[chain.id]}/tx/${hash}`, 'Open the transaction in the explorer')
    const receipt = await pc.waitForTransactionReceipt({ hash })
    if (receipt.status !== 'success' || !receipt.contractAddress) throw new Error(`Deploy failed, status ${receipt.status}.`)
    const address = getAddress(receipt.contractAddress)
    log(`Deployed at ${address} in block ${receipt.blockNumber}, gas used ${receipt.gasUsed}.`, 'ok')
    addLink(`${EXPLORER[chain.id]}/address/${address}`, 'Open the contract in the explorer')
    await verify(chain, address, Number(receipt.blockNumber), hash)
  } catch (err) {
    log(String((err as Error).message ?? err), 'bad')
  } finally {
    refreshButton()
  }
})

// ── 3. verify: runtime code equals the reference, constructor values read back ──
async function verify(chain: Chain, address: `0x${string}`, block: number, tx: Hex) {
  const mask = (code: Hex) => {
    const bytes = code.slice(2).split('')
    for (const r of immutableRefs) for (let i = r.start * 2; i < (r.start + r.length) * 2; i++) bytes[i] = '0'
    return keccak256(`0x${bytes.join('')}` as Hex)
  }
  const [mine, ref] = await Promise.all([
    publicClient(chain).getCode({ address }),
    publicClient(REFERENCE.chain).getCode({ address: REFERENCE.address }),
  ])
  if (!mine || !ref) return log('Could not read runtime code for the comparison.', 'bad')
  const same = mine.length === ref.length && mask(mine) === mask(ref)
  log(`Runtime code ${(mine.length - 2) / 2} bytes; equal to the Studio testnet vault with immutables masked: ${same ? 'YES' : 'NO'}.`, same ? 'ok' : 'bad')

  const pc = publicClient(chain)
  let allOk = true
  for (const a of ARGS) {
    const fn = a.name.replace(/_$/, '')
    const got = await pc.readContract({ address, abi: abi!, functionName: fn }) as bigint | string
    const ok = String(got).toLowerCase() === String(a.value).toLowerCase()
    allOk &&= ok
    log(`${fn} = ${String(got)} ${ok ? '(as intended)' : `(EXPECTED ${String(a.value)})`}`, ok ? 'ok' : 'bad')
  }
  const summary = { network: chain.name, chainId: chain.id, address, deployBlock: block, tx, constructorValuesOk: allOk, runtimeMatchesStudioArtifact: same }
  $('summary').textContent = JSON.stringify(summary, null, 2)
  log('Copy the summary below and send it to Claude.', 'ok')
}

function addLink(href: string, text: string) {
  const li = document.createElement('li')
  const a = document.createElement('a')
  a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.textContent = text
  li.appendChild(a)
  $('log').appendChild(li)
}

// ── init ────────────────────────────────────────────────────────────────────
$('args').innerHTML = ARGS.map(a => `<tr><td><code>${a.name}</code></td><td><code>${String(a.value)}</code></td><td>${a.note}</td></tr>`).join('')
$('network').addEventListener('change', refreshButton)
$('mainnetConfirm').addEventListener('change', refreshButton)
if (location.protocol === 'file:') log('Open this page through http://127.0.0.1:8080, not as a file.', 'bad')
refreshButton()
