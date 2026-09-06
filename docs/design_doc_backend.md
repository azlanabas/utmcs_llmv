# Backend design — UTM-LLMV

**Compiled:** 2026-09-06. *Decided* per README §2; implementation detail is *draft* until built.

Two pieces of backend, on two different machines:

| Piece | Host | Language | Process | Port |
|---|---|---|---|---|
| **API + proxy** | hostinger-kerry | Rust / Axum | systemd `llmv-backend` | 8092 |
| **Benchmark harness** | Azlan's Mac | Python 3.11+ | run by hand | — |

---

## 1. Axum service (kerry)

### 1.1 Dependencies

```toml
[dependencies]
axum       = { version = "0.7", features = ["macros"] }
tokio      = { version = "1",   features = ["full"] }
serde      = { version = "1",   features = ["derive"] }
serde_json = "1"
sqlx       = { version = "0.7", features = ["sqlite", "runtime-tokio", "macros", "migrate"] }
tower-http = { version = "0.5", features = ["trace", "compression-gzip"] }
reqwest    = { version = "0.12", features = ["json", "stream"] }
futures    = "0.3"
tracing            = "0.1"
tracing-subscriber = { version = "0.3", features = ["env-filter"] }
sha2       = "0.10"
anyhow     = "1"
```

⚠️ No CORS layer. The frontend is served from the **same origin** through nginx, so there is
no cross-origin request to permit. Adding `CorsLayer::permissive()` here would widen the
surface for no reason — the DSA sibling's guide suggests CORS because it assumed a split
origin; ours is not split.

### 1.2 Configuration — `config.rs`

Read once at startup from `backend/.env` (mode 0600). **Every value is required; the service
refuses to start if one is missing** rather than falling back to a default.

| Var | Example | Purpose |
|---|---|---|
| `DATABASE_URL` | `sqlite:///srv/utmcs/llmv/backend/data.db` | SQLite file |
| `BIND_ADDR` | `127.0.0.1:8092` | never `0.0.0.0` — nginx is the only client |
| `OLLAMA_URL` | `http://100.69.208.5:11434` | the Mac, over Tailscale |
| `INGEST_TOKEN` | *(secret)* | guards `/api/ingest` |
| `LIVE_TIMEOUT_S` | `60` | hard cap on a live generation |
| `PROBE_TIMEOUT_MS` | `1500` | Mac health probe |
| `MAX_TOKENS_CAP` | `512` | server-side ceiling, independent of what the client asks |

### 1.3 Module responsibilities

| Module | Owns | Must not |
|---|---|---|
| `main.rs` | router assembly, listener, tracing init | contain business logic |
| `config.rs` | env parsing + validation | read env anywhere else |
| `db.rs` | pool, WAL pragmas, migrations | know about HTTP |
| `models.rs` | serde types shared across routes | touch the DB |
| `ollama.rs` | the *only* code that talks to the Mac | touch the DB |
| `routes/*` | HTTP shape, validation, status codes | contain SQL beyond simple queries |

Global rule 5 applies: **no file over 500 lines.** `routes/live.rs` is the one at risk —
split the SSE plumbing into `ollama.rs` before it grows.

---

## 2. Route behaviours

### 2.1 `POST /api/ingest`

```
1. Read X-Ingest-Token. Constant-time compare against config.
   ✗ → 401, empty body, log the source IP at warn. No detail leaked.
2. Deserialize the benchmark document. ✗ → 400 with the field path that failed.
3. Validate:
   - quant levels ⊆ {q2_K, q4_K_M, q8_0}
   - every (quant, prompt_key, repeat_index) cell is unique
   - finished_at >= started_at
   ✗ → 422 naming the violated rule.
4. In ONE transaction: insert benchmark_runs, then all measurements.
5. → 201 { run_id }
```

**Idempotency:** none by design. Two identical pushes create two runs — they are two real
executions and the history should show both. The harness warns before a duplicate push.

### 2.2 `GET /api/live/health`

```
1. GET {OLLAMA_URL}/api/tags with PROBE_TIMEOUT_MS.
2. Any failure (DNS, connect, timeout, non-200, bad JSON)
   → { mac_online: false, models: [], checked_at }   -- 200, never 5xx
3. Success → { mac_online: true, models: [...tags], checked_at }
```

⚠️ **This route never returns an error status.** "The Mac is off" is a normal state of the
world, not a server fault. A 500 here would make the frontend show a crash where it should
show an amber badge. It also never caches beyond 5 s — a stale "online" is a lie
(`architecture.md` §5).

### 2.3 `POST /api/live/generate` — SSE

