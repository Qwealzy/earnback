#!/usr/bin/env bash
# Replay a failed tx's calldata as an eth_call from the same sender and decode the revert reason.
# Usage (WSL): bash arc-testleri/neden.sh <tx-hash>
set -euo pipefail
TX=${1:?tx hash}
R=${ARC_TESTNET_RPC_URL:-https://rpc.testnet.arc.io}
C=~/.local/bin/arc-cast
ABI="$(cd "$(dirname "$0")/.." && pwd)/studio/contracts/out/RetentionVault.sol/RetentionVault.json"

FROM=$($C tx "$TX" from --rpc-url "$R")
TO=$($C tx "$TX" to --rpc-url "$R")
INPUT=$($C tx "$TX" input --rpc-url "$R")
BLOCK=$($C tx "$TX" blockNumber --rpc-url "$R")
echo "from $FROM  to $TO  block $BLOCK"
echo "decoded input:"
$C decode-calldata "$(echo "$INPUT" | cut -c1-10 | xargs -I{} sh -c "$C 4byte {} 2>/dev/null | head -1")" "$INPUT" 2>/dev/null || echo "  selector ${INPUT:0:10}"
echo "replay at block $((BLOCK - 1)):"
OUT=$($C call "$TO" "$INPUT" --from "$FROM" --block $((BLOCK - 1)) --rpc-url "$R" 2>&1 || true)
echo "  $OUT" | head -3
SEL=$(echo "$OUT" | grep -oE '0x[0-9a-fA-F]{8}' | head -1 || true)
if [ -n "$SEL" ]; then
  python3 - "$SEL" "$ABI" <<'PY'
import json, sys, subprocess
sel, abi = sys.argv[1].lower(), json.load(open(sys.argv[2]))["abi"]
for e in abi:
    if e["type"] == "error":
        sig = e["name"] + "(" + ",".join(i["type"] for i in e["inputs"]) + ")"
        h = subprocess.run([__import__("os").path.expanduser("~/.local/bin/arc-cast"), "sig", sig], capture_output=True, text=True).stdout.strip()
        if h.lower() == sel:
            print("  custom error:", sig)
PY
fi
