# Architecture — UTM-LLMV

**Compiled:** 2026-09-06. **Status:** decided (README §2), nothing built.
Environment facts below are *verified* (measured live 2026-09-06); everything describing
the target system is *decided* or *draft*.

---

## 1. The one-paragraph version

Most web apps put the compute next to the web server. This one deliberately does not. The
whole point of the project is that a real language model is running on a real laptop —
Azlan's M4 Mac — and you can watch what quantization does to it. So the Mac is the compute
host and keeps its models; **hostinger-kerry** is the web host and never loads a model. The
two are joined by Tailscale, a private network only these machines are on. kerry keeps a copy
of every benchmark the Mac has ever pushed, so the results pages work at 3am with the Mac
shut in a bag; and when the Mac *is* awake, kerry forwards live prompts to it so a visitor can
type something and watch tokens arrive from a laptop in Bali.

---

## 2. Current state (verified 2026-09-06)

| Component | State |
|---|---|
| `/srv/utmcs/llmv` on kerry | **created empty this session** — `docs/` only |
| `/srv/utmcs/dsa` (sibling) | exists, backend compiled (`target/release`), **`frontend/` empty**, no PM2 entry, no systemd unit, no DNS. Mid-build. Not our concern. |
| `llmv.utmcs.online` | does not resolve — no DNS record |
| nginx vhost | does not exist |
| Ollama on the Mac | running, **0 models**, bound to `127.0.0.1` only |
| Tailscale Mac ↔ kerry | **active, direct** |

Nothing else about LLMV exists yet.

---

## 3. Target composition

```
                          ┌──────────────────────────────────────────┐
   visitor (browser)      │  hostinger-kerry  187.127.216.146        │
        │                 │  ts: 100.97.211.48                       │
        │  HTTPS          │                                          │
        └────────────────►│  nginx :443  llmv.utmcs.online           │
                          │   │  ├─ TLS (Let's Encrypt)              │
                          │   │  └─ BASIC AUTH  .htpasswd-llmv       │
                          │   │      (whole site, no exceptions)     │
                          │   │                                      │
                          │   ├─ /        ──► Next.js  :3092  (PM2)  │
                          │   │                                      │
                          │   └─ /api/*   ──► Axum     :8092 (systemd)
                          │                     │                    │
                          │                     ├─ SQLite data.db    │
                          │                     │   stored results,  │
                          │                     │   run counters     │
                          │                     │                    │
                          │                     └─ /api/live/* ──┐   │
                          └─────────────────────────────────────│───┘
                                                                │
                                       Tailscale (private, WireGuard)
                                                                │
                          ┌─────────────────────────────────────▼───┐
                          │  Azlan's Mac — Apple M4, 16 GB          │
                          │  ts: 100.69.208.5                       │
                          │                                          │
                          │   Ollama :11434   ◄── bind must move     │
                          │    ├─ llama3.2:1b-instruct-q2_K          │
                          │    ├─ llama3.2:1b-instruct-q4_K_M        │
                          │    └─ llama3.2:1b-instruct-q8_0          │
                          │                                          │
                          │   bench/run_benchmark.py  (Python 3.11+) │
                          │    └── measures, then PUSHES results ────┼──► POST /api/ingest
                          └──────────────────────────────────────────┘
```

---

## 4. The two data paths

There are exactly two ways data crosses between the Mac and kerry. Keeping them separate is
the whole design.

### Path A — Push (the benchmark). Always eventually available.

1. Azlan runs `bench/run_benchmark.py` on the Mac, on demand.
2. It drives Ollama locally (`127.0.0.1:11434`) through all 3 quant levels × 3 prompts × 3
   repeats, timing everything.
3. It POSTs one JSON document to `https://llmv.utmcs.online/api/ingest` with a shared ingest
   token (over the public HTTPS endpoint, behind basic auth — no Tailscale needed).
4. Axum validates, stores it as a new immutable `benchmark_run` row, and it is now permanent.

**Consequence:** `/` and `/benchmark` render entirely from SQLite. They do not care whether
the Mac exists. They work forever after the first push.

### Path B — Live proxy (the playground). Only when the Mac is awake.

1. Visitor types a prompt on `/playground`, picks a quant level.
2. Browser calls `POST /api/live/generate` on kerry.
3. Axum opens a streaming request to `http://100.69.208.5:11434/api/generate` over Tailscale.
4. Tokens stream back through Axum to the browser (SSE), with timings computed in Axum.
5. Axum logs the *metadata* — quant, token counts, TTFT, tokens/sec, SHA-256 of the prompt —
   never the prompt text (README §2, Privacy).

