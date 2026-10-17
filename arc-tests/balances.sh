#!/usr/bin/env bash
# Testnet USDC balances of the rehearsal accounts (ERC-20 view, 6 decimals) and vault withdrawable.
# Usage (WSL): bash arc-tests/balances.sh E=0x.. Y=0x.. ...
set -euo pipefail
R=${ARC_TESTNET_RPC_URL:-https://rpc.testnet.arc.io}
USDC=0x3600000000000000000000000000000000000000
VAULT=0xfa5e10d370140acbdfe977437be6742908449b39
C=~/.local/bin/arc-cast
for pair in "$@"; do
  name=${pair%%=*}; addr=$(echo "${pair#*=}" | tr 'A-F' 'a-f')
  bal=$($C call $USDC 'balanceOf(address)(uint256)' "$addr" --rpc-url "$R" | cut -d' ' -f1)
  wd=$($C call $VAULT 'withdrawable(address)(uint256)' "$addr" --rpc-url "$R" | cut -d' ' -f1)
  printf '%-2s %s  USDC %s  withdrawable %s\n' "$name" "$addr" \
    "$(python3 -c "print(f'{$bal/1e6:.6f}')")" "$(python3 -c "print(f'{$wd/1e6:.6f}')")"
done
