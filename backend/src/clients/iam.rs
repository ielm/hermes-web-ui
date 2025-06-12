use tonic::transport::Channel;
use crate::error::Result;

// TODO: These will be generated from proto files
pub mod iam_proto {
    tonic::include_proto!("hermes.iam.v1");
}

use iam_proto::iam_service_client::IamServiceClient;

pub struct IamClient {
    client: IamServiceClient<Channel>,
}

impl IamClient {
    pub async fn new(url: &str) -> Result<Self> {
        let channel = Channel::from_shared(url.to_string())
            .expect("Invalid URL")
            .connect()
            .await?;
        
        let client = IamServiceClient::new(channel);
        Ok(Self { client })
    }

    pub async fn authenticate(&self, email: &str, password: &str) -> Result<AuthenticateResponse> {
        let request = AuthenticateRequest {
            email: email.to_string(),
            password: password.to_string(),
        };
        
        let response = self.client
            .clone()
            .authenticate(request)
            .await?;
        Ok(response.into_inner())
    }

    pub async fn validate_token(&self, token: &str) -> Result<ValidateTokenResponse> {
        let request = ValidateTokenRequest {
            token: token.to_string(),
        };
        
        let response = self.client
            .clone()
            .validate_token(request)
            .await?;
        Ok(response.into_inner())
    }

    pub async fn refresh_token(&self, refresh_token: &str) -> Result<RefreshTokenResponse> {
        let request = RefreshTokenRequest {
            refresh_token: refresh_token.to_string(),
        };
        
        let response = self.client
            .clone()
            .refresh_token(request)
            .await?;
        Ok(response.into_inner())
    }
}

// Placeholder types until proto generation
#[derive(Debug, Clone)]
pub struct AuthenticateRequest {
    pub email: String,
    pub password: String,
}

#[derive(Debug, Clone)]
pub struct AuthenticateResponse {
    pub access_token: String,
    pub refresh_token: String,
    pub user: User,
}

#[derive(Debug, Clone)]
pub struct User {
    pub id: String,
    pub email: String,
    pub name: String,
    pub role: String,
}

#[derive(Debug, Clone)]
pub struct ValidateTokenRequest {
    pub token: String,
}

#[derive(Debug, Clone)]
pub struct ValidateTokenResponse {
    pub valid: bool,
    pub user: Option<User>,
}

#[derive(Debug, Clone)]
pub struct RefreshTokenRequest {
    pub refresh_token: String,
}

#[derive(Debug, Clone)]
pub struct RefreshTokenResponse {
    pub access_token: String,
    pub refresh_token: String,
}