"""Submit RetentionVault to Sourcify (v2, metadata + sources) and wait for the result.

Publishing is public: run only with the user's approval for that chain and address.
Usage: python -I verify/submit_sourcify.py <chainId> <address> [creationTxHash]
Inputs come from verify/sourcify/ (built by verify/build-sourcify.ts, every source keccak-checked).
"""
import json
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

API = "https://sourcify.dev/server"
HERE = Path(__file__).resolve().parent / "sourcify"


def call(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(API + path, data=data, method=method,
                                 headers={"Content-Type": "application/json", "User-Agent": "earnback-verify/1"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, json.load(r)
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")


def main(chain, address, tx=None):
    metadata = json.loads((HERE / "metadata.json").read_text(encoding="utf-8"))
    sources = {p: (HERE / "sources" / p).read_text(encoding="utf-8") for p in metadata["sources"]}
    body = {"metadata": metadata, "sources": sources}
    if tx:
        body["creationTransactionHash"] = tx
    status, res = call("POST", f"/v2/verify/metadata/{chain}/{address}", body)
    print("submit:", status, json.dumps(res)[:300])
    vid = res.get("verificationId")
    if not vid:
        return
    for _ in range(40):
        time.sleep(3)
        status, job = call("GET", f"/v2/verify/{vid}")
        if job.get("isJobCompleted"):
            print("job:", json.dumps({k: job.get(k) for k in ("isJobCompleted", "error", "contract")}, indent=1)[:1500])
            break
    else:
        print("job did not complete in 2 minutes; check later with GET", f"{API}/v2/verify/{vid}")
    status, look = call("GET", f"/v2/contract/{chain}/{address}")
    print("lookup:", json.dumps(look)[:300])


if __name__ == "__main__":
    main(*sys.argv[1:])
