use axum::{
    extract::{Request, State},
    http::{header, StatusCode},
    middleware::Next,
    response::{IntoResponse, Response},
    Json,
};
use serde_json::json;

use crate::{auth::validate_token, AppState};

pub async fn require_auth(
    State(state): State<AppState>,
    mut request: Request,
    next: Next,
) -> Result<Response, impl IntoResponse> {
    let auth_header = request
        .headers()
        .get(header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok());

    let token = match auth_header {
        Some(value) if value.starts_with("Bearer ") => &value[7..],
        _ => {
            return Err((
                StatusCode::UNAUTHORIZED,
                Json(json!({
                    "error": "Missing or invalid authorization header"
                })),
            ));
        }
    };

    match validate_token(token, &state.config.jwt_secret) {
        Ok(claims) => {
            // Add user info to request extensions
            request.extensions_mut().insert(claims);
            Ok(next.run(request).await)
        }
        Err(_) => Err((
            StatusCode::UNAUTHORIZED,
            Json(json!({
                "error": "Invalid or expired token"
            })),
        )),
    }
}