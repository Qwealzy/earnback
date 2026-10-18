/**
 * Proof scenario cards for the /proof page: real Arc mainnet transactions
 * against the Earnback vault at 0xd8EA0473Cfd03FfB21BeDFfCf3A4882FF7CB9e81.
 *
 * Generated from the vault's event logs (block 26,515,939 to 26,519,607).
 * Shown only in mainnet builds; the testnet build has no scenarios.
 *
 * All four wallets (E payer, Y contractor, T subcontractor, H arbiter) belong
 * to the builder. Amounts are deliberately small.
 */
import { IS_TESTNET } from '@/app-config'

export interface ScenarioTx {
  functionName: string
  hash: string         // 0x transaction hash on Arc mainnet
  amountUsdc?: string  // human-readable, e.g. "$0.50"
  gasFeeUsdc?: string  // fee actually paid (gasUsed × effectiveGasPrice), e.g. "0.002986"
  explorerUrl: string
}

export interface ProofScenario {
  id: string
  title: string
  description: string
  roles: {
    payer: string
    payee: string
    arbiter?: string
  }
  transactions: ScenarioTx[]
  /** One-line outcome for the "honesty" summary line (editable in UI). */
  honestyNote: string
}

const EXPLORER = 'https://explorer.arc.io/tx/'

const t = (functionName: string, hash: string, gasFeeUsdc: string, amountUsdc?: string): ScenarioTx =>
  ({ functionName, hash, gasFeeUsdc, amountUsdc, explorerUrl: EXPLORER + hash })