```
1. Validate: prompt non-empty and <= 4000 chars; quant ∈ the three;
   max_tokens = min(requested, MAX_TOKENS_CAP).
2. Probe the Mac (as §2.2). Offline → log live_generations(outcome='mac_offline')
   and return a single SSE `error` event. Not a 5xx.
3. Open a streaming POST to {OLLAMA_URL}/api/generate with stream: true.
4. Emit:
     event: meta   { model_tag, quant, max_tokens, started_at }
     event: token  { t: "<text>", i: <n> }        ← one per token
     event: done   { ttft_ms, total_ms, completion_tokens, tokens_per_sec }
   TTFT is measured in Axum at the first token chunk — the honest number
   from the browser's point of view, including the Tailscale hop.
5. On LIVE_TIMEOUT_S: close the stream with
     event: error  { reason: "timeout", partial: true }
6. Always, in every exit path: write one live_generations row
   (prompt SHA-256 + length, never the text).
```

**Why SSE and not WebSockets:** one-directional, survives nginx buffering with
`proxy_buffering off`, and needs no extra protocol handling. There is nothing to send
upstream mid-generation.

⚠️ nginx must set `proxy_buffering off;` and `proxy_read_timeout 90s;` on `/api/live/` or the
stream arrives in one lump at the end — which destroys the entire point of watching TTFT.

### 2.4 Read routes

Plain SQLite queries, JSON out. `/api/runs/:id` expands measurements grouped by quant. All
aggregates filter `ok = 1` and report the excluded count (`db_schema.md` §5).

---

## 3. Concurrency & fairness

There is one GPU on the other end of the wire.

| Control | Value | Why |
|---|---|---|
| Live generation semaphore | **1** | Ollama serialises anyway; queueing in Axum gives a clean "waiting" state instead of a stalled socket. |
| Queue wait cap | 20 s | beyond that → `error { reason: "busy" }`. |
| Compare mode | runs the 3 quants **sequentially**, not in parallel | parallel would thrash the Mac's unified memory and produce meaningless timings. |

⚠️ **Timings from the playground are indicative, not benchmark-grade.** They include the
Tailscale hop and whatever else the Mac is doing. The `/benchmark` numbers are the measured
ones — taken locally on the Mac with no network in the path. The UI must say so; conflating
them would undermine the whole exercise.

---

## 4. The benchmark harness (Mac)

`bench/run_benchmark.py` — Python 3.11+ (use `/opt/homebrew/bin/python3`, **not** the system
3.9.6). Talks to `127.0.0.1:11434` directly: no network hop, no Tailscale, no nginx.

```
for quant in config.quants:                 # q2_K, q4_K_M, q8_0
    ensure model pulled (ollama pull if absent)
    record on-disk size (ollama show / manifest)
    warm-up call, discarded          ← first call pays load cost; excluding it
                                       is the difference between measuring
                                       inference and measuring disk I/O
    for prompt in prompts.json:             # short, medium, long
        for repeat in range(config.repeats):    # 3
            t0 = perf_counter()
            stream POST /api/generate (stream=True)
            ttft   = first chunk time - t0
            total  = last chunk time - t0
            sample memory during the call (see below)
            record eval_count / eval_duration from Ollama's final chunk
    unload the model between quants (keep-alive: 0)
                                     ← otherwise quant N's memory reading
                                       includes quant N-1 still resident
write results/<iso8601>.json
```

### 4.1 Memory sampling

Ollama's own `/api/ps` reports the loaded model's `size_vram`/`size` — that is the
authoritative figure for what the model occupies, and is preferred over sampling the process
RSS (which includes the Ollama server itself and is noisy). The harness records both, labels
which is which, and the report uses `/api/ps`.

### 4.2 Token counts

Taken from Ollama's final response chunk (`eval_count`, `eval_duration`,
`prompt_eval_count`), **not** estimated from character counts. `tokens_per_sec` is computed
two ways — from Ollama's own `eval_count / eval_duration`, and from wall-clock — and both are
stored. Divergence between them is itself informative and the report shows it.

### 4.3 `push_results.py`

POSTs the newest `results/*.json` to `/api/ingest` with the token from
`.secrets/app-pass/llmv.md`, over HTTPS with basic auth. Prints the returned `run_id`. Warns
if a run with the same `started_at` was already pushed.

---

## 5. Observability

| Signal | Where |
|---|---|
| Structured logs | `tracing` → journald (`journalctl -u llmv-backend`) |
| Request log | method, path, status, duration. **Never the prompt body.** |
| Mac probe transitions | logged at info on change only, not every 30 s poll |
| Failed ingests | logged at warn with source IP and the validation rule violated |

No metrics endpoint, no Prometheus in v1 — kerry's existing ntfy watchers cover host-level
alerting and this app has no SLO to defend.