**Consequence:** if the Mac is asleep, step 3 fails fast and the playground shows an
"offline" state. Nothing else on the site degrades.

---

## 5. Health & the offline badge

`GET /api/live/health` on kerry does a 1.5 s TCP+HTTP probe of the Mac's Ollama and returns:

```json
{ "mac_online": true, "models": ["...q2_K","...q4_K_M","...q8_0"], "checked_at": "..." }
```

The frontend polls this on `/playground` load and every 30 s. Three states:

| State | Meaning | UI |
|---|---|---|
| `online` | Ollama answered, all 3 models present | playground fully enabled |
| `degraded` | Ollama answered, but a chosen model is missing | that quant option disabled with a reason |
| `offline` | no answer within 1.5 s | form disabled, amber badge, copy explaining the Mac is asleep and pointing at `/benchmark` |

⚠️ **The badge must never be a lie.** It reports the result of a probe made in the last 30 s,
not an assumption. If the probe itself errors, the state is `offline`, not `online`.

---

## 6. Why this shape (and what was rejected)

| Option | Rejected because |
|---|---|
| Run the model on kerry | Defeats the entire premise. Also kerry is a shared box running 17 other apps; a model would starve them. |
| Live-only (no stored results) | The public URL would be dead whenever the Mac sleeps — which is most of the time. |
| Push-only (no live path) | Owner wanted a real "try it" playground (scope 3). A static chart doesn't teach TTFT the way watching a first token land does. |
| Expose Ollama publicly | Would put an unauthenticated GPU on the internet. Tailscale keeps it on a private network with no public port at all. |
| Cloudflare tunnel / ngrok | Another vendor and another moving part when Tailscale is already live and direct between exactly these two machines. |

---

## 7. Failure modes we design for

| # | Failure | Behaviour | Where handled |
|---|---|---|---|
| 1 | Mac asleep / off | `/` and `/benchmark` unaffected; `/playground` shows offline badge | `design_doc_backend.md` §4 |
| 2 | Mac awake, model not pulled | that quant disabled with a named reason; others still work | health `degraded` |
| 3 | Tailscale down on either end | same as (1) — probe times out | 1.5 s timeout |
| 4 | Generation hangs | hard 60 s cap per live request, stream closed with a partial-result notice | Axum timeout |
| 5 | Ingest called with a bad/absent token | 401, nothing stored | `/api/ingest` guard |
| 6 | Two benchmark pushes race | both stored — runs are immutable and append-only, never updated | `db_schema.md` |
| 7 | SQLite locked under concurrent writes | WAL mode + busy_timeout; writes are tiny and rare | `db_schema.md` §4 |
| 8 | kerry reboots | systemd `llmv-backend` enabled; PM2 `pm2 save` + resurrect | `handover.md` |
| 9 | Someone hits `/api/*` directly | basic auth is on the **whole server block**, API included — not just `/` | nginx config |

---

## 8. Security posture

- **No public port on the Mac.** Ollama binds to the Tailscale IP only (pending action 1),
  not `0.0.0.0`. On an untrusted café network, `0.0.0.0` would expose the GPU to the LAN.
- **Basic auth covers everything**, including `/api/*`. There is no unauthenticated surface
  except the TLS handshake itself.
- **The ingest token is separate** from the gate credential so the Mac's push script never
  carries the human password. Stored in `.secrets/app-pass/` and in the systemd unit's
  environment file, mode `0600`.
- **No prompt text at rest** (README §2, Privacy).
- ⚠️ **Honest limitation:** basic auth over TLS is a gate, not a security boundary. A single
  shared credential with no rotation and no rate limiting is appropriate for a password-shared
  showcase and inappropriate for anything else. Recorded so nobody later mistakes it for
  hardened access control.

---

## 9. Sibling relationship to DSA Explorer

Both live under `/srv/utmcs/` on kerry, both are UTM teaching apps, both use Next.js + Axum +
SQLite. LLMV deliberately reuses DSA's *shape* (systemd backend, PM2 frontend, per-demo run
counters) so that learning one teaches the other. They share **no code and no database** —
they are siblings, not a monorepo. DSA is mid-build and out of scope here (README §2, ⏳ 4).
