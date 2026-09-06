//! POST /api/ingest — the Mac pushes a benchmark document here.
//! Append-only: never updates an existing run (docs/db_schema.md §1).

use crate::{
    models::{quant_is_allowed, IngestDoc},
    state::AppState,
};
use axum::{
    extract::State,
    http::{HeaderMap, StatusCode},
    Json,
};
use serde_json::{json, Value};
use std::collections::HashSet;

/// Constant-time-ish comparison so a bad token can't be probed byte by byte.
fn token_matches(given: &str, expected: &str) -> bool {
    if given.len() != expected.len() {
        return false;
    }
    given
        .bytes()
        .zip(expected.bytes())
        .fold(0u8, |acc, (a, b)| acc | (a ^ b))
        == 0
}

pub async fn ingest(
    State(state): State<AppState>,
    headers: HeaderMap,
    body: String,
) -> Result<(StatusCode, Json<Value>), (StatusCode, Json<Value>)> {
    // 1. Token guard. 401 with no detail — nothing leaked about why.
    let given = headers
        .get("x-ingest-token")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    if !token_matches(given, &state.cfg.ingest_token) {
        tracing::warn!("rejected ingest: bad or absent X-Ingest-Token");
        return Err((StatusCode::UNAUTHORIZED, Json(json!({}))));
    }

    // 2. Parse.
    let doc: IngestDoc = serde_json::from_str(&body).map_err(|e| {
        (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "malformed document", "detail": e.to_string() })),
        )
    })?;

    // 3. Validate.
    if let Err(msg) = validate(&doc) {
        tracing::warn!("rejected ingest: {msg}");
        return Err((
            StatusCode::UNPROCESSABLE_ENTITY,
            Json(json!({ "error": msg })),
        ));
    }

    // 4. One transaction: the run and all its measurements land together or not at all.
    let mut tx = state.db.begin().await.map_err(internal)?;

    let run_id: i64 = sqlx::query_scalar(
        r#"INSERT INTO benchmark_runs
           (started_at, finished_at, harness_version, model_family, model_params, repeats,
            host_chip, host_ram_gb, host_cpu_cores, host_gpu_cores, host_os, ollama_version,
            note, raw_json)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
           RETURNING id"#,
    )
    .bind(&doc.started_at)
    .bind(&doc.finished_at)
    .bind(&doc.harness_version)
    .bind(&doc.model_family)
    .bind(&doc.model_params)
    .bind(doc.repeats)
    .bind(&doc.host_chip)
    .bind(doc.host_ram_gb)
    .bind(doc.host_cpu_cores)
    .bind(doc.host_gpu_cores)
    .bind(&doc.host_os)
    .bind(&doc.ollama_version)
    .bind(&doc.note)
    .bind(&body)
    .fetch_one(&mut *tx)
    .await
    .map_err(internal)?;

    for m in &doc.measurements {
        sqlx::query(
            r#"INSERT INTO measurements
               (run_id, quant, model_tag, model_size_bytes, prompt_key, prompt_text,
                repeat_index, ttft_ms, total_ms, prompt_tokens, completion_tokens,
                tokens_per_sec, tokens_per_sec_ollama, peak_memory_mb, context_window,
                ok, error)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)"#,
        )
        .bind(run_id)
        .bind(&m.quant)
        .bind(&m.model_tag)
        .bind(m.model_size_bytes)
        .bind(&m.prompt_key)
        .bind(&m.prompt_text)
        .bind(m.repeat_index)
        .bind(m.ttft_ms)
        .bind(m.total_ms)
        .bind(m.prompt_tokens)
        .bind(m.completion_tokens)
        .bind(m.tokens_per_sec)
        .bind(m.tokens_per_sec_ollama)
        .bind(m.peak_memory_mb)
        .bind(m.context_window)
        .bind(if m.ok { 1 } else { 0 })
        .bind(&m.error)
        .execute(&mut *tx)
        .await
        .map_err(internal)?;
    }

    tx.commit().await.map_err(internal)?;
    tracing::info!(run_id, count = doc.measurements.len(), "ingested run");

    Ok((
        StatusCode::CREATED,
        Json(json!({ "run_id": run_id, "measurements": doc.measurements.len() })),
    ))
}

fn validate(doc: &IngestDoc) -> Result<(), String> {
    if doc.measurements.is_empty() {
        return Err("document contains no measurements".into());
    }
    if doc.finished_at < doc.started_at {
        return Err("finished_at is before started_at".into());
    }

    let mut seen: HashSet<(&str, &str, i64)> = HashSet::new();
    for m in &doc.measurements {
        if !quant_is_allowed(&m.quant) {
            return Err(format!(
                "quant '{}' is not one of the three this project ships",
                m.quant
            ));
        }
        if !seen.insert((&m.quant, &m.prompt_key, m.repeat_index)) {
            return Err(format!(
                "duplicate cell (quant={}, prompt_key={}, repeat_index={})",
                m.quant, m.prompt_key, m.repeat_index
            ));
        }
    }
    Ok(())
}

fn internal<E: std::fmt::Display>(e: E) -> (StatusCode, Json<Value>) {
    tracing::error!("ingest db error: {e}");
    (
        StatusCode::INTERNAL_SERVER_ERROR,
        Json(json!({ "error": "storage failure" })),
    )
}
