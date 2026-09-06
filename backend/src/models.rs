//! Serde types shared across routes. No DB access here.

use serde::{Deserialize, Serialize};

/// The document the Mac's push_results.py POSTs to /api/ingest.
#[derive(Debug, Deserialize, Serialize)]
pub struct IngestDoc {
    pub started_at: String,
    pub finished_at: String,
    pub harness_version: String,
    pub model_family: String,
    pub model_params: String,
    pub repeats: i64,
    #[serde(default)]
    pub host_chip: Option<String>,
    #[serde(default)]
    pub host_ram_gb: Option<i64>,
    #[serde(default)]
    pub host_cpu_cores: Option<i64>,
    #[serde(default)]
    pub host_gpu_cores: Option<i64>,
    #[serde(default)]
    pub host_os: Option<String>,
    #[serde(default)]
    pub ollama_version: Option<String>,
    #[serde(default)]
    pub note: Option<String>,
    pub measurements: Vec<MeasurementIn>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct MeasurementIn {
    pub quant: String,
    pub model_tag: String,
    #[serde(default)]
    pub model_size_bytes: Option<i64>,
    pub prompt_key: String,
    pub prompt_text: String,
    pub repeat_index: i64,
    #[serde(default)]
    pub ttft_ms: Option<f64>,
    pub total_ms: f64,
    #[serde(default)]
    pub prompt_tokens: Option<i64>,
    #[serde(default)]
    pub completion_tokens: Option<i64>,
    #[serde(default)]
    pub tokens_per_sec: Option<f64>,
    #[serde(default)]
    pub tokens_per_sec_ollama: Option<f64>,
    #[serde(default)]
    pub peak_memory_mb: Option<f64>,
    #[serde(default)]
    pub context_window: Option<i64>,
    #[serde(default = "yes")]
    pub ok: bool,
    #[serde(default)]
    pub error: Option<String>,
}

fn yes() -> bool {
    true
}

/// The three quant levels this project ships. Decisions Log: exactly these.
pub const ALLOWED_QUANTS: [&str; 3] = ["q2_K", "q4_K_M", "q8_0"];

pub fn quant_is_allowed(q: &str) -> bool {
    ALLOWED_QUANTS.contains(&q)
}

/// Maps a quant level to its Ollama tag.
pub fn tag_for_quant(q: &str) -> Option<&'static str> {
    match q {
        "q2_K" => Some("llama3.2:1b-instruct-q2_K"),
        "q4_K_M" => Some("llama3.2:1b-instruct-q4_K_M"),
        "q8_0" => Some("llama3.2:1b-instruct-q8_0"),
        _ => None,
    }
}

#[derive(Debug, Deserialize)]
pub struct GenerateReq {
    pub prompt: String,
    pub quant: String,
    #[serde(default)]
    pub max_tokens: Option<u32>,
}

#[derive(Debug, Serialize)]
pub struct LiveHealth {
    pub mac_online: bool,
    pub models: Vec<String>,
    pub checked_at: String,
}
