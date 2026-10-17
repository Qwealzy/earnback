"""Expected /proof totals for the testnet vault, from raw logs (QuickNode, 10,000-block chunks).

Usage: python -I arc-tests/proof_totals.py
"""
import json
import time
import urllib.request

RPC = "https://rpc.quicknode.testnet.arc.io"
VAULT = "0xfa5e10d370140acbdfe977437be6742908449b39"
DEPLOY_BLOCK = 67543436
CHUNK = 10_000

# keccak256 of the event signatures, as emitted by the deployed contract (checked against arc-cast sig-event)
TOPIC = {
    "AgreementCreated": None,
    "ProgressPaid": None,
    "Withdrawn": None,
}


def rpc(method, params):
    body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params}).encode()
    req = urllib.request.Request(RPC, body, {"Content-Type": "application/json", "User-Agent": "earnback-check/1"})
    for attempt in range(5):
        with urllib.request.urlopen(req, timeout=30) as r:
            out = json.load(r)
        if "error" not in out:
            return out["result"]
        time.sleep(1 + attempt)
    raise SystemExit(f"{method} failed: {out['error']}")


def main(topics):
    head = int(rpc("eth_blockNumber", []), 16)
    counts = {k: 0 for k in topics}
    sums = {"ProgressPaid": 0, "Withdrawn": 0}
    for start in range(DEPLOY_BLOCK, head + 1, CHUNK):
        end = min(start + CHUNK - 1, head)
        logs = rpc("eth_getLogs", [{"address": VAULT, "fromBlock": hex(start), "toBlock": hex(end)}])
        for log in logs:
            for name, t in topics.items():
                if log["topics"][0] == t:
                    counts[name] += 1
                    if name == "ProgressPaid":  # data: amount, cut, ref
                        sums[name] += int(log["data"][2:66], 16)
                    if name == "Withdrawn":  # data: amount
                        sums[name] += int(log["data"][2:66], 16)
        time.sleep(0.3)
    print(f"blocks {DEPLOY_BLOCK}..{head}")
    for name in topics:
        extra = f", sum {sums[name] / 1e6:.6f} USDC" if name in sums else ""
        print(f"{name}: {counts[name]} events{extra}")


if __name__ == "__main__":
    import sys
    main(dict(zip(TOPIC, sys.argv[1:4])))
