use std::net::SocketAddr;
use std::sync::Arc;

use axum::{
    extract::State,
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use tower_http::cors::CorsLayer;
use tower_http::trace::TraceLayer;
use tracing::info;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

mod auth;
mod clients;
mod config;
mod error;
mod handlers;
mod middleware;
mod websocket;

use crate::config::Config;
use crate::error::AppError;

#[derive(Clone)]
pub struct AppState {
    pub config: Arc<Config>,
    pub control_plane_client: Arc<clients::ControlPlaneClient>,
    pub memory_client: Arc<clients::MemoryClient>,
    pub iam_client: Arc<clients::IamClient>,
    pub redis_client: Arc<redis::aio::ConnectionManager>,
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Initialize tracing
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "hermes_web_ui_backend=debug,tower_http=debug".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    // Load configuration
    let config = Arc::new(Config::from_env()?);

    // Initialize Redis client
    let redis_client = redis::Client::open(config.redis_url.as_str())?;
    let redis_conn = Arc::new(redis_client.get_connection_manager().await?);

    // Initialize gRPC clients
    let control_plane_client = Arc::new(clients::ControlPlaneClient::new(&config.control_plane_url).await?);
    let memory_client = Arc::new(clients::MemoryClient::new(&config.memory_service_url).await?);
    let iam_client = Arc::new(clients::IamClient::new(&config.iam_service_url).await?);

    // Create app state
    let state = AppState {
        config: config.clone(),
        control_plane_client,
        memory_client,
        iam_client,
        redis_client: redis_conn,
    };

    // Build the router
    let app = Router::new()
        // Health check
        .route("/health", get(health_check))
        // Auth routes
        .nest("/api/auth", auth_routes())
        // Execution routes
        .nest("/api/executions", execution_routes())
        // Memory routes
        .nest("/api/memory", memory_routes())
        // Workspace routes
        .nest("/api/workspaces", workspace_routes())
        // WebSocket for logs
        .route("/ws/logs", get(websocket::handle_websocket))
        // Add middleware
        .layer(CorsLayer::permissive())
        .layer(TraceLayer::new_for_http())
        .with_state(state);

    // Start the server
    let addr = SocketAddr::from(([0, 0, 0, 0], config.port));
    info!("Web UI backend listening on {}", addr);
    
    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}

async fn health_check() -> impl IntoResponse {
    Json(serde_json::json!({
        "status": "healthy",
        "service": "hermes-web-ui-backend"
    }))
}

fn auth_routes() -> Router<AppState> {
    Router::new()
        .route("/login", post(handlers::auth::login))
        .route("/logout", post(handlers::auth::logout))
        .route("/refresh", post(handlers::auth::refresh_token))
        .route("/me", get(handlers::auth::get_current_user))
}

fn execution_routes() -> Router<AppState> {
    Router::new()
        .route("/", post(handlers::executions::create_execution))
        .route("/:id", get(handlers::executions::get_execution))
        .route("/:id/logs", get(handlers::executions::get_execution_logs))
        .route("/:id/cancel", post(handlers::executions::cancel_execution))
        .layer(axum::middleware::from_fn(middleware::auth::require_auth))
}

fn memory_routes() -> Router<AppState> {
    Router::new()
        .route("/search", post(handlers::memory::search_memory))
        .route("/store", post(handlers::memory::store_memory))
        .route("/query", post(handlers::memory::query_memory))
        .layer(axum::middleware::from_fn(middleware::auth::require_auth))
}

fn workspace_routes() -> Router<AppState> {
    Router::new()
        .route("/", get(handlers::workspaces::list_workspaces))
        .route("/", post(handlers::workspaces::create_workspace))
        .route("/:id", get(handlers::workspaces::get_workspace))
        .route("/:id", put(handlers::workspaces::update_workspace))
        .route("/:id", delete(handlers::workspaces::delete_workspace))
        .layer(axum::middleware::from_fn(middleware::auth::require_auth))
}