# Database schema — UTM-LLMV

**Engine:** SQLite (single file, `/srv/utmcs/llmv/backend/data.db`) — *decided*, README §2.
**Compiled:** 2026-09-06. ⚠️ `sqlite3` CLI is **not installed on kerry** (verified 2026-09-06);
install it in Phase 1 or inspect through the app.

---

## 1. Design principles

1. **Runs are immutable.** A benchmark push is a historical fact. Nothing ever `UPDATE`s a
   measurement — a re-run is a new run. This is what makes the run-history picker honest.
2. **Store raw, derive on read.** Every individual repeat is stored. Averages are computed
   when queried, never persisted — so we can always go back to the noise.
3. **No prompt text at rest** for live generations (README §2, Privacy). Benchmark prompts
   *are* stored, because they are fixed, non-personal, and part of the method.
4. **Small and boring.** Three tables. A few KB per run. This will not outgrow SQLite.

---

## 2. Logical model

```
benchmark_runs  1 ──────< measurements
   (one push)              (quant × prompt × repeat)

live_generations   (independent — playground telemetry, no FK)
```

---

## 3. Schema — `migrations/0001_init.sql`

```sql
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ─────────────────────────────────────────────────────────────
-- One row per benchmark push from the Mac. Immutable.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS benchmark_runs (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at      TEXT    NOT NULL,          -- ISO8601, from the Mac
    finished_at     TEXT    NOT NULL,
    received_at     TEXT    NOT NULL DEFAULT (datetime('now')),
    harness_version TEXT    NOT NULL,          -- bench/run_benchmark.py version
    model_family    TEXT    NOT NULL,          -- 'llama3.2'
    model_params    TEXT    NOT NULL,          -- '1b-instruct'
    repeats         INTEGER NOT NULL,          -- 3
    -- host facts, captured by the harness so a run is self-describing
    host_chip       TEXT,                      -- 'Apple M4'
    host_ram_gb     INTEGER,                   -- 16
    host_cpu_cores  INTEGER,                   -- 10
    host_gpu_cores  INTEGER,                   -- 8
    host_os         TEXT,                      -- 'macOS 15.x'
    ollama_version  TEXT,                      -- '0.32.3'
    note            TEXT,                      -- free-text, e.g. 'first clean run'
    raw_json        TEXT NOT NULL              -- the whole pushed document, verbatim
);

CREATE INDEX IF NOT EXISTS idx_runs_started ON benchmark_runs(started_at DESC);

-- ─────────────────────────────────────────────────────────────
-- One row per (quant × prompt × repeat). The actual measurements.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS measurements (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id              INTEGER NOT NULL REFERENCES benchmark_runs(id) ON DELETE CASCADE,

    quant               TEXT    NOT NULL,      -- 'q2_K' | 'q4_K_M' | 'q8_0'
    model_tag           TEXT    NOT NULL,      -- 'llama3.2:1b-instruct-q4_K_M'
    model_size_bytes    INTEGER,               -- on-disk size of this quant
    prompt_key          TEXT    NOT NULL,      -- 'short' | 'medium' | 'long'
    prompt_text         TEXT    NOT NULL,      -- fixed & non-personal: safe to store
    repeat_index        INTEGER NOT NULL,      -- 0..repeats-1

    ttft_ms             REAL,                  -- time to first token
    total_ms            REAL    NOT NULL,      -- wall clock for the whole generation
    prompt_tokens       INTEGER,
    completion_tokens   INTEGER,
    tokens_per_sec      REAL,                  -- completion_tokens / (total-ttft)
    peak_memory_mb      REAL,                  -- sampled during the call
    context_window      INTEGER,               -- num_ctx actually used

    ok                  INTEGER NOT NULL DEFAULT 1,   -- 0 if this repeat failed
    error               TEXT,                          -- why, if ok = 0
    created_at          TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_meas_run    ON measurements(run_id);
CREATE INDEX IF NOT EXISTS idx_meas_quant  ON measurements(run_id, quant);
CREATE UNIQUE INDEX IF NOT EXISTS idx_meas_cell
    ON measurements(run_id, quant, prompt_key, repeat_index);

-- ─────────────────────────────────────────────────────────────
-- Playground telemetry. NO prompt text — hash only. See README §2.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS live_generations (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    quant             TEXT    NOT NULL,
    model_tag         TEXT    NOT NULL,
    prompt_sha256     TEXT    NOT NULL,        -- hash ONLY, never the text
    prompt_chars      INTEGER NOT NULL,
    max_tokens        INTEGER NOT NULL,

    ttft_ms           REAL,
    total_ms          REAL,
    completion_tokens INTEGER,
    tokens_per_sec    REAL,

    outcome           TEXT    NOT NULL,        -- 'ok'|'timeout'|'mac_offline'|'error'
    error             TEXT,
    created_at        TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_live_created ON live_generations(created_at DESC);
```

---

## 4. Operational notes

| Concern | Handling |
|---|---|
| Concurrency | `journal_mode = WAL` + `busy_timeout = 5000` set on every pool connection. Writes are rare (a push, or one row per playground run) and tiny. |
| Pool size | 5 connections. SQLite serialises writes regardless; the pool is for read concurrency. |
| Migrations | `sqlx migrate` at startup, in `db.rs`. Fails loudly and refuses to serve on a migration error rather than starting with a half-schema. |
| Backups | ✅ **LIVE since 2026-09-06.** systemd `llmv-backup.timer` → `/usr/local/bin/llmv-backup.sh`, nightly 19:20 UTC (**03:20 GMT+8**). Uses `VACUUM INTO` — a consistent snapshot of a live WAL database, **never `cp`**, which can capture a torn file mid-write. Each snapshot is then checked with `PRAGMA integrity_check` and deleted if it fails, so an unusable backup is never retained. Keeps 14; retention verified 18→14. Output `/srv/utmcs/llmv/backups/` (gitignored). Logs: `journalctl -u llmv-backup`. |
| `raw_json` duplication | Deliberate. `measurements` is the queryable projection; `raw_json` is the untouched original, so a schema mistake never loses data we already collected. |
| Deletion | `ON DELETE CASCADE` exists for integrity, but **nothing in the app deletes runs**. There is no delete route (`sitemap.md` §3.4). |

---

## 5. Derived values — computed on read, never stored

| Value | Query shape |
|---|---|
| avg tokens/sec per quant | `SELECT quant, AVG(tokens_per_sec) FROM measurements WHERE run_id=? AND ok=1 GROUP BY quant` |
| avg TTFT per quant | same, over `ttft_ms` |
| peak memory per quant | `MAX(peak_memory_mb)` grouped by quant |
| size vs speed scatter | `model_size_bytes` × `AVG(tokens_per_sec)` per quant |
| per-prompt breakdown | group by `quant, prompt_key` |

⚠️ **Every aggregate must filter `ok = 1`.** A failed repeat has `NULL` timings; letting it
into an average is how a benchmark starts lying. The UI shows the failed-repeat count next to
any average computed over fewer than `repeats` rows.

---

## 6. Worked example — one full run

Three quant levels × three prompts × three repeats = **27 `measurements` rows** per
`benchmark_runs` row. At roughly 400 bytes a row that is ~11 KB of measurements plus the
`raw_json` blob. A hundred runs is still under 5 MB.
