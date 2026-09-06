#!/usr/bin/env python3
"""
UTM-LLMV benchmark harness. RUNS ON THE MAC, against Ollama's loopback.

No network hop, no nginx, no Tailscale in the measurement path — that is what makes
these numbers the "measured" ones, as opposed to the "indicative" playground numbers
(docs/design_doc_frontend.md §6).

Requires Python >= 3.11. Use /opt/homebrew/bin/python3 — the system 3.9.6 will not do.
"""

from __future__ import annotations

import json
import pathlib
import platform
import subprocess
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone

HARNESS_VERSION = "1.0.0"
HERE = pathlib.Path(__file__).parent

if sys.version_info < (3, 11):
    sys.exit(
        f"needs Python >= 3.11, got {sys.version.split()[0]}. "
        "Use /opt/homebrew/bin/python3."
    )


# ── helpers ────────────────────────────────────────────────────────────────

def load(name: str) -> dict:
    return json.loads((HERE / name).read_text())


def post_json(url: str, payload: dict, timeout: float) -> urllib.request.addinfourl:
    body = json.dumps(payload).encode()
    req = urllib.request.Request(
        url, data=body, headers={"Content-Type": "application/json"}, method="POST"
    )
    return urllib.request.urlopen(req, timeout=timeout)


def get_json(url: str, timeout: float = 10.0) -> dict:
    with urllib.request.urlopen(url, timeout=timeout) as r:
        return json.loads(r.read())


def sh(*args: str) -> str:
    try:
        return subprocess.run(
            args, capture_output=True, text=True, timeout=15
        ).stdout.strip()
    except Exception:
        return ""


def host_facts(cfg: dict) -> dict:
    """Captured so a stored run is self-describing (docs/db_schema.md)."""
    chip = sh("sysctl", "-n", "machdep.cpu.brand_string")
    mem = sh("sysctl", "-n", "hw.memsize")
    cpu = sh("sysctl", "-n", "hw.ncpu")

    gpu_cores = None
    disp = sh("system_profiler", "SPDisplaysDataType")
    for line in disp.splitlines():
        if "Total Number of Cores" in line:
            try:
                gpu_cores = int(line.split(":")[1].strip())
            except Exception:
                pass
            break

    try:
        ver = get_json(f"{cfg['ollama_host']}/api/version").get("version")
    except Exception:
        ver = None

    return {
        "host_chip": chip or None,
        "host_ram_gb": int(int(mem) / 1024**3) if mem.isdigit() else None,
        "host_cpu_cores": int(cpu) if cpu.isdigit() else None,
        "host_gpu_cores": gpu_cores,
        "host_os": f"{platform.system()} {platform.mac_ver()[0]}".strip(),
        "ollama_version": ver,
    }


def model_size_bytes(cfg: dict, tag: str) -> int | None:
    """On-disk size as Ollama itself reports it — measured, not taken from the registry."""
    try:
        for m in get_json(f"{cfg['ollama_host']}/api/tags").get("models", []):
            if m.get("name") == tag:
                return m.get("size")
    except Exception:
        pass
    return None


def loaded_memory_mb(cfg: dict, tag: str) -> float | None:
    """
    Ollama's own /api/ps is authoritative for what the model occupies.
    Preferred over sampling process RSS, which includes the server itself
    (docs/design_doc_backend.md §4.1).
    """
    try:
        for m in get_json(f"{cfg['ollama_host']}/api/ps").get("models", []):
            if m.get("name") == tag:
                size = m.get("size_vram") or m.get("size")
                return round(size / 1024**2, 1) if size else None
    except Exception:
        pass
    return None


def unload(cfg: dict, tag: str) -> None:
    """keep_alive: 0 evicts the model, so the next quant's memory reading is clean."""
    try:
        post_json(
            f"{cfg['ollama_host']}/api/generate",
            {"model": tag, "prompt": "", "keep_alive": 0},
            timeout=30,
        ).read()
    except Exception:
        pass


# ── the measurement ────────────────────────────────────────────────────────

