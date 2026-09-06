//! Shared application state.

use crate::config::Config;
use sqlx::SqlitePool;
use std::sync::Arc;
use tokio::sync::Semaphore;

#[derive(Clone)]
pub struct AppState {
    pub db: SqlitePool,
    pub cfg: Arc<Config>,
    pub http: reqwest::Client,
    /// There is exactly ONE GPU on the other end of the wire. Serialising here
    /// gives a clean "busy" answer instead of a stalled socket
    /// (docs/design_doc_backend.md §3).
    pub live_slot: Arc<Semaphore>,
    pub started_at: std::time::Instant,
}

impl AppState {
    pub fn new(db: SqlitePool, cfg: Config) -> Self {
        let http = reqwest::Client::builder()
            .pool_idle_timeout(std::time::Duration::from_secs(30))
            .build()
            .expect("reqwest client");

        Self {
            db,
            cfg: Arc::new(cfg),
            http,
            live_slot: Arc::new(Semaphore::new(1)),
            started_at: std::time::Instant::now(),
        }
    }
}
