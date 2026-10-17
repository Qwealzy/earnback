"""Independent check of a deploy made with deploy/index.html.

Checks, from raw RPC data only:
  1. receipt status, sender, created address;
  2. creation input == artifact bytecode.object + ABI-encoded intended constructor args (no recompilation);
  3. runtime code == Studio testnet vault runtime with immutable positions masked;
  4. every constructor value read back with eth_call.

Usage: python -I arc-tests/verify_deploy.py <testnet|mainnet> <tx-hash>
"""
import json
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ART = json.loads((ROOT / "studio/contracts/out/RetentionVault.sol/RetentionVault.json").read_text(encoding="utf-8"))
RPC = {"testnet": "https://rpc.quicknode.testnet.arc.io", "mainnet": "https://rpc.mainnet.arc.io"}
REF = ("https://rpc.quicknode.testnet.arc.io", "0xfa5e10d370140acbdfe977437be6742908449b39")
WAD = 10**18
INTENDED = [  # decision K1, same order as the constructor
    ("usdc", 0x3600000000000000000000000000000000000000, "address"),
    ("priorA", 4 * WAD // 10, "uint"), ("priorB", 46 * WAD // 10, "uint"), ("zWad", WAD, "uint"),
    ("capBps", 500, "uint"), ("floorBps", 100, "uint"),
    ("maxAgreementValue", 10**15, "uint"), ("maxTotalHeld", 10**15, "uint"), ("minRecordValue", 500_000, "uint"),
]
def rpc(url, method, params):
    body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params}).encode()
    req = urllib.request.Request(url, body, {"Content-Type": "application/json", "User-Agent": "earnback-check/1"})
    with urllib.request.urlopen(req, timeout=30) as r:
        out = json.load(r)
    if "error" in out:
        raise SystemExit(f"{method}: {out['error']}")
    return out["result"]


def mask(code_hex):
    b = bytearray(bytes.fromhex(code_hex[2:]))
    for refs in ART["deployedBytecode"]["immutableReferences"].values():
        for r in refs:
            b[r["start"]:r["start"] + r["length"]] = bytes(r["length"])
    return bytes(b)


def main(network, tx):
    url = RPC[network]
    rc = rpc(url, "eth_getTransactionReceipt", [tx])
    t = rpc(url, "eth_getTransactionByHash", [tx])
    addr = rc["contractAddress"]
    print(f"status {int(rc['status'], 16)} | from {t['from']} | to {t['to']} | contract {addr} | block {int(rc['blockNumber'], 16)}")
    print(f"gas used {int(rc['gasUsed'], 16)} | effective gas price {int(rc['effectiveGasPrice'], 16) / 1e9:.2f} gwei | "
          f"fee {int(rc['gasUsed'], 16) * int(rc['effectiveGasPrice'], 16) / 1e18:.6f} USDC")

    args = "".join(f"{v:064x}" for _, v, _ in INTENDED)
    expected_input = ART["bytecode"]["object"].lower() + args
    print("creation input == artifact bytecode + intended args:", t["input"].lower() == expected_input)

    mine = rpc(url, "eth_getCode", [addr, "latest"])
    ref = rpc(REF[0], "eth_getCode", [REF[1], "latest"])
    print(f"runtime {(len(mine) - 2) // 2} bytes; equal to Studio testnet vault (immutables masked):", mask(mine) == mask(ref))

    sel = ART["methodIdentifiers"]  # getter selectors from the artifact
    ok_all = True
    for name, want, _ in INTENDED:
        got = int(rpc(url, "eth_call", [{"to": addr, "data": "0x" + sel[f"{name}()"]}, "latest"]), 16)
        ok = got == want
        ok_all &= ok
        print(f"  {name:18} {got} {'OK' if ok else f'EXPECTED {want}'}")
    print("all constructor values as intended:", ok_all)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
