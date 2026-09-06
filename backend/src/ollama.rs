//! The ONLY module that talks to the Mac. No DB access here.
//! The Mac being asleep is a normal state of the world, never an error condition.

use crate::state::AppState;
use serde::Deserialize;
use std::time::Duration;

#[derive(Debug, Deserialize)]
struct TagsResp {
    #[serde(default)]
    models: Vec<TagEntry>,
}

#[derive(Debug, Deserialize)]
struct TagEntry {
    name: String,
}

/// One streamed chunk from Ollama's /api/generate.
#[derive(Debug, Deserialize)]
pub struct GenChunk {
    #[serde(default)]
    pub response: String,
    #[serde(default)]
    pub done: bool,
    #[serde(default)]
    pub eval_count: Option<i64>,
    #[serde(default)]
    pub eval_duration: Option<i64>, // nanoseconds
    #[serde(default)]
    pub prompt_eval_count: Option<i64>,
}

/// Probes the Mac. NEVER returns an error — an unreachable Mac yields
/// `(false, vec![])` so callers cannot accidentally turn "asleep" into a 5xx.
pub async fn probe(state: &AppState) -> (bool, Vec<String>) {
    let url = format!("{}/api/tags", state.cfg.ollama_url);
    let timeout = Duration::from_millis(state.cfg.probe_timeout_ms);

    let resp = match state.http.get(&url).timeout(timeout).send().await {
        Ok(r) => r,
        Err(_) => return (false, vec![]),
    };
    if !resp.status().is_success() {
        return (false, vec![]);
    }
    match resp.json::<TagsResp>().await {
        Ok(t) => (true, t.models.into_iter().map(|m| m.name).collect()),
        Err(_) => (false, vec![]),
    }
}

/// Opens a streaming generate request against the Mac.
pub async fn open_stream(
    state: &AppState,
    model_tag: &str,
    prompt: &str,
    max_tokens: u32,
) -> Result<reqwest::Response, reqwest::Error> {
    let url = format!("{}/api/generate", state.cfg.ollama_url);
    let body = serde_json::json!({
        "model":  model_tag,
        "prompt": prompt,
        "stream": true,
        "options": { "num_predict": max_tokens }
    });

    state
        .http
        .post(&url)
        .json(&body)
        .timeout(Duration::from_secs(state.cfg.live_timeout_s + 5))
        .send()
        .await?
        .error_for_status()
}
