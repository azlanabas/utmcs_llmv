//! Configuration. Every value is REQUIRED — the service refuses to start rather
//! than fall back to a default (docs/design_doc_backend.md §1.2).

use anyhow::{anyhow, Result};

#[derive(Clone, Debug)]
pub struct Config {
    pub database_url: String,
    pub bind_addr: String,
    pub ollama_url: String,
    pub ingest_token: String,
    pub live_timeout_s: u64,
    pub probe_timeout_ms: u64,
    pub max_tokens_cap: u32,
}

fn req(key: &str) -> Result<String> {
    match std::env::var(key) {
        Ok(v) if !v.trim().is_empty() => Ok(v),
        _ => Err(anyhow!(
            "required env var {key} is missing or empty — refusing to start"
        )),
    }
}

fn req_parse<T: std::str::FromStr>(key: &str) -> Result<T> {
    req(key)?
        .parse::<T>()
        .map_err(|_| anyhow!("env var {key} is not a valid value for its type"))
}

impl Config {
    /// Loads `backend/.env` if present, then reads every value from the environment.
    pub fn load() -> Result<Self> {
        load_dotenv(".env");

        let cfg = Self {
            database_url: req("DATABASE_URL")?,
            bind_addr: req("BIND_ADDR")?,
            ollama_url: req("OLLAMA_URL")?.trim_end_matches('/').to_string(),
            ingest_token: req("INGEST_TOKEN")?,
            live_timeout_s: req_parse("LIVE_TIMEOUT_S")?,
            probe_timeout_ms: req_parse("PROBE_TIMEOUT_MS")?,
            max_tokens_cap: req_parse("MAX_TOKENS_CAP")?,
        };

        if cfg.ingest_token.len() < 32 {
            return Err(anyhow!("INGEST_TOKEN is shorter than 32 chars — refusing"));
        }
        Ok(cfg)
    }
}

/// Minimal .env reader — avoids a dependency for eight lines of KEY=VALUE.
/// Does not override values already present in the real environment.
fn load_dotenv(path: &str) {
    let Ok(body) = std::fs::read_to_string(path) else {
        return;
    };
    for line in body.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let Some((k, v)) = line.split_once('=') else {
            continue;
        };
        let (k, v) = (k.trim(), v.trim());
        if std::env::var(k).is_err() {
            std::env::set_var(k, v);
        }
    }
}
