use tonic::transport::Channel;
use crate::error::Result;

// TODO: These will be generated from proto files
pub mod control_plane_proto {
    tonic::include_proto!("hermes.control_plane.v1");
}

use control_plane_proto::control_plane_service_client::ControlPlaneServiceClient;

pub struct ControlPlaneClient {
    client: ControlPlaneServiceClient<Channel>,
}

impl ControlPlaneClient {
    pub async fn new(url: &str) -> Result<Self> {
        let channel = Channel::from_shared(url.to_string())
            .expect("Invalid URL")
            .connect()
            .await?;
        
        let client = ControlPlaneServiceClient::new(channel);
        Ok(Self { client })
    }

    pub async fn create_execution(&self, request: CreateExecutionRequest) -> Result<CreateExecutionResponse> {
        let response = self.client
            .clone()
            .create_execution(request)
            .await?;
        Ok(response.into_inner())
    }

    pub async fn get_execution(&self, execution_id: &str) -> Result<GetExecutionResponse> {
        let request = GetExecutionRequest {
            execution_id: execution_id.to_string(),
        };
        
        let response = self.client
            .clone()
            .get_execution(request)
            .await?;
        Ok(response.into_inner())
    }

    pub async fn cancel_execution(&self, execution_id: &str) -> Result<CancelExecutionResponse> {
        let request = CancelExecutionRequest {
            execution_id: execution_id.to_string(),
        };
        
        let response = self.client
            .clone()
            .cancel_execution(request)
            .await?;
        Ok(response.into_inner())
    }
}

// Placeholder types until proto generation
#[derive(Debug, Clone)]
pub struct CreateExecutionRequest {
    pub code: String,
    pub language: String,
    pub environment: std::collections::HashMap<String, String>,
}

#[derive(Debug, Clone)]
pub struct CreateExecutionResponse {
    pub execution_id: String,
}

#[derive(Debug, Clone)]
pub struct GetExecutionRequest {
    pub execution_id: String,
}

#[derive(Debug, Clone)]
pub struct GetExecutionResponse {
    pub execution_id: String,
    pub status: String,
    pub output: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Clone)]
pub struct CancelExecutionRequest {
    pub execution_id: String,
}

#[derive(Debug, Clone)]
pub struct CancelExecutionResponse {
    pub success: bool,
}