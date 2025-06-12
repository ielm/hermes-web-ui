use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{error::Result, AppState};

#[derive(Debug, Serialize, Deserialize)]
pub struct Workspace {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateWorkspacePayload {
    pub name: String,
    pub description: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateWorkspacePayload {
    pub name: Option<String>,
    pub description: Option<String>,
}

pub async fn list_workspaces(
    State(_state): State<AppState>,
) -> Result<impl IntoResponse> {
    // TODO: Implement workspace storage
    // For now, return mock data
    let workspaces = vec![
        Workspace {
            id: Uuid::new_v4().to_string(),
            name: "Default Workspace".to_string(),
            description: Some("Your default workspace".to_string()),
            created_at: chrono::Utc::now().to_rfc3339(),
            updated_at: chrono::Utc::now().to_rfc3339(),
        },
    ];
    
    Ok(Json(serde_json::json!({
        "workspaces": workspaces,
    })))
}

pub async fn create_workspace(
    State(_state): State<AppState>,
    Json(payload): Json<CreateWorkspacePayload>,
) -> Result<impl IntoResponse> {
    let workspace = Workspace {
        id: Uuid::new_v4().to_string(),
        name: payload.name,
        description: payload.description,
        created_at: chrono::Utc::now().to_rfc3339(),
        updated_at: chrono::Utc::now().to_rfc3339(),
    };
    
    Ok((StatusCode::CREATED, Json(workspace)))
}

pub async fn get_workspace(
    State(_state): State<AppState>,
    Path(id): Path<String>,
) -> Result<impl IntoResponse> {
    // TODO: Fetch from storage
    let workspace = Workspace {
        id,
        name: "Mock Workspace".to_string(),
        description: Some("This is a mock workspace".to_string()),
        created_at: chrono::Utc::now().to_rfc3339(),
        updated_at: chrono::Utc::now().to_rfc3339(),
    };
    
    Ok(Json(workspace))
}

pub async fn update_workspace(
    State(_state): State<AppState>,
    Path(id): Path<String>,
    Json(payload): Json<UpdateWorkspacePayload>,
) -> Result<impl IntoResponse> {
    // TODO: Update in storage
    let workspace = Workspace {
        id,
        name: payload.name.unwrap_or_else(|| "Updated Workspace".to_string()),
        description: payload.description.or(Some("Updated description".to_string())),
        created_at: chrono::Utc::now().to_rfc3339(),
        updated_at: chrono::Utc::now().to_rfc3339(),
    };
    
    Ok(Json(workspace))
}

pub async fn delete_workspace(
    State(_state): State<AppState>,
    Path(_id): Path<String>,
) -> Result<impl IntoResponse> {
    // TODO: Delete from storage
    Ok(StatusCode::NO_CONTENT)
}