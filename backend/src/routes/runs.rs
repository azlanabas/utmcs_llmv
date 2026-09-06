//! Read paths — served from SQLite, entirely independent of the Mac.
//! Every aggregate filters ok=1 and reports how many rows it excluded
//! (docs/db_schema.md §5 — an average over failed repeats is how a benchmark lies).

use crate::state::AppState;
use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde_json::{json, Value};
use sqlx::Row;

pub async fn list_runs(State(state): State<AppState>) -> Result<Json<Value>, StatusCode> {
    let rows = sqlx::query(
        r#"SELECT r.id, r.started_at, r.finished_at, r.received_at, r.model_family,
                  r.model_params, r.repeats, r.host_chip, r.note,
                  (SELECT COUNT(*) FROM measurements m WHERE m.run_id = r.id) AS n_meas,
                  (SELECT COUNT(*) FROM measurements m WHERE m.run_id = r.id AND m.ok = 0) AS n_failed
           FROM benchmark_runs r
           ORDER BY r.started_at DESC"#,
    )
    .fetch_all(&state.db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let runs: Vec<Value> = rows
        .iter()
        .map(|r| {
            json!({
                "id":            r.get::<i64, _>("id"),
                "started_at":    r.get::<String, _>("started_at"),
                "finished_at":   r.get::<String, _>("finished_at"),
                "received_at":   r.get::<String, _>("received_at"),
                "model_family":  r.get::<String, _>("model_family"),
                "model_params":  r.get::<String, _>("model_params"),
                "repeats":       r.get::<i64, _>("repeats"),
                "host_chip":     r.get::<Option<String>, _>("host_chip"),
                "note":          r.get::<Option<String>, _>("note"),
                "measurements":  r.get::<i64, _>("n_meas"),
                "failed":        r.get::<i64, _>("n_failed"),
            })
        })
        .collect();

    Ok(Json(json!({ "runs": runs })))
}

pub async fn latest_run(State(state): State<AppState>) -> Result<Json<Value>, StatusCode> {
    let id: Option<i64> = sqlx::query_scalar("SELECT MAX(id) FROM benchmark_runs")
        .fetch_one(&state.db)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    match id {
        Some(id) => expand(state, id).await,
        None => Ok(Json(json!({ "run": null, "reason": "no benchmark has been pushed yet" }))),
    }
}

pub async fn get_run(
    State(state): State<AppState>,
    Path(id): Path<i64>,
) -> Result<Json<Value>, StatusCode> {
    expand(state, id).await
}

async fn expand(state: AppState, id: i64) -> Result<Json<Value>, StatusCode> {
    let run = sqlx::query(
        r#"SELECT id, started_at, finished_at, received_at, harness_version, model_family,
                  model_params, repeats, host_chip, host_ram_gb, host_cpu_cores,
                  host_gpu_cores, host_os, ollama_version, note
           FROM benchmark_runs WHERE id = ?"#,
    )
    .bind(id)
    .fetch_optional(&state.db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
    .ok_or(StatusCode::NOT_FOUND)?;

    let meas = sqlx::query(
        r#"SELECT quant, model_tag, model_size_bytes, prompt_key, prompt_text, repeat_index,
                  ttft_ms, total_ms, prompt_tokens, completion_tokens, tokens_per_sec,
                  tokens_per_sec_ollama, peak_memory_mb, context_window, ok, error
           FROM measurements WHERE run_id = ?
           ORDER BY quant, prompt_key, repeat_index"#,
    )
    .bind(id)
    .fetch_all(&state.db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let measurements: Vec<Value> = meas
        .iter()
        .map(|m| {
            json!({
                "quant":                 m.get::<String, _>("quant"),
                "model_tag":             m.get::<String, _>("model_tag"),
                "model_size_bytes":      m.get::<Option<i64>, _>("model_size_bytes"),
                "prompt_key":            m.get::<String, _>("prompt_key"),
                "prompt_text":           m.get::<String, _>("prompt_text"),
                "repeat_index":          m.get::<i64, _>("repeat_index"),
                "ttft_ms":               m.get::<Option<f64>, _>("ttft_ms"),
                "total_ms":              m.get::<f64, _>("total_ms"),
                "prompt_tokens":         m.get::<Option<i64>, _>("prompt_tokens"),
                "completion_tokens":     m.get::<Option<i64>, _>("completion_tokens"),
                "tokens_per_sec":        m.get::<Option<f64>, _>("tokens_per_sec"),
                "tokens_per_sec_ollama": m.get::<Option<f64>, _>("tokens_per_sec_ollama"),
                "peak_memory_mb":        m.get::<Option<f64>, _>("peak_memory_mb"),
                "context_window":        m.get::<Option<i64>, _>("context_window"),
                "ok":                    m.get::<i64, _>("ok") == 1,
                "error":                 m.get::<Option<String>, _>("error"),
            })
        })
        .collect();

    // Per-quant summary. ok=1 only, with the excluded count made visible.
    let summary = sqlx::query(
        r#"SELECT quant,
                  MAX(model_size_bytes)                        AS model_size_bytes,
                  AVG(CASE WHEN ok=1 THEN tokens_per_sec END)  AS avg_tokens_per_sec,
                  AVG(CASE WHEN ok=1 THEN ttft_ms END)         AS avg_ttft_ms,
                  MAX(CASE WHEN ok=1 THEN peak_memory_mb END)  AS peak_memory_mb,
                  SUM(CASE WHEN ok=1 THEN 1 ELSE 0 END)        AS n_ok,
                  SUM(CASE WHEN ok=0 THEN 1 ELSE 0 END)        AS n_failed
           FROM measurements WHERE run_id = ?
           GROUP BY quant"#,
    )
    .bind(id)
    .fetch_all(&state.db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let summary: Vec<Value> = summary
        .iter()
        .map(|s| {
            json!({
                "quant":              s.get::<String, _>("quant"),
                "model_size_bytes":   s.get::<Option<i64>, _>("model_size_bytes"),
                "avg_tokens_per_sec": s.get::<Option<f64>, _>("avg_tokens_per_sec"),
                "avg_ttft_ms":        s.get::<Option<f64>, _>("avg_ttft_ms"),
                "peak_memory_mb":     s.get::<Option<f64>, _>("peak_memory_mb"),
                "n_ok":               s.get::<i64, _>("n_ok"),
                "n_failed":           s.get::<i64, _>("n_failed"),
            })
        })
        .collect();

    Ok(Json(json!({
        "run": {
            "id":              run.get::<i64, _>("id"),
            "started_at":      run.get::<String, _>("started_at"),
            "finished_at":     run.get::<String, _>("finished_at"),
            "received_at":     run.get::<String, _>("received_at"),
            "harness_version": run.get::<String, _>("harness_version"),
            "model_family":    run.get::<String, _>("model_family"),
            "model_params":    run.get::<String, _>("model_params"),
            "repeats":         run.get::<i64, _>("repeats"),
            "host_chip":       run.get::<Option<String>, _>("host_chip"),
            "host_ram_gb":     run.get::<Option<i64>, _>("host_ram_gb"),
            "host_cpu_cores":  run.get::<Option<i64>, _>("host_cpu_cores"),
            "host_gpu_cores":  run.get::<Option<i64>, _>("host_gpu_cores"),
            "host_os":         run.get::<Option<String>, _>("host_os"),
            "ollama_version":  run.get::<Option<String>, _>("ollama_version"),
            "note":            run.get::<Option<String>, _>("note"),
        },
        "summary":      summary,
        "measurements": measurements,
    })))
}

pub async fn stats(State(state): State<AppState>) -> Result<Json<Value>, StatusCode> {
    let row = sqlx::query(
        r#"SELECT (SELECT COUNT(*) FROM benchmark_runs)                     AS runs,
                  (SELECT COUNT(*) FROM measurements)                       AS measurements,
                  (SELECT COUNT(*) FROM live_generations)                   AS live_runs,
                  (SELECT MIN(started_at) FROM benchmark_runs)              AS first_run,
                  (SELECT MAX(started_at) FROM benchmark_runs)              AS last_run"#,
    )
    .fetch_one(&state.db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(json!({
        "runs":         row.get::<i64, _>("runs"),
        "measurements": row.get::<i64, _>("measurements"),
        "live_runs":    row.get::<i64, _>("live_runs"),
        "first_run":    row.get::<Option<String>, _>("first_run"),
        "last_run":     row.get::<Option<String>, _>("last_run"),
    })))
}
