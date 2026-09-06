-- UTM-LLMV initial schema. See docs/db_schema.md.
-- Runs are immutable and append-only; nothing here is ever UPDATEd.

CREATE TABLE IF NOT EXISTS benchmark_runs (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at      TEXT    NOT NULL,
    finished_at     TEXT    NOT NULL,
    received_at     TEXT    NOT NULL DEFAULT (datetime('now')),
    harness_version TEXT    NOT NULL,
    model_family    TEXT    NOT NULL,
    model_params    TEXT    NOT NULL,
    repeats         INTEGER NOT NULL,
    host_chip       TEXT,
    host_ram_gb     INTEGER,
    host_cpu_cores  INTEGER,
    host_gpu_cores  INTEGER,
    host_os         TEXT,
    ollama_version  TEXT,
    note            TEXT,
    raw_json        TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_runs_started ON benchmark_runs(started_at DESC);

CREATE TABLE IF NOT EXISTS measurements (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id              INTEGER NOT NULL REFERENCES benchmark_runs(id) ON DELETE CASCADE,
    quant               TEXT    NOT NULL,
    model_tag           TEXT    NOT NULL,
    model_size_bytes    INTEGER,
    prompt_key          TEXT    NOT NULL,
    prompt_text         TEXT    NOT NULL,
    repeat_index        INTEGER NOT NULL,
    ttft_ms             REAL,
    total_ms            REAL    NOT NULL,
    prompt_tokens       INTEGER,
    completion_tokens   INTEGER,
    tokens_per_sec      REAL,
    tokens_per_sec_ollama REAL,
    peak_memory_mb      REAL,
    context_window      INTEGER,
    ok                  INTEGER NOT NULL DEFAULT 1,
    error               TEXT,
    created_at          TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_meas_run   ON measurements(run_id);
CREATE INDEX IF NOT EXISTS idx_meas_quant ON measurements(run_id, quant);
CREATE UNIQUE INDEX IF NOT EXISTS idx_meas_cell
    ON measurements(run_id, quant, prompt_key, repeat_index);

CREATE TABLE IF NOT EXISTS live_generations (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    quant             TEXT    NOT NULL,
    model_tag         TEXT    NOT NULL,
    prompt_sha256     TEXT    NOT NULL,
    prompt_chars      INTEGER NOT NULL,
    max_tokens        INTEGER NOT NULL,
    ttft_ms           REAL,
    total_ms          REAL,
    completion_tokens INTEGER,
    tokens_per_sec    REAL,
    outcome           TEXT    NOT NULL,
    error             TEXT,
    created_at        TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_live_created ON live_generations(created_at DESC);
