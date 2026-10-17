/**
 * RetentionVault ABI — extracted from the Foundry build artifact.
 * State enums:
 *   State: 0=Proposed, 1=Active, 2=Disputed, 3=Finalized, 4=Cancelled
 *   ClaimStatus: 0=Open, 1=Accepted, 2=Disputed
 *   ProvisionalStatus: 0=None, 1=Pending, 2=Objected
 */
export const RETENTION_VAULT_ABI = [
  // ── constructor ──────────────────────────────────────────────────────────
  {
    type: 'constructor',
    inputs: [
      { name: 'usdc_', type: 'address' },
      { name: 'priorA_', type: 'uint256' },
      { name: 'priorB_', type: 'uint256' },
      { name: 'zWad_', type: 'uint256' },
      { name: 'capBps_', type: 'uint256' },
      { name: 'floorBps_', type: 'uint256' },
      { name: 'maxAgreementValue_', type: 'uint256' },
      { name: 'maxTotalHeld_', type: 'uint256' },
      { name: 'minRecordValue_', type: 'uint256' },
    ],
    stateMutability: 'nonpayable',
  },

  // ── view functions ───────────────────────────────────────────────────────
  {
    type: 'function', name: 'agreement',
    inputs: [{ name: 'id', type: 'uint256' }],
    outputs: [{
      name: '', type: 'tuple',
      components: [
        { name: 'payer', type: 'address' },
        { name: 'payee', type: 'address' },
        { name: 'arbiter', type: 'address' },
        { name: 'contractValue', type: 'uint256' },
        { name: 'maxBps', type: 'uint256' },
        { name: 'minBps', type: 'uint256' },
        { name: 'defectPeriod', type: 'uint256' },
        { name: 'responseWindow', type: 'uint256' },
        { name: 'arbiterWindow', type: 'uint256' },
        { name: 'retentionBps', type: 'uint256' },
        { name: 'paid', type: 'uint256' },
        { name: 'retained', type: 'uint256' },
        { name: 'releasedToPayee', type: 'uint256' },
        { name: 'awardedToPayer', type: 'uint256' },
        { name: 'payerSigned', type: 'bool' },
        { name: 'payeeSigned', type: 'bool' },
        { name: 'defectEnd', type: 'uint256' },
        { name: 'state', type: 'uint8' },
        {
          name: 'claim', type: 'tuple',
          components: [
            { name: 'amount', type: 'uint256' },
            { name: 'evidenceHash', type: 'bytes32' },
            { name: 'openedAt', type: 'uint256' },
            { name: 'responseDeadline', type: 'uint256' },
            { name: 'arbiterDeadline', type: 'uint256' },
            { name: 'status', type: 'uint8' },
          ],
        },
        { name: 'upheld', type: 'bool' },
        { name: 'provisionalStatus', type: 'uint8' },
        { name: 'provisionalDeadline', type: 'uint256' },
        { name: 'provisionalArbiterDeadline', type: 'uint256' },
        { name: 'provisionalObjectionHash', type: 'bytes32' },
      ],
    }],
    stateMutability: 'view',
  },
  {
    type: 'function', name: 'available',
    inputs: [{ name: 'id', type: 'uint256' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function', name: 'pool',
    inputs: [{ name: 'id', type: 'uint256' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function', name: 'record',
    inputs: [{ name: 'payee', type: 'address' }],
    outputs: [{ name: 'n', type: 'uint256' }, { name: 'k', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function', name: 'credibilityWad',
    inputs: [{ name: 'payee', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function', name: 'rateFor',
    inputs: [{ name: 'payee', type: 'address' }, { name: 'maxBps', type: 'uint256' }],
    outputs: [{ name: 'bps', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function', name: 'withdrawable',
    inputs: [{ name: '', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function', name: 'totalHeld',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function', name: 'priorA',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function', name: 'priorB',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function', name: 'zWad',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function', name: 'capBps',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function', name: 'floorBps',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function', name: 'maxAgreementValue',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function', name: 'maxTotalHeld',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function', name: 'minRecordValue',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function', name: 'usdc',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
  },

  // ── state-changing functions ─────────────────────────────────────────────
  {
    type: 'function', name: 'createAgreement',
    inputs: [
      { name: 'payee', type: 'address' },
      { name: 'arbiter', type: 'address' },
      { name: 'contractValue', type: 'uint256' },
      { name: 'maxBps', type: 'uint256' },
      { name: 'minBps', type: 'uint256' },
      { name: 'defectPeriod', type: 'uint256' },
      { name: 'responseWindow', type: 'uint256' },
      { name: 'arbiterWindow', type: 'uint256' },
    ],
    outputs: [{ name: 'id', type: 'uint256' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function', name: 'cancelProposal',
    inputs: [{ name: 'id', type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function', name: 'acceptAgreement',
    inputs: [{ name: 'id', type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function', name: 'signProvisional',
    inputs: [{ name: 'id', type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function', name: 'payProgress',
    inputs: [
      { name: 'id', type: 'uint256' },
      { name: 'amount', type: 'uint256' },
      { name: 'ref', type: 'bytes32' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function', name: 'finalize',
    inputs: [{ name: 'id', type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function', name: 'openClaim',
    inputs: [
      { name: 'id', type: 'uint256' },
      { name: 'amount', type: 'uint256' },
      { name: 'evidenceHash', type: 'bytes32' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function', name: 'respondClaim',
    inputs: [{ name: 'id', type: 'uint256' }, { name: 'accept', type: 'bool' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function', name: 'arbiterDecide',
    inputs: [{ name: 'id', type: 'uint256' }, { name: 'payerShare', type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function', name: 'resolveUnanswered',
    inputs: [{ name: 'id', type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function', name: 'resolveByDefault',
    inputs: [{ name: 'id', type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function', name: 'objectProvisional',
    inputs: [{ name: 'id', type: 'uint256' }, { name: 'reasonHash', type: 'bytes32' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function', name: 'arbiterDecideProvisional',
    inputs: [{ name: 'id', type: 'uint256' }, { name: 'accept', type: 'bool' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function', name: 'resolveProvisional',
    inputs: [{ name: 'id', type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function', name: 'withdraw',
    inputs: [],
    outputs: [],
    stateMutability: 'nonpayable',
  },

  // ── events ───────────────────────────────────────────────────────────────
  {
    type: 'event', name: 'AgreementCreated',
    inputs: [
      { name: 'id', type: 'uint256', indexed: true },
      { name: 'payer', type: 'address', indexed: true },
      { name: 'payee', type: 'address', indexed: true },
      { name: 'arbiter', type: 'address', indexed: false },
      { name: 'contractValue', type: 'uint256', indexed: false },
    ],
    anonymous: false,
  },
  {
    type: 'event', name: 'AgreementAccepted',
    inputs: [
      { name: 'id', type: 'uint256', indexed: true },
      { name: 'retentionBps', type: 'uint256', indexed: false },
      { name: 'n', type: 'uint256', indexed: false },
      { name: 'k', type: 'uint256', indexed: false },
    ],
    anonymous: false,
  },
  {
    type: 'event', name: 'AgreementCancelled',
    inputs: [{ name: 'id', type: 'uint256', indexed: true }],
    anonymous: false,
  },
  {
    type: 'event', name: 'ProgressPaid',
    inputs: [
      { name: 'id', type: 'uint256', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
      { name: 'cut', type: 'uint256', indexed: false },
      { name: 'ref', type: 'bytes32', indexed: false },
    ],
    anonymous: false,
  },
  {
    type: 'event', name: 'Finalized',
    inputs: [
      { name: 'id', type: 'uint256', indexed: true },
      { name: 'released', type: 'uint256', indexed: false },
    ],
    anonymous: false,
  },
  {
    type: 'event', name: 'ClaimOpened',
    inputs: [
      { name: 'id', type: 'uint256', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
      { name: 'evidenceHash', type: 'bytes32', indexed: false },
    ],
    anonymous: false,
  },
  {
    type: 'event', name: 'ClaimAnswered',
    inputs: [
      { name: 'id', type: 'uint256', indexed: true },
      { name: 'accepted', type: 'bool', indexed: false },
    ],
    anonymous: false,
  },
  {
    type: 'event', name: 'ClaimDecided',
    inputs: [
      { name: 'id', type: 'uint256', indexed: true },
      { name: 'payerShare', type: 'uint256', indexed: false },
    ],
    anonymous: false,
  },
  {
    type: 'event', name: 'ClaimResolved',
    inputs: [
      { name: 'id', type: 'uint256', indexed: true },
      { name: 'payerShare', type: 'uint256', indexed: false },
      { name: 'reason', type: 'string', indexed: false },
    ],
    anonymous: false,
  },
  {
    type: 'event', name: 'ProvisionalRequested',
    inputs: [
      { name: 'id', type: 'uint256', indexed: true },
      { name: 'deadline', type: 'uint256', indexed: false },
    ],
    anonymous: false,
  },
  {
    type: 'event', name: 'ProvisionalSigned',
    inputs: [
      { name: 'id', type: 'uint256', indexed: true },
      { name: 'signer', type: 'address', indexed: false },
    ],
    anonymous: false,
  },
  {
    type: 'event', name: 'ProvisionalAccepted',
    inputs: [
      { name: 'id', type: 'uint256', indexed: true },
      { name: 'released', type: 'uint256', indexed: false },
      { name: 'defectEnd', type: 'uint256', indexed: false },
    ],
    anonymous: false,
  },
  {
    type: 'event', name: 'ProvisionalObjected',
    inputs: [
      { name: 'id', type: 'uint256', indexed: true },
      { name: 'reasonHash', type: 'bytes32', indexed: false },
    ],
    anonymous: false,
  },
  {
    type: 'event', name: 'ProvisionalDecided',
    inputs: [
      { name: 'id', type: 'uint256', indexed: true },
      { name: 'accepted', type: 'bool', indexed: false },
    ],
    anonymous: false,
  },
  {
    type: 'event', name: 'ProvisionalResolved',
    inputs: [
      { name: 'id', type: 'uint256', indexed: true },
      { name: 'reason', type: 'string', indexed: false },
    ],
    anonymous: false,
  },
  {
    type: 'event', name: 'Withdrawn',
    inputs: [
      { name: 'account', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
    ],
    anonymous: false,
  },
] as const
