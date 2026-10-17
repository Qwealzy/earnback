#!/usr/bin/env bash
# Read one agreement from the testnet vault, plus the parties' balances and records.
# Usage (WSL): bash arc-tests/read_agreement.sh <agreement-id>
set -euo pipefail
ID=${1:?agreement id}
A=0xfa5e10d370140acbdfe977437be6742908449b39
R=${ARC_TESTNET_RPC_URL:-https://rpc.testnet.arc.io}
C=~/.local/bin/arc-cast

SIG='agreement(uint256)((address,address,address,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,bool,bool,uint256,uint8,(uint256,bytes32,uint256,uint256,uint256,uint8),bool,uint8,uint256,uint256,bytes32))'
RAW=$($C call $A "$SIG" "$ID" --rpc-url "$R" | tr -d '()' | sed 's/ \[[^]]*\]//g')
IFS=', ' read -r -a F <<< "$RAW"
names=(payer payee arbiter contractValue maxBps minBps defectPeriod responseWindow arbiterWindow retentionBps paid retained releasedToPayee awardedToPayer payerSigned payeeSigned defectEnd state claimAmount claimEvidence claimOpenedAt claimResponseDeadline claimArbiterDeadline claimStatus upheld provisionalStatus provisionalDeadline provisionalArbiterDeadline provisionalObjectionHash)
states=(Proposed Active DefectPeriod Closed Cancelled)
for i in "${!names[@]}"; do
  v=${F[$i]:-?}
  [ "${names[$i]}" = state ] && v="$v (${states[$v]:-?})"
  printf '%-28s %s\n' "${names[$i]}" "$v"
done
echo "now (block time)             $($C block latest --field timestamp --rpc-url "$R")"
echo "pool / available             $($C call $A 'pool(uint256)(uint256)' "$ID" --rpc-url "$R" | cut -d' ' -f1) / $($C call $A 'available(uint256)(uint256)' "$ID" --rpc-url "$R" | cut -d' ' -f1)"
for who in payer payee; do
  addr=${F[$([ $who = payer ] && echo 0 || echo 1)]}
  echo "withdrawable[$who]           $($C call $A 'withdrawable(address)(uint256)' "$addr" --rpc-url "$R" | cut -d' ' -f1)"
done
echo "record(payee) n,k            $($C call $A 'record(address)(uint256,uint256)' "${F[1]}" --rpc-url "$R" | tr '\n' ' ')"
echo "totalHeld                    $($C call $A 'totalHeld()(uint256)' --rpc-url "$R" | cut -d' ' -f1)"
