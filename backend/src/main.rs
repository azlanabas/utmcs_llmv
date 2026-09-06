//! UTM-LLMV backend — API + Ollama proxy.
//! Runs on hostinger-kerry. NEVER loads a model; inference lives on the Mac.

mod config;
mod db;
mod models;
mod ollama;
mod routes;
mod state;

use axum::{
    routing::{get, post},
    Router,
};
use state::AppState;
use tower_http::trace::TraceLayer;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info".into()),
        )
        .init();

    let cfg = config::Config::load()?;
    tracing::info!(bind = %cfg.bind_addr, ollama = %cfg.ollama_url, "starting llmv-backend");

    let pool = db::connect(&cfg.database_url).await?;
    let bind_addr = cfg.bind_addr.clone();
    let st = AppState::new(pool, cfg);

    // Startup probe: informational only. An asleep Mac must NOT block startup.
    let (online, models) = ollama::probe(&st).await;
    tracing::info!(mac_online = online, models = models.len(), "initial Mac probe");

    // NOTE: no CORS layer — the frontend is same-origin behind nginx.
    let app = Router::new()
        .route("/api/health", get(routes::health::health))
        .route("/api/ingest", post(routes::ingest::ingest))
        .route("/api/runs", get(routes::runs::list_runs))
        .route("/api/runs/latest", get(routes::runs::latest_run))
        .route("/api/runs/:id", get(routes::runs::get_run))
        .route("/api/stats", get(routes::runs::stats))
        .route("/api/live/health", get(routes::live::live_health))
        .route("/api/live/generate", post(routes::live::generate))
        .layer(TraceLayer::new_for_http())
        .with_state(st);

    let listener = tokio::net::TcpListener::bind(&bind_addr).await?;
    tracing::info!("listening on {bind_addr}");
    axum::serve(listener, app).await?;
    Ok(())
}