const MAINNET_SCENARIOS: ProofScenario[] = [
  {
    id: 's1',
    title: 'S1 · Clean completion (new contractor)',
    description: '1 USDC job, two progress payments of 0.50. New contractor, so retention is the 5% cap. Payee requests provisional acceptance, payer signs, the 10-minute guarantee period passes with no claim and the full retention goes to the payee. Payee record becomes n = 1, k = 0.',
    roles: {
      payer: '0x451e…3912 (E)',
      payee: '0x6bc1…1d9a (Y)',
    },
    transactions: [
      t('createAgreement', '0xff9e7f62f7054cdad98ead3625799102b00e34ae626da3408e400b1cdf5f0e17', '0.004997'),
      t('acceptAgreement', '0xaf22227b29b0eb5f78099290b6334ed61207e8c5a425e4a91224e46b4f842759', '0.001862'),
      t('payProgress', '0x763be0ecca7bf535f0c8eecafc8631c2f653d597f858b12abc6467e237009587', '0.003354', '$0.50'),
      t('payProgress', '0x3270920adcb772f472f8b31d1d5393d88630c8bf9f53ccb283aaf09b45dae1fa', '0.001883', '$0.50'),
      t('signProvisional (payee requests)', '0x545688dd25e7d4b7e1a87cb0341ed169fd8d450b60580604cb899f617a785ffb', '0.002205'),
      t('signProvisional (payer signs)', '0xef09e683e3edc86feb7ffcd30b4e629d87daaa301226e971f9e61f3eb86a8656', '0.002181'),
      t('finalize', '0x0b70c7f07366189eba7382ca72da912435926c873e579c345bdcd8c4ec3907df', '0.001737'),
      t('withdraw', '0x76f43ecdf5574f994fbd81a51cf2872405b8702e9e3dab21c34fe90909cb6ba9', '0.001257', '$1.00 to payee'),
    ],
    honestyNote: 'Clean job: the payee got 100% of the 1.00 USDC, including the 0.05 retention. All wallets here (payer, payee, arbiter) are the builder\u2019s own; amounts are deliberately small.',
  },
  {
    id: 's4',
    title: 'S4 · Defect claim, rejected, arbiter splits it',
    description: '0.50 USDC job with an arbiter. During the guarantee period the payer claims 0.01 for a defect, the subcontractor rejects it and the arbiter awards 0.005 to the payer. The rest of the retention is released at finalize. Payee record: n = 1, k = 1.',
    roles: {
      payer: '0x451e…3912 (E)',
      payee: '0x51f8…a5c6 (T)',
      arbiter: '0xb77a…4e6e (H)',
    },
    transactions: [
      t('createAgreement', '0x5d7bc09e49febb77ab969bdd2bcc94980c4b0f61d1864bf4d6d0311443dc2db4', '0.005064'),
      t('acceptAgreement', '0x86081e7023d3d3da90c46dc5c285d1c50a4bc1acf9ea26cea6f17a19f494c3d7', '0.001862'),
      t('payProgress', '0xeb53f9cb32f034dac0adfef517cf644649e28137c4873356d73b95d9719372ae', '0.002986', '$0.50'),
      t('signProvisional (payee requests)', '0xe596afc8f3297a592c0e5e7242b620e2c2c560134301be53a3960ddf3fd4bd63', '0.002205'),
      t('signProvisional (payer signs)', '0xe014be7e47c80491f9ceb94b4ece010f9f8ecfccde00ff74ba1c31b1b6330703', '0.002181'),
      t('openClaim', '0x965f853226b96cfe2cb51c088e370fb21bda7453a894ba103d2c0a412750358d', '0.003331', '$0.01 claimed'),
      t('respondClaim (reject)', '0x17de00dc2e2b985b94f7f986b333f3472cf58297e41311eb9b7cb9c0c4b9f685', '0.001322'),
      t('arbiterDecide', '0xde15e6ba5c7cff58156f08565e23d94a5c4279328cf51e59891d98e4de3c3a70', '0.002229', '$0.005 to payer'),
      t('finalize', '0xc3b8e57988ff6ee60a39d0cf92da3d2ceadf9a30ce6d7c93fe80b6c068ea46f0', '0.002242'),
    ],
    honestyNote: 'Dispute resolved on-chain; the arbiter can award at most the claimed amount, never the rest of the retention. All wallets here (payer, payee, arbiter) are the builder\u2019s own; amounts are deliberately small.',
  },
  {
    id: 's5',
    title: 'S5 · Claim left unanswered (timeout)',
    description: '0.50 USDC job, no arbiter. The payer claims 0.01; the subcontractor does not answer within the 3-minute window, so anyone can resolve it and the claim is upheld. Payee record: n = 2, k = 2.',
    roles: {
      payer: '0x451e…3912 (E)',
      payee: '0x51f8…a5c6 (T)',
    },
    transactions: [
      t('createAgreement', '0x3e0cee95e3282b0f7d193ebe664e8dd12b2ea00af54085e0e07fd10dcbb03bca', '0.004678'),
      t('acceptAgreement', '0xfa0ea2f766a12fd44e3056babda336e6f6d761e5c3fd6837b7e010669731f767', '0.001882'),
      t('payProgress', '0xa08832b58899cd1805812c567532836a3b6af630508d8941420732f9f40278a5', '0.002662', '$0.50'),
      t('signProvisional (payee requests)', '0x1144003c773cd07ea1748c97edbef5d9e52061ffe200158237531e1c593a2a3f', '0.002241'),
      t('signProvisional (payer signs)', '0x07c6569f09aaadd69791696d48631229e2854f4207a043818152dfb16b61945c', '0.002204'),
      t('openClaim', '0xb0b14133dd7dd2adfcf545d659af700ceb1da1b2db49d8fd55ab22458d06bcaf', '0.003366', '$0.01 claimed'),
      t('resolveUnanswered', '0x9c350bb34a85a64a8bd65da209e97a7b2a490c686cbf2307c4a98bd3db1c1c6c', '0.001881'),
      t('withdraw', '0x0a03aee65d1184e59dfed9493cfd07e2be36335471495b107ef5f083806fa0c9', '0.001291', '$0.015 to payer (S4 award $0.005 + S5 claim $0.01)'),
      t('withdraw', '0x80cef23f7ce9067c13107d705836fccb73d5d7d9e8be448c776515240fcfe511', '0.001291', '$0.9825 to payee (S4 + S5)'),
      t('finalize', '0xd9ccd79e568d14936f534414b4e86d45629e3b8e82ac6116f7fa76c0fc4bd21c', '0.001870'),
    ],
    honestyNote: 'Silence has a cost: an unanswered claim is paid to the payer automatically after the response window. All wallets here (payer, payee, arbiter) are the builder\u2019s own; amounts are deliberately small.',
  },
  {
    id: 's7',
    title: 'S7 · Clean record, lower retention (actuarial rate)',
    description: 'Second job for the same contractor as S1. With one clean job on record (n = 1, k = 0) the on-chain rate drops from 500 to 421 bps (4.21%), matching the off-chain reference model. No claim; the full retention goes back to the payee. Payee record: n = 2, k = 0.',
    roles: {
      payer: '0x451e…3912 (E)',
      payee: '0x6bc1…1d9a (Y)',
    },
    transactions: [
      t('createAgreement', '0x8a2b6ca3acd8488d183e43f4f2dc4e087e60e3e72bff20d02f1eddded4ee99df', '0.004629'),
      t('acceptAgreement', '0x89341c233d270d6a61d4f1eaf6e93e9a38ac9a19d3293263e94917e1269b1277', '0.001862'),
      t('payProgress', '0x50c67db688af619ed069df8312d2fd7ca4e0bd095ee9160f36e12fc61984dfd0', '0.002986', '$0.50'),
      t('signProvisional (payee requests)', '0xa9eab4f89edd927f8c5f8d9fa691a0830bfb70f2057831a9af7188c5a74f7355', '0.002205'),
      t('signProvisional (payer signs)', '0x2a4ba44c05b5d37693843d52df4058b412289e327ec07ad649f6da9a186bff4b', '0.002181'),
      t('finalize', '0x13166eecfe74d0600d2d8d5fa1ff2f88ef30294843d21ea25f9c7fd2fcd19a57', '0.001399'),
      t('withdraw', '0x9924fe6daa59f865804fd424488d6fab86ff501e4558db81c361ad4963c368ee', '0.001286', '$0.50 to payee'),
    ],
    honestyNote: 'Same contract value, less capital locked: 4.21% held instead of 5% because the record is clean. All wallets here (payer, payee, arbiter) are the builder\u2019s own; amounts are deliberately small.',
  },
]

export const PROOF_SCENARIOS: ProofScenario[] = IS_TESTNET ? [] : MAINNET_SCENARIOS
