//! Live paths — require the Mac. SSE streaming.
//! Invariant: "the Mac is asleep" is a normal state, NEVER a 5xx
//! (docs/design_doc_backend.md §2.2).

use crate::{
    models::{quant_is_allowed, tag_for_quant, GenerateReq, LiveHealth},
    ollama,
    state::AppState,
};
use axum::{
    extract::State,
    response::{sse::Event, IntoResponse, Sse},
    Json,
};
use sha2::{Digest, Sha256};
use std::convert::Infallible;
use std::time::{Duration, Instant};
use tokio::sync::mpsc;
use tokio_stream::wrappers::ReceiverStream;

pub async fn live_health(State(state): State<AppState>) -> Json<LiveHealth> {
    let (mac_online, models) = ollama::probe(&state).await;
    Json(LiveHealth {
        mac_online,
        models,
        checked_at: chrono::Utc::now().to_rfc3339(),
    })
}

/// Metadata-only telemetry. The prompt TEXT is never stored — hash only
/// (docs/README.md §2, Privacy).
#[allow(clippy::too_many_arguments)]
async fn log_live(
    state: &AppState,
    quant: &str,
    model_tag: &str,
    prompt: &str,
    max_tokens: u32,
    ttft_ms: Option<f64>,
    total_ms: Option<f64>,
    completion_tokens: Option<i64>,
    tokens_per_sec: Option<f64>,
    outcome: &str,
    error: Option<String>,
) {
    let hash = hex::encode(Sha256::digest(prompt.as_bytes()));
    let _ = sqlx::query(
        r#"INSERT INTO live_generations
           (quant, model_tag, prompt_sha256, prompt_chars, max_tokens,
            ttft_ms, total_ms, completion_tokens, tokens_per_sec, outcome, error)
           VALUES (?,?,?,?,?,?,?,?,?,?,?)"#,
    )
    .bind(quant)
    .bind(model_tag)
    .bind(&hash)
    .bind(prompt.chars().count() as i64)
    .bind(max_tokens as i64)
    .bind(ttft_ms)
    .bind(total_ms)
    .bind(completion_tokens)
    .bind(tokens_per_sec)
    .bind(outcome)
    .bind(error)
    .execute(&state.db)
    .await;
}

fn ev(kind: &str, payload: serde_json::Value) -> Result<Event, Infallible> {
    Ok(Event::default().event(kind).data(payload.to_string()))
}

