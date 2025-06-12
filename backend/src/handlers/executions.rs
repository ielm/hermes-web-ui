use axum::{
    extract::{Path, State},
    response::IntoResponse,
    Json,
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{
    clients::control_plane::{CreateExecutionRequest, CreateExecutionResponse},
    error::Result,
    AppState,
};

#[derive(Debug, Deserialize)]
pub struct CreateExecutionPayload {
    pub code: String,
    pub language: String,
    pub environment: Option<std::collections::HashMap<String, String>>,
}

#[derive(Debug, Serialize)]
pub struct ExecutionResponse {
    pub id: String,
    pub status: String,
    pub created_at: String,
}

pub async fn create_execution(
    State(state): State<AppState>,
    Json(payload): Json<CreateExecutionPayload>,
) -> Result<impl IntoResponse> {
    let request = CreateExecutionRequest {
        code: payload.code,
        language: payload.language,
        environment: payload.environment.unwrap_or_default(),
    };
    
    let response = state.control_plane_client
        .create_execution(request)
        .await?;
    
    Ok(Json(ExecutionResponse {
        id: response.execution_id,
        status: "pending".to_string(),
        created_at: chrono::Utc::now().to_rfc3339(),
    }))
}

pub async fn get_execution(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<impl IntoResponse> {
    let response = state.control_plane_client
        .get_execution(&id)
        .await?;
    
    Ok(Json(serde_json::json!({
        "id": response.execution_id,
        "status": response.status,
        "output": response.output,
        "error": response.error,
    })))
}

pub async fn get_execution_logs(
    State(_state): State<AppState>,
    Path(id): Path<String>,
) -> Result<impl IntoResponse> {
    // TODO: Stream logs from Redis pub/sub
    Ok(Json(serde_json::json!({
        "execution_id": id,
        "logs": [
            {
                "timestamp": chrono::Utc::now().to_rfc3339(),
                "level": "info",
                "message": "Execution started"
            }
        ]
    })))
}

pub async fn cancel_execution(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<impl IntoResponse> {
    let response = state.control_plane_client
        .cancel_execution(&id)
        .await?;
    
    Ok(Json(serde_json::json!({
        "success": response.success,
        "execution_id": id,
    })))
}