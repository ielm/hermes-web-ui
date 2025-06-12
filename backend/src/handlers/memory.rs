use axum::{
    extract::State,
    response::IntoResponse,
    Json,
};
use serde::{Deserialize, Serialize};

use crate::{
    clients::memory::{QueryRequest, SearchRequest, StoreRequest},
    error::Result,
    AppState,
};

#[derive(Debug, Deserialize)]
pub struct StoreMemoryPayload {
    pub namespace: String,
    pub content: String,
    pub metadata: Option<std::collections::HashMap<String, String>>,
}

#[derive(Debug, Deserialize)]
pub struct SearchMemoryPayload {
    pub namespace: String,
    pub query: String,
    pub limit: Option<i32>,
}

#[derive(Debug, Deserialize)]
pub struct QueryMemoryPayload {
    pub namespace: String,
    pub omni_query: String,
}

pub async fn store_memory(
    State(state): State<AppState>,
    Json(payload): Json<StoreMemoryPayload>,
) -> Result<impl IntoResponse> {
    let request = StoreRequest {
        namespace: payload.namespace,
        content: payload.content,
        metadata: payload.metadata.unwrap_or_default(),
    };
    
    let response = state.memory_client
        .store(request)
        .await?;
    
    Ok(Json(serde_json::json!({
        "id": response.id,
        "success": response.success,
    })))
}

pub async fn search_memory(
    State(state): State<AppState>,
    Json(payload): Json<SearchMemoryPayload>,
) -> Result<impl IntoResponse> {
    let request = SearchRequest {
        namespace: payload.namespace,
        query: payload.query,
        limit: payload.limit.unwrap_or(10),
    };
    
    let response = state.memory_client
        .search(request)
        .await?;
    
    Ok(Json(serde_json::json!({
        "results": response.results.into_iter().map(|r| {
            serde_json::json!({
                "id": r.id,
                "content": r.content,
                "score": r.score,
                "metadata": r.metadata,
            })
        }).collect::<Vec<_>>(),
    })))
}

pub async fn query_memory(
    State(state): State<AppState>,
    Json(payload): Json<QueryMemoryPayload>,
) -> Result<impl IntoResponse> {
    let request = QueryRequest {
        namespace: payload.namespace,
        omni_query: payload.omni_query,
    };
    
    let response = state.memory_client
        .query(request)
        .await?;
    
    Ok(Json(serde_json::json!({
        "results": response.results,
        "execution_time_ms": response.execution_time_ms,
    })))
}