use serde::Deserialize;
use std::env;

#[derive(Debug, Clone, Deserialize)]
pub struct Config {
    pub port: u16,
    pub redis_url: String,
    pub control_plane_url: String,
    pub memory_service_url: String,
    pub iam_service_url: String,
    pub jwt_secret: String,
    pub jwt_expiry_hours: i64,
    pub workos_api_key: Option<String>,
    pub workos_client_id: Option<String>,
}

impl Config {
    pub fn from_env() -> Result<Self, env::VarError> {
        Ok(Config {
            port: env::var("PORT")
                .unwrap_or_else(|_| "8080".to_string())
                .parse()
                .expect("PORT must be a valid u16"),
            redis_url: env::var("REDIS_URL")
                .unwrap_or_else(|_| "redis://localhost:6379".to_string()),
            control_plane_url: env::var("CONTROL_PLANE_URL")
                .unwrap_or_else(|_| "http://localhost:50051".to_string()),
            memory_service_url: env::var("MEMORY_SERVICE_URL")
                .unwrap_or_else(|_| "http://localhost:50052".to_string()),
            iam_service_url: env::var("IAM_SERVICE_URL")
                .unwrap_or_else(|_| "http://localhost:50053".to_string()),
            jwt_secret: env::var("JWT_SECRET")
                .unwrap_or_else(|_| "development-secret-change-in-production".to_string()),
            jwt_expiry_hours: env::var("JWT_EXPIRY_HOURS")
                .unwrap_or_else(|_| "24".to_string())
                .parse()
                .expect("JWT_EXPIRY_HOURS must be a valid i64"),
            workos_api_key: env::var("WORKOS_API_KEY").ok(),
            workos_client_id: env::var("WORKOS_CLIENT_ID").ok(),
        })
    }
}