"""Every vault event on Arc mainnet, grouped by agreement, with sender and fee per transaction.

Feeds the proof page scenario table (proof-scenarios.ts) and the README.
Usage (WSL, needs arc-cast for keccak): python3 -I arc-tests/scenario_txs.py [out.json]
"""
import json
import os
import subprocess
import sys
import time
import urllib.request

RPC = "https://rpc.mainnet.arc.io"
VAULT = "0xd8ea0473cfd03ffb21bedffcf3a4882ff7cb9e81"
DEPLOY_BLOCK = 26_510_136
CHUNK = 9_000
HERE = os.path.dirname(os.path.abspath(__file__))
ARTIFACT = os.path.join(HERE, "..", "studio", "contracts", "out", "RetentionVault.sol", "RetentionVault.json")
CAST = os.path.expanduser("~/.local/bin/arc-cast")


def rpc(method, params):
    body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params}).encode()
    req = urllib.request.Request(RPC, body, {"Content-Type": "application/json", "User-Agent": "earnback-check/1"})
    for attempt in range(6):
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                out = json.load(r)
            if "error" not in out:
                return out["result"]
        except Exception as e:  # 429 from the public RPC
            out = {"error": str(e)}
        time.sleep(1 + attempt)
    raise SystemExit(f"{method} failed: {out['error']}")


def canonical(t):
    if t["type"].startswith("tuple"):
        return "(" + ",".join(canonical(c) for c in t["components"]) + ")" + t["type"][5:]
    return t["type"]


def event_topics():
    abi = json.load(open(ARTIFACT, encoding="utf-8"))["abi"]
    topics = {}
    for e in abi:
        if e["type"] != "event":
            continue
        sig = e["name"] + "(" + ",".join(canonical(i) for i in e["inputs"]) + ")"
        h = subprocess.run([CAST, "keccak", sig], capture_output=True, text=True, check=True).stdout.strip()
        first_indexed = next((i for i in e["inputs"] if i.get("indexed")), None)
        topics[h.lower()] = (e["name"], first_indexed["name"] if first_indexed else None)
    return topics


def main():
    topics = event_topics()
    head = int(rpc("eth_blockNumber", []), 16)
    logs = []
    for start in range(DEPLOY_BLOCK, head + 1, CHUNK):
        end = min(start + CHUNK - 1, head)
        logs += rpc("eth_getLogs", [{"address": VAULT, "fromBlock": hex(start), "toBlock": hex(end)}])
    rows, seen = [], {}
    for lg in logs:
        name, first = topics.get(lg["topics"][0].lower(), ("?", None))
        h = lg["transactionHash"]
        if h not in seen:
            tx = rpc("eth_getTransactionByHash", [h])
            rc = rpc("eth_getTransactionReceipt", [h])
            seen[h] = {
                "from": tx["from"],
                "status": int(rc["status"], 16),
                "fee": int(rc["gasUsed"], 16) * int(rc["effectiveGasPrice"], 16) / 1e18,
            }
        key = None
        if first == "id" and len(lg["topics"]) > 1:
            key = int(lg["topics"][1], 16)
        elif len(lg["topics"]) > 1:
            key = "0x" + lg["topics"][1][-40:]
        rows.append({"block": int(lg["blockNumber"], 16), "event": name, "key": key, "tx": h, **seen[h]})
    for r in rows:
        print(f'{r["block"]:>10} {str(r["key"]):>44} {r["event"]:<28} {r["tx"]} from {r["from"]} fee {r["fee"]:.6f} status {r["status"]}')
    print(f"{len(rows)} events, {len(seen)} txs, fees {sum(s['fee'] for s in seen.values()):.6f} USDC (vault txs only, approvals not included)")
    if len(sys.argv) > 1:
        json.dump(rows, open(sys.argv[1], "w"), indent=1)


if __name__ == "__main__":
    main()
