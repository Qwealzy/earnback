/**
 * Proof-of-concept scenario cards for the /proof page.
 *
 * Each scenario tells the story of one completed agreement lifecycle
 * on Arc Testnet. Populate this file with real transaction hashes
 * from the deployment at 0xfa5e10d370140acbdfe977437be6742908449b39.
 *
 * To add a scenario:
 *   1. Run the relevant transactions through the UI.
 *   2. Copy the tx hashes from the explorer.
 *   3. Add a ProofScenario entry below with all fields filled in.
 */

export interface ScenarioTx {
  functionName: string
  hash: string         // 0x transaction hash on Arc Testnet
  amountUsdc?: string  // human-readable, e.g. "$500.00"
  gasFeeUsdc?: string  // estimated fee paid, e.g. "$0.0012"
  explorerUrl: string
}

export interface ProofScenario {
  id: string
  title: string
  description: string
  roles: {
    payer: string    // e.g. "0x1234…abcd"
    payee: string
    arbiter?: string
  }
  transactions: ScenarioTx[]
  /** One-line outcome for the "honesty" summary line (editable in UI). */
  honestyNote: string
}

/**
 * Populated scenarios.  Empty by default — add entries once you have
 * real testnet transactions to reference.
 */
export const PROOF_SCENARIOS: ProofScenario[] = [
  // Example (replace hashes with real ones):
  // {
  //   id: 'demo-1',
  //   title: 'Simple completion — no disputes',
  //   description: 'Payer and payee agree on a $500 contract. Two progress payments are made; defect period expires cleanly.',
  //   roles: {
  //     payer: '0x5B12Ce46C7194aD57d143bC22847224047b1Ef42',
  //     payee: '0x…',
  //     arbiter: '0x…',
  //   },
  //   transactions: [
  //     {
  //       functionName: 'createAgreement',
  //       hash: '0x…',
  //       explorerUrl: 'https://explorer.testnet.arc.io/tx/0x…',
  //     },
  //     {
  //       functionName: 'acceptAgreement',
  //       hash: '0x…',
  //       explorerUrl: 'https://explorer.testnet.arc.io/tx/0x…',
  //     },
  //     {
  //       functionName: 'payProgress',
  //       hash: '0x…',
  //       amountUsdc: '$250.00',
  //       gasFeeUsdc: '$0.0011',
  //       explorerUrl: 'https://explorer.testnet.arc.io/tx/0x…',
  //     },
  //     {
  //       functionName: 'finalize',
  //       hash: '0x…',
  //       explorerUrl: 'https://explorer.testnet.arc.io/tx/0x…',
  //     },
  //   ],
  //   honestyNote: 'Payee delivered on time. No issues raised.',
  // },
]
