use axum::{
    extract::State,
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use serde::{Deserialize, Serialize};

use crate::{
    auth::{generate_tokens, validate_token},
    error::{AppError, Result},
    AppState,
};

#[derive(Debug, Deserialize)]
pub struct LoginRequest {
    pub email: String,
    pub password: String,
}

#[derive(Debug, Serialize)]
pub struct LoginResponse {
    pub access_token: String,
    pub refresh_token: String,
    pub expires_in: i64,
    pub user: UserInfo,
}

#[derive(Debug, Serialize)]
pub struct UserInfo {
    pub id: String,
    pub email: String,
    pub name: String,
    pub role: String,
}

pub async fn login(
    State(state): State<AppState>,
    Json(payload): Json<LoginRequest>,
) -> Result<impl IntoResponse> {
    // Authenticate with IAM service
    let auth_response = state.iam_client
        .authenticate(&payload.email, &payload.password)
        .await
        .map_err(|_| AppError::AuthenticationError)?;
    
    // Generate JWT tokens
    let tokens = generate_tokens(
        &auth_response.user.id,
        &auth_response.user.email,
        &auth_response.user.role,
        &state.config.jwt_secret,
        state.config.jwt_expiry_hours,
    )?;
    
    // Store session in Redis
    let session_key = format!("session:{}", auth_response.user.id);
    let session_data = serde_json::json!({
        "user_id": auth_response.user.id,
        "email": auth_response.user.email,
        "role": auth_response.user.role,
        "jti": tokens.access_token.split('.').last().unwrap_or(""),
    });
    
    let mut conn = state.redis_client.clone();
    redis::cmd("SETEX")
        .arg(&session_key)
        .arg(state.config.jwt_expiry_hours * 3600)
        .arg(session_data.to_string())
        .query_async::<_, ()>(&mut conn)
        .await?;
    
    Ok(Json(LoginResponse {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_in: tokens.expires_in,
        user: UserInfo {
            id: auth_response.user.id,
            email: auth_response.user.email,
            name: auth_response.user.name,
            role: auth_response.user.role,
        },
    }))
}

pub async fn logout(
    State(state): State<AppState>,
    // TODO: Extract user ID from JWT middleware
) -> Result<impl IntoResponse> {
    // For now, return success
    // TODO: Invalidate session in Redis
    Ok(StatusCode::NO_CONTENT)
}

#[derive(Debug, Deserialize)]
pub struct RefreshTokenRequest {
    pub refresh_token: String,
}

pub async fn refresh_token(
    State(state): State<AppState>,
    Json(payload): Json<RefreshTokenRequest>,
) -> Result<impl IntoResponse> {
    // Validate refresh token
    let claims = validate_token(&payload.refresh_token, &state.config.jwt_secret)?;
    
    // Generate new tokens
    let tokens = generate_tokens(
        &claims.sub,
        &claims.email,
        &claims.role,
        &state.config.jwt_secret,
        state.config.jwt_expiry_hours,
    )?;
    
    Ok(Json(serde_json::json!({
        "access_token": tokens.access_token,
        "refresh_token": tokens.refresh_token,
        "expires_in": tokens.expires_in,
    })))
}

pub async fn get_current_user(
    State(_state): State<AppState>,
    // TODO: Extract user from JWT middleware
) -> Result<impl IntoResponse> {
    // For now, return mock user
    Ok(Json(UserInfo {
        id: "mock-user-id".to_string(),
        email: "user@example.com".to_string(),
        name: "Mock User".to_string(),
        role: "user".to_string(),
    }))
}