def generate_once(cfg: dict, tag: str, prompt: str) -> dict:
    """One streamed generation. Returns timings + Ollama's own token accounting."""
    payload = {
        "model": tag,
        "prompt": prompt,
        "stream": True,
        "options": {"num_predict": cfg["max_tokens"]},
    }
    body = json.dumps(payload).encode()
    req = urllib.request.Request(
        f"{cfg['ollama_host']}/api/generate",
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    t0 = time.perf_counter()
    ttft = None
    n_chunks = 0
    final: dict = {}
    peak_mem = None

    with urllib.request.urlopen(req, timeout=cfg["request_timeout_s"]) as resp:
        for raw in resp:
            if not raw.strip():
                continue
            chunk = json.loads(raw)
            if chunk.get("response"):
                if ttft is None:
                    ttft = (time.perf_counter() - t0) * 1000.0
                    # sample memory once the model is definitely resident
                    peak_mem = loaded_memory_mb(cfg, tag)
                n_chunks += 1
            if chunk.get("done"):
                final = chunk

    total_ms = (time.perf_counter() - t0) * 1000.0

    eval_count = final.get("eval_count")
    eval_ns = final.get("eval_duration")

    # Two independent tokens/sec figures. Divergence between them is itself
    # informative and both are stored (docs/design_doc_backend.md §4.2).
    tps_ollama = (
        eval_count / (eval_ns / 1e9) if eval_count and eval_ns and eval_ns > 0 else None
    )
    gen_ms = total_ms - (ttft or 0.0)
    tps_wall = (
        (eval_count or n_chunks) / (gen_ms / 1000.0) if gen_ms > 0 and (eval_count or n_chunks) else None
    )

    return {
        "ttft_ms": round(ttft, 3) if ttft is not None else None,
        "total_ms": round(total_ms, 3),
        "prompt_tokens": final.get("prompt_eval_count"),
        "completion_tokens": eval_count if eval_count is not None else n_chunks,
        "tokens_per_sec": round(tps_wall, 3) if tps_wall else None,
        "tokens_per_sec_ollama": round(tps_ollama, 3) if tps_ollama else None,
        "peak_memory_mb": peak_mem,
        "context_window": final.get("context") and len(final["context"]) or None,
    }


def main() -> int:
    cfg = load("bench_config.json")
    prompts = load("prompts.json")["prompts"]

    # Fail fast and clearly if Ollama isn't up.
    try:
        tags = {m["name"] for m in get_json(f"{cfg['ollama_host']}/api/tags")["models"]}
    except Exception as e:
        print(f"FATAL: cannot reach Ollama at {cfg['ollama_host']} — {e}")
        print("Is `ollama serve` running? (brew services list | grep ollama)")
        return 1

    missing = [q["tag"] for q in cfg["quants"] if q["tag"] not in tags]
    if missing:
        print("FATAL: these models are not pulled:")
        for t in missing:
            print(f"  ollama pull {t}")
        return 1

    facts = host_facts(cfg)
    started = datetime.now(timezone.utc)
    print(f"host: {facts['host_chip']} · {facts['host_ram_gb']} GB · "
          f"{facts['host_cpu_cores']} CPU / {facts['host_gpu_cores']} GPU cores")
    print(f"ollama {facts['ollama_version']} · repeats={cfg['repeats']} "
          f"· max_tokens={cfg['max_tokens']}\n")

    measurements = []
    total_cells = len(cfg["quants"]) * len(prompts) * cfg["repeats"]
    cell = 0

    for q in cfg["quants"]:
        key, tag = q["key"], q["tag"]
        size = model_size_bytes(cfg, tag)
        print(f"=== {key} ({tag}) — {size/1e9:.2f} GB on disk ===" if size
              else f"=== {key} ({tag}) ===")

        # Warm-up, discarded. Excluding it is the difference between measuring
        # inference and measuring disk I/O.
        if cfg.get("warmup", True):
            print("  warm-up…", end="", flush=True)
            try:
                generate_once(cfg, tag, "hello")
                print(" done")
            except Exception as e:
                print(f" failed ({e})")

        for p in prompts:
            for r in range(cfg["repeats"]):
                cell += 1
                print(f"  [{cell:2d}/{total_cells}] {p['key']:<6} repeat {r}…",
                      end="", flush=True)
                row = {
                    "quant": key,
                    "model_tag": tag,
                    "model_size_bytes": size,
                    "prompt_key": p["key"],
                    "prompt_text": p["text"],
                    "repeat_index": r,
                }
                try:
                    row.update(generate_once(cfg, tag, p["text"]))
                    row["ok"] = True
                    print(f" {row['tokens_per_sec']:.1f} tok/s, "
                          f"ttft {row['ttft_ms']:.0f} ms")
                except Exception as e:
                    # A failed repeat is recorded as failed, never silently dropped.
                    row.update({"total_ms": 0.0, "ok": False, "error": str(e)})
                    print(f" FAILED: {e}")
                measurements.append(row)

        if cfg.get("unload_between_quants", True):
            unload(cfg, tag)

    finished = datetime.now(timezone.utc)

    doc = {
        "started_at": started.isoformat(),
        "finished_at": finished.isoformat(),
        "harness_version": HARNESS_VERSION,
        "model_family": cfg["model_family"],
        "model_params": cfg["model_params"],
        "repeats": cfg["repeats"],
        **facts,
        "note": " ".join(sys.argv[1:]) or None,
        "measurements": measurements,
    }

    outdir = HERE / "results"
    outdir.mkdir(exist_ok=True)
    stamp = started.strftime("%Y%m%dT%H%M%SZ")
    out = outdir / f"{stamp}.json"
    out.write_text(json.dumps(doc, indent=2))

    ok = [m for m in measurements if m.get("ok")]
    failed = len(measurements) - len(ok)
    print(f"\nwrote {out}")
    print(f"{len(ok)}/{len(measurements)} measurements ok"
          + (f", {failed} FAILED" if failed else ""))

    # CLI readout, as the spec asks for.
    print("\n  quant    avg tok/s   avg ttft   size")
    for q in cfg["quants"]:
        rows = [m for m in ok if m["quant"] == q["key"]]
        if not rows:
            print(f"  {q['key']:<8} — no successful runs")
            continue
        tps = sum(m["tokens_per_sec"] for m in rows if m["tokens_per_sec"]) / len(rows)
        ttft = sum(m["ttft_ms"] for m in rows if m["ttft_ms"]) / len(rows)
        sz = rows[0].get("model_size_bytes")
        print(f"  {q['key']:<8} {tps:8.1f}   {ttft:7.0f}ms   "
              f"{sz/1e9:.2f} GB" if sz else f"  {q['key']:<8} {tps:8.1f}   {ttft:7.0f}ms")

    print(f"\nnext: python3 push_results.py   # publishes to {cfg['push_url']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
