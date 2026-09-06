#!/usr/bin/env python3
"""
Publish the newest benchmark result to kerry.

Goes over public HTTPS (basic auth + X-Ingest-Token) — NOT Tailscale. The push path
does not depend on the Ollama bind, so it works even before that change is made.

Credentials are read from ~/Documents/Claude/.secrets/app-pass/llmv.md.
Nothing is ever printed that would reveal them.
"""

from __future__ import annotations

import base64
import glob
import json
import pathlib
import re
import sys
import urllib.error
import urllib.request

HERE = pathlib.Path(__file__).parent
SECRETS = pathlib.Path.home() / "Documents/Claude/.secrets/app-pass/llmv.md"


def creds() -> tuple[str, str, str]:
    if not SECRETS.exists():
        sys.exit(f"FATAL: secrets file not found: {SECRETS}")
    body = SECRETS.read_text()

    def pick(pattern: str, what: str) -> str:
        m = re.search(pattern, body)
        if not m:
            sys.exit(f"FATAL: could not find the {what} in {SECRETS}")
        return m.group(1).strip()

    user = pick(r"^user\s*:\s*(\S+)", "gate username")
    pw = pick(r"^password\s*:\s*(\S+)", "gate password")
    token = pick(r"^token\s*:\s*(\S+)", "ingest token")
    return user, pw, token


def newest_result() -> pathlib.Path:
    files = sorted(glob.glob(str(HERE / "results" / "*.json")))
    if not files:
        sys.exit("FATAL: no results found — run run_benchmark.py first")
    return pathlib.Path(files[-1])


def main() -> int:
    cfg = json.loads((HERE / "bench_config.json").read_text())
    url = cfg["push_url"]
    user, pw, token = creds()

    path = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else newest_result()
    doc = json.loads(path.read_text())

    ok = sum(1 for m in doc["measurements"] if m.get("ok"))
    total = len(doc["measurements"])
    print(f"pushing {path.name}")
    print(f"  started : {doc['started_at']}")
    print(f"  cells   : {ok}/{total} ok" + (f", {total-ok} FAILED" if ok != total else ""))
    print(f"  target  : {url}")

    basic = base64.b64encode(f"{user}:{pw}".encode()).decode()
    req = urllib.request.Request(
        url,
        data=json.dumps(doc).encode(),
        headers={
            "Content-Type": "application/json",
            "X-Ingest-Token": token,
            "Authorization": f"Basic {basic}",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            print(f"\nHTTP {r.status}")
            print(r.read().decode())
    except urllib.error.HTTPError as e:
        detail = e.read().decode()[:400]
        print(f"\nHTTP {e.code}")
        print(detail)
        if e.code == 401:
            print("\n401 means either the basic-auth gate or the ingest token was rejected.")
            print("Both live in .secrets/app-pass/llmv.md — check they match the server.")
        elif e.code == 422:
            print("\n422 means the document failed validation. The message above names the rule.")
        return 1
    except urllib.error.URLError as e:
        print(f"\nFAILED to reach {url}: {e.reason}")
        print("Is DNS live and the nginx vhost in place yet?")
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