pub async fn generate(
    State(state): State<AppState>,
    Json(req): Json<GenerateReq>,
) -> impl IntoResponse {
    let (tx, rx) = mpsc::channel::<Result<Event, Infallible>>(64);

    tokio::spawn(async move {
        let prompt = req.prompt.trim().to_string();
        let quant = req.quant.clone();

        // ---- validation -------------------------------------------------
        if prompt.is_empty() || prompt.chars().count() > 4000 {
            let _ = tx
                .send(ev("error", serde_json::json!({
                    "reason": "invalid_prompt",
                    "detail": "prompt must be 1–4000 characters"
                })))
                .await;
            return;
        }
        if !quant_is_allowed(&quant) {
            let _ = tx
                .send(ev("error", serde_json::json!({
                    "reason": "invalid_quant",
                    "detail": format!("'{quant}' is not one of the three quant levels")
                })))
                .await;
            return;
        }
        let model_tag = tag_for_quant(&quant).unwrap();
        let max_tokens = req
            .max_tokens
            .unwrap_or(256)
            .min(state.cfg.max_tokens_cap)
            .max(1);

        // ---- fairness: one GPU on the other end -------------------------
        let permit = match tokio::time::timeout(
            Duration::from_secs(20),
            state.live_slot.clone().acquire_owned(),
        )
        .await
        {
            Ok(Ok(p)) => p,
            _ => {
                let _ = tx
                    .send(ev("error", serde_json::json!({
                        "reason": "busy",
                        "detail": "another generation is running — there is only one Mac"
                    })))
                    .await;
                log_live(&state, &quant, model_tag, &prompt, max_tokens,
                         None, None, None, None, "busy", None).await;
                return;
            }
        };

        // ---- is the Mac awake? ------------------------------------------
        let (online, _) = ollama::probe(&state).await;
        if !online {
            let _ = tx
                .send(ev("error", serde_json::json!({
                    "reason": "mac_offline",
                    "detail": "the Mac is asleep — the model lives there. Benchmark results are still available."
                })))
                .await;
            log_live(&state, &quant, model_tag, &prompt, max_tokens,
                     None, None, None, None, "mac_offline", None).await;
            drop(permit);
            return;
        }

        let started = Instant::now();
        let _ = tx
            .send(ev("meta", serde_json::json!({
                "model_tag":  model_tag,
                "quant":      quant,
                "max_tokens": max_tokens,
                "started_at": chrono::Utc::now().to_rfc3339(),
            })))
            .await;

        // ---- open the stream --------------------------------------------
        let resp = match ollama::open_stream(&state, model_tag, &prompt, max_tokens).await {
            Ok(r) => r,
            Err(e) => {
                let _ = tx
                    .send(ev("error", serde_json::json!({
                        "reason": "upstream_error", "detail": e.to_string()
                    })))
                    .await;
                log_live(&state, &quant, model_tag, &prompt, max_tokens,
                         None, None, None, None, "error", Some(e.to_string())).await;
                drop(permit);
                return;
            }
        };

        // ---- consume, framing NDJSON into SSE ---------------------------
        use futures::StreamExt;
        let mut body = resp.bytes_stream();
        let mut buf: Vec<u8> = Vec::new();
        let mut ttft_ms: Option<f64> = None;
        let mut idx: i64 = 0;
        let mut eval_count: Option<i64> = None;
        let mut eval_duration: Option<i64> = None;
        let deadline = Duration::from_secs(state.cfg.live_timeout_s);
        let mut timed_out = false;

        loop {
            let remaining = deadline.saturating_sub(started.elapsed());
            if remaining.is_zero() {
                timed_out = true;
                break;
            }
            let chunk = match tokio::time::timeout(remaining, body.next()).await {
                Err(_) => { timed_out = true; break; }
                Ok(None) => break,
                Ok(Some(Err(_))) => break,
                Ok(Some(Ok(c))) => c,
            };
            buf.extend_from_slice(&chunk);

            // Ollama emits newline-delimited JSON; split on \n.
            while let Some(pos) = buf.iter().position(|b| *b == b'\n') {
                let line: Vec<u8> = buf.drain(..=pos).collect();
                let line = &line[..line.len() - 1];
                if line.is_empty() { continue; }
                let Ok(c) = serde_json::from_slice::<ollama::GenChunk>(line) else { continue };

                if !c.response.is_empty() {
                    if ttft_ms.is_none() {
                        // The honest TTFT from the browser's point of view:
                        // it includes the Tailscale hop. Labelled "indicative" in the UI.
                        ttft_ms = Some(started.elapsed().as_secs_f64() * 1000.0);
                    }
                    let _ = tx
                        .send(ev("token", serde_json::json!({ "t": c.response, "i": idx })))
                        .await;
                    idx += 1;
                }
                if c.done {
                    eval_count = c.eval_count;
                    eval_duration = c.eval_duration;
                }
            }
        }

        // ---- finish ------------------------------------------------------
        let total_ms = started.elapsed().as_secs_f64() * 1000.0;
        let tps = match (eval_count, eval_duration) {
            (Some(n), Some(d)) if d > 0 => Some(n as f64 / (d as f64 / 1e9)),
            _ => {
                let gen_ms = total_ms - ttft_ms.unwrap_or(0.0);
                if gen_ms > 0.0 && idx > 0 { Some(idx as f64 / (gen_ms / 1000.0)) } else { None }
            }
        };

        if timed_out {
            let _ = tx
                .send(ev("error", serde_json::json!({
                    "reason": "timeout", "partial": true,
                    "detail": format!("stopped at {}s — partial output kept", state.cfg.live_timeout_s)
                })))
                .await;
        } else {
            let _ = tx
                .send(ev("done", serde_json::json!({
                    "ttft_ms": ttft_ms, "total_ms": total_ms,
                    "completion_tokens": eval_count.unwrap_or(idx),
                    "tokens_per_sec": tps,
                })))
                .await;
        }

        log_live(
            &state, &quant, model_tag, &prompt, max_tokens,
            ttft_ms, Some(total_ms), Some(eval_count.unwrap_or(idx)), tps,
            if timed_out { "timeout" } else { "ok" }, None,
        ).await;

        drop(permit);
    });

    Sse::new(ReceiverStream::new(rx))
}
