//! GET /api/health — the backend's own health, NOT the Mac's.

use crate::{db, state::AppState};
use axum::{extract::State, Json};
use serde_json::{json, Value};

pub async fn health(State(state): State<AppState>) -> Json<Value> {
    let db_ok = db::db_ok(&state.db).await;
    Json(json!({
        "status":    if db_ok { "ok" } else { "degraded" },
        "version":   env!("CARGO_PKG_VERSION"),
        "db_ok":     db_ok,
        "uptime_s":  state.started_at.elapsed().as_secs(),
    }))
}